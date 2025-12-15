import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';


/**
 * Creates a database connection instance for the current request.
 * This should be called per-request in Cloudflare Workers to ensure
 * proper connection handling in the serverless environment.
 * 
 * @param {string} databaseUrl - The Neon PostgreSQL connection string
 * @returns {Object} Drizzle ORM database instance with schema
 */
export function createDb(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  const sql = neon(databaseUrl);
  const db = drizzle(sql, { schema });
  
  return db;
}

/**
 * Helper to get db instance from Hono context
 * @param {Object} c - Hono context
 * @returns {Object} Drizzle ORM database instance
 */
export function getDb(c) {
  const databaseUrl = c.env.DATABASE_URL;
  return createDb(databaseUrl);
}

// Re-export schema for convenience
export { schema };
