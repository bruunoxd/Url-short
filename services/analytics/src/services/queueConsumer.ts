import amqplib, { Channel, Connection } from 'amqplib';
import { ClickEvent } from '@url-shortener/shared-types';
import { queueMessagesProcessed } from '@url-shortener/shared-monitoring';
import { clickEventProcessor } from './clickEventProcessor';

const SERVICE_NAME = 'analytics';

// Queue configuration
const QUEUE_CONFIG = {
  // RabbitMQ connection URL
  url: process.env.RABBITMQ_URL || 'amqp://rabbitmq:rabbitmq@localhost:5672',
  // Exchange name
  exchange: 'url_shortener',
  // Queue name for click events
  clickEventsQueue: 'click_events',
  // Retry options
  retry: {
    // Maximum number of connection attempts
    maxAttempts: 5,
    // Initial delay between attempts (ms)
    initialDelay: 1000,
    // Maximum delay between attempts (ms)
    maxDelay: 30000
  },
  // Consumer options
  consumer: {
    // Prefetch count (number of messages to process at once)
    prefetch: 10
  }
};

/**
 * Service for consuming messages from the queue
 */
export class QueueConsumer {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private consumerTag: string | null = null;
  
  /**
   * Connect to the message queue
   */
  async connect(): Promise<void> {
    // If already connected, return
    if (this.isConnected && this.connection && this.channel) {
      return;
    }
    
    // If connection is in progress, wait for it to complete
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    // Start connection process
    this.connectionPromise = this.connectWithRetry();
    return this.connectionPromise;
  }
  
  /**
   * Connect to the message queue with retry logic
   */
  private async connectWithRetry(attempt = 1): Promise<void> {
    try {
      console.log(`Connecting to RabbitMQ (attempt ${attempt})...`);
      
      // Connect to RabbitMQ
      this.connection = await amqplib.connect(QUEUE_CONFIG.url);
      
      // Create channel
      this.channel = await this.connection.createChannel();
      
      // Set prefetch count
      await this.channel.prefetch(QUEUE_CONFIG.consumer.prefetch);
      
      // Setup exchange and queues
      await this.channel.assertExchange(QUEUE_CONFIG.exchange, 'direct', { durable: true });
      await this.channel.assertQueue(QUEUE_CONFIG.clickEventsQueue, { durable: true });
      await this.channel.bindQueue(QUEUE_CONFIG.clickEventsQueue, QUEUE_CONFIG.exchange, 'click_event');
      
      // Set up connection event handlers
      this.connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
        this.isConnected = false;
      });
      
      this.connection.on('close', () => {
        console.log('RabbitMQ connection closed');
        this.isConnected = false;
        this.consumerTag = null;
        
        // Attempt to reconnect after a delay
        setTimeout(() => {
          this.connectionPromise = null;
          this.connect().then(() => this.startConsuming()).catch(err => {
            console.error('Failed to reconnect to RabbitMQ:', err);
          });
        }, 5000);
      });
      
      console.log('Connected to RabbitMQ');
      this.isConnected = true;
      this.connectionPromise = null;
    } catch (error) {
      console.error(`Failed to connect to RabbitMQ (attempt ${attempt}):`, error);
      
      // If max attempts reached, give up
      if (attempt >= QUEUE_CONFIG.retry.maxAttempts) {
        this.connectionPromise = null;
        throw new Error(`Failed to connect to RabbitMQ after ${attempt} attempts`);
      }
      
      // Calculate next retry delay with exponential backoff
      const delay = Math.min(
        QUEUE_CONFIG.retry.initialDelay * Math.pow(2, attempt - 1),
        QUEUE_CONFIG.retry.maxDelay
      );
      
      console.log(`Retrying in ${delay}ms...`);
      
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, delay));
      await this.connectWithRetry(attempt + 1);
    }
  }
  
  /**
   * Start consuming messages from the queue
   */
  async startConsuming(): Promise<void> {
    try {
      // Ensure connected
      await this.connect();
      
      if (!this.channel) {
        throw new Error('Channel not available');
      }
      
      // Start consuming
      const { consumerTag } = await this.channel.consume(
        QUEUE_CONFIG.clickEventsQueue,
        async (msg) => {
          if (!msg) {
            return;
          }
          
          try {
            // Parse message
            const content = msg.content.toString();
            const clickEvent = JSON.parse(content) as ClickEvent;
            
            // Process event
            await clickEventProcessor.processEvent(clickEvent);
            
            // Acknowledge message
            this.channel?.ack(msg);
            
            // Record success metric
            queueMessagesProcessed.inc({
              queue: QUEUE_CONFIG.clickEventsQueue,
              status: 'success',
              service: SERVICE_NAME
            });
          } catch (error) {
            console.error('Error processing message:', error);
            
            // Reject message and requeue
            this.channel?.nack(msg, false, true);
            
            // Record error metric
            queueMessagesProcessed.inc({
              queue: QUEUE_CONFIG.clickEventsQueue,
              status: 'error',
              service: SERVICE_NAME
            });
          }
        },
        { noAck: false }
      );
      
      this.consumerTag = consumerTag;
      console.log(`Started consuming from ${QUEUE_CONFIG.clickEventsQueue} queue`);
    } catch (error) {
      console.error('Error starting consumer:', error);
      throw error;
    }
  }
  
  /**
   * Stop consuming messages from the queue
   */
  async stopConsuming(): Promise<void> {
    try {
      if (this.channel && this.consumerTag) {
        await this.channel.cancel(this.consumerTag);
        this.consumerTag = null;
        console.log('Stopped consuming messages');
      }
    } catch (error) {
      console.error('Error stopping consumer:', error);
    }
  }
  
  /**
   * Close the connection to the message queue
   */
  async close(): Promise<void> {
    try {
      // Stop consuming
      await this.stopConsuming();
      
      // Close channel
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      // Close connection
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      this.isConnected = false;
      console.log('RabbitMQ connection closed');
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }
  
  /**
   * Check if the connection to the message queue is healthy
   */
  async checkHealth(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      return this.isConnected && !!this.connection && !!this.channel;
    } catch (error) {
      console.error('RabbitMQ health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const queueConsumer = new QueueConsumer();