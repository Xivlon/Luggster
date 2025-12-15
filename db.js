// db.js
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

const connectionString = "postgresql://neondb_owner:npg_wrA2IV4GaHzD@ep-proud-cake-a4m2vdkf-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const client = neon(connectionString);

// This simple export is exactly what server.js is looking for
export const db = drizzle(client, { schema });
export function getDb(c) {
  return db;
}
