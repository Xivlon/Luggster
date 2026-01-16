import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { etag } from 'hono/etag';
import { orderRoutes, authRoutes } from './routes.js';
import { db } from './db.js';
import { locations } from './schema.js';

// ============================================================================
// HONO APP SETUP
// ============================================================================

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', etag());

// CORS configuration for API routes
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Request-Id'],
  maxAge: 86400,
}));

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'order-creation-platform',
    environment: c.env.ENVIRONMENT || 'unknown',
  });
});

// ============================================================================
// API ROUTES
// ============================================================================

// Authentication endpoints: /api/auth/signup, /api/auth/login
app.route('/api/auth', authRoutes);

// Order endpoints: /api/orders (create, list, get by ID, get by customer)
app.route('/api/orders', orderRoutes);

// Locations reference data
app.get('/api/locations', async (c) => {
  try {
    const result = await db.select().from(locations);
    return c.json({ locations: result });
  } catch (err) {
    return c.json({ error: 'Failed to fetch locations', details: err.message }, 500);
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    path: c.req.path,
  }, 404);
});

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
  }, 500);
});

// ============================================================================
// EXPORT FOR CLOUDFLARE WORKERS
// ============================================================================

export default app;
