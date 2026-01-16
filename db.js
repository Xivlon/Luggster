// db.js - Neon PostgreSQL Database Connection
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

// Database connection string (must be provided via environment variable)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable must be set for database connection');
}
const client = neon(connectionString);

// Export drizzle instance for use across the application
export const db = drizzle(client, { schema });
