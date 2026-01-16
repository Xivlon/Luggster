import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { orders, customers } from './schema.js';

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
    const existing = await db.select().from(customers).where(eq(customers.email, email));
    if (existing.length > 0) {
      return c.json({ error: 'User already exists' }, 409);
    }

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create customer user
    const newUser = await db.insert(customers).values({
      email,
      password: hashedPassword,
      firstName: firstName || 'Customer',
      lastName: lastName || 'User',
      phone: phone || null
    }).returning({ id: customers.id, email: customers.email });

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
    const user = await db.select().from(customers)
      .where(eq(customers.email, email))
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

    // Validate that customer exists
    const customer = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, body.customerId)).limit(1);
    if (customer.length === 0) {
      return c.json({ error: 'Customer not found' }, 404);
    }

    // Create order/shipment
    const newOrder = await db.insert(orders).values({
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
    const result = await db.select().from(orders).orderBy(desc(orders.createdAt));
    return c.json({ orders: result });
  } catch (err) {
    return c.json({ error: 'Failed to fetch orders', details: err.message }, 500);
  }
});

// GET /api/orders/:id - Get a specific order
orderRoutes.get('/:id', async (c) => {
  try {
    const orderId = c.req.param('id');
    const order = await db.select().from(orders).where(eq(orders.id, orderId));

    if (order.length === 0) {
      return c.json({ error: 'Order not found' }, 404);
    }

    return c.json(order[0]);
  } catch (err) {
    return c.json({ error: 'Failed to fetch order', details: err.message }, 500);
  }
});

// GET /api/orders/customer/:customerId - Get customer's orders
orderRoutes.get('/customer/:customerId', async (c) => {
  try {
    const customerId = c.req.param('customerId');

    if (!customerId) {
      return c.json({ error: 'Customer ID required' }, 400);
    }

    const customerOrders = await db.select()
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt));

    return c.json({ orders: customerOrders });
  } catch (err) {
    return c.json({ error: 'Failed to fetch customer orders', details: err.message }, 500);
  }
});

export { orderRoutes, authRoutes };
