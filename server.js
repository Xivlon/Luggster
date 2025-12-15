import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { etag } from 'hono/etag';
import { shipmentRoutes, driverRoutes, adminRoutes } from './routes.js';
import { getPhoto } from './storage.js';

// ============================================================================
// FRONTEND HTML TEMPLATES
// ============================================================================

const dispatcherHtml = const dispatcherHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LuggageLink Dispatcher</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css" />
  
  <style>
    #map { height: 400px; width: 100%; z-index: 1; border-radius: 0.75rem; }
    .leaflet-control-geocoder { z-index: 1000 !important; }
  </style>
</head>
<body class="bg-slate-50 min-h-screen py-10 px-4 font-sans text-slate-800">

  <div class="max-w-3xl mx-auto bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
    <div class="bg-indigo-600 px-6 py-5">
      <div class="flex justify-between items-center">
        <div>
            <h1 class="text-xl font-bold text-white flex items-center gap-2">
                ✈️ New Shipment Order
            </h1>
            <p class="text-indigo-100 text-sm mt-1">Enter route details to calculate pricing and assign drivers.</p>
        </div>
        <div class="bg-indigo-500/50 px-3 py-1 rounded-full border border-indigo-400/50">
             <span class="text-xs font-medium text-white flex items-center gap-2">
                <span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span> System Online
             </span>
        </div>
      </div>
    </div>

    <form id="orderForm" class="p-6 space-y-8">
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Customer Name</label>
          <input type="text" name="name" required placeholder="e.g. John Doe" 
            class="w-full rounded-lg border-slate-300 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-indigo-500 p-2.5 border transition-all shadow-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
          <input type="email" name="email" required placeholder="john@example.com" 
            class="w-full rounded-lg border-slate-300 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-indigo-500 p-2.5 border transition-all shadow-sm">
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex justify-between items-end">
            <label class="block text-sm font-bold text-slate-700">Route Selection</label>
            <span class="text-xs text-slate-400">Powered by OpenStreetMap</span>
        </div>
        
        <div class="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 border border-blue-100 flex items-start gap-3">
          <span class="text-xl">ℹ️</span>
          <div>
            <strong>How to use:</strong> Use the search icon 🔍 on the map to find an address. 
            <ul class="list-disc list-inside mt-1 ml-1 text-blue-700/80">
                <li>First selection sets <strong>Pickup</strong> (Blue).</li>
                <li>Second selection sets <strong>Dropoff</strong> (Green).</li>
            </ul>
          </div>
        </div>
        
        <div id="map" class="border-2 border-slate-200 shadow-inner"></div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div>
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pickup Location</span>
            <input type="text" id="pickup_address" name="pickupAddress" required readonly 
                class="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-700 focus:ring-0 placeholder-slate-300 truncate" 
                placeholder="Select on map...">
            <input type="hidden" id="pickup_lat" name="pickupLatitude">
            <input type="hidden" id="pickup_lng" name="pickupLongitude">
        </div>
        <div>
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dropoff Location</span>
            <input type="text" id="dropoff_address" name="dropoffAddress" required readonly 
                class="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-700 focus:ring-0 placeholder-slate-300 truncate" 
                placeholder="Select on map...">
            <input type="hidden" id="dropoff_lat" name="dropoffLatitude">
            <input type="hidden" id="dropoff_lng" name="dropoffLongitude">
        </div>
      </div>

      <div class="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Price</label>
          <div class="relative">
              <span class="absolute left-3 top-2.5 text-slate-400">$</span>
              <input type="number" id="price" required placeholder="0.00" step="0.01"
                class="w-full pl-6 rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2.5 border font-mono font-bold text-lg">
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Currency</label>
          <select class="w-full rounded-lg border-slate-300 bg-slate-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2.5 border text-sm">
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </div>
      </div>

      <button type="submit" id="submitBtn" 
        class="w-full bg-indigo-600 text-white font-bold py-4 px-4 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 flex justify-center items-center gap-2 transform active:scale-[0.99]">
        <span>Create Shipment</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      </button>
    </form>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js"></script>

  <script>
    // --- MAP SETUP ---
    const map = L.map('map').setView([40.7128, -74.0060], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Custom Icons
    const pickupIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    const dropoffIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    let pickupMarker = null;
    let dropoffMarker = null;
    let selectionMode = 'pickup';

    // --- SEARCH & CLICK HANDLERS ---
    const geocoder = L.Control.geocoder({ defaultMarkGeocode: false })
    .on('markgeocode', function(e) {
        const latlng = e.geocode.center;
        const address = e.geocode.name;
        handleMapClick({ latlng }, address);
        map.fitBounds(e.geocode.bbox);
    })
    .addTo(map);

    map.on('click', (e) => handleMapClick(e, null));

    function handleMapClick(e, addressOverride) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        const displayAddress = addressOverride || \`\${lat.toFixed(4)}, \${lng.toFixed(4)}\`;

        if (selectionMode === 'pickup') {
            if (pickupMarker) map.removeLayer(pickupMarker);
            pickupMarker = L.marker([lat, lng], {icon: pickupIcon}).addTo(map).bindPopup("Pickup: " + displayAddress).openPopup();
            
            document.getElementById('pickup_address').value = displayAddress;
            document.getElementById('pickup_lat').value = lat;
            document.getElementById('pickup_lng').value = lng;
            
            selectionMode = 'dropoff';
        } else {
            if (dropoffMarker) map.removeLayer(dropoffMarker);
            dropoffMarker = L.marker([lat, lng], {icon: dropoffIcon}).addTo(map).bindPopup("Dropoff: " + displayAddress).openPopup();
            
            document.getElementById('dropoff_address').value = displayAddress;
            document.getElementById('dropoff_lat').value = lat;
            document.getElementById('dropoff_lng').value = lng;
            
            if (pickupMarker && dropoffMarker) {
                const group = new L.featureGroup([pickupMarker, dropoffMarker]);
                map.fitBounds(group.getBounds().pad(0.2));
            }
            selectionMode = 'pickup'; 
        }
    }

    // --- SUBMISSION LOGIC ---
    document.getElementById('orderForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      const originalText = btn.innerHTML;
      
      btn.innerHTML = 'Processing...';
      btn.disabled = true;

      const formData = new FormData(e.target);
      const priceVal = parseFloat(document.getElementById('price').value);

      const payload = {
        name: formData.get('name'),
        email: formData.get('email'),
        pickupAddress: formData.get('pickupAddress'),
        pickupLatitude: parseFloat(formData.get('pickupLatitude')),
        pickupLongitude: parseFloat(formData.get('pickupLongitude')),
        dropoffAddress: formData.get('dropoffAddress'),
        dropoffLatitude: parseFloat(formData.get('dropoffLatitude')),
        dropoffLongitude: parseFloat(formData.get('dropoffLongitude')),
        priceCents: Math.round(priceVal * 100),
        currency: 'USD'
      };

      try {
        // AUTOMATICALLY USE THE SAME SERVER URL
        const API_ENDPOINT = window.location.origin + "/api/shipments";
        
        const response = await fetch(API_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          alert("✅ Shipment Created Successfully!");
          window.location.reload();
        } else {
          const err = await response.text();
          alert("❌ Error: " + err);
        }
      } catch (error) {
        alert("❌ Network Error: " + error.message);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>`;

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
  origin: '*',
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
    service: 'luggagelink-backend',
    environment: c.env.ENVIRONMENT || 'unknown',
  });
});

// ============================================================================
// WEB PORTAL ROUTES
// ============================================================================

// Dispatcher Console (main page for creating orders)
app.get('/', (c) => {
  return c.html(dispatcherHtml);
});

// Admin Console (dashboard for monitoring)
app.get('/admin', (c) => {
  return c.html(adminHtml);
});

// ============================================================================
// API ROUTES
// ============================================================================

// Mount shipment routes at /api/shipments (main dispatcher endpoint)
app.route('/api/shipments', shipmentRoutes);

// Mount driver routes at /api/driver
app.route('/api/driver', driverRoutes);

// Mount admin routes at /api/admin  
app.route('/api/admin', adminRoutes);

// ============================================================================
// PHOTO SERVING ROUTE
// ============================================================================

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

app.notFound((c) => {
  return c.json({ 
    error: 'Not Found',
    path: c.req.path,
  }, 404);
});

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
