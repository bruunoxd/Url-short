/**
 * ClickHouse migration: create_click_events_table
 */
exports.up = async function(client) {
  // Create analytics database if not exists
  await client.query({
    query: `
      CREATE DATABASE IF NOT EXISTS analytics;
    `,
    format: 'JSONEachRow'
  });

  // Use analytics database
  await client.query({
    query: `
      USE analytics;
    `,
    format: 'JSONEachRow'
  });

  // Create click_events table
  await client.query({
    query: `
      CREATE TABLE IF NOT EXISTS click_events (
        short_url_id String,
        timestamp DateTime64(3),
        ip_address String,
        user_agent String,
        referrer String,
        country String,
        city String,
        device_type String,
        browser String,
        os String,
        created_date Date MATERIALIZED toDate(timestamp)
      ) ENGINE = MergeTree()
      ORDER BY (short_url_id, timestamp)
      PARTITION BY toYYYYMM(timestamp)
      TTL timestamp + INTERVAL 2 YEAR;
    `,
    format: 'JSONEachRow'
  });
};