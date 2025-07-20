-- Create analytics database
CREATE DATABASE IF NOT EXISTS analytics;

-- Use analytics database
USE analytics;

-- Click events table for raw data
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

-- Daily aggregated statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_stats
ENGINE = SummingMergeTree()
ORDER BY (short_url_id, date)
AS SELECT 
    short_url_id,
    toDate(timestamp) as date,
    count() as clicks,
    uniq(ip_address) as unique_visitors
FROM click_events
GROUP BY short_url_id, date;

-- Hourly aggregated statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_stats
ENGINE = SummingMergeTree()
ORDER BY (short_url_id, hour)
AS SELECT 
    short_url_id,
    toStartOfHour(timestamp) as hour,
    count() as clicks,
    uniq(ip_address) as unique_visitors
FROM click_events
GROUP BY short_url_id, hour;

-- Country statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS country_stats
ENGINE = SummingMergeTree()
ORDER BY (short_url_id, country)
AS SELECT 
    short_url_id,
    country,
    count() as clicks,
    uniq(ip_address) as unique_visitors
FROM click_events
WHERE country != ''
GROUP BY short_url_id, country;

-- Device statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS device_stats
ENGINE = SummingMergeTree()
ORDER BY (short_url_id, device_type)
AS SELECT 
    short_url_id,
    device_type,
    count() as clicks,
    uniq(ip_address) as unique_visitors
FROM click_events
WHERE device_type != ''
GROUP BY short_url_id, device_type;

-- Browser statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS browser_stats
ENGINE = SummingMergeTree()
ORDER BY (short_url_id, browser)
AS SELECT 
    short_url_id,
    browser,
    count() as clicks,
    uniq(ip_address) as unique_visitors
FROM click_events
WHERE browser != ''
GROUP BY short_url_id, browser;