# Order Creation Platform

A pure order creation API built for Cloudflare Workers with Hono, Neon PostgreSQL, and Drizzle ORM.

## Tech Stack

- **Runtime**: Cloudflare Workers (ES Modules, `nodejs_compat`)
- **Framework**: Hono v4+
- **Database**: Neon Serverless PostgreSQL
- **ORM**: Drizzle ORM

## Features

- **Customer Registration & Authentication**: Simple signup and login
- **Order Creation**: Create orders with pickup/dropoff locations and pricing
- **Order Retrieval**: List all orders, get specific orders, retrieve customer orders
- **Locations Reference**: Pre-defined airports and hubs for quick selection

## Project Structure

```
order-creation-platform/
├── server.js           # Main entry point, Hono app setup
├── routes.js           # API route handlers (auth, orders)
├── db.js               # Database connection utilities
├── schema.js           # Drizzle ORM schema definitions
├── wrangler.toml       # Cloudflare Workers configuration
├── drizzle.config.js   # Drizzle Kit configuration
├── package.json
└── drizzle/
    └── migrations/     # SQL migration files
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.dev.vars` file for local development:

```env
DATABASE_URL=postgresql://user:password@your-neon-host.neon.tech/dbname?sslmode=require
```

For production, set secrets via Wrangler:

```bash
wrangler secret put DATABASE_URL
```

### 3. Set Up Database

Run the SQL migration against your Neon database:

```bash
# Using Drizzle Kit
npm run db:push
```

### 4. Run Locally

```bash
npm run dev
```

### 5. Deploy

```bash
npm run deploy
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register a new customer |
| POST | `/api/auth/login` | Login with email and password |

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Create a new order |
| GET | `/api/orders` | List all orders |
| GET | `/api/orders/:id` | Get a specific order |
| GET | `/api/orders/customer/:customerId` | Get customer's orders |

### Locations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/locations` | Get all locations (airports/hubs) |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check endpoint |

## API Usage Examples

### Register a Customer

```bash
curl -X POST http://localhost:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "secure-password",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "(555) 123-4567"
  }'
```

### Login

```bash
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "secure-password"
  }'
```

### Create an Order

```bash
curl -X POST http://localhost:8787/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "uuid-here",
    "originAirport": "MCO",
    "destinationAirport": "MIA",
    "pickupAddress": "123 Main St, Orlando, FL",
    "pickupLatitude": 28.4312,
    "pickupLongitude": -81.3081,
    "pickupAt": "2024-01-15T10:00:00Z",
    "dropoffAddress": "456 Oak Ave, Miami, FL",
    "dropoffLatitude": 25.7962,
    "dropoffLongitude": -80.2864,
    "dropoffBy": "2024-01-15T14:00:00Z",
    "priceCents": 2500,
    "currency": "USD",
    "notes": "Special handling instructions"
  }'
```

### Get Customer's Orders

```bash
curl http://localhost:8787/api/orders/customer/uuid-here
```

## Database Schema

### Customers Table

- `id` (UUID, primary key)
- `email` (VARCHAR, unique)
- `firstName` (VARCHAR)
- `lastName` (VARCHAR)
- `password` (VARCHAR)
- `phone` (VARCHAR)
- `createdAt` (TIMESTAMP)

### Orders Table

- `id` (UUID, primary key)
- `customerId` (UUID, foreign key)
- `status` (ENUM: PENDING, CONFIRMED, COMPLETED, CANCELLED)
- `originAirport` (VARCHAR)
- `destinationAirport` (VARCHAR)
- `pickupAddress` (TEXT)
- `pickupLatitude` (REAL)
- `pickupLongitude` (REAL)
- `pickupAt` (TIMESTAMP)
- `dropoffAddress` (TEXT)
- `dropoffLatitude` (REAL)
- `dropoffLongitude` (REAL)
- `dropoffBy` (TIMESTAMP)
- `priceCents` (INTEGER)
- `currency` (VARCHAR)
- `notes` (TEXT)
- `createdAt` (TIMESTAMP)

### Locations Table

- `code` (VARCHAR, primary key)
- `name` (VARCHAR)
- `type` (VARCHAR)
- `latitude` (REAL)
- `longitude` (REAL)
- `address` (TEXT)

## License

MIT
