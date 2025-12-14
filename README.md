# LuggageLink Backend API

A production-ready shipment management API built for Cloudflare Workers with Hono, Neon PostgreSQL, Drizzle ORM, and Cloudflare R2 storage.

## Tech Stack

- **Runtime**: Cloudflare Workers (ES Modules, `nodejs_compat`)
- **Framework**: Hono v4+
- **Database**: Neon Serverless PostgreSQL
- **ORM**: Drizzle ORM
- **Storage**: Cloudflare R2 (photo evidence)

## Features

- **Dispatcher Console**: Web form for creating shipments with robust data sanitization
- **Driver API**: Mobile-friendly endpoints for the React Native app
- **Admin Dashboard**: Real-time monitoring of shipments and drivers
- **Concurrency Control**: Atomic "first come, first served" job claiming
- **Photo Evidence**: R2 storage for pickup/delivery photos and signatures

## Project Structure

```
luggagelink-backend/
├── server.js          # Main entry point, Hono app setup, HTML templates
├── routes.js          # API route handlers (dispatcher, driver, admin)
├── db.js              # Database connection utilities
├── schema.js          # Drizzle ORM schema definitions
├── storage.js         # R2 storage utilities for photos
├── wrangler.toml      # Cloudflare Workers configuration
├── drizzle.config.js  # Drizzle Kit configuration
├── package.json
├── drizzle/
│   └── migrations/    # SQL migration files
└── scripts/
    └── seed.js        # Database seed script
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
JWT_SECRET=your-secret-key
```

For production, set secrets via Wrangler:

```bash
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
```

### 3. Set Up Database

Run the SQL migration against your Neon database:

```bash
# Using psql
psql $DATABASE_URL -f drizzle/migrations/0001_initial_schema.sql

# Or use Drizzle Kit
npm run db:push
```

### 4. Create R2 Bucket (if not already created)

```bash
wrangler r2 bucket create luggster-photos
```

### 5. Seed Database (Optional)

```bash
DATABASE_URL=your-connection-string npm run db:seed
```

### 6. Run Locally

```bash
npm run dev
```

### 7. Deploy

```bash
npm run deploy
```

## API Endpoints

### Dispatcher API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/dispatcher/shipments` | Create a new shipment |
| GET | `/api/dispatcher/shipments` | List shipments |
| GET | `/api/dispatcher/shipments/:id` | Get shipment details |

### Driver API (React Native App)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/driver/shipments/available` | Get pending shipments (Job Board) |
| POST | `/api/driver/shipments/:id/claim` | Claim a shipment |
| PATCH | `/api/driver/shipments/:id/status` | Update status with photos |
| GET | `/api/driver/shipments/my` | Get driver's shipments |
| PATCH | `/api/driver/profile/location` | Update driver location |

### Admin API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create user (driver/admin) |
| GET | `/api/admin/shipments` | List all shipments |
| PATCH | `/api/admin/shipments/:id` | Update any shipment |
| DELETE | `/api/admin/shipments/:id` | Delete shipment |
| GET | `/api/admin/drivers` | List drivers with profiles |
| GET | `/api/admin/stats` | Dashboard statistics |

### Web Portals

| Route | Description |
|-------|-------------|
| `GET /` | Dispatcher Console (create orders) |
| `GET /admin` | Admin Dashboard |

## API Usage Examples

### Create Shipment (Dispatcher)

```javascript
const response = await fetch('/api/dispatcher/shipments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customerEmail: 'customer@example.com',
    pickupAddress: '123 Main St, NYC',
    pickupAt: '2024-01-15T10:00:00Z',
    dropoffAddress: '456 Oak Ave, NYC',
    dropoffBy: '2024-01-15T14:00:00Z',
    price: 25.00, // dollars (converted to cents internally)
    packageDescription: 'Electronics'
  })
});
```

### Claim Shipment (Driver)

```javascript
const response = await fetch(`/api/driver/shipments/${shipmentId}/claim`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ driverId: 'uuid-here' })
});
```

### Update Status with Photo (Driver)

```javascript
const response = await fetch(`/api/driver/shipments/${shipmentId}/status`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    driverId: 'uuid-here',
    status: 'DELIVERED',
    deliveryPhoto: 'data:image/jpeg;base64,...',
    signature: 'data:image/png;base64,...'
  })
});
```

## Business Logic Details

### Robust Shipment Creation

The Dispatcher API handles imperfect data:

1. **Date Conversion**: ISO strings automatically converted to Date objects
2. **User Resolution**: Email lookup finds existing users or creates new ones
3. **Price Handling**: Accepts dollars or cents, stores as cents
4. **Validation**: Ensures dropoff time is after pickup time

### Concurrency Control (Atomic Claim)

The claim endpoint uses an atomic UPDATE to prevent race conditions:

```sql
UPDATE shipments 
SET driver_id = ?, status = 'ASSIGNED', claimed_at = NOW()
WHERE id = ? 
  AND status = 'PENDING' 
  AND driver_id IS NULL
RETURNING *
```

Only one driver can successfully claim a shipment, even with simultaneous requests.

## Customization

### Adding Your Frontend

Replace the `dispatcherHtml` and `adminHtml` variables in `server.js` with your custom HTML:

```javascript
const dispatcherHtml = `
  <!-- Your dispatcher console HTML here -->
`;

const adminHtml = `
  <!-- Your admin dashboard HTML here -->
`;
```

### Adding Authentication

Add authentication middleware to protected routes:

```javascript
import { bearerAuth } from 'hono/bearer-auth';

// Protect admin routes
app.use('/api/admin/*', bearerAuth({ token: 'your-admin-token' }));

// Protect driver routes
app.use('/api/driver/*', async (c, next) => {
  // Verify driver JWT here
  await next();
});
```

## License

MIT
