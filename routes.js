import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db } from './db.js';
import { shipments, users } from './schema.js';
import bcrypt from 'bcryptjs';

// ============================================================================
// AUTH ROUTES (Customer Registration & Login)
// ============================================================================
const authRoutes = new Hono();

// POST /api/auth/signup - Register a customer
authRoutes.post('/signup', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, firstName, lastName, phone } = body;

    // Validate required fields
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    // Check if user exists
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      return c.json({ error: 'User already exists' }, 409);
    }

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create customer user
    const newUser = await db.insert(users).values({
      email,
      password: hashedPassword,
      firstName: firstName || 'Customer',
      lastName: lastName || 'User',
      phone: phone || null
    }).returning({ id: users.id, email: users.email });

    return c.json({
      success: true,
      userId: newUser[0].id,
      email: newUser[0].email
    }, 201);
  } catch (err) {
    return c.json({ error: 'Signup failed', details: err.message }, 500);
  }
});

// POST /api/auth/login - Customer login
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    // Find user by email
    const user = await db.select().from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Verify password using bcrypt
    const isPasswordValid = await bcrypt.compare(password, user[0].password);
    if (!isPasswordValid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Return user info
    return c.json({
      success: true,
      user: {
        id: user[0].id,
        email: user[0].email,
        firstName: user[0].firstName,
        lastName: user[0].lastName,
        phone: user[0].phone
      }
    }, 200);

  } catch (err) {
    return c.json({ error: 'Login failed', details: err.message }, 500);
  }
});

// ============================================================================
// ORDER ROUTES (Order Creation & Retrieval)
// ============================================================================
const orderRoutes = new Hono();

// POST /api/orders - Create a new order
orderRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.customerId || !body.originAirport || !body.destinationAirport ||
        !body.pickupAddress || !body.dropoffAddress || body.priceCents === undefined) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Create order/shipment
    const newOrder = await db.insert(shipments).values({
      customerId: body.customerId,
      originAirport: body.originAirport,
      destinationAirport: body.destinationAirport,
      pickupAddress: body.pickupAddress,
      pickupLatitude: body.pickupLatitude || null,
      pickupLongitude: body.pickupLongitude || null,
      pickupAt: body.pickupAt ? new Date(body.pickupAt) : null,
      dropoffAddress: body.dropoffAddress,
      dropoffLatitude: body.dropoffLatitude || null,
      dropoffLongitude: body.dropoffLongitude || null,
      dropoffBy: body.dropoffBy ? new Date(body.dropoffBy) : null,
      priceCents: body.priceCents,
      currency: body.currency || 'USD',
      notes: body.notes || null
    }).returning();

    return c.json(newOrder[0], 201);
  } catch (err) {
    return c.json({ error: 'Order creation failed', details: err.message }, 500);
  }
});

// GET /api/orders - List all orders
orderRoutes.get('/', async (c) => {
  try {
    const result = await db.select().from(shipments).orderBy(desc(shipments.createdAt));
    return c.json({ orders: result });
  } catch (err) {
    return c.json({ error: 'Failed to fetch orders', details: err.message }, 500);
  }
});

// GET /api/orders/:id - Get a specific order
orderRoutes.get('/:id', async (c) => {
  try {
    const orderId = c.req.param('id');
    const order = await db.select().from(shipments).where(eq(shipments.id, orderId));

    if (order.length === 0) {
      return c.json({ error: 'Order not found' }, 404);
    }

    return c.json(order[0]);
  } catch (err) {
    return c.json({ error: 'Failed to fetch order', details: err.message }, 500);
  }
});

// GET /api/orders?customerId=<id> - Get customer's orders
orderRoutes.get('/customer/:customerId', async (c) => {
  try {
    const customerId = c.req.param('customerId');

    if (!customerId) {
      return c.json({ error: 'Customer ID required' }, 400);
    }

    const customerOrders = await db.select()
      .from(shipments)
      .where(eq(shipments.customerId, customerId))
      .orderBy(desc(shipments.createdAt));

    return c.json({ orders: customerOrders });
  } catch (err) {
    return c.json({ error: 'Failed to fetch customer orders', details: err.message }, 500);
  }
});

export { orderRoutes, authRoutes };
