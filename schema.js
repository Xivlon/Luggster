import { pgTable, varchar, text, timestamp, integer, boolean, real, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Enums
export const userTypeEnum = pgEnum('user_type', ['customer', 'driver', 'admin']);
export const shipmentStatusEnum = pgEnum('shipment_status', ['PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED']);

// 2. Users Table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  password: varchar('password', { length: 255 }), 
  phone: varchar('phone', { length: 50 }),
  userType: userTypeEnum('user_type').notNull().default('customer'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. Driver Profiles Table (THIS WAS MISSING!)
export const driverProfiles = pgTable('driver_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  isOnline: boolean('is_online').notNull().default(false),
  currentLatitude: real('current_latitude'),
  currentLongitude: real('current_longitude'),
  vehicleType: varchar('vehicle_type', { length: 100 }),
  vehiclePlate: varchar('vehicle_plate', { length: 20 }),
  rating: real('rating').default(5.0),
  totalDeliveries: integer('total_deliveries').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. Locations Table
export const locations = pgTable('locations', {
  code: varchar('code', { length: 10 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  address: text('address')
});

// 5. Shipments Table
export const shipments = pgTable('shipments', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').references(() => users.id, { onDelete: 'set null' }),
  status: shipmentStatusEnum('status').notNull().default('PENDING'),
  
  // Location Data
  originAirport: varchar('origin_airport', { length: 10 }),
  destinationAirport: varchar('destination_airport', { length: 10 }),
  
  pickupAddress: text('pickup_address'),
  pickupLatitude: real('pickup_latitude'),
  pickupLongitude: real('pickup_longitude'),
  pickupAt: timestamp('pickup_at', { withTimezone: true }),
  
  dropoffAddress: text('dropoff_address'),
  dropoffLatitude: real('dropoff_latitude'),
  dropoffLongitude: real('dropoff_longitude'),
  dropoffBy: timestamp('dropoff_by', { withTimezone: true }),
  
  priceCents: integer('price_cents').notNull(),
  currency: varchar('currency', { length: 3 }).default('USD'),
  notes: text('notes'),
  
  pickupPhotoUrl: text('pickup_photo_url'),
  deliveryPhotoUrl: text('delivery_photo_url'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 6. Relations
export const usersRelations = relations(users, ({ one }) => ({
  profile: one(driverProfiles, {
    fields: [users.id],
    references: [driverProfiles.userId],
  }),
}));

export const driverProfileRelations = relations(driverProfiles, ({ one }) => ({
  user: one(users, {
    fields: [driverProfiles.userId],
    references: [users.id],
  }),
}));
