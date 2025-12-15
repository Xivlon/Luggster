import { Hono } from 'hono';
import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from './db.js';
import { shipments, users, driverProfiles, locations } from './schema.js'; 

// ============================================================================
// 1. AUTH ROUTES (Signup & Login)
// ============================================================================
const authRoutes = new Hono();

// POST /api/auth/signup
authRoutes.post('/signup', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, firstName, lastName, phone, type, vehicleType, vehiclePlate } = body;

    // 1. Check if user exists
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      return c.json({ error: 'User already exists' }, 409);
    }

    // 2. Create User
    const newUser = await db.insert(users).values({
      email,
      password, // Note: In a real app, hash this password!
      firstName: firstName || 'New',
      lastName: lastName || 'User',
      phone,
      userType: type || 'customer'
    }).returning({ id: users.id });

    const userId = newUser[0].id;

    // 3. If Driver, create Profile
    if (type === 'driver') {
      await db.insert(driverProfiles).values({
        userId: userId,
        isOnline: true, // Default to online for immediate testing
        vehicleType: vehicleType || 'Standard Vehicle',
        vehiclePlate: vehiclePlate || 'NO-PLATE',
        totalDeliveries: 0
      });
    }

    return c.json({ success: true, userId, userType: type }, 201);

  } catch (err) {
    console.error("Signup Error:", err);
    return c.json({ error: "Signup Failed", details: err.message }, 500);
  }
});

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json();

    // 1. Find User
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (user.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // 2. Check Password (Simple comparison for MVP)
    if (user[0].password !== password) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // 3. If Driver, get Profile Status
    let driverData = null;
    if (user[0].userType === 'driver') {
      const profile = await db.select().from(driverProfiles).where(eq(driverProfiles.userId, user[0].id));
      if (profile.length > 0) driverData = profile[0];
    }

    return c.json({
      success: true,
      user: {
        id: user[0].id,
        name: `${user[0].firstName} ${user[0].lastName}`,
        email: user[0].email,
        type: user[0].userType
      },
      driverProfile: driverData
    });

  } catch (err) {
    return c.json({ error: "Login Failed", details: err.message }, 500);
  }
});

// ============================================================================
// 2. SHIPMENT ROUTES (Dispatcher API)
// ============================================================================
const shipmentRoutes = new Hono();

shipmentRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    let userId;
    
    // 1. Find or Create Guest User
    const existingUser = await db.select().from(users).where(eq(users.email, body.customerDetails.email)).limit(1);
    
    if (existingUser.length > 0) {
      userId = existingUser[0].id;
    } else {
      const newUser = await db.insert(users).values({
        email: body.customerDetails.email,
        firstName: body.customerDetails.name.split(' ')[0] || 'Guest',
        lastName: body.customerDetails.name.split(' ').slice(1).join(' ') || 'User',
        phone: body.customerDetails.phone,
        userType: 'customer'
      }).returning({ id: users.id });
      userId = newUser[0].id;
    }

    // 2. Create Shipment
    const newShipment = await db.insert(shipments).values({
      customerId: userId,
      status: 'PENDING',
      originAirport: body.originAirport,
      destinationAirport: body.destinationAirport,
      pickupAddress: body.pickupAddress,
      pickupLatitude: body.pickupLatitude,
      pickupLongitude: body.pickupLongitude,
      pickupAt: new Date(body.pickupAt),
      dropoffAddress: body.dropoffAddress,
      dropoffLatitude: body.dropoffLatitude,
      dropoffLongitude: body.dropoffLongitude,
      dropoffBy: new Date(body.dropoffBy),
      priceCents: body.priceCents,
      currency: body.currency || 'USD',
      notes: body.notes
    }).returning();

    return c.json(newShipment[0], 201);
  } catch (err) {
    return c.json({ error: "Create Shipment Failed", details: err.message }, 500);
  }
});

shipmentRoutes.get('/', async (c) => {
  try {
    const result = await db.select().from(shipments).orderBy(desc(shipments.createdAt));
    return c.json({ shipments: result });
  } catch (err) {
    return c.json({ error: "List Shipments Failed", details: err.message }, 500);
  }
});

// ============================================================================
// 3. ADMIN ROUTES (Dashboard API)
// ============================================================================
const adminRoutes = new Hono();

adminRoutes.get('/stats', async (c) => {
  try {
    const pending = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'PENDING'));
    const assigned = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'ASSIGNED'));
    const pickedUp = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'PICKED_UP'));
    const delivered = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'DELIVERED'));
    const revenue = await db.select({ total: sql`sum(${shipments.priceCents})` }).from(shipments).where(eq(shipments.status, 'DELIVERED'));

    // Safe Driver Stats Fetching
    let totalDrivers = 0;
    let onlineCount = 0;
    try {
        const dTotal = await db.select({ count: sql`count(*)` }).from(users).where(eq(users.userType, 'driver'));
        const dOnline = await db.select({ count: sql`count(*)` }).from(driverProfiles).where(eq(driverProfiles.isOnline, true));
        totalDrivers = dTotal[0].count;
        onlineCount = dOnline[0].count;
    } catch (e) {
        console.log("Driver stats skipped: Table might not exist yet.");
    }

    return c.json({
      shipments: {
        pending: pending[0].count,
        assigned: assigned[0].count,
        pickedUp: pickedUp[0].count,
        delivered: delivered[0].count
      },
      revenue: {
        totalDollars: ((revenue[0].total || 0) / 100).toFixed(2)
      },
      drivers: {
        total: totalDrivers,
        online: onlineCount
      }
    });
  } catch (err) {
    return c.json({ error: "Stats Failed", details: err.message }, 500);
  }
});

adminRoutes.get('/shipments', async (c) => {
  try {
    const status = c.req.query('status');
    let query = db.select().from(shipments).orderBy(desc(shipments.createdAt));
    if (status) query = db.select().from(shipments).where(eq(shipments.status, status)).orderBy(desc(shipments.createdAt));
    const list = await query;
    return c.json({ shipments: list });
  } catch (err) {
    return c.json({ error: "Admin List Failed", details: err.message }, 500);
  }
});

adminRoutes.get('/drivers', async (c) => {
  try {
    // 1. Safe Join - Joins Users with DriverProfiles
    const list = await db.select({
      id: users.id,
      name: users.firstName,
      email: users.email,
      isOnline: driverProfiles.isOnline,
      vehicleType: driverProfiles.vehicleType,
      totalDeliveries: driverProfiles.totalDeliveries
    })
    .from(users)
    .innerJoin(driverProfiles, eq(users.id, driverProfiles.userId))
    .where(eq(users.userType, 'driver'));

    return c.json({ drivers: list });

  } catch (err) {
    return c.json({ 
        error: "Driver List Failed", 
        message: err.message,
        hint: "Run the SQL command to create 'driver_profiles' table."
    }, 500);
  }
});

// Assign Driver
adminRoutes.put('/shipments/:id/assign', async (c) => {
  try {
    const shipmentId = c.req.param('id');
    const { driverId } = await c.req.json();

    if (!driverId) return c.json({ error: 'Driver ID is required' }, 400);

    const updated = await db.update(shipments)
      .set({ 
        driverId: driverId,
        status: 'ASSIGNED'
      })
      .where(eq(shipments.id, shipmentId))
      .returning();

    if (updated.length === 0) return c.json({ error: 'Shipment not found' }, 404);

    return c.json({ success: true, shipment: updated[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});
authRoutes.get('/signup', (c) => {
  return c.json({ message: "Alive! The API is connected. Now send a POST request." });
});
// TEMPORARY: Test route to prove /api/auth/login exists
authRoutes.get('/login', (c) => {
  return c.json({ 
    status: "online", 
    message: "Login endpoint is reachable! Send a POST request with email/password to sign in." 
  });
});

// ============================================================================
// 4. DRIVER ROUTES (Placeholder)
// ============================================================================
const driverRoutes = new Hono();
driverRoutes.get('/me', (c) => c.json({ msg: 'Driver profile placeholder' }));

// Export everything
export { shipmentRoutes, adminRoutes, driverRoutes, authRoutes };
