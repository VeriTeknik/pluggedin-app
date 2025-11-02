import 'dotenv/config';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

// Configure PostgreSQL connection with SSL support
const getPoolConfig = () => {
  const config: any = {
    connectionString: process.env.DATABASE_URL!,
  };

  // Enable SSL in production or when explicitly requested
  // BUT: if DATABASE_SSL is explicitly set to 'false', don't use SSL
  if (process.env.DATABASE_SSL === 'false') {
    // Explicitly disabled - no SSL
    config.ssl = false;
  } else if (process.env.NODE_ENV === 'production' || process.env.DATABASE_SSL === 'true') {
    config.ssl = {
      // Accept self-signed certificates (no issuer certificate required)
      // Connection is still encrypted, just not fully validated
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' ? true : false
    };
  }

  // Connection pool settings for better performance
  config.max = 20; // Maximum number of clients in the pool
  config.idleTimeoutMillis = 30000; // Close idle clients after 30 seconds
  config.connectionTimeoutMillis = 10000; // Return error after 10 seconds if connection cannot be established (increased for remote DB)

  return config;
};

const pool = new Pool(getPoolConfig());

export const db = drizzle(pool, { schema });
