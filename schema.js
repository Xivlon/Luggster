import { pgTable, varchar, text, timestamp, integer, real, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Enums
export const orderStatusEnum = pgEnum('order_status', ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']);

// 2. Customers Table
export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  password: varchar('password', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. Locations Table (Reference data for airports/hubs)
export const locations = pgTable('locations', {
  code: varchar('code', { length: 10 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  address: text('address')
});

// 4. Orders Table (renamed from shipments for clarity)
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  status: orderStatusEnum('status').notNull().default('PENDING'),

  // Location Data
  originAirport: varchar('origin_airport', { length: 10 }),
  destinationAirport: varchar('destination_airport', { length: 10 }),

  pickupAddress: text('pickup_address').notNull(),
  pickupLatitude: real('pickup_latitude'),
  pickupLongitude: real('pickup_longitude'),
  pickupAt: timestamp('pickup_at', { withTimezone: true }),

  dropoffAddress: text('dropoff_address').notNull(),
  dropoffLatitude: real('dropoff_latitude'),
  dropoffLongitude: real('dropoff_longitude'),
  dropoffBy: timestamp('dropoff_by', { withTimezone: true }),

  priceCents: integer('price_cents').notNull(),
  currency: varchar('currency', { length: 3 }).default('USD'),
  notes: text('notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 5. Relations
export const customerRelations = relations(customers, ({ many }) => ({
  orders: many(shipments),
}));

export const orderRelations = relations(shipments, ({ one }) => ({
  customer: one(customers, {
    fields: [shipments.customerId],
    references: [customers.id],
  }),
}));
