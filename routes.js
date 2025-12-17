import { Hono } from 'hono';
import { eq, desc, sql, and, or } from 'drizzle-orm';
import { sign, verify } from 'hono/jwt';
import { db } from './db.js';
import { shipments, users, driverProfiles } from './schema.js';

// ============================================================================
// MIDDLEWARE: Check for valid Token
// ============================================================================
const authMiddleware = async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Unauthorized: Missing Token' }, 401);

    const token = authHeader.replace('Bearer ', '');
    
    //Read from Cloudflare Vault
    const secret = c.env.JWT_SECRET; 
    
    if (!secret) {
        console.error("CRITICAL: JWT_SECRET is missing from environment variables!");
        return c.json({ error: 'Server Configuration Error' }, 500);
    }

    const payload = await verify(token, secret);
    c.set('jwtPayload', payload); // Attach user info to request
    await next();
  } catch (err) {
    return c.json({ error: 'Unauthorized: Invalid Token' }, 401);
  }
};

// ============================================================================
// 1. AUTH ROUTES (Signup & Login)
// ============================================================================
const authRoutes = new Hono();

// POST /api/auth/signup
authRoutes.post('/signup', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, firstName, lastName, phone, type, vehicleType, vehiclePlate, username } = body;

    // 1. Check if user exists
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length > 0) return c.json({ error: 'User already exists' }, 409);

    if (username) {
        const taken = await db.select().from(users).where(eq(users.username, username));
        if (taken.length > 0) return c.json({ error: 'Username already taken' }, 409);
    }

    // 2. Create User
    const newUser = await db.insert(users).values({
      email,
      password, 
      username: username || null,
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
        isOnline: true,
        vehicleType: vehicleType || 'Standard Vehicle',
        vehiclePlate: vehiclePlate || 'NO-PLATE',
        totalDeliveries: 0
      });
    }

    return c.json({ success: true, userId, userType: type }, 201);
  } catch (err) {
    return c.json({ error: "Signup Failed", details: err.message }, 500);
  }
});

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    
    // 1. SMART INPUT HANDLING
    let loginHandle = body.email || body.username || body.identifier;
    // Handle array case
    if (Array.isArray(body) && body.length > 0 && body[0] && typeof body[0] === 'object') {
        loginHandle = body[0].username || body[0].email;
    }

    if (!loginHandle) return c.json({ error: 'Missing email or username' }, 400);

    // 2. SMART QUERY
    const user = await db.select().from(users)
      .where(or(
        eq(users.email, loginHandle), 
        and(eq(users.username, loginHandle), sql`${users.username} IS NOT NULL`)
      ))
      .limit(1);
    
    if (user.length === 0) return c.json({ error: 'User not found' }, 401);

    // 3. Password Check
    let inputPassword = body.password;
    if (Array.isArray(body) && body.length > 0 && body[0] && typeof body[0] === 'object') {
        inputPassword = body[0].password;
    }

    if (!inputPassword || user[0].password !== inputPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // 4. Get Driver Profile (FIXED: Done BEFORE returning)
    let driverData = null;
    if (user[0].userType === 'driver') {
      const profile = await db.select().from(driverProfiles).where(eq(driverProfiles.userId, user[0].id));
      if (profile.length > 0) driverData = profile[0];
    }

    // 5. Generate Token
    const secret = c.env.JWT_SECRET;
    if (!secret) return c.json({ error: "Server Error: No Secret" }, 500);

    const token = await sign({
      id: user[0].id,
      email: user[0].email,
      type: user[0].userType,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days
    }, secret);

    // 6. Return Everything
    return c.json({
      success: true,
      token: token,
      user: {
        id: user[0].id,
        name: `${user[0].firstName} ${user[0].lastName}`,
        email: user[0].email,
        username: user[0].username,
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

// Create Shipment
shipmentRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    let userId;
    
    // Find or Create Guest User
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

    // Create Shipment
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

// List Shipments
shipmentRoutes.get('/', async (c) => {
  try {
    const result = await db.select().from(shipments).orderBy(desc(shipments.createdAt));
    return c.json({ shipments: result });
  } catch (err) {
    return c.json({ error: "List Shipments Failed", details: err.message }, 500);
  }
});

// Get My Orders (For Customer App)
shipmentRoutes.get('/my-orders', async (c) => {
  try {
    const email = c.req.query('email');
    if (!email) return c.json({ error: "Email required" }, 400);

    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user.length === 0) return c.json({ shipments: [] });

    const myShipments = await db.select()
      .from(shipments)
      .where(eq(shipments.customerId, user[0].id))
      .orderBy(desc(shipments.createdAt));

    return c.json({ success: true, shipments: myShipments });
  } catch (err) {
    return c.json({ error: "Fetch failed", details: err.message }, 500);
  }
});

// ============================================================================
// 3. ADMIN ROUTES
// ============================================================================
const adminRoutes = new Hono();

adminRoutes.get('/stats', async (c) => {
  try {
    const pending = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'PENDING'));
    const assigned = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'ASSIGNED'));
    const pickedUp = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'PICKED_UP'));
    const delivered = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'DELIVERED'));
    const revenue = await db.select({ total: sql`sum(${shipments.priceCents})` }).from(shipments).where(eq(shipments.status, 'DELIVERED'));

    let totalDrivers = 0;
    let onlineCount = 0;
    try {
        const dTotal = await db.select({ count: sql`count(*)` }).from(users).where(eq(users.userType, 'driver'));
        const dOnline = await db.select({ count: sql`count(*)` }).from(driverProfiles).where(eq(driverProfiles.isOnline, true));
        totalDrivers = dTotal[0].count;
        onlineCount = dOnline[0].count;
    } catch (e) {}

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

adminRoutes.get('/drivers', async (c) => {
  try {
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
    return c.json({ error: "Driver List Failed", message: err.message }, 500);
  }
});

adminRoutes.put('/shipments/:id/assign', async (c) => {
  try {
    const shipmentId = c.req.param('id');
    const { driverId } = await c.req.json();
    if (!driverId) return c.json({ error: 'Driver ID is required' }, 400);

    const updated = await db.update(shipments)
      .set({ driverId: driverId, status: 'ASSIGNED' })
      .where(eq(shipments.id, shipmentId))
      .returning();

    if (updated.length === 0) return c.json({ error: 'Shipment not found' }, 404);
    return c.json({ success: true, shipment: updated[0] });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});
// GET /api/admin/shipments
// This is what the Ops Dashboard fetches to fill the table
adminRoutes.get('/shipments', async (c) => {
  try {
    const status = c.req.query('status');
    
    let query = db.select().from(shipments).orderBy(desc(shipments.createdAt));
    
    // Optional: Filter by status if sent
    if (status) {
        query = db.select().from(shipments)
          .where(eq(shipments.status, status))
          .orderBy(desc(shipments.createdAt));
    }
    
    const list = await query;
    return c.json({ shipments: list });
    
  } catch (err) {
    return c.json({ error: "Admin List Failed", details: err.message }, 500);
  }
});
// ============================================================================
// 4. DRIVER ROUTES
// ============================================================================
const driverRoutes = new Hono();

driverRoutes.get('/me', (c) => c.json({ msg: 'Driver profile active' }));

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

driverRoutes.post('/shipments/:id/accept', async (c) => {
  try {
    const shipmentId = c.req.param('id');
    const { driverId } = await c.req.json();

    if (!driverId) return c.json({ error: "Driver ID missing" }, 400);

    const result = await db.update(shipments)
      .set({ driverId: driverId, status: 'ASSIGNED' })
      .where(and(eq(shipments.id, shipmentId), eq(shipments.status, 'PENDING')))
      .returning();

    if (result.length === 0) return c.json({ error: "Job unavailable" }, 409);

    await db.update(driverProfiles)
      .set({ totalDeliveries: sql`${driverProfiles.totalDeliveries} + 1` })
      .where(eq(driverProfiles.userId, driverId));

    return c.json({ success: true, job: result[0] });
  } catch (err) {
    return c.json({ error: "Accept failed", details: err.message }, 500);
  }
});

// See My Jobs (History)
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

//Active Route protected by Middleware
driverRoutes.use('/active', authMiddleware);

driverRoutes.get('/active', async (c) => {
  try {
    // Get Driver ID from the Token Payload
    const payload = c.get('jwtPayload');
    const driverId = payload.id; 

    if (!driverId) return c.json({ error: "Token missing driver ID" }, 400);

    const activeJobs = await db.select()
      .from(shipments)
      .where(and(
        eq(shipments.driverId, driverId),
        or(eq(shipments.status, 'ASSIGNED'), eq(shipments.status, 'PICKED_UP'))
      ))
      .orderBy(desc(shipments.createdAt));

    return c.json({ success: true, orders: activeJobs });
  } catch (err) {
    return c.json({ error: "Failed to fetch active orders", details: err.message }, 500);
  }
});
//Driver: Mark as PICKED UP (Now saves photo!)
driverRoutes.post('/shipments/:id/pickup', async (c) => {
  try {
    const shipmentId = c.req.param('id');
    const { driverId, photoUrl } = await c.req.json(); // 👈 Accept photoUrl

    const result = await db.update(shipments)
      .set({ 
        status: 'PICKED_UP',
        pickupPhotoUrl: photoUrl || null // 👈 Save it here
      })
      .where(and(
        eq(shipments.id, shipmentId),
        eq(shipments.driverId, driverId),
        eq(shipments.status, 'ASSIGNED')
      ))
      .returning();

    if (result.length === 0) return c.json({ error: "Cannot pick up. Check status." }, 400);
    return c.json({ success: true, status: 'PICKED_UP', shipment: result[0] });
  } catch (err) {
    return c.json({ error: "Pickup failed", details: err.message }, 500);
  }
});

//Driver: Mark as DELIVERED (Now saves photo!)
driverRoutes.post('/shipments/:id/deliver', async (c) => {
  try {
    const shipmentId = c.req.param('id');
    const { driverId, photoUrl } = await c.req.json();

    const result = await db.update(shipments)
      .set({ 
        status: 'DELIVERED',
        dropoffBy: new Date(), 
        deliveryPhotoUrl: photoUrl || null
      })
      .where(and(
        eq(shipments.id, shipmentId),
        eq(shipments.driverId, driverId),
        eq(shipments.status, 'PICKED_UP')
      ))
      .returning();

    if (result.length === 0) return c.json({ error: "Cannot deliver. Check status." }, 400);

    // Update stats
    await db.update(driverProfiles)
      .set({ totalDeliveries: sql`${driverProfiles.totalDeliveries} + 1` })
      .where(eq(driverProfiles.userId, driverId));

    return c.json({ success: true, status: 'DELIVERED', shipment: result[0] });
  } catch (err) {
    return c.json({ error: "Delivery failed", details: err.message }, 500);
  }
});
// ============================================================================
// 5. UPLOAD ROUTE (For Proof of Delivery)
// ============================================================================
const uploadRoutes = new Hono();

// POST /api/upload
// The App sends the file here -> We save to R2 -> We return the URL
uploadRoutes.post('/', async (c) => {
  try {
    const body = await c.req.parseBody(); // Parse "multipart/form-data"
    const file = body['file']; // The App must name the field "file"

    if (!file) return c.json({ error: "No file uploaded" }, 400);

    // 1. Generate a unique name (e.g., "proof-12345.jpg")
    const fileName = `proof-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    // 2. Save directly to R2 Bucket
    await c.env.MY_BUCKET.put(fileName, file);

    // 3. Return the Public URL
    const publicUrl = `https://2c905270a590526b80946b04b64c9a4e.r2.cloudflarestorage.com/luggster-photos/${fileName}`; 

    return c.json({ success: true, url: publicUrl });

  } catch (err) {
    return c.json({ error: "Upload failed", details: err.message }, 500);
  }
});
export { shipmentRoutes, adminRoutes, driverRoutes, authRoutes, uploadRoutes };
