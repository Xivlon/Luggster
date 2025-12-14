import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { etag } from 'hono/etag';
import { dispatcherRoutes, driverRoutes, adminRoutes } from './routes.js';
import { getPhoto } from './storage.js';

// ============================================================================
// FRONTEND HTML TEMPLATES
// Paste your existing frontend code in these variables
// ============================================================================

const dispatcherHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dispatcher Console - Create Shipment</title>
  <style>
    /* Add your dispatcher console CSS here */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 30px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; font-weight: 500; color: #555; }
    input, textarea, select { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: #007bff; box-shadow: 0 0 0 3px rgba(0,123,255,0.1); }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    button[type="submit"] { width: 100%; padding: 15px; background: #007bff; color: white; border: none; border-radius: 8px; font-size: 18px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    button[type="submit"]:hover { background: #0056b3; }
    button[type="submit"]:disabled { background: #ccc; cursor: not-allowed; }
    .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .section-title { font-size: 18px; color: #333; margin: 30px 0 15px; padding-bottom: 10px; border-bottom: 2px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📦 Dispatcher Console</h1>
    
    <div id="message"></div>
    
    <form id="shipmentForm">
      <h2 class="section-title">Customer Information</h2>
      <div class="form-group">
        <label for="customerEmail">Customer Email *</label>
        <input type="email" id="customerEmail" name="customerEmail" required placeholder="customer@example.com">
      </div>
      
      <h2 class="section-title">Pickup Details</h2>
      <div class="form-group">
        <label for="pickupAddress">Pickup Address *</label>
        <input type="text" id="pickupAddress" name="pickupAddress" required placeholder="123 Main St, City, State">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pickupAt">Pickup Time *</label>
          <input type="datetime-local" id="pickupAt" name="pickupAt" required>
        </div>
        <div class="form-group">
          <label for="pickupContactName">Contact Name</label>
          <input type="text" id="pickupContactName" name="pickupContactName" placeholder="John Doe">
        </div>
      </div>
      <div class="form-group">
        <label for="pickupContactPhone">Contact Phone</label>
        <input type="tel" id="pickupContactPhone" name="pickupContactPhone" placeholder="+1 (555) 123-4567">
      </div>
      
      <h2 class="section-title">Dropoff Details</h2>
      <div class="form-group">
        <label for="dropoffAddress">Dropoff Address *</label>
        <input type="text" id="dropoffAddress" name="dropoffAddress" required placeholder="456 Oak Ave, City, State">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="dropoffBy">Deliver By *</label>
          <input type="datetime-local" id="dropoffBy" name="dropoffBy" required>
        </div>
        <div class="form-group">
          <label for="dropoffContactName">Contact Name</label>
          <input type="text" id="dropoffContactName" name="dropoffContactName" placeholder="Jane Smith">
        </div>
      </div>
      <div class="form-group">
        <label for="dropoffContactPhone">Contact Phone</label>
        <input type="tel" id="dropoffContactPhone" name="dropoffContactPhone" placeholder="+1 (555) 987-6543">
      </div>
      
      <h2 class="section-title">Package Details</h2>
      <div class="form-row">
        <div class="form-group">
          <label for="packageDescription">Description</label>
          <input type="text" id="packageDescription" name="packageDescription" placeholder="Electronics, Documents, etc.">
        </div>
        <div class="form-group">
          <label for="packageWeight">Weight (kg)</label>
          <input type="number" id="packageWeight" name="packageWeight" step="0.1" placeholder="2.5">
        </div>
      </div>
      <div class="form-group">
        <label for="packageDimensions">Dimensions (L x W x H cm)</label>
        <input type="text" id="packageDimensions" name="packageDimensions" placeholder="30x20x15">
      </div>
      
      <h2 class="section-title">Pricing & Notes</h2>
      <div class="form-group">
        <label for="price">Price ($) *</label>
        <input type="number" id="price" name="price" step="0.01" required placeholder="25.00">
      </div>
      <div class="form-group">
        <label for="dispatcherNotes">Dispatcher Notes</label>
        <textarea id="dispatcherNotes" name="dispatcherNotes" rows="3" placeholder="Special instructions for the driver..."></textarea>
      </div>
      
      <button type="submit" id="submitBtn">Create Shipment</button>
    </form>
  </div>
  
  <script>
    const form = document.getElementById('shipmentForm');
    const message = document.getElementById('message');
    const submitBtn = document.getElementById('submitBtn');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      message.innerHTML = '';
      
      const formData = new FormData(form);
      const data = {
        customerEmail: formData.get('customerEmail'),
        pickupAddress: formData.get('pickupAddress'),
        pickupAt: new Date(formData.get('pickupAt')).toISOString(),
        pickupContactName: formData.get('pickupContactName') || undefined,
        pickupContactPhone: formData.get('pickupContactPhone') || undefined,
        dropoffAddress: formData.get('dropoffAddress'),
        dropoffBy: new Date(formData.get('dropoffBy')).toISOString(),
        dropoffContactName: formData.get('dropoffContactName') || undefined,
        dropoffContactPhone: formData.get('dropoffContactPhone') || undefined,
        packageDescription: formData.get('packageDescription') || undefined,
        packageWeight: formData.get('packageWeight') ? parseFloat(formData.get('packageWeight')) : undefined,
        packageDimensions: formData.get('packageDimensions') || undefined,
        price: parseFloat(formData.get('price')),
        dispatcherNotes: formData.get('dispatcherNotes') || undefined,
      };
      
      try {
        const response = await fetch('/api/dispatcher/shipments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        
        const result = await response.json();
        
        if (response.ok) {
          message.innerHTML = '<div class="success">✅ Shipment created successfully! ID: ' + result.shipment.id + '</div>';
          form.reset();
        } else {
          message.innerHTML = '<div class="error">❌ Error: ' + (result.error || 'Failed to create shipment') + '</div>';
        }
      } catch (error) {
        message.innerHTML = '<div class="error">❌ Network error: ' + error.message + '</div>';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Shipment';
      }
    });
    
    // Set default datetime values
    const now = new Date();
    const pickup = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    const dropoff = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours from now
    
    document.getElementById('pickupAt').value = pickup.toISOString().slice(0, 16);
    document.getElementById('dropoffBy').value = dropoff.toISOString().slice(0, 16);
  </script>
</body>
</html>
`;

const adminHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Console - Shipment Dashboard</title>
  <style>
    /* Add your admin console CSS here */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; }
    .header { background: #16213e; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 24px; }
    .header .refresh-btn { background: #0f3460; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; }
    .dashboard { padding: 20px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: #16213e; border-radius: 12px; padding: 20px; }
    .stat-card h3 { color: #888; font-size: 14px; margin-bottom: 10px; }
    .stat-card .value { font-size: 32px; font-weight: bold; }
    .stat-card.pending .value { color: #ffc107; }
    .stat-card.assigned .value { color: #17a2b8; }
    .stat-card.pickedup .value { color: #6f42c1; }
    .stat-card.delivered .value { color: #28a745; }
    .stat-card.revenue .value { color: #20c997; }
    .stat-card.drivers .value { color: #fd7e14; }
    .section { background: #16213e; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .section h2 { margin-bottom: 20px; font-size: 18px; }
    .filters { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .filters select, .filters input { background: #0f3460; border: 1px solid #333; color: white; padding: 10px 15px; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #333; }
    th { color: #888; font-weight: 500; }
    .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .status-PENDING { background: #ffc10720; color: #ffc107; }
    .status-ASSIGNED { background: #17a2b820; color: #17a2b8; }
    .status-PICKED_UP { background: #6f42c120; color: #6f42c1; }
    .status-DELIVERED { background: #28a74520; color: #28a745; }
    .driver-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
    .driver-card { background: #0f3460; border-radius: 8px; padding: 15px; }
    .driver-card .name { font-weight: 600; margin-bottom: 5px; }
    .driver-card .meta { color: #888; font-size: 14px; }
    .online-indicator { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
    .online-indicator.online { background: #28a745; }
    .online-indicator.offline { background: #dc3545; }
    .loading { text-align: center; padding: 40px; color: #888; }
    .error { background: #dc354520; color: #dc3545; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚚 Admin Dashboard</h1>
    <button class="refresh-btn" onclick="loadAll()">↻ Refresh</button>
  </div>
  
  <div class="dashboard">
    <div id="error"></div>
    
    <div class="stats-grid" id="statsGrid">
      <div class="stat-card pending">
        <h3>Pending</h3>
        <div class="value" id="statPending">-</div>
      </div>
      <div class="stat-card assigned">
        <h3>Assigned</h3>
        <div class="value" id="statAssigned">-</div>
      </div>
      <div class="stat-card pickedup">
        <h3>Picked Up</h3>
        <div class="value" id="statPickedUp">-</div>
      </div>
      <div class="stat-card delivered">
        <h3>Delivered</h3>
        <div class="value" id="statDelivered">-</div>
      </div>
      <div class="stat-card revenue">
        <h3>Total Revenue</h3>
        <div class="value" id="statRevenue">-</div>
      </div>
      <div class="stat-card drivers">
        <h3>Drivers Online</h3>
        <div class="value" id="statDrivers">-</div>
      </div>
    </div>
    
    <div class="section">
      <h2>📦 Live Shipments</h2>
      <div class="filters">
        <select id="statusFilter" onchange="loadShipments()">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="PICKED_UP">Picked Up</option>
          <option value="DELIVERED">Delivered</option>
        </select>
      </div>
      <div id="shipmentsTable">
        <div class="loading">Loading shipments...</div>
      </div>
    </div>
    
    <div class="section">
      <h2>🚗 Active Drivers</h2>
      <div id="driversList">
        <div class="loading">Loading drivers...</div>
      </div>
    </div>
  </div>
  
  <script>
    async function loadStats() {
      try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();
        
        document.getElementById('statPending').textContent = data.shipments.pending;
        document.getElementById('statAssigned').textContent = data.shipments.assigned;
        document.getElementById('statPickedUp').textContent = data.shipments.pickedUp;
        document.getElementById('statDelivered').textContent = data.shipments.delivered;
        document.getElementById('statRevenue').textContent = '$' + data.revenue.totalDollars;
        document.getElementById('statDrivers').textContent = data.drivers.online + '/' + data.drivers.total;
      } catch (error) {
        showError('Failed to load stats: ' + error.message);
      }
    }
    
    async function loadShipments() {
      const status = document.getElementById('statusFilter').value;
      const url = '/api/admin/shipments' + (status ? '?status=' + status : '');
      
      try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.shipments.length === 0) {
          document.getElementById('shipmentsTable').innerHTML = '<div class="loading">No shipments found</div>';
          return;
        }
        
        let html = '<table><thead><tr><th>ID</th><th>Status</th><th>Pickup</th><th>Dropoff</th><th>Price</th><th>Created</th></tr></thead><tbody>';
        
        data.shipments.forEach(s => {
          html += '<tr>';
          html += '<td>' + s.id.slice(0, 8) + '...</td>';
          html += '<td><span class="status-badge status-' + s.status + '">' + s.status + '</span></td>';
          html += '<td>' + (s.pickupAddress || '-').slice(0, 30) + '</td>';
          html += '<td>' + (s.dropoffAddress || '-').slice(0, 30) + '</td>';
          html += '<td>$' + (s.priceCents / 100).toFixed(2) + '</td>';
          html += '<td>' + new Date(s.createdAt).toLocaleString() + '</td>';
          html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('shipmentsTable').innerHTML = html;
      } catch (error) {
        showError('Failed to load shipments: ' + error.message);
      }
    }
    
    async function loadDrivers() {
      try {
        const response = await fetch('/api/admin/drivers');
        const data = await response.json();
        
        if (data.drivers.length === 0) {
          document.getElementById('driversList').innerHTML = '<div class="loading">No drivers found</div>';
          return;
        }
        
        let html = '<div class="driver-list">';
        
        data.drivers.forEach(d => {
          html += '<div class="driver-card">';
          html += '<div class="name"><span class="online-indicator ' + (d.isOnline ? 'online' : 'offline') + '"></span>' + d.email + '</div>';
          html += '<div class="meta">🚗 ' + (d.vehicleType || 'N/A') + ' • ' + (d.vehiclePlate || 'N/A') + '</div>';
          html += '<div class="meta">⭐ ' + (d.rating || 5.0).toFixed(1) + ' • ' + d.totalDeliveries + ' deliveries</div>';
          if (d.currentLatitude && d.currentLongitude) {
            html += '<div class="meta">📍 ' + d.currentLatitude.toFixed(4) + ', ' + d.currentLongitude.toFixed(4) + '</div>';
          }
          html += '</div>';
        });
        
        html += '</div>';
        document.getElementById('driversList').innerHTML = html;
      } catch (error) {
        showError('Failed to load drivers: ' + error.message);
      }
    }
    
    function showError(message) {
      document.getElementById('error').innerHTML = '<div class="error">' + message + '</div>';
      setTimeout(() => { document.getElementById('error').innerHTML = ''; }, 5000);
    }
    
    function loadAll() {
      loadStats();
      loadShipments();
      loadDrivers();
    }
    
    // Initial load
    loadAll();
    
    // Auto-refresh every 30 seconds
    setInterval(loadAll, 30000);
  </script>
</body>
</html>
`;

// ============================================================================
// HONO APP SETUP
// ============================================================================

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', etag());

// CORS configuration
app.use('/api/*', cors({
  origin: '*', // Configure this for production
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Request-Id'],
  maxAge: 86400,
}));

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'unknown',
  });
});

// ============================================================================
// WEB PORTAL ROUTES
// ============================================================================

// Dispatcher Console (public form for creating orders)
app.get('/', (c) => {
  return c.html(dispatcherHtml);
});

// Admin Console (dashboard for monitoring)
app.get('/admin', (c) => {
  // In production, add authentication middleware here
  return c.html(adminHtml);
});

// ============================================================================
// API ROUTES
// ============================================================================

// Mount API route groups
app.route('/api/dispatcher', dispatcherRoutes);
app.route('/api/driver', driverRoutes);
app.route('/api/admin', adminRoutes);

// ============================================================================
// PHOTO SERVING ROUTE
// ============================================================================

// Serve photos from R2 (if bucket has restricted access)
app.get('/photos/*', async (c) => {
  const bucket = c.env.R2_PHOTOS;
  
  if (!bucket) {
    return c.json({ error: 'Photo storage not configured' }, 500);
  }
  
  const key = c.req.path.replace('/photos/', '');
  const photo = await getPhoto(bucket, key);
  
  if (!photo) {
    return c.json({ error: 'Photo not found' }, 404);
  }
  
  return new Response(photo.body, {
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'public, max-age=31536000',
      'ETag': photo.etag,
    },
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.notFound((c) => {
  return c.json({ 
    error: 'Not Found',
    path: c.req.path,
  }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ 
    error: 'Internal Server Error',
    message: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
  }, 500);
});

// ============================================================================
// EXPORT FOR CLOUDFLARE WORKERS
// ============================================================================

export default app;
