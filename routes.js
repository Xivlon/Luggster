// ============================================================================
// 4. AUTH ROUTES (Signup & Login)
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
      password, // In a real app, hash this!
      firstName,
      lastName,
      phone,
      userType: type || 'customer'
    }).returning({ id: users.id });

    const userId = newUser[0].id;

    // 3. If Driver, create Profile
    if (type === 'driver') {
      await db.insert(driverProfiles).values({
        userId: userId,
        isOnline: true, // Default to online for testing
        vehicleType: vehicleType || 'Standard Sedan',
        vehiclePlate: vehiclePlate || 'NO-PLATE',
        totalDeliveries: 0
      });
    }

    return c.json({ success: true, userId, userType: type }, 201);

  } catch (err) {
    return c.json({ error: err.message }, 500);
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

    // 2. Check Password (Simple check for MVP)
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
    return c.json({ error: err.message }, 500);
  }
});

// Don't forget to export it!
// CHANGE YOUR EXPORT LINE TO THIS:
export { shipmentRoutes, adminRoutes, driverRoutes, authRoutes };
