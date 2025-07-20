/**
 * ClickHouse migration: create_materialized_views
 */
exports.up = async function(client) {
  // Use analytics database
  await client.query({
    query: `
      USE analytics;
    `,
    format: 'JSONEachRow'
  });

  // Create daily_stats materialized view
  await client.query({
    query: `
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
    `,
    format: 'JSONEachRow'
  });

  // Create hourly_stats materialized view
  await client.query({
    query: `
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
    `,
    format: 'JSONEachRow'
  });

  // Create country_stats materialized view
  await client.query({
    query: `
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
    `,
    format: 'JSONEachRow'
  });

  // Create device_stats materialized view
  await client.query({
    query: `
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
    `,
    format: 'JSONEachRow'
  });

  // Create browser_stats materialized view
  await client.query({
    query: `
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
    `,
    format: 'JSONEachRow'
  });
};