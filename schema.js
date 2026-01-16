import { pgTable, varchar, text, timestamp, integer, real, uuid, pgEnum } from 'drizzle-orm/pg-core';

// 1. Enums
export const shipmentStatusEnum = pgEnum('shipment_status', ['PENDING', 'CLAIMED', 'PICKED_UP', 'DELIVERED', 'CANCELLED']);

// 2. Locations Table (Reference data for airports/hubs)
export const locations = pgTable('locations', {
  code: varchar('code', { length: 10 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  address: text('address')
});

// 3. Shipments Table
export const shipments = pgTable('shipments', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').notNull(),
  driverId: uuid('driver_id'),
  luggageId: uuid('luggage_id'),
  status: shipmentStatusEnum('status').notNull().default('PENDING'),

  // Location Data
  originAirport: varchar('origin_airport', { length: 10 }),
  destinationAirport: varchar('destination_airport', { length: 10 }),

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

  distanceMiles: real('distance_miles'),
  priceCents: integer('price_cents').notNull(),
  currency: varchar('currency', { length: 3 }).default('USD'),
  notes: text('notes'),

  pickupPhotoUrl: text('pickup_photo_url'),
  deliveryPhotoUrl: text('delivery_photo_url'),
  signatureUrl: text('signature_url'),

  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
