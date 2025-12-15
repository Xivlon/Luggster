import { pgTable, uuid, varchar, text, timestamp, integer, boolean, real, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userTypeEnum = pgEnum('user_type', ['customer', 'driver', 'admin']);
export const shipmentStatusEnum = pgEnum('shipment_status', ['PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED']);

// Users table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }), // Hashed password, nullable for customers created via dispatcher
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  userType: userTypeEnum('user_type').notNull().default('customer'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Driver profiles table
export const driverProfiles = pgTable('driver_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  isOnline: boolean('is_online').notNull().default(false),
  currentLatitude: real('current_latitude'),
  currentLongitude: real('current_longitude'),
  vehicleType: varchar('vehicle_type', { length: 100 }),
  vehiclePlate: varchar('vehicle_plate', { length: 20 }),
  rating: real('rating').default(5.0),
  totalDeliveries: integer('total_deliveries').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Shipments table (Luggage deliveries)
export const shipments = pgTable('shipments', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').references(() => users.id, { onDelete: 'set null' }),
  luggageId: uuid('luggage_id'), // Optional reference for luggage tracking
  status: shipmentStatusEnum('status').notNull().default('PENDING'),
  
  // Airport/Location codes (3-letter codes like MCO, MIA, or "OTH" for custom addresses)
  originAirport: varchar('origin_airport', { length: 10 }),
  destinationAirport: varchar('destination_airport', { length: 10 }),
  
  // Full addresses (stored in notes or separate fields)
  pickupAddress: text('pickup_address'),
  pickupLatitude: real('pickup_latitude'),
  pickupLongitude: real('pickup_longitude'),
  pickupAt: timestamp('pickup_at', { withTimezone: true }).notNull(),
  pickupContactName: varchar('pickup_contact_name', { length: 255 }),
  pickupContactPhone: varchar('pickup_contact_phone', { length: 50 }),
  
  dropoffAddress: text('dropoff_address'),
  dropoffLatitude: real('dropoff_latitude'),
  dropoffLongitude: real('dropoff_longitude'),
  dropoffBy: timestamp('dropoff_by', { withTimezone: true }).notNull(),
  dropoffContactName: varchar('dropoff_contact_name', { length: 255 }),
  dropoffContactPhone: varchar('dropoff_contact_phone', { length: 50 }),
  
  // Distance tracking
  distanceMiles: real('distance_miles'),
  
  // Pricing
  priceCents: integer('price_cents').notNull(),
  currency: varchar('currency', { length: 3 }).default('USD'),
  
  // Notes (contains customer info, luggage details, promo info, etc.)
  notes: text('notes'),
  
  // Photo evidence URLs (stored in R2)
  pickupPhotoUrl: text('pickup_photo_url'),
  deliveryPhotoUrl: text('delivery_photo_url'),
  signatureUrl: text('signature_url'),
  
  // Timestamps
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  driverProfile: one(driverProfiles, {
    fields: [users.id],
    references: [driverProfiles.userId],
  }),
  customerShipments: many(shipments, { relationName: 'customerShipments' }),
  driverShipments: many(shipments, { relationName: 'driverShipments' }),
}));

export const driverProfilesRelations = relations(driverProfiles, ({ one }) => ({
  user: one(users, {
    fields: [driverProfiles.userId],
    references: [users.id],
  }),
}));

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  customer: one(users, {
    fields: [shipments.customerId],
    references: [users.id],
    relationName: 'customerShipments',
  }),
  driver: one(users, {
    fields: [shipments.driverId],
    references: [users.id],
    relationName: 'driverShipments',
  }),
}));

// Export all tables for migrations
export const schema = {
  users,
  driverProfiles,
  shipments,
  userTypeEnum,
  shipmentStatusEnum,
};
