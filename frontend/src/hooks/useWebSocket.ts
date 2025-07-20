import { useState, useEffect, useCallback } from 'react';

interface UseWebSocketOptions {
  reconnectInterval?: number;
  reconnectAttempts?: number;
  onOpen?: (event: WebSocketEventMap['open']) => void;
  onClose?: (event: WebSocketEventMap['close']) => void;
  onMessage?: (event: WebSocketEventMap['message']) => void;
  onError?: (event: WebSocketEventMap['error']) => void;
}

interface UseWebSocketReturn {
  sendMessage: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
  lastMessage: WebSocketEventMap['message'] | null;
  readyState: number;
  reconnect: () => void;
}

export function useWebSocket(
  url: string | null,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const {
    reconnectInterval = 5000,
    reconnectAttempts = 10,
    onOpen,
    onClose,
    onMessage,
    onError,
  } = options;

  const [ws, setWs] = useState<WebSocket | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketEventMap['message'] | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);

  // Create WebSocket connection
  const connect = useCallback(() => {
    if (!url) return;
    
    const websocket = new WebSocket(url);
    
    websocket.onopen = (event) => {
      console.log('WebSocket connected');
      setReadyState(WebSocket.OPEN);
      setReconnectCount(0);
      if (onOpen) onOpen(event);
    };
    
    websocket.onclose = (event) => {
      console.log('WebSocket disconnected');
      setReadyState(WebSocket.CLOSED);
      if (onClose) onClose(event);
      
      // Attempt to reconnect if not closed cleanly and under max attempts
      if (!event.wasClean && reconnectCount < reconnectAttempts) {
        setTimeout(() => {
          setReconnectCount((prev) => prev + 1);
          connect();
        }, reconnectInterval);
      }
    };
    
    websocket.onmessage = (event) => {
      setLastMessage(event);
      if (onMessage) onMessage(event);
    };
    
    websocket.onerror = (event) => {
      console.error('WebSocket error:', event);
      if (onError) onError(event);
    };
    
    setWs(websocket);
    
    return () => {
      websocket.close();
    };
  }, [url, reconnectCount, reconnectAttempts, reconnectInterval, onOpen, onClose, onMessage, onError]);

  // Connect on mount and when URL changes
  useEffect(() => {
    const cleanup = connect();
    return () => {
      if (cleanup) cleanup();
    };
  }, [connect]);

  // Send message function
  const sendMessage = useCallback(
    (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      } else {
        console.error('WebSocket is not connected');
      }
    },
    [ws]
  );

  // Manual reconnect function
  const reconnect = useCallback(() => {
    if (ws) {
      ws.close();
    }
    setReconnectCount(0);
    connect();
  }, [ws, connect]);

  return { sendMessage, lastMessage, readyState, reconnect };
}