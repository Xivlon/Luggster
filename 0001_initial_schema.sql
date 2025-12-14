-- Shipment API Database Schema
-- Run this against your Neon PostgreSQL database to initialize the schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom enum types
DO $$ BEGIN
    CREATE TYPE user_type AS ENUM ('customer', 'driver', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE shipment_status AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255),
    user_type user_type NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type);

-- Driver profiles table
CREATE TABLE IF NOT EXISTS driver_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    current_latitude REAL,
    current_longitude REAL,
    vehicle_type VARCHAR(100),
    vehicle_plate VARCHAR(20),
    rating REAL DEFAULT 5.0,
    total_deliveries INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on online status for finding available drivers
CREATE INDEX IF NOT EXISTS idx_driver_profiles_online ON driver_profiles(is_online);

-- Shipments table
CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status shipment_status NOT NULL DEFAULT 'PENDING',
    
    -- Pickup details
    pickup_address TEXT NOT NULL,
    pickup_latitude REAL,
    pickup_longitude REAL,
    pickup_at TIMESTAMPTZ NOT NULL,
    pickup_contact_name VARCHAR(255),
    pickup_contact_phone VARCHAR(50),
    
    -- Dropoff details
    dropoff_address TEXT NOT NULL,
    dropoff_latitude REAL,
    dropoff_longitude REAL,
    dropoff_by TIMESTAMPTZ NOT NULL,
    dropoff_contact_name VARCHAR(255),
    dropoff_contact_phone VARCHAR(50),
    
    -- Package details
    package_description TEXT,
    package_weight REAL,
    package_dimensions VARCHAR(100),
    
    -- Pricing
    price_cents INTEGER NOT NULL,
    
    -- Photo evidence URLs
    pickup_photo_url TEXT,
    delivery_photo_url TEXT,
    signature_url TEXT,
    
    -- Notes
    dispatcher_notes TEXT,
    driver_notes TEXT,
    
    -- Timestamps
    claimed_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_customer ON shipments(customer_id);
CREATE INDEX IF NOT EXISTS idx_shipments_driver ON shipments(driver_id);
CREATE INDEX IF NOT EXISTS idx_shipments_created ON shipments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_pickup_at ON shipments(pickup_at);

-- Composite index for the "available shipments" query (Job Board)
CREATE INDEX IF NOT EXISTS idx_shipments_available 
ON shipments(status, driver_id) 
WHERE status = 'PENDING' AND driver_id IS NULL;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_driver_profiles_updated_at ON driver_profiles;
CREATE TRIGGER update_driver_profiles_updated_at
    BEFORE UPDATE ON driver_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shipments_updated_at ON shipments;
CREATE TRIGGER update_shipments_updated_at
    BEFORE UPDATE ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE users IS 'User accounts for customers, drivers, and admins';
COMMENT ON TABLE driver_profiles IS 'Extended profile information for driver users';
COMMENT ON TABLE shipments IS 'Delivery shipments with full lifecycle tracking';

COMMENT ON COLUMN shipments.status IS 'PENDING: awaiting driver, ASSIGNED: claimed by driver, PICKED_UP: package collected, DELIVERED: completed';
COMMENT ON COLUMN shipments.price_cents IS 'Price stored in cents to avoid floating point issues';
COMMENT ON COLUMN driver_profiles.rating IS 'Average rating from 1-5 stars';
