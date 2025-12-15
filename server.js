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

const dispatcherHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LuggageLink Dispatcher Console</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📦</text></svg>">
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css" />
    <style>
        #map { height: 350px; width: 100%; border-radius: 0.5rem; z-index: 1; }
        .leaflet-control-geocoder { z-index: 1000 !important; }

        /* OVERRIDE: LUCIDE SEARCH ICON */
        .leaflet-control-geocoder-icon {
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E") !important;
            background-repeat: no-repeat;
            background-position: center;
            background-size: 18px 18px; /* Adjust icon size here */
            border-radius: 0.5rem;
        }
    </style>
</head>
<body class="bg-slate-50 min-h-screen p-6 font-sans text-green-800">

    <div class="max-w-6xl mx-auto">
        <div class="flex justify-between items-center mb-8">
            <div class="flex items-center gap-3">
                <div class="bg-green-600 text-white p-2 rounded-lg">
                    <i data-lucide="truck" class="w-8 h-8"></i>
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-slate-900">Dispatcher Console</h1>
                    <p class="text-sm text-slate-500">Create and assign new luggage shipments</p>
                </div>
            </div>
            
            <div class="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-green-200 shadow-sm text-sm">
                <div id="connStatus" class="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></div>
                <span id="connText" class="font-medium text-slate-600">Connecting...</span>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div class="lg:col-span-2 space-y-6">
                
                <div class="bg-white p-6 rounded-xl shadow-sm border border-green-200">
                    <h2 class="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2 border-green-100">
                        <i data-lucide="user" class="text-green-600 w-5 h-5"></i> Customer Information
                    </h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                            <input type="text" id="custName" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="e.g. Sarah Connor">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                            <input type="email" id="custEmail" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none" placeholder="sarah@example.com">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Phone</label>
                            <input type="tel" id="custPhone" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none" placeholder="(555) 123-4567">
                        </div>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-xl shadow-sm border border-green-200">
                    <h2 class="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2 border-slate-100">
                        <i data-lucide="briefcase" class="text-green-600 w-5 h-5"></i> Luggage Details
                    </h2>
                    
                    <div class="overflow-hidden rounded-lg border border-green-200">
                        <table class="w-full text-sm text-left">
                            <thead class="bg-slate-50 text-slate-500 uppercase font-bold text-xs">
                                <tr>
                                    <th class="p-3">Bag Type</th>
                                    <th class="p-3 w-24">Price</th>
                                    <th class="p-3 w-24 text-center">Quantity</th>
                                    <th class="p-3 w-32 text-right">Line Total</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 bg-white">
                                <tr>
                                    <td class="p-3 font-medium text-slate-900">Large / Med</td>
                                    <td class="p-3 text-slate-500">$10.00</td>
                                    <td class="p-3">
                                        <input type="number" min="0" value="0" data-name="Large/Med" data-price="10" class="bag-input w-full p-2 border border-slate-200 rounded text-center font-bold focus:ring-1 focus:ring-green-500 outline-none">
                                    </td>
                                    <td class="p-3 text-right font-bold text-slate-900 bag-total">$0.00</td>
                                </tr>
                                <tr>
                                    <td class="p-3 font-medium text-slate-900">Small Carry on</td>
                                    <td class="p-3 text-slate-500">$7.00</td>
                                    <td class="p-3">
                                        <input type="number" min="0" value="0" data-name="Carry On" data-price="7" class="bag-input w-full p-2 border border-slate-200 rounded text-center font-bold focus:ring-1 focus:ring-green-500 outline-none">
                                    </td>
                                    <td class="p-3 text-right font-bold text-slate-900 bag-total">$0.00</td>
                                </tr>
                                <tr>
                                    <td class="p-3 font-medium text-slate-900">Small / Personal / Backpacks</td>
                                    <td class="p-3 text-slate-500">$6.00</td>
                                    <td class="p-3">
                                        <input type="number" min="0" value="0" data-name="Backpack" data-price="6" class="bag-input w-full p-2 border border-slate-200 rounded text-center font-bold focus:ring-1 focus:ring-green-500 outline-none">
                                    </td>
                                    <td class="p-3 text-right font-bold text-slate-900 bag-total">$0.00</td>
                                </tr>
                            </tbody>
                            <tfoot class="bg-slate-50 border-t border-slate-200">
                                <tr>
                                    <td colspan="3" class="p-3 text-right font-bold uppercase text-xs text-slate-500">Total Bags: <span id="totalBagCount">0</span></td>
                                    <td class="p-3 text-right font-black text-slate-700 text-lg" id="bagsSubTotal">$0.00</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-xl shadow-sm border border-green-200">
                    <h2 class="text-lg font-bold mb-4 flex items-center justify-between border-b pb-2 border-slate-100">
                        <span class="flex items-center gap-2"><i data-lucide="map-pin" class="text-green-600 w-5 h-5"></i> Route Selection</span>
                        <span class="text-xs font-normal text-slate-400">Powered by OpenStreetMap</span>
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
                <div class="bg-white p-6 rounded-xl shadow-sm border border-green-200 sticky top-6 z-10">
                    <h2 class="text-lg font-bold mb-4">Summary</h2>
                    
                    <div class="space-y-4 mb-6">
                        <div class="flex gap-2">
                            <input type="text" id="promoCode" placeholder="Promo Code" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm uppercase outline-none focus:ring-1 focus:ring-green-500">
                            <button onclick="applyPromo()" class="bg-slate-800 text-white px-4 rounded-lg text-sm font-bold hover:bg-slate-700">Apply</button>
                        </div>
                        <div id="promoMsg" class="hidden text-xs font-bold"></div>

                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Total Price ($)</label>
                            <div class="relative">
                                <span class="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                                <input  id="finalPrice" value="5.73" readonly class="w-full pl-7 p-3 bg-white-100 border border-green-200 rounded-lg font-black text-slate-500 text-xl cursor-not-allowed select-none">
                            </div>
                            
                            <div class="mt-3 text-xs text-slate-500 space-y-1 bg-slate-50 p-3 rounded border border-slate-100">
                                <div class="flex justify-between">
                                    <span>Bag Subtotal:</span>
                                    <span id="summaryBagTotal" class="font-bold">$0.00</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Platform Fee:</span>
                                    <span class="font-bold text-slate-700">$5.73</span>
                                </div>
                                <div id="summaryDiscountRow" class="flex justify-between text-green-600 hidden">
                                    <span>Discount (<span id="discountName"></span>):</span>
                                    <span id="discountVal" class="font-bold">-$0.00</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Internal Notes</label>
                            <textarea id="internalNotes" rows="4" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" placeholder="Gate codes, special instructions..."></textarea>
                        </div>
                    </div>

                    <button onclick="createShipment()" id="submitBtn" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2">
                        <span>Create Shipment</span>
                        <i data-lucide="send" class="w-5 h-5"></i>
                    </button>

                    <div id="resultMsg" class="mt-4 hidden p-3 rounded-lg text-sm text-center"></div>
                </div>

                <div class="bg-slate-100 p-4 rounded-xl border border-slate-200 opacity-60 hover:opacity-100 transition-opacity">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Backend URL</label>
                    <input type="text" id="apiUrl" readonly class="w-full p-1.5 bg-slate-200 border border-slate-300 rounded text-[10px] text-slate-600 font-mono cursor-not-allowed">
                </div>
            </div>
        </div>
    </div>

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
        const map = L.map('map').setView([40.7128, -74.0060], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);

        // Icons
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

        // Geocoder
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
            const displayAddress = addressOverride || \`\${lat.toFixed(4)}, \${lng.toFixed(4)}\`;

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
                "PICKUP ADDRESS: " + document.getElementById('originInput').value,
                "DROPOFF ADDRESS: " + document.getElementById('destInput').value,
                "LUGGAGE: " + bagString,
                "NOTES: " + document.getElementById('internalNotes').value,
                activePromoCode ? "PROMO: " + activePromoCode : ""
            ].join('\\n');

            const payload = {
                customerId: crypto.randomUUID(), 
                customerDetails: {
                    name: name,
                    email: document.getElementById('custEmail').value,
                    phone: document.getElementById('custPhone').value
                },
                luggageId: crypto.randomUUID(),
                originAirport: "MAP", 
                destinationAirport: "MAP",
                pickupLatitude: parseFloat(lat1),
                pickupLongitude: parseFloat(lng1),
                dropoffLatitude: parseFloat(lat2),
                dropoffLongitude: parseFloat(lng2),
                pickupAddress: document.getElementById('originInput').value,
                dropoffAddress: document.getElementById('destInput').value,
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
