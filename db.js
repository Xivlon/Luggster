// db.js - Neon PostgreSQL Database Connection
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

let dbInstance = null;

// Lazy-load the database connection
function initializeDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable must be set for database connection');
  }

  const client = neon(connectionString);
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

// Export a getter that lazily initializes the database with proper method binding
export const db = new Proxy({}, {
  get(target, prop) {
    const instance = initializeDatabase();
    const value = instance[prop];
    // Bind functions to preserve 'this' context for ORM methods
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
