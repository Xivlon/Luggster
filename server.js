import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { etag } from 'hono/etag';
import { orderRoutes, authRoutes } from './routes.js';
import { db } from './db.js';
import { locations } from './schema.js';

// ============================================================================
// DISPATCHER CONSOLE HTML
// ============================================================================

const dispatcherHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Creation Platform</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📦</text></svg>">

    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>

    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css" />
    <style>
        #map { height: 350px; width: 100%; border-radius: 0.5rem; z-index: 1; }
        .leaflet-control-geocoder { z-index: 1000 !important; }
        .leaflet-control-geocoder-icon {
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E") !important;
            background-repeat: no-repeat;
            background-position: center;
            background-size: 18px 18px;
            border-radius: 0.5rem;
        }
    </style>
</head>
<body class="bg-slate-50 min-h-screen p-6 font-sans">

    <div class="max-w-6xl mx-auto">
        <div class="flex justify-between items-center mb-8">
            <div class="flex items-center gap-3">
                <div class="bg-blue-600 text-white p-2 rounded-lg">
                    <i data-lucide="package" class="w-8 h-8"></i>
                </div>
                <div>
                    <h1 class="text-3xl font-bold text-slate-900">Order Creation Platform</h1>
                    <p class="text-sm text-slate-500">Create orders with pickup and dropoff locations</p>
                </div>
            </div>

            <div class="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-blue-200 shadow-sm text-sm">
                <div id="connStatus" class="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></div>
                <span id="connText" class="font-medium text-slate-600">Connecting...</span>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <div class="lg:col-span-2 space-y-6">

                <div class="bg-white p-6 rounded-xl shadow-sm border border-blue-200">
                    <h2 class="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2">
                        <i data-lucide="user" class="text-blue-600 w-5 h-5"></i> Customer Information
                    </h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                            <input type="text" id="custName" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="John Doe">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                            <input type="email" id="custEmail" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="john@example.com" required>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Phone</label>
                            <input type="tel" id="custPhone" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none" placeholder="(555) 123-4567">
                        </div>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-xl shadow-sm border border-blue-200">
                    <h2 class="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2">
                        <i data-lucide="map-pin" class="text-blue-600 w-5 h-5"></i> Route Selection
                    </h2>

                    <div class="bg-blue-50 text-blue-800 text-sm p-3 rounded-lg mb-4 flex items-start gap-2">
                        <i data-lucide="info" class="w-5 h-5 mt-0.5"></i>
                        <div>
                            <strong>Use the Search Icon (🔍) on the map</strong> to find locations.
                            <ul class="list-disc list-inside text-xs mt-1">
                                <li>1st Selection = <span class="font-bold text-blue-600">Pickup</span> (Blue Marker)</li>
                                <li>2nd Selection = <span class="font-bold text-green-600">Dropoff</span> (Green Marker)</li>
                            </ul>
                        </div>
                    </div>

                    <div id="map" class="mb-6 border border-slate-200 shadow-inner"></div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                        <div class="hidden md:block absolute left-1/2 top-4 bottom-4 w-px bg-slate-100 -translate-x-1/2"></div>

                        <div>
                            <div class="flex items-center gap-2 mb-3">
                                <div class="w-2 h-2 rounded-full bg-blue-600"></div>
                                <h3 class="font-bold text-slate-900">Pick Up</h3>
                            </div>
                            <div class="space-y-3">
                                <div>
                                    <input type="text" id="originInput" readonly placeholder="Select on Map..." class="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-600 cursor-not-allowed">
                                    <input type="hidden" id="pickupLat"><input type="hidden" id="pickupLng">
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="block text-[10px] font-bold text-slate-400 mb-1">Date</label>
                                        <input type="date" id="pickupDate" class="w-full p-2 border border-slate-200 rounded-lg text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-bold text-slate-400 mb-1">Time</label>
                                        <input type="time" id="pickupTime" class="w-full p-2 border border-slate-200 rounded-lg text-sm">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div class="flex items-center gap-2 mb-3">
                                <div class="w-2 h-2 rounded-full bg-green-600"></div>
                                <h3 class="font-bold text-slate-900">Drop Off</h3>
                            </div>
                            <div class="space-y-3">
                                <div>
                                    <input type="text" id="destInput" readonly placeholder="Select on Map..." class="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-600 cursor-not-allowed">
                                    <input type="hidden" id="dropoffLat"><input type="hidden" id="dropoffLng">
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="block text-[10px] font-bold text-slate-400 mb-1">Date</label>
                                        <input type="date" id="dropoffDate" class="w-full p-2 border border-slate-200 rounded-lg text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-bold text-slate-400 mb-1">Time</label>
                                        <input type="time" id="dropoffTime" class="w-full p-2 border border-slate-200 rounded-lg text-sm">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="space-y-6">
                <div class="bg-white p-6 rounded-xl shadow-sm border border-blue-200 sticky top-6 z-10">
                    <h2 class="text-lg font-bold mb-4">Order Summary</h2>

                    <div class="space-y-4 mb-6">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Total Price</label>
                            <div class="relative">
                                <span class="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                                <input id="finalPrice" type="number" min="0.01" step="0.01" value="0.00" class="w-full pl-7 p-3 bg-slate-50 border border-blue-200 rounded-lg font-black text-slate-700 text-xl select-none">
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Order Notes</label>
                            <textarea id="internalNotes" rows="4" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" placeholder="Special instructions, codes, etc..."></textarea>
                        </div>
                    </div>

                    <button onclick="createOrder()" id="submitBtn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2">
                        <span>Create Order</span>
                        <i data-lucide="send" class="w-5 h-5"></i>
                    </button>

                    <div id="resultMsg" class="mt-4 hidden p-3 rounded-lg text-sm text-center"></div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js"></script>

   <script>
        lucide.createIcons();

        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const fmtDate = (d) => d.toISOString().split('T')[0];
        document.getElementById('pickupDate').value = fmtDate(now);
        document.getElementById('pickupTime').value = "10:00";
        document.getElementById('dropoffDate').value = fmtDate(tomorrow);
        document.getElementById('dropoffTime').value = "10:00";

        checkApiHealth();

        // MAP SETUP
        const map = L.map('map').setView([28.4312, -81.3081], 9);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);

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

        async function loadSpecialLocations() {
            try {
                const res = await fetch(window.location.origin + '/api/locations');
                const data = await res.json();

                if (data.locations) {
                    data.locations.forEach(loc => {
                        const marker = L.marker([loc.latitude, loc.longitude]).addTo(map);
                        marker.bindTooltip('<b>' + loc.code + '</b><br>' + loc.name, { direction: 'top', offset: [0, -10] });
                        marker.on('click', () => {
                            handleMapClick({ latlng: { lat: loc.latitude, lng: loc.longitude } }, loc.code);
                        });
                    });
                }
            } catch (err) {
                console.warn("Failed to load locations:", err);
            }
        }
        loadSpecialLocations();

        const geocoder = L.Control.geocoder({ defaultMarkGeocode: false })
        .on('markgeocode', function(e) {
            handleMapClick({ latlng: e.geocode.center }, e.geocode.name);
            map.fitBounds(e.geocode.bbox);
        })
        .addTo(map);

        map.on('click', (e) => handleMapClick(e, null));

        function handleMapClick(e, addressOverride) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            const displayAddress = addressOverride || lat.toFixed(4) + ', ' + lng.toFixed(4);

            if (selectionMode === 'pickup') {
                if (pickupMarker) map.removeLayer(pickupMarker);
                pickupMarker = L.marker([lat, lng], {icon: pickupIcon}).addTo(map).bindPopup("Pickup").openPopup();

                document.getElementById('originInput').value = displayAddress;
                document.getElementById('pickupLat').value = lat;
                document.getElementById('pickupLng').value = lng;

                selectionMode = 'dropoff';
            } else {
                if (dropoffMarker) map.removeLayer(dropoffMarker);
                dropoffMarker = L.marker([lat, lng], {icon: dropoffIcon}).addTo(map).bindPopup("Dropoff").openPopup();

                document.getElementById('destInput').value = displayAddress;
                document.getElementById('dropoffLat').value = lat;
                document.getElementById('dropoffLng').value = lng;

                if (pickupMarker && dropoffMarker) {
                    const group = new L.featureGroup([pickupMarker, dropoffMarker]);
                    map.fitBounds(group.getBounds().pad(0.2));
                }
                selectionMode = 'pickup';
            }
        }

        async function checkApiHealth() {
            const statusDot = document.getElementById('connStatus');
            const statusText = document.getElementById('connText');
            try {
                const res = await fetch(window.location.origin + '/health');
                if (res.ok) {
                    statusDot.className = "w-2.5 h-2.5 rounded-full bg-green-500";
                    statusText.textContent = "System Online";
                    statusText.className = "font-medium text-green-700";
                }
            } catch (e) {
                statusDot.className = "w-2.5 h-2.5 rounded-full bg-red-500";
                statusText.textContent = "Offline";
                statusText.className = "font-medium text-red-700";
            }
        }

        async function createOrder() {
            const btn = document.getElementById('submitBtn');
            const msg = document.getElementById('resultMsg');
            const name = document.getElementById('custName').value;
            const email = document.getElementById('custEmail').value;
            const phone = document.getElementById('custPhone').value;

            const lat1 = document.getElementById('pickupLat').value;
            const lng1 = document.getElementById('pickupLng').value;
            const lat2 = document.getElementById('dropoffLat').value;
            const lng2 = document.getElementById('dropoffLng').value;

            const rawOrigin = document.getElementById('originInput').value;
            const rawDest = document.getElementById('destInput').value;
            const price = parseFloat(document.getElementById('finalPrice').value) || 0;

            if (!name || !email) return alert("Name and email are required");
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(email)) return alert("Please enter a valid email address");
            if (!lat1 || !lat2) return alert("Please select both Pickup and Dropoff points on the map.");
            if (price <= 0) return alert("Price must be greater than 0");

            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 mr-2 animate-spin"></i> Creating...';
            lucide.createIcons();
            msg.className = 'hidden';

            const payload = {
                customerName: name,
                customerEmail: email,
                customerPhone: phone,
                originAirport: rawOrigin.length <= 8 ? rawOrigin : "MAP",
                destinationAirport: rawDest.length <= 8 ? rawDest : "MAP",
                pickupAddress: rawOrigin,
                pickupLatitude: parseFloat(lat1),
                pickupLongitude: parseFloat(lng1),
                pickupAt: new Date(document.getElementById('pickupDate').value + "T" + document.getElementById('pickupTime').value).toISOString(),
                dropoffAddress: rawDest,
                dropoffLatitude: parseFloat(lat2),
                dropoffLongitude: parseFloat(lng2),
                dropoffBy: new Date(document.getElementById('dropoffDate').value + "T" + document.getElementById('dropoffTime').value).toISOString(),
                priceCents: Math.round(price * 100),
                currency: 'USD',
                notes: document.getElementById('internalNotes').value
            };

            try {
                const res = await fetch(window.location.origin + '/api/orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();

                if (res.ok) {
                    msg.innerHTML = '✅ <b>Success!</b> Order #' + data.id.slice(0,8) + ' Created.';
                    msg.className = "mt-4 p-3 rounded-lg text-sm text-center bg-green-100 text-green-800 border border-green-200 block";

                    // Reset all form fields after successful order creation
                    document.getElementById('custName').value = "";
                    document.getElementById('custEmail').value = "";
                    document.getElementById('custPhone').value = "";
                    document.getElementById('originInput').value = "";
                    document.getElementById('destInput').value = "";
                    document.getElementById('pickupLat').value = "";
                    document.getElementById('pickupLng').value = "";
                    document.getElementById('dropoffLat').value = "";
                    document.getElementById('dropoffLng').value = "";
                    document.getElementById('pickupDate').value = "";
                    document.getElementById('pickupTime').value = "";
                    document.getElementById('dropoffDate').value = "";
                    document.getElementById('dropoffTime').value = "";
                    document.getElementById('finalPrice').value = "0.00";
                    document.getElementById('internalNotes').value = "";

                    // Clear map markers
                    if (window.pickupMarker) {
                        map.removeLayer(window.pickupMarker);
                        window.pickupMarker = null;
                    }
                    if (window.dropoffMarker) {
                        map.removeLayer(window.dropoffMarker);
                        window.dropoffMarker = null;
                    }
                } else {
                    throw new Error(data.error || "Server rejected request");
                }
            } catch (err) {
                msg.innerHTML = '❌ ' + err.message;
                msg.className = "mt-4 p-3 rounded-lg text-sm text-center bg-red-100 text-red-800 border border-red-200 block";
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>Create Order</span><i data-lucide="send" class="w-5 h-5 ml-2"></i>';
                lucide.createIcons();
            }
        }
    </script>
</body>
</html>\`;

// ============================================================================
// HONO APP SETUP
// ============================================================================

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', etag());

// CORS configuration for API routes
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Request-Id'],
  maxAge: 86400,
}));

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'order-creation-platform',
    environment: c.env.ENVIRONMENT || 'unknown',
  });
});

// ============================================================================
// WEB UI ROUTES
// ============================================================================

// Dispatcher console - main page for creating orders
app.get('/', (c) => {
  return c.html(dispatcherHtml);
});

// ============================================================================
// API ROUTES
// ============================================================================

// Authentication endpoints: /api/auth/signup, /api/auth/login
app.route('/api/auth', authRoutes);

// Order endpoints: /api/orders (create, list, get by ID, get by customer)
app.route('/api/orders', orderRoutes);

// Locations reference data
app.get('/api/locations', async (c) => {
  try {
    const result = await db.select().from(locations);
    return c.json({ locations: result });
  } catch (err) {
    return c.json({ error: 'Failed to fetch locations', details: err.message }, 500);
  }
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
