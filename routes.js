import { Hono } from 'hono';
import { eq, desc, sql, and, or } from 'drizzle-orm';
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
    // Add 'username' to the list of things we read
    const { email, password, firstName, lastName, phone, type, vehicleType, vehiclePlate, username } = body;

    // 1. Check if user exists
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      return c.json({ error: 'User already exists' }, 409);
    }

    // NEW: Check if username is taken (only if they provided one)
    if (username) {
        const taken = await db.select().from(users).where(eq(users.username, username));
        if (taken.length > 0) return c.json({ error: 'Username already taken' }, 409);
    }

    // 2. Create User
    const newUser = await db.insert(users).values({
      email,
      password, // Note: In a real app, hash this password!
      username: username || null, // 👈 Save the username!
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
    const body = await c.req.json();
    
    // 1. SMART INPUT HANDLING
    // We accept 'email', 'username', or the React Team's 'identifier'
    // We treat whatever they sent as the "login handle"
    let loginHandle = body.email || body.username || body.identifier;

    // Handle the specific array case your Dev Team was sending
    if (Array.isArray(body) && body.length > 0) {
        if (body[0] && typeof body[0] === 'object') {
            loginHandle = body[0].username || body[0].email;
        }
    }

    if (!loginHandle) return c.json({ error: 'Missing email or username' }, 400);

    // 2. SMART QUERY: Check if it matches Email OR Username
    const user = await db.select().from(users)
      .where(or(
        eq(users.email, loginHandle), 
        and(eq(users.username, loginHandle), sql`${users.username} IS NOT NULL`)
      ))
      .limit(1);
    
    if (user.length === 0) {
      return c.json({ error: 'User not found' }, 401);
    }

    // 3. Password Check
    // (Note: Your dev team sends { username, password } inside an array sometimes. 
    // We need to grab the password safely).
    let inputPassword = body.password;
    if (Array.isArray(body) && body.length > 0 && body[0] && typeof body[0] === 'object') {
        inputPassword = body[0].password;
    }

    if (!inputPassword || user[0].password !== inputPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // 4. If Driver, get Profile
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
        username: user[0].username, // Return the username too
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
// 4. DRIVER ROUTES (Job Board & Acceptance)
// ============================================================================
const driverRoutes = new Hono();

// 1. Get Profile (Keep this for the frontend check)
driverRoutes.get('/me', (c) => c.json({ msg: 'Driver profile active' }));

// 2. See Available Jobs (Only shows PENDING jobs)
driverRoutes.get('/shipments/available', async (c) => {
  try {
    const openJobs = await db.select()
      .from(shipments)
      .where(eq(shipments.status, 'PENDING'))
      .orderBy(desc(shipments.createdAt));
    
    return c.json({ success: true, jobs: openJobs });
  } catch (err) {
    return c.json({ error: "Failed to fetch jobs", details: err.message }, 500);
  }
});

// 3. Accept a Job
driverRoutes.post('/shipments/:id/accept', async (c) => {
  try {
    const shipmentId = c.req.param('id');
    const { driverId } = await c.req.json(); // Frontend must send { "driverId": "..." }

    if (!driverId) return c.json({ error: "Driver ID missing" }, 400);

    // Atomic Update: Only update if it is still PENDING
    // This prevents two drivers from grabbing the same job
    const result = await db.update(shipments)
      .set({
        driverId: driverId,
        status: 'ASSIGNED'
      })
      .where(and(
        eq(shipments.id, shipmentId),
        eq(shipments.status, 'PENDING')
      ))
      .returning();

    if (result.length === 0) {
      return c.json({ error: "Job no longer available or already taken" }, 409);
    }

    // Increment Driver's "Total Deliveries" count (Optional nice-to-have)
    await db.execute(sql`UPDATE driver_profiles SET total_deliveries = total_deliveries + 1 WHERE user_id = ${driverId}`);

    return c.json({ success: true, job: result[0] });

  } catch (err) {
    return c.json({ error: "Accept failed", details: err.message }, 500);
  }
});

// 4. See My Jobs (Active & Past)
driverRoutes.get('/shipments/my-jobs', async (c) => {
  try {
    const driverId = c.req.query('driverId');
    if (!driverId) return c.json({ error: "Driver ID required" }, 400);

    const myJobs = await db.select()
      .from(shipments)
      .where(eq(shipments.driverId, driverId))
      .orderBy(desc(shipments.createdAt));

    return c.json({ success: true, jobs: myJobs });
  } catch (err) {
    return c.json({ error: "Failed to fetch history", details: err.message }, 500);
  }
});

export { shipmentRoutes, adminRoutes, driverRoutes, authRoutes };
