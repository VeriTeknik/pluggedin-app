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
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_SSL === 'true') {
    config.ssl = {
      // Accept self-signed certificates (no issuer certificate required)
      // Connection is still encrypted, just not fully validated
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' ? true : false
    };
  }

  // Connection pool settings for better performance
  config.max = 20; // Maximum number of clients in the pool
  config.idleTimeoutMillis = 30000; // Close idle clients after 30 seconds
  config.connectionTimeoutMillis = 2000; // Return error after 2 seconds if connection cannot be established

  return config;
};

const pool = new Pool(getPoolConfig());

export const db = drizzle(pool, { schema });
