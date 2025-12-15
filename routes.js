import { Hono } from 'hono';
import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from './db.js';
import { shipments, users, driverProfiles, locations } from './schema.js';

// ============================================================================
// 1. SHIPMENT ROUTES (Dispatcher API)
// ============================================================================
const shipmentRoutes = new Hono();

shipmentRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    let userId;
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
    return c.json({ error: "Shipment Create Failed", details: err.message }, 500);
  }
});

shipmentRoutes.get('/', async (c) => {
  try {
    const result = await db.select().from(shipments).orderBy(desc(shipments.createdAt));
    return c.json({ shipments: result });
  } catch (err) {
    return c.json({ error: "List Failed", details: err.message }, 500);
  }
});

// ============================================================================
// 2. ADMIN ROUTES (Dashboard API)
// ============================================================================
const adminRoutes = new Hono();

adminRoutes.get('/stats', async (c) => {
  try {
    const pending = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'PENDING'));
    const assigned = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'ASSIGNED'));
    const pickedUp = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'PICKED_UP'));
    const delivered = await db.select({ count: sql`count(*)` }).from(shipments).where(eq(shipments.status, 'DELIVERED'));
    const revenue = await db.select({ total: sql`sum(${shipments.priceCents})` }).from(shipments).where(eq(shipments.status, 'DELIVERED'));

    // ERROR TRAP: Check if driverProfiles table exists by trying a simple count
    let onlineCount = 0;
    let totalDrivers = 0;
    try {
        const dTotal = await db.select({ count: sql`count(*)` }).from(users).where(eq(users.userType, 'driver'));
        const dOnline = await db.select({ count: sql`count(*)` }).from(driverProfiles).where(eq(driverProfiles.isOnline, true));
        totalDrivers = dTotal[0].count;
        onlineCount = dOnline[0].count;
    } catch (e) {
        console.log("Driver stats failed (table missing?):", e.message);
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
    return c.json({ error: "Admin Shipments Failed", details: err.message }, 500);
  }
});

// The Problematic Route - Wrapped in extensive debugging
adminRoutes.get('/drivers', async (c) => {
  try {
    // 1. Try to fetch raw driver profiles first
    // This usually fails if the table 'driver_profiles' doesn't exist
    const profiles = await db.select().from(driverProfiles).limit(1);

    // 2. If that works, try the join
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
    // RETURN THE ACTUAL DATABASE ERROR SO WE CAN SEE IT
    return c.json({ 
        error: "Driver Fetch Failed", 
        message: err.message,
        hint: "This usually means the table 'driver_profiles' does not exist in Neon, or schema.js is not imported correctly."
    }, 500);
  }
});

// New PUT route for assigning drivers
adminRoutes.put('/shipments/:id/assign', async (c) => {
    try {
      const shipmentId = c.req.param('id');
      const { driverId } = await c.req.json();
  
      if (!driverId) return c.json({ error: 'Driver ID is required' }, 400);
  
      const updated = await db.update(shipments)
        .set({ 
          driverId: driverId,
          status: 'ASSIGNED',
          // updatedAt: new Date() // removed for simplicity if column missing
        })
        .where(eq(shipments.id, shipmentId))
        .returning();
  
      if (updated.length === 0) return c.json({ error: 'Shipment not found' }, 404);
  
      return c.json({ success: true, shipment: updated[0] });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

// ============================================================================
// 3. DRIVER ROUTES (Placeholder)
// ============================================================================
const driverRoutes = new Hono();
driverRoutes.get('/me', (c) => c.json({ msg: 'Driver profile' }));

export { shipmentRoutes, adminRoutes, driverRoutes };
