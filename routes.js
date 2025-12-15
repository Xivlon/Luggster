import { Hono } from 'hono';
import { eq, and, isNull, sql, desc, asc } from 'drizzle-orm';
import { getDb } from './db.js';
import { users, shipments, driverProfiles } from './schema.js';
import { uploadBase64Photo, listShipmentPhotos } from './storage.js';

// Create route groups
export const shipmentRoutes = new Hono();
export const driverRoutes = new Hono();
export const adminRoutes = new Hono();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sanitizes and converts date strings to Date objects
 */
function sanitizeDate(dateInput) {
  if (!dateInput) {
    throw new Error('Date is required');
  }
  
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) {
      throw new Error('Invalid Date object');
    }
    return dateInput;
  }
  
  const parsed = new Date(dateInput);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: ${dateInput}`);
  }
  
  return parsed;
}

/**
 * Finds or creates a user by email with robust name splitting
 */
async function findOrCreateCustomer(db, customerDetails) {
  const { email, name, phone } = customerDetails || {};
  
  if (!email || typeof email !== 'string') {
    throw new Error('Valid email is required');
  }
  
  const normalizedEmail = email.toLowerCase().trim();
  
  // 1. Try to find existing user
  const existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  
  if (existingUsers.length > 0) {
    return existingUsers[0];
  }
  
  // 2. Name Splitting Logic (The Fix)
  // The database needs firstName/lastName, but we only have 'name'
  const safeName = (name && name.trim().length > 0) ? name.trim() : 'Guest User';
  const nameParts = safeName.split(' ');
  const firstName = nameParts[0] || 'Guest';
  const lastName = nameParts.slice(1).join(' ') || 'User';

  // 3. Create new user
  const newUsers = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      firstName: firstName,  // Now correctly defined!
      lastName: lastName,    // Now correctly defined!
      password: Math.random().toString(36), // Random placeholder password
      phone: phone || null,
      userType: 'customer',
    })
    .returning();
  
  return newUsers[0];
}

/**
 * Validates UUID format
 */
function isValidUUID(id) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// ============================================================================
// MAIN SHIPMENT ROUTES (For Dispatcher Console)
// ============================================================================

/**
 * POST /api/shipments
 * Creates a new luggage shipment - handles the dispatcher console payload
 */
shipmentRoutes.post('/', async (c) => {
  try {
    const db = getDb(c);
    const body = await c.req.json();
    
    console.log('Received shipment payload:', JSON.stringify(body, null, 2));
    
    const {
      customerId: rawCustomerId,
      customerDetails,
      luggageId,
      originAirport,
      destinationAirport,
      pickupAt: rawPickupAt,
      dropoffBy: rawDropoffBy,
      priceCents: rawPriceCents,
      currency = 'USD',
      notes,
    } = body;
    
    // Validate required fields
    if (!rawPickupAt) {
      return c.json({ error: 'Pickup time (pickupAt) is required' }, 400);
    }
    if (!rawDropoffBy) {
      return c.json({ error: 'Dropoff time (dropoffBy) is required' }, 400);
    }
    if (rawPriceCents === undefined || rawPriceCents === null) {
      return c.json({ error: 'Price (priceCents) is required' }, 400);
    }
    
    // Sanitize dates
    let pickupAt, dropoffBy;
    try {
      pickupAt = sanitizeDate(rawPickupAt);
      dropoffBy = sanitizeDate(rawDropoffBy);
    } catch (dateError) {
      return c.json({ error: dateError.message }, 400);
    }
    
    if (dropoffBy <= pickupAt) {
      return c.json({ error: 'Dropoff time must be after pickup time' }, 400);
    }
    
    // Resolve customer
    let customer;
    if (customerDetails && customerDetails.email) {
      try {
        customer = await findOrCreateCustomer(db, customerDetails);
      } catch (userError) {
        return c.json({ error: userError.message }, 400);
      }
    } else if (rawCustomerId && isValidUUID(rawCustomerId)) {
      const existingCustomers = await db
        .select()
        .from(users)
        .where(eq(users.id, rawCustomerId))
        .limit(1);
      
      if (existingCustomers.length > 0) {
        customer = existingCustomers[0];
      } else {
        return c.json({ error: 'Customer not found and no email provided to create one' }, 400);
      }
    } else {
      return c.json({ error: 'Customer details (email) or valid customer ID is required' }, 400);
    }
    
    const priceCents = Math.round(Number(rawPriceCents));
    if (isNaN(priceCents) || priceCents < 0) {
      return c.json({ error: 'Invalid price' }, 400);
    }
    
    // Create shipment
    const newShipments = await db
      .insert(shipments)
      .values({
        customerId: customer.id,
        luggageId: luggageId && isValidUUID(luggageId) ? luggageId : null,
        status: 'PENDING',
        originAirport: originAirport || null,
        destinationAirport: destinationAirport || null,
        pickupAt,
        dropoffBy,
        priceCents,
        currency,
        notes: notes || null,
      })
      .returning();
    
    const shipment = newShipments[0];
    
    console.log('Created shipment:', shipment.id);
    
    return c.json({
      id: shipment.id,
      status: shipment.status,
      customerId: customer.id,
      customerEmail: customer.email,
      originAirport: shipment.originAirport,
      destinationAirport: shipment.destinationAirport,
      pickupAt: shipment.pickupAt,
      dropoffBy: shipment.dropoffBy,
      priceCents: shipment.priceCents,
      currency: shipment.currency,
      createdAt: shipment.createdAt,
    }, 201);
    
  } catch (error) {
    console.error('Create shipment error:', error);
    return c.json({ error: 'Failed to create shipment', details: error.message }, 500);
  }
});

/**
 * GET /api/shipments
 */
shipmentRoutes.get('/', async (c) => {
  try {
    const db = getDb(c);
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');
    
    let query = db.select().from(shipments);
    
    if (status) {
      query = query.where(eq(shipments.status, status));
    }
    
    const results = await query
      .orderBy(desc(shipments.createdAt))
      .limit(limit)
      .offset(offset);
    
    return c.json({ shipments: results });
    
  } catch (error) {
    console.error('List shipments error:', error);
    return c.json({ error: 'Failed to list shipments' }, 500);
  }
});

/**
 * GET /api/shipments/:id
 */
shipmentRoutes.get('/:id', async (c) => {
  try {
    const db = getDb(c);
    const shipmentId = c.req.param('id');
    
    if (!isValidUUID(shipmentId)) {
      return c.json({ error: 'Invalid shipment ID' }, 400);
    }
    
    const results = await db
      .select()
      .from(shipments)
      .where(eq(shipments.id, shipmentId))
      .limit(1);
    
    if (results.length === 0) {
      return c.json({ error: 'Shipment not found' }, 404);
    }
    
    return c.json(results[0]);
    
  } catch (error) {
    console.error('Get shipment error:', error);
    return c.json({ error: 'Failed to get shipment' }, 500);
  }
});

// ============================================================================
// DRIVER API ROUTES (For React Native App)
// ============================================================================

/**
 * GET /api/driver/shipments/available
 */
driverRoutes.get('/shipments/available', async (c) => {
  try {
    const db = getDb(c);
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
    
    const availableShipments = await db
      .select({
        id: shipments.id,
        originAirport: shipments.originAirport,
        destinationAirport: shipments.destinationAirport,
        pickupAddress: shipments.pickupAddress,
        pickupLatitude: shipments.pickupLatitude,
        pickupLongitude: shipments.pickupLongitude,
        pickupAt: shipments.pickupAt,
        dropoffAddress: shipments.dropoffAddress,
        dropoffLatitude: shipments.dropoffLatitude,
        dropoffLongitude: shipments.dropoffLongitude,
        dropoffBy: shipments.dropoffBy,
        distanceMiles: shipments.distanceMiles,
        priceCents: shipments.priceCents,
        currency: shipments.currency,
        notes: shipments.notes,
        createdAt: shipments.createdAt,
      })
      .from(shipments)
      .where(eq(shipments.status, 'PENDING'))
      .orderBy(asc(shipments.pickupAt))
      .limit(limit);
    
    return c.json({
      shipments: availableShipments,
      count: availableShipments.length,
    });
    
  } catch (error) {
    console.error('Get available shipments error:', error);
    return c.json({ error: 'Failed to get available shipments' }, 500);
  }
});

/**
 * POST /api/driver/shipments/:id/claim
 */
driverRoutes.post('/shipments/:id/claim', async (c) => {
  try {
    const db = getDb(c);
    const shipmentId = c.req.param('id');
    const body = await c.req.json();
    const { driverId } = body;
    
    if (!isValidUUID(shipmentId)) {
      return c.json({ error: 'Invalid shipment ID' }, 400);
    }
    if (!driverId || !isValidUUID(driverId)) {
      return c.json({ error: 'Valid driver ID is required' }, 400);
    }
    
    const driverResults = await db
      .select()
      .from(users)
      .where(and(eq(users.id, driverId), eq(users.userType, 'driver')))
      .limit(1);
    
    if (driverResults.length === 0) {
      return c.json({ error: 'Driver not found' }, 404);
    }
    
    // ATOMIC CLAIM
    const updateResult = await db
      .update(shipments)
      .set({
        driverId,
        status: 'ASSIGNED',
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(shipments.id, shipmentId),
          eq(shipments.status, 'PENDING'),
          isNull(shipments.driverId)
        )
      )
      .returning();
    
    if (updateResult.length === 0) {
      const existingShipment = await db
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId))
        .limit(1);
      
      if (existingShipment.length === 0) {
        return c.json({ error: 'Shipment not found' }, 404);
      }
      
      if (existingShipment[0].driverId) {
        return c.json({ 
          error: 'Shipment already claimed',
          claimedBy: existingShipment[0].driverId,
        }, 409);
      }
      
      if (existingShipment[0].status !== 'PENDING') {
        return c.json({ 
          error: 'Shipment is not available',
          status: existingShipment[0].status,
        }, 409);
      }
      
      return c.json({ error: 'Failed to claim shipment' }, 500);
    }
    
    return c.json({
      success: true,
      message: 'Shipment claimed successfully',
      shipment: updateResult[0],
    });
    
  } catch (error) {
    console.error('Claim shipment error:', error);
    return c.json({ error: 'Failed to claim shipment' }, 500);
  }
});

/**
 * PATCH /api/driver/shipments/:id/status
 */
driverRoutes.patch('/shipments/:id/status', async (c) => {
  try {
    const db = getDb(c);
    const bucket = c.env.R2_PHOTOS;
    const shipmentId = c.req.param('id');
    const body = await c.req.json();
    
    const { 
      driverId,
      status: newStatus,
      pickupPhoto,
      deliveryPhoto,
      signature,
      driverNotes,
    } = body;
    
    if (!isValidUUID(shipmentId)) {
      return c.json({ error: 'Invalid shipment ID' }, 400);
    }
    if (!driverId || !isValidUUID(driverId)) {
      return c.json({ error: 'Valid driver ID is required' }, 400);
    }
    
    const validStatuses = ['PICKED_UP', 'DELIVERED'];
    if (!validStatuses.includes(newStatus)) {
      return c.json({ 
        error: 'Invalid status. Must be PICKED_UP or DELIVERED',
      }, 400);
    }
    
    const currentShipments = await db
      .select()
      .from(shipments)
      .where(eq(shipments.id, shipmentId))
      .limit(1);
    
    if (currentShipments.length === 0) {
      return c.json({ error: 'Shipment not found' }, 404);
    }
    
    const currentShipment = currentShipments[0];
    
    if (currentShipment.driverId !== driverId) {
      return c.json({ error: 'Not authorized to update this shipment' }, 403);
    }
    
    const validTransitions = {
      'ASSIGNED': ['PICKED_UP'],
      'PICKED_UP': ['DELIVERED'],
    };
    
    if (!validTransitions[currentShipment.status]?.includes(newStatus)) {
      return c.json({ 
        error: `Invalid status transition from ${currentShipment.status} to ${newStatus}`,
      }, 400);
    }
    
    const updateData = {
      status: newStatus,
      updatedAt: new Date(),
    };
    
    if (driverNotes !== undefined) {
      const existingNotes = currentShipment.notes || '';
      updateData.notes = existingNotes + '\n\nDRIVER NOTES: ' + driverNotes;
    }
    
    if (newStatus === 'PICKED_UP') {
      updateData.pickedUpAt = new Date();
      
      if (pickupPhoto && bucket) {
        const uploadResult = await uploadBase64Photo(bucket, shipmentId, 'pickup', pickupPhoto, { driverId });
        if (uploadResult.success) {
          updateData.pickupPhotoUrl = uploadResult.path;
        }
      }
    }
    
    if (newStatus === 'DELIVERED') {
      updateData.deliveredAt = new Date();
      
      if (deliveryPhoto && bucket) {
        const uploadResult = await uploadBase64Photo(bucket, shipmentId, 'delivery', deliveryPhoto, { driverId });
        if (uploadResult.success) {
          updateData.deliveryPhotoUrl = uploadResult.path;
        }
      }
      
      if (signature && bucket) {
        const uploadResult = await uploadBase64Photo(bucket, shipmentId, 'signature', signature, { driverId });
        if (uploadResult.success) {
          updateData.signatureUrl = uploadResult.path;
        }
      }
    }
    
    const updateResult = await db
      .update(shipments)
      .set(updateData)
      .where(and(eq(shipments.id, shipmentId), eq(shipments.driverId, driverId)))
      .returning();
    
    if (updateResult.length === 0) {
      return c.json({ error: 'Failed to update shipment' }, 500);
    }
    
    if (newStatus === 'DELIVERED') {
      await db
        .update(driverProfiles)
        .set({
          totalDeliveries: sql`${driverProfiles.totalDeliveries} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(driverProfiles.userId, driverId));
    }
    
    return c.json({
      success: true,
      shipment: updateResult[0],
    });
    
  } catch (error) {
    console.error('Update shipment status error:', error);
    return c.json({ error: 'Failed to update shipment status' }, 500);
  }
});

/**
 * GET /api/driver/shipments/my
 */
driverRoutes.get('/shipments/my', async (c) => {
  try {
    const db = getDb(c);
    const driverId = c.req.query('driverId');
    const status = c.req.query('status');
    
    if (!driverId || !isValidUUID(driverId)) {
      return c.json({ error: 'Valid driver ID is required' }, 400);
    }
    
    let conditions = [eq(shipments.driverId, driverId)];
    
    if (status) {
      conditions.push(eq(shipments.status, status));
    }
    
    const driverShipments = await db
      .select()
      .from(shipments)
      .where(and(...conditions))
      .orderBy(desc(shipments.updatedAt));
    
    return c.json({ shipments: driverShipments });
    
  } catch (error) {
    console.error('Get driver shipments error:', error);
    return c.json({ error: 'Failed to get shipments' }, 500);
  }
});

/**
 * PATCH /api/driver/profile/location
 */
driverRoutes.patch('/profile/location', async (c) => {
  try {
    const db = getDb(c);
    const body = await c.req.json();
    const { driverId, latitude, longitude, isOnline } = body;
    
    if (!driverId || !isValidUUID(driverId)) {
      return c.json({ error: 'Valid driver ID is required' }, 400);
    }
    
    const updateData = { updatedAt: new Date() };
    
    if (latitude !== undefined) updateData.currentLatitude = Number(latitude);
    if (longitude !== undefined) updateData.currentLongitude = Number(longitude);
    if (isOnline !== undefined) updateData.isOnline = Boolean(isOnline);
    
    const result = await db
      .update(driverProfiles)
      .set(updateData)
      .where(eq(driverProfiles.userId, driverId))
      .returning();
    
    if (result.length === 0) {
      return c.json({ error: 'Driver profile not found' }, 404);
    }
    
    return c.json({ success: true, profile: result[0] });
    
  } catch (error) {
    console.error('Update location error:', error);
    return c.json({ error: 'Failed to update location' }, 500);
  }
});

// ============================================================================
// ADMIN API ROUTES
// ============================================================================

adminRoutes.get('/users', async (c) => {
  try {
    const db = getDb(c);
    const userType = c.req.query('type');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');
    
    let query = db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      userType: users.userType,
      createdAt: users.createdAt,
    }).from(users);
    
    if (userType) query = query.where(eq(users.userType, userType));
    
    const results = await query.orderBy(desc(users.createdAt)).limit(limit).offset(offset);
    return c.json({ users: results });
  } catch (error) {
    console.error('List users error:', error);
    return c.json({ error: 'Failed to list users' }, 500);
  }
});

adminRoutes.post('/users', async (c) => {
  try {
    const db = getDb(c);
    const body = await c.req.json();
    const { email, password, name, phone, userType, vehicleType, vehiclePlate } = body;
    
    if (!email) return c.json({ error: 'Email is required' }, 400);
    if (!userType || !['customer', 'driver', 'admin'].includes(userType)) {
      return c.json({ error: 'Valid user type is required' }, 400);
    }
    
    const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    if (existing.length > 0) return c.json({ error: 'User already exists' }, 409);
    
    const newUsers = await db.insert(users).values({
      email: email.toLowerCase().trim(),
      password,
      name,
      phone,
      userType,
    }).returning();
    
    const newUser = newUsers[0];
    
    if (userType === 'driver') {
      await db.insert(driverProfiles).values({ userId: newUser.id, vehicleType, vehiclePlate });
    }
    
    return c.json({ 
      success: true, 
      user: { id: newUser.id, email: newUser.email, name: newUser.name, userType: newUser.userType },
    }, 201);
  } catch (error) {
    console.error('Create user error:', error);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

adminRoutes.get('/shipments', async (c) => {
  try {
    const db = getDb(c);
    const status = c.req.query('status');
    const customerId = c.req.query('customerId');
    const driverId = c.req.query('driverId');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');
    
    let conditions = [];
    if (status) conditions.push(eq(shipments.status, status));
    if (customerId && isValidUUID(customerId)) conditions.push(eq(shipments.customerId, customerId));
    if (driverId && isValidUUID(driverId)) conditions.push(eq(shipments.driverId, driverId));
    
    let query = db.select().from(shipments);
    if (conditions.length > 0) query = query.where(and(...conditions));
    
    const results = await query.orderBy(desc(shipments.createdAt)).limit(limit).offset(offset);
    return c.json({ shipments: results });
  } catch (error) {
    console.error('Admin list shipments error:', error);
    return c.json({ error: 'Failed to list shipments' }, 500);
  }
});

adminRoutes.patch('/shipments/:id', async (c) => {
  try {
    const db = getDb(c);
    const shipmentId = c.req.param('id');
    const body = await c.req.json();
    
    if (!isValidUUID(shipmentId)) return c.json({ error: 'Invalid shipment ID' }, 400);
    
    const { id, createdAt, ...updateFields } = body;
    if (updateFields.pickupAt) updateFields.pickupAt = sanitizeDate(updateFields.pickupAt);
    if (updateFields.dropoffBy) updateFields.dropoffBy = sanitizeDate(updateFields.dropoffBy);
    updateFields.updatedAt = new Date();
    
    const result = await db.update(shipments).set(updateFields).where(eq(shipments.id, shipmentId)).returning();
    if (result.length === 0) return c.json({ error: 'Shipment not found' }, 404);
    
    return c.json({ success: true, shipment: result[0] });
  } catch (error) {
    console.error('Admin update shipment error:', error);
    return c.json({ error: 'Failed to update shipment' }, 500);
  }
});

adminRoutes.delete('/shipments/:id', async (c) => {
  try {
    const db = getDb(c);
    const shipmentId = c.req.param('id');
    
    if (!isValidUUID(shipmentId)) return c.json({ error: 'Invalid shipment ID' }, 400);
    
    const result = await db.delete(shipments).where(eq(shipments.id, shipmentId)).returning();
    if (result.length === 0) return c.json({ error: 'Shipment not found' }, 404);
    
    return c.json({ success: true, deleted: result[0] });
  } catch (error) {
    console.error('Delete shipment error:', error);
    return c.json({ error: 'Failed to delete shipment' }, 500);
  }
});

adminRoutes.get('/drivers', async (c) => {
  try {
    const db = getDb(c);
    const isOnline = c.req.query('online');
    
    let query = db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        createdAt: users.createdAt,
        isOnline: driverProfiles.isOnline,
        currentLatitude: driverProfiles.currentLatitude,
        currentLongitude: driverProfiles.currentLongitude,
        vehicleType: driverProfiles.vehicleType,
        vehiclePlate: driverProfiles.vehiclePlate,
        rating: driverProfiles.rating,
        totalDeliveries: driverProfiles.totalDeliveries,
      })
      .from(users)
      .innerJoin(driverProfiles, eq(users.id, driverProfiles.userId))
      .where(eq(users.userType, 'driver'));
    
    if (isOnline !== undefined) query = query.where(eq(driverProfiles.isOnline, isOnline === 'true'));
    
    const results = await query.orderBy(desc(driverProfiles.totalDeliveries));
    return c.json({ drivers: results });
  } catch (error) {
    console.error('List drivers error:', error);
    return c.json({ error: 'Failed to list drivers' }, 500);
  }
});

adminRoutes.get('/stats', async (c) => {
  try {
    const db = getDb(c);
    
    const statusCounts = await db
      .select({ status: shipments.status, count: sql<number>`count(*)::int` })
      .from(shipments)
      .groupBy(shipments.status);
    
    const revenueResult = await db
      .select({ total: sql<number>`coalesce(sum(${shipments.priceCents}), 0)::int` })
      .from(shipments)
      .where(eq(shipments.status, 'DELIVERED'));
    
    const driverCountResult = await db
      .select({
        total: sql<number>`count(*)::int`,
        online: sql<number>`count(*) filter (where ${driverProfiles.isOnline} = true)::int`,
      })
      .from(driverProfiles);
    
    const customerCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.userType, 'customer'));
    
    const statusMap = statusCounts.reduce((acc, row) => { acc[row.status] = row.count; return acc; }, {});
    
    return c.json({
      shipments: {
        pending: statusMap['PENDING'] || 0,
        assigned: statusMap['ASSIGNED'] || 0,
        pickedUp: statusMap['PICKED_UP'] || 0,
        delivered: statusMap['DELIVERED'] || 0,
        cancelled: statusMap['CANCELLED'] || 0,
        total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      },
      revenue: {
        totalCents: revenueResult[0]?.total || 0,
        totalDollars: ((revenueResult[0]?.total || 0) / 100).toFixed(2),
      },
      drivers: {
        total: driverCountResult[0]?.total || 0,
        online: driverCountResult[0]?.online || 0,
      },
      customers: customerCountResult[0]?.count || 0,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ error: 'Failed to get stats' }, 500);
  }
});

adminRoutes.get('/photos/:shipmentId', async (c) => {
  try {
    const bucket = c.env.R2_PHOTOS;
    const shipmentId = c.req.param('shipmentId');
    
    if (!isValidUUID(shipmentId)) return c.json({ error: 'Invalid shipment ID' }, 400);
    if (!bucket) return c.json({ error: 'Photo storage not configured' }, 500);
    
    const photos = await listShipmentPhotos(bucket, shipmentId);
    return c.json({ photos });
  } catch (error) {
    console.error('List photos error:', error);
    return c.json({ error: 'Failed to list photos' }, 500);
  }
});
