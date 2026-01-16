// db.js - Neon PostgreSQL Database Connection
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

// Database connection string (use environment variable in production)
const connectionString = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_wrA2IV4GaHzD@ep-proud-cake-a4m2vdkf-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const client = neon(connectionString);

// Export drizzle instance for use across the application
export const db = drizzle(client, { schema });
