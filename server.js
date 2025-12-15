import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { etag } from 'hono/etag';
import { shipmentRoutes, driverRoutes, adminRoutes } from './routes.js';
import { getPhoto } from './storage.js';
import { db } from './db.js';
import { locations } from './schema.js';

// ============================================================================
// FRONTEND HTML TEMPLATES
// ============================================================================

// ... end of dispatcherHtml ...

const adminHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LuggageLink Admin Dashboard</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎒</text></svg>">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        .address-truncate { 
            max-width: 150px; 
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            display: inline-block;
            vertical-align: bottom;
        }
    </style>
</head>
<body class="bg-slate-900 min-h-screen text-slate-100 font-sans">
    <div class="bg-slate-800 border-b border-slate-700 px-6 py-4 sticky top-0 z-50">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <div class="flex items-center gap-3">
                <div class="bg-green-600 text-white p-2 rounded-lg">
                    <i data-lucide="truck" class="w-6 h-6"></i>
                </div>
                <div>
                    <h1 class="text-xl font-bold">LuggageLink Admin</h1>
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <p class="text-xs text-slate-400">Live Operations</p>
                    </div>
                </div>
            </div>
            <button onclick="loadAll()" class="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-slate-600">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i> Refresh
            </button>
        </div>
    </div>

    <div class="max-w-7xl mx-auto p-6">
        <div id="error"></div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div class="text-slate-400 text-xs font-medium uppercase mb-1">Pending</div>
                <div id="statPending" class="text-2xl font-black text-yellow-400">-</div>
            </div>
            <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div class="text-slate-400 text-xs font-medium uppercase mb-1">Assigned</div>
                <div id="statAssigned" class="text-2xl font-black text-blue-400">-</div>
            </div>
            <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div class="text-slate-400 text-xs font-medium uppercase mb-1">Picked Up</div>
                <div id="statPickedUp" class="text-2xl font-black text-purple-400">-</div>
            </div>
            <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div class="text-slate-400 text-xs font-medium uppercase mb-1">Delivered</div>
                <div id="statDelivered" class="text-2xl font-black text-green-400">-</div>
            </div>
            <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div class="text-slate-400 text-xs font-medium uppercase mb-1">Revenue</div>
                <div id="statRevenue" class="text-2xl font-black text-emerald-400">-</div>
            </div>
            <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div class="text-slate-400 text-xs font-medium uppercase mb-1">Drivers</div>
                <div id="statDrivers" class="text-2xl font-black text-orange-400">-</div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col max-h-[800px]">
                <div class="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 backdrop-blur">
                    <h2 class="font-bold flex items-center gap-2">
                        <i data-lucide="package" class="text-green-400 w-5 h-5"></i> Live Shipments
                    </h2>
                    <select id="statusFilter" onchange="loadShipments()" class="bg-slate-700 border-none rounded-lg text-sm px-3 py-1.5 focus:ring-1 focus:ring-green-500 outline-none cursor-pointer">
                        <option value="">All Statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="ASSIGNED">Assigned</option>
                        <option value="PICKED_UP">Picked Up</option>
                        <option value="DELIVERED">Delivered</option>
                    </select>
                </div>
                <div id="shipmentsTable" class="p-4 overflow-y-auto custom-scrollbar">
                    <div class="text-center text-slate-500 py-12 flex flex-col items-center">
                        <i data-lucide="loader-2" class="w-8 h-8 animate-spin mb-2"></i>
                        <span>Loading shipments...</span>
                    </div>
                </div>
            </div>

            <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col max-h-[800px]">
                <div class="px-6 py-4 border-b border-slate-700 bg-slate-800/50 backdrop-blur">
                    <h2 class="font-bold flex items-center gap-2">
                        <i data-lucide="users" class="text-green-400 w-5 h-5"></i> Active Drivers
                    </h2>
                </div>
                <div id="driversList" class="p-4 overflow-y-auto custom-scrollbar">
                    <div class="text-center text-slate-500 py-12">Loading drivers...</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        lucide.createIcons();
        const API_URL = window.location.origin;

        async function loadStats() {
            try {
                const res = await fetch(API_URL + '/api/admin/stats');
                const data = await res.json();
                document.getElementById('statPending').textContent = data.shipments?.pending || 0;
                document.getElementById('statAssigned').textContent = data.shipments?.assigned || 0;
                document.getElementById('statPickedUp').textContent = data.shipments?.pickedUp || 0;
                document.getElementById('statDelivered').textContent = data.shipments?.delivered || 0;
                document.getElementById('statRevenue').textContent = '$' + (data.revenue?.totalDollars || '0.00');
                document.getElementById('statDrivers').textContent = (data.drivers?.online || 0) + '/' + (data.drivers?.total || 0);
            } catch (error) { console.warn('Stats error:', error); }
        }

        async function loadShipments() {
            const status = document.getElementById('statusFilter').value;
            const url = API_URL + '/api/admin/shipments' + (status ? '?status=' + status : '');
            const container = document.getElementById('shipmentsTable');
            try {
                const res = await fetch(url);
                const data = await res.json();
                const list = data.shipments || [];
                if (list.length === 0) {
                    container.innerHTML = '<div class="text-center text-slate-500 py-12">No shipments found</div>';
                    return;
                }
                let html = '<div class="space-y-3">';
                list.forEach(s => {
                    const statusConfig = {
                        'PENDING': { class: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: 'clock' },
                        'ASSIGNED': { class: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: 'user-check' },
                        'PICKED_UP': { class: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: 'truck' },
                        'DELIVERED': { class: 'bg-green-500/10 text-green-400 border-green-500/20', icon: 'check-circle' }
                    };
                    const st = statusConfig[s.status] || { class: 'bg-slate-600', icon: 'help-circle' };
                    const formatLoc = (code, addr) => {
                        if (code && code.length === 3 && code !== 'MAP' && code !== 'OTH') {
                            return \`<span class="font-black text-lg text-white">\${code}</span>\`;
                        }
                        const fullAddr = addr || 'N/A';
                        return \`<span class="address-truncate text-sm text-slate-300" title="\${fullAddr}">\${fullAddr}</span>\`;
                    };
                    const originDisplay = formatLoc(s.originAirport, s.pickupAddress);
                    const destDisplay = formatLoc(s.destinationAirport, s.dropoffAddress);
                    let driverDisplay = '<span class="text-slate-600 text-xs italic">Unassigned</span>';
                    if (s.driverId) {
                         driverDisplay = \`<span class="text-indigo-400 text-xs font-mono"><i data-lucide="user" class="w-3 h-3 inline"></i> \${s.driverId.slice(0,5)}..</span>\`;
                    }
                    let proofs = '';
                    if (s.pickupPhotoUrl) proofs += \`<a href="\${s.pickupPhotoUrl}" target="_blank" class="text-blue-400 hover:text-blue-300"><i data-lucide="camera" class="w-4 h-4"></i></a>\`;
                    if (s.deliveryPhotoUrl || s.dropoffPhotoUrl) proofs += \`<a href="\${s.deliveryPhotoUrl || s.dropoffPhotoUrl}" target="_blank" class="text-green-400 hover:text-green-300 ml-2"><i data-lucide="check-square" class="w-4 h-4"></i></a>\`;

                    html += \`
                    <div class="bg-slate-700/30 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors group">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex flex-col">
                                <span class="font-mono text-[10px] text-slate-500 uppercase tracking-widest">ID: \${s.id.slice(0,8)}</span>
                                <div class="font-bold text-lg text-white mt-0.5">$\${(s.priceCents / 100).toFixed(2)}</div>
                            </div>
                            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border flex items-center gap-1 \${st.class}">
                                <i data-lucide="\${st.icon}" class="w-3 h-3"></i> \${s.status}
                            </span>
                        </div>
                        <div class="bg-slate-800/50 p-3 rounded border border-slate-700/50 mb-3 grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                            <div class="overflow-hidden">\${originDisplay}</div>
                            <i data-lucide="arrow-right" class="text-slate-600 w-4 h-4"></i>
                            <div class="text-right overflow-hidden">\${destDisplay}</div>
                        </div>
                        <div class="flex justify-between items-center border-t border-slate-700/50 pt-3">
                            <div class="text-xs text-slate-500 flex items-center gap-3">
                                <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i> \${new Date(s.createdAt).toLocaleDateString()}</span>
                                \${driverDisplay}
                            </div>
                            <div class="flex items-center">
                                \${proofs}
                            </div>
                        </div>
                    </div>\`;
                });
                html += '</div>';
                container.innerHTML = html;
                lucide.createIcons();
            } catch (error) {
                container.innerHTML = '<div class="p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">Failed to load data</div>';
            }
        }

        async function loadDrivers() {
            try {
                const res = await fetch(API_URL + '/api/admin/drivers');
                const data = await res.json();
                const list = data.drivers || [];
                const container = document.getElementById('driversList');
                if (list.length === 0) {
                    container.innerHTML = '<div class="text-center text-slate-500 py-12">No drivers found</div>';
                    return;
                }
                let html = '<div class="space-y-3">';
                list.forEach(d => {
                    html += \`
                    <div class="bg-slate-700/30 rounded-lg p-3 border border-slate-700 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-2.5 h-2.5 rounded-full \${d.isOnline ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-slate-600'}"></div>
                            <div>
                                <div class="font-bold text-sm text-slate-200">\${d.name || d.email}</div>
                                <div class="text-[10px] text-slate-500 uppercase tracking-wide">\${d.vehicleType || 'Unknown Vehicle'}</div>
                            </div>
                        </div>
                        <div class="text-right">
                             <div class="font-mono text-lg font-bold text-slate-300">\${d.totalDeliveries}</div>
                             <div class="text-[10px] text-slate-500">Deliveries</div>
                        </div>
                    </div>\`;
                });
                html += '</div>';
                container.innerHTML = html;
            } catch (error) { console.warn('Driver load error', error); }
        }

        function loadAll() { loadStats(); loadShipments(); loadDrivers(); }
        loadAll();
        setInterval(loadAll, 30000);
    </script>
</body>
</html>`;
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js"></script>

   <script>
        // Initialize Lucide Icons
        lucide.createIcons();
    
        // --- CONFIG & INIT ---
        const PLATFORM_FEE = 5.73;
        let currentDiscount = 0;
        let activePromoCode = "";

        // Auto-detect backend URL
        document.getElementById('apiUrl').value = window.location.origin;

        // Set Default Dates
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const fmtDate = (d) => d.toISOString().split('T')[0];
        document.getElementById('pickupDate').value = fmtDate(now);
        document.getElementById('pickupTime').value = "10:00";
        document.getElementById('dropoffDate').value = fmtDate(tomorrow);
        document.getElementById('dropoffTime').value = "10:00";

        checkApiHealth();

        // --- MAP SETUP ---
        const map = L.map('map').setView([28.4312, -81.3081], 9); // Default near Orlando
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);

        // --- ICONS ---
        // 1. Dynamic Selection Icons (Blue/Green Pins)
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

        // 2. Special Location Icons (Plane / Box)
        // We use DivIcons to render Emojis or Custom Shapes easily without images
        const airportIcon = L.divIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color:#0ea5e9; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3); font-size:18px;'>✈️</div>",
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const hubIcon = L.divIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color:#f59e0b; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3); font-size:18px;'>📦</div>",
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        let pickupMarker = null;
        let dropoffMarker = null;
        let selectionMode = 'pickup';

        // --- LOAD SPECIAL LOCATIONS ---
        async function loadSpecialLocations() {
            try {
                const res = await fetch(window.location.origin + '/api/locations');
                const data = await res.json();
                
                if (data.locations) {
                    data.locations.forEach(loc => {
                        const icon = loc.type === 'AIRPORT' ? airportIcon : hubIcon;
                        const marker = L.marker([loc.latitude, loc.longitude], { icon: icon }).addTo(map);
                        
                        // Add Tooltip
                        marker.bindTooltip(`<b>${loc.code}</b><br>${loc.name}`, { direction: 'top', offset: [0, -10] });

                        // Click Logic: Treat this as a "Selection"
                        marker.on('click', () => {
                            // Pass the CODE as the address (e.g., "MCO")
                            handleMapClick({ latlng: { lat: loc.latitude, lng: loc.longitude } }, loc.code);
                        });
                    });
                }
            } catch (err) {
                console.warn("Failed to load special locations:", err);
            }
        }
        loadSpecialLocations();


        // --- GEOCODER & CLICK HANDLING ---
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
            
            // If addressOverride is short (like "MCO"), use it. Otherwise, use coord string.
            // Note: In a real app, you'd Reverse Geocode here if addressOverride is null.
            const displayAddress = addressOverride || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

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

        // --- CALCULATION LOGIC ---
        const bagInputs = document.querySelectorAll('.bag-input');
        bagInputs.forEach(input => input.addEventListener('input', calculateTotals));

        function calculateTotals() {
            let bagTotal = 0;
            let totalCount = 0;

            bagInputs.forEach(input => {
                const qty = parseInt(input.value) || 0;
                const price = parseFloat(input.dataset.price);
                const rowTotal = qty * price;
                input.parentElement.nextElementSibling.textContent = '$' + rowTotal.toFixed(2);
                bagTotal += rowTotal;
                totalCount += qty;
            });

            document.getElementById('bagsSubTotal').textContent = '$' + bagTotal.toFixed(2);
            document.getElementById('totalBagCount').textContent = totalCount;
            document.getElementById('summaryBagTotal').textContent = '$' + bagTotal.toFixed(2);
            
            let grandTotal = bagTotal + PLATFORM_FEE - currentDiscount;
            if (grandTotal < 0) grandTotal = 0;

            document.getElementById('finalPrice').value = grandTotal.toFixed(2);
        }

        // --- PROMO LOGIC ---
        function applyPromo() {
            const code = document.getElementById('promoCode').value.trim().toUpperCase();
            const msg = document.getElementById('promoMsg');
            const row = document.getElementById('summaryDiscountRow');
            
            currentDiscount = 0;
            activePromoCode = "";
            msg.className = "hidden";
            row.classList.add('hidden');

            if (!code) { calculateTotals(); return; }

            if (code === 'SAVE5') {
                currentDiscount = 5.00;
                activePromoCode = "SAVE5";
                showSuccess("Code Applied: $5.00 OFF");
            } else if (code === 'FLY10') {
                const bagText = document.getElementById('bagsSubTotal').textContent.replace('$','');
                currentDiscount = (parseFloat(bagText) || 0) * 0.10;
                activePromoCode = "FLY10";
                showSuccess("Code Applied: 10% OFF");
            } else {
                msg.textContent = "❌ Invalid Code";
                msg.className = "text-xs font-bold text-red-600 mt-1 block";
            }

            if (currentDiscount > 0) {
                row.classList.remove('hidden');
                document.getElementById('discountName').textContent = activePromoCode;
                document.getElementById('discountVal').textContent = '-$' + currentDiscount.toFixed(2);
                calculateTotals(); 
            }

            function showSuccess(text) {
                msg.textContent = "✅ " + text;
                msg.className = "text-xs font-bold text-green-600 mt-1 block";
            }
        }

        // --- API HELPERS ---
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

        // --- SUBMIT FUNCTION ---
        async function createShipment() {
            const btn = document.getElementById('submitBtn');
            const msg = document.getElementById('resultMsg');
            const name = document.getElementById('custName').value;
            
            const lat1 = document.getElementById('pickupLat').value;
            const lng1 = document.getElementById('pickupLng').value;
            const lat2 = document.getElementById('dropoffLat').value;
            const lng2 = document.getElementById('dropoffLng').value;
            
            const rawOrigin = document.getElementById('originInput').value;
            const rawDest = document.getElementById('destInput').value;

            if (!name) return alert("Customer Name is required");
            if (!lat1 || !lat2) return alert("Please select both Pickup and Dropoff points on the map.");

            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Creating...';
            msg.className = 'hidden';

            // Build Notes
            let bagSummary = [];
            bagInputs.forEach(input => {
                if (input.value > 0) bagSummary.push(input.value + " x " + input.dataset.name);
            });
            const bagString = bagSummary.length > 0 ? bagSummary.join(', ') : "No Bags";
            
            const notes = [
                "CUSTOMER: " + name + " | " + document.getElementById('custEmail').value + " | " + document.getElementById('custPhone').value,
                "PICKUP: " + rawOrigin,
                "DROPOFF: " + rawDest,
                "LUGGAGE: " + bagString,
                "NOTES: " + document.getElementById('internalNotes').value,
                activePromoCode ? "PROMO: " + activePromoCode : ""
            ].join('\\n');

            // INTELLIGENT ROUTE NAMING
            // If the input is short (e.g. "MCO"), save it as the airport code.
            // If it's long, save as "MAP" so the Admin knows to look at the address.
            const originCode = rawOrigin.length <= 5 ? rawOrigin : "MAP";
            const destCode = rawDest.length <= 5 ? rawDest : "MAP";

            const payload = {
                customerId: crypto.randomUUID(), 
                customerDetails: {
                    name: name,
                    email: document.getElementById('custEmail').value,
                    phone: document.getElementById('custPhone').value
                },
                luggageId: crypto.randomUUID(),
                
                // SAVE CODES HERE
                originAirport: originCode, 
                destinationAirport: destCode,
                
                pickupLatitude: parseFloat(lat1),
                pickupLongitude: parseFloat(lng1),
                dropoffLatitude: parseFloat(lat2),
                dropoffLongitude: parseFloat(lng2),
                pickupAddress: rawOrigin, 
                dropoffAddress: rawDest,
                pickupAt: new Date(document.getElementById('pickupDate').value + "T" + document.getElementById('pickupTime').value).toISOString(),
                dropoffBy: new Date(document.getElementById('dropoffDate').value + "T" + document.getElementById('dropoffTime').value).toISOString(),
                priceCents: Math.round(parseFloat(document.getElementById('finalPrice').value) * 100),
                currency: 'USD',
                notes: notes
            };

            try {
                const res = await fetch(window.location.origin + '/api/shipments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();

                if (res.ok) {
                    msg.innerHTML = '✅ <b>Success!</b> Shipment #' + data.id.slice(0,8) + ' Created.';
                    msg.className = "mt-4 p-3 rounded-lg text-sm text-center bg-green-100 text-green-800 border border-green-200 block";
                    
                    document.getElementById('custName').value = "";
                    document.getElementById('internalNotes').value = "";
                    // Reset map selection if desired
                } else {
                    throw new Error(data.error || "Server rejected request");
                }
            } catch (err) {
                msg.innerHTML = '❌ ' + err.message;
                msg.className = "mt-4 p-3 rounded-lg text-sm text-center bg-red-100 text-red-800 border border-red-200 block";
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>Create Shipment</span><i data-lucide="send" class="w-5 h-5 ml-2"></i>';
                lucide.createIcons();
            }
        }
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
// GET /api/locations - Returns all special hubs/airports
app.get('/api/locations', async (c) => {
  try {
    const result = await db.select().from(locations);
    return c.json({ locations: result });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});
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
