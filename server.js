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
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
</head>
<body class="bg-slate-50 min-h-screen p-6 font-sans text-green-800">

    <div class="max-w-5xl mx-auto">
        <div class="flex justify-between items-center mb-8">
            <div class="flex items-center gap-3">
                <div class="bg-green-600 text-white p-2 rounded-lg">
                    <i class="ph ph-truck text-2xl"></i>
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
                        <i class="ph ph-user text-green-600"></i> Customer Information
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
                        <i class="ph ph-suitcase text-green-600"></i> Luggage Details
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

                <div class="bg-white p-10 rounded-xl shadow-sm border border-green-200">
                    <h2 class="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2 border-slate-100">
                        <i class="ph ph-map-pin text-green-600"></i> Trip Details
                    </h2>

                    <div id="sameDayContainer" class="hidden mb-4 bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-3">
                        <i class="ph ph-lightning-fill text-orange-500 text-xl mt-0.5"></i>
                        <div>
                            <h4 class="font-bold text-orange-800 text-sm">Same Day Delivery</h4>
                            <p class="text-xs text-orange-700 mt-0.5">Same Day delivery will be applied if we are holding for less than 24.00hr</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                         <div class="hidden md:block absolute left-1/2 top-4 bottom-4 w-px bg-slate-100 -translate-x-1/2"></div>

                        <div>
                            <div class="flex items-center gap-2 mb-3">
                                <div class="w-2 h-2 rounded-full bg-green-600"></div>
                                <h3 class="font-bold text-slate-900">Pick Up</h3>
                            </div>
                            <div class="space-y-3">
                                <div>
                                    <label class="block text-xs font-bold text-slate-500 mb-1">Location / Address</label>
                                    <input type="text" id="originInput" list="locationsList" placeholder="Airport Code or Full Address..." class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none">
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="block text-xs font-bold text-slate-500 mb-1">Date</label>
                                        <input type="date" id="pickupDate" class="w-full p-2 border border-slate-200 rounded-lg text-sm" onchange="checkSchedule()">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-slate-500 mb-1">Time</label>
                                        <input type="time" id="pickupTime" class="w-full p-2 border border-slate-200 rounded-lg text-sm" onchange="checkSchedule()">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div class="flex items-center gap-2 mb-3">
                                <div class="w-2 h-2 rounded-full bg-slate-900"></div>
                                <h3 class="font-bold text-slate-900">Drop Off</h3>
                            </div>
                            <div class="space-y-3">
                                <div>
                                    <label class="block text-xs font-bold text-slate-500 mb-1">Location / Address</label>
                                    <input type="text" id="destInput" list="locationsList" placeholder="Airport Code or Full Address..." class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-slate-500 outline-none">
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="block text-xs font-bold text-slate-500 mb-1">Date</label>
                                        <input type="date" id="dropoffDate" class="w-full p-2 border border-slate-200 rounded-lg text-sm" onchange="checkSchedule()">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-slate-500 mb-1">Time</label>
                                        <input type="time" id="dropoffTime" class="w-full p-2 border border-slate-200 rounded-lg text-sm" onchange="checkSchedule()">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div>
                    &nbsp;
                       <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Total Distance (miles) <i class="ph ph-target text-slate-400">
                       </i>
                  </label>
                      <input id="distance" readonly class="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg outline-none cursor-not-allowed" placeholder="0.0">
                             <p class="text-[10px] text-slate-400 mt-1">Calculated automatically on shipment creation.</p>
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
                        <i class="ph ph-paper-plane-right font-bold text-lg"></i>
                    </button>

                    <div id="resultMsg" class="mt-4 hidden p-3 rounded-lg text-sm text-center"></div>
                </div>

                <div class="bg-slate-100 p-4 rounded-xl border border-slate-200 opacity-60 hover:opacity-100 transition-opacity">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Backend URL</label>
                    <input 
                        type="text" 
                        id="apiUrl" 
                        readonly 
                        class="w-full p-1.5 bg-slate-200 border border-slate-300 rounded text-[10px] text-slate-600 font-mono cursor-not-allowed"
                    >
                </div>
            </div>
        </div>
    </div>

    <datalist id="locationsList">
        <option value="MCO">Orlando International</option>
        <option value="MIA">Miami International</option>
        <option value="TPA">Tampa International</option>
        <option value="FLL">Fort Lauderdale</option>
        <option value="JFK">John F. Kennedy</option>
        <option value="HML">Home / Hotel / Other</option>
    </datalist>

    <script>
        // --- CONFIG & INIT ---
        const PLATFORM_FEE = 5.73;
        let currentDiscount = 0;
        let activePromoCode = "";

        // Auto-detect backend URL (same origin)
        document.getElementById('apiUrl').value = window.location.origin;

        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const fmtDate = (d) => d.toISOString().split('T')[0];
        
        document.getElementById('pickupDate').value = fmtDate(now);
        document.getElementById('pickupTime').value = "10:00";
        document.getElementById('dropoffDate').value = fmtDate(tomorrow);
        document.getElementById('dropoffTime').value = "10:00";

        checkApiHealth();
        
        // --- GEOLOCATION HELPERS ---
        function getDistanceInMiles(lat1, lon1, lat2, lon2) {
            const R = 3958.8;
            const dLat = (lat2 - lat1) * (Math.PI / 180);
            const dLon = (lon2 - lon1) * (Math.PI / 180);
            const a = 
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        async function geocodeAddress(addr) {
            if (!addr || addr.length <= 3) return null;
            const url = "https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(addr) + "&limit=1";
            const res = await fetch(url);
            const json = await res.json();
            
            if (json && json.length > 0) {
                return { 
                    lat: parseFloat(json[0].lat), 
                    lng: parseFloat(json[0].lon) 
                };
            }
            throw new Error("Could not geocode address: " + addr);
        }

        // --- UI CALCULATIONS ---
        const bagInputs = document.querySelectorAll('.bag-input');
        
        bagInputs.forEach(input => {
            input.addEventListener('input', calculateTotals);
        });

        function calculateTotals() {
            let bagTotal = 0;
            let totalCount = 0;

            bagInputs.forEach(input => {
                const qty = parseInt(input.value) || 0;
                const price = parseFloat(input.dataset.price);
                const rowTotal = qty * price;
                
                const rowTotalEl = input.parentElement.nextElementSibling;
                rowTotalEl.textContent = '$' + rowTotal.toFixed(2);

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
            const nameEl = document.getElementById('discountName');
            const valEl = document.getElementById('discountVal');

            currentDiscount = 0;
            activePromoCode = "";
            msg.className = "hidden";
            row.classList.add('hidden');

            if (!code) {
                 calculateTotals();
                 return;
            }

            if (code === 'SAVE5') {
                currentDiscount = 5.00;
                activePromoCode = "SAVE5";
                showSuccess("Code Applied: $5.00 OFF");
            } 
            else if (code === 'FLY10') {
                const bagText = document.getElementById('bagsSubTotal').textContent.replace('$','');
                const bagTotal = parseFloat(bagText) || 0;
                currentDiscount = bagTotal * 0.10;
                activePromoCode = "FLY10";
                showSuccess("Code Applied: 10% OFF ($" + currentDiscount.toFixed(2) + ")");
            }
            else {
                msg.textContent = "❌ Invalid Code";
                msg.className = "text-xs font-bold text-red-600 mt-1";
            }

            if (currentDiscount > 0) {
                row.classList.remove('hidden');
                nameEl.textContent = activePromoCode;
                valEl.textContent = '-$' + currentDiscount.toFixed(2);
                calculateTotals(); 
            }

            function showSuccess(text) {
                msg.textContent = "✅ " + text;
                msg.className = "text-xs font-bold text-green-600 mt-1";
            }
        }

        function checkSchedule() {
            const pDate = document.getElementById('pickupDate').value;
            const pTime = document.getElementById('pickupTime').value;
            const dDate = document.getElementById('dropoffDate').value;
            const dTime = document.getElementById('dropoffTime').value;

            if (pDate && pTime && dDate && dTime) {
                const pickup = new Date(pDate + "T" + pTime);
                const dropoff = new Date(dDate + "T" + dTime);
                
                const diffHrs = (dropoff - pickup) / (1000 * 60 * 60);
                const banner = document.getElementById('sameDayContainer');
                
                if (diffHrs > 0 && diffHrs < 24) {
                    banner.classList.remove('hidden');
                } else {
                    banner.classList.add('hidden');
                }
            }
        }

        // --- API HELPERS ---
        function getApiUrl() {
            return document.getElementById('apiUrl').value.replace(/\\/$/, "");
        }

        async function checkApiHealth() {
            const statusDot = document.getElementById('connStatus');
            const statusText = document.getElementById('connText');
            try {
                const res = await fetch(getApiUrl() + '/health');
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
            
            let distanceInMiles = 0;
            let distanceError = false;
            let dbOrigin = ''; 
            let dbDest = '';

            let rawOrigin = document.getElementById('originInput').value.trim();
            let rawDest = document.getElementById('destInput').value.trim();

            if (!name) return alert("Customer Name is required");
            if (!rawOrigin || !rawDest) return alert("Please specify Pick Up and Drop Off locations");
            
            const pDate = document.getElementById('pickupDate').value;
            const pTime = document.getElementById('pickupTime').value;
            const dDate = document.getElementById('dropoffDate').value;
            const dTime = document.getElementById('dropoffTime').value;

            if (!pDate || !pTime || !dDate || !dTime) {
                alert("Please ensure all Pick Up and Drop Off Date/Time fields are filled.");
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Calculating Distance...';
            msg.className = 'hidden';

            try {
                const originCoords = await geocodeAddress(rawOrigin);
                const destCoords = await geocodeAddress(rawDest);

                if (originCoords && destCoords) {
                    distanceInMiles = getDistanceInMiles(
                        originCoords.lat, originCoords.lng, 
                        destCoords.lat, destCoords.lng
                    );
                    document.getElementById('distance').value = distanceInMiles.toFixed(2);
                    btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Creating Shipment...';
                }
            } catch (e) {
                console.warn("Distance calculation failed:", e.message);
                distanceError = true;
                document.getElementById('distance').value = "0.00";
                msg.innerHTML = '⚠️ Warning: Could not auto-calculate distance. Check addresses.';
                msg.className = "mt-4 p-3 rounded-lg text-sm text-center bg-yellow-100 text-yellow-800 border border-yellow-200";
                msg.classList.remove('hidden');
                btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Creating Shipment (Manual Distance)...';
            }
            
            dbOrigin = rawOrigin.length === 3 ? rawOrigin.toUpperCase() : "OTH";
            dbDest = rawDest.length === 3 ? rawDest.toUpperCase() : "OTH";

            let locationNotes = "";
            if (rawOrigin.length !== 3) locationNotes += "PICKUP ADDRESS: " + rawOrigin + "\\n";
            if (rawDest.length !== 3) locationNotes += "DROPOFF ADDRESS: " + rawDest + "\\n";

            let bagSummary = [];
            bagInputs.forEach(input => {
                const qty = parseInt(input.value) || 0;
                if (qty > 0) bagSummary.push(qty + " x " + input.dataset.name);
            });
            const bagString = bagSummary.length > 0 ? bagSummary.join(', ') : "No Bags Specified";
            const bagTotalCount = document.getElementById('totalBagCount').textContent;

            const custInfo = "CUSTOMER: " + name + " | " + document.getElementById('custEmail').value + " | " + document.getElementById('custPhone').value;
            const distInfo = "DISTANCE: " + distanceInMiles.toFixed(2) + " miles";
            const luggageInfo = "LUGGAGE (" + bagTotalCount + "): " + bagString;
            const feeInfo = "(Includes $" + PLATFORM_FEE + " Fee)";
            const promoInfo = activePromoCode ? "PROMO: " + activePromoCode + " (-$" + currentDiscount.toFixed(2) + ")" : "";
            const internal = "NOTES: " + document.getElementById('internalNotes').value;
            
            const finalNotes = custInfo + "\\n" + locationNotes + distInfo + "\\n" + luggageInfo + " " + feeInfo + "\\n" + promoInfo + "\\n" + internal;

            const pickupDate = new Date(pDate + "T" + pTime);
            const dropoffDate = new Date(dDate + "T" + dTime);
            
            const finalPriceValue = document.getElementById('finalPrice').value;
            const parsedPrice = parseFloat(finalPriceValue) || 0; 

            const payload = {
                customerId: crypto.randomUUID(), 
                customerDetails: {
                    name: document.getElementById('custName').value,
                    email: document.getElementById('custEmail').value,
                    phone: document.getElementById('custPhone').value
                },
                luggageId: crypto.randomUUID(),
                originAirport: dbOrigin,
                destinationAirport: dbDest,
                pickupAt: pickupDate.toISOString(), 
                dropoffBy: dropoffDate.toISOString(),
                priceCents: Math.round(parsedPrice * 100), 
                currency: 'USD',
                notes: finalNotes
            };
            console.log("Sending Payload:", payload);

            try {
                const res = await fetch(getApiUrl() + '/api/shipments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();

                if (res.ok) {
                    msg.innerHTML = '✅ <b>Success!</b> Shipment #' + data.id.slice(0,8) + ' Created.';
                    msg.className = "mt-4 p-3 rounded-lg text-sm text-center bg-green-100 text-green-800 border border-green-200";
                    msg.classList.remove('hidden');
                    
                    document.getElementById('custName').value = "";
                    document.getElementById('custEmail').value = "";
                    document.getElementById('custPhone').value = "";
                    document.getElementById('internalNotes').value = "";
                    document.getElementById('promoCode').value = "";
                    document.getElementById('originInput').value = "";
                    document.getElementById('destInput').value = "";
                    document.getElementById('distance').value = "0.00";
                    document.getElementById('promoMsg').className = "hidden";
                    document.getElementById('summaryDiscountRow').classList.add('hidden');
                    currentDiscount = 0;
                    activePromoCode = "";
                    bagInputs.forEach(i => i.value = 0);
                    calculateTotals();
                } else {
                    console.error("Server Error Payload:", data);
                    
                    let errorMessage = "Unknown Error";
                    if (data.error) errorMessage = data.error;
                    else if (data.message) errorMessage = data.message;
                    else if (Array.isArray(data)) errorMessage = JSON.stringify(data);
                    else if (typeof data === 'object') errorMessage = JSON.stringify(data);

                    throw new Error("Server Rejected: " + errorMessage);
                }
            } catch (err) {
                msg.innerHTML = '❌ ' + err.message;
                msg.className = "mt-4 p-3 rounded-lg text-sm text-center bg-red-100 text-red-800 border border-red-200 break-words";
                msg.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>Create Shipment</span><i class="ph ph-paper-plane-right font-bold text-lg"></i>';
            }
        }
    </script>
</body>
</html>`;

const adminHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LuggageLink Admin Dashboard</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎒</text></svg>">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
</head>
<body class="bg-slate-900 min-h-screen text-slate-100">
    <div class="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <div class="flex items-center gap-3">
                <div class="bg-green-600 text-white p-2 rounded-lg">
                    <i class="ph ph-truck text-2xl"></i>
                </div>
                <div>
                    <h1 class="text-xl font-bold">LuggageLink Admin</h1>
                    <p class="text-xs text-slate-400">Live Operations Dashboard</p>
                </div>
            </div>
            <button onclick="loadAll()" class="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                <i class="ph ph-arrows-clockwise"></i> Refresh
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
            <div class="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                    <h2 class="font-bold flex items-center gap-2">
                        <i class="ph ph-package text-green-400"></i> Live Shipments
                    </h2>
                    <select id="statusFilter" onchange="loadShipments()" class="bg-slate-700 border-none rounded-lg text-sm px-3 py-1.5">
                        <option value="">All Statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="ASSIGNED">Assigned</option>
                        <option value="PICKED_UP">Picked Up</option>
                        <option value="DELIVERED">Delivered</option>
                    </select>
                </div>
                <div id="shipmentsTable" class="p-4">
                    <div class="text-center text-slate-500 py-8">Loading shipments...</div>
                </div>
            </div>

            <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-700">
                    <h2 class="font-bold flex items-center gap-2">
                        <i class="ph ph-users text-green-400"></i> Active Drivers
                    </h2>
                </div>
                <div id="driversList" class="p-4">
                    <div class="text-center text-slate-500 py-8">Loading drivers...</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const API_URL = window.location.origin;

        async function loadStats() {
            try {
                const res = await fetch(API_URL + '/api/admin/stats');
                const data = await res.json();
                
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
            const url = API_URL + '/api/admin/shipments' + (status ? '?status=' + status : '');
            
            try {
                const res = await fetch(url);
                const data = await res.json();
                
                if (!data.shipments || data.shipments.length === 0) {
                    document.getElementById('shipmentsTable').innerHTML = '<div class="text-center text-slate-500 py-8">No shipments found</div>';
                    return;
                }
                
                let html = '<div class="space-y-3">';
                data.shipments.forEach(s => {
                    const statusColors = {
                        'PENDING': 'bg-yellow-500/20 text-yellow-400',
                        'ASSIGNED': 'bg-blue-500/20 text-blue-400',
                        'PICKED_UP': 'bg-purple-500/20 text-purple-400',
                        'DELIVERED': 'bg-green-500/20 text-green-400'
                    };
                    html += '<div class="bg-slate-700/50 rounded-lg p-4">';
                    html += '<div class="flex justify-between items-start mb-2">';
                    html += '<span class="font-mono text-xs text-slate-400">#' + s.id.slice(0,8) + '</span>';
                    html += '<span class="px-2 py-0.5 rounded-full text-xs font-bold ' + (statusColors[s.status] || 'bg-slate-600') + '">' + s.status + '</span>';
                    html += '</div>';
                    html += '<div class="text-sm mb-2">';
                    html += '<span class="text-green-400">' + (s.originAirport || 'N/A') + '</span>';
                    html += ' <i class="ph ph-arrow-right text-slate-500"></i> ';
                    html += '<span class="text-slate-300">' + (s.destinationAirport || 'N/A') + '</span>';
                    html += '</div>';
                    html += '<div class="flex justify-between text-xs text-slate-400">';
                    html += '<span>$' + (s.priceCents / 100).toFixed(2) + '</span>';
                    html += '<span>' + new Date(s.createdAt).toLocaleDateString() + '</span>';
                    html += '</div>';
                    html += '</div>';
                });
                html += '</div>';
                
                document.getElementById('shipmentsTable').innerHTML = html;
            } catch (error) {
                showError('Failed to load shipments: ' + error.message);
            }
        }

        async function loadDrivers() {
            try {
                const res = await fetch(API_URL + '/api/admin/drivers');
                const data = await res.json();
                
                if (!data.drivers || data.drivers.length === 0) {
                    document.getElementById('driversList').innerHTML = '<div class="text-center text-slate-500 py-8">No drivers found</div>';
                    return;
                }
                
                let html = '<div class="space-y-3">';
                data.drivers.forEach(d => {
                    html += '<div class="bg-slate-700/50 rounded-lg p-3">';
                    html += '<div class="flex items-center gap-2 mb-1">';
                    html += '<div class="w-2 h-2 rounded-full ' + (d.isOnline ? 'bg-green-400' : 'bg-slate-500') + '"></div>';
                    html += '<span class="font-medium text-sm">' + (d.name || d.email) + '</span>';
                    html += '</div>';
                    html += '<div class="text-xs text-slate-400">';
                    html += '<span>' + (d.vehicleType || 'N/A') + '</span>';
                    html += ' • <span>' + d.totalDeliveries + ' deliveries</span>';
                    html += '</div>';
                    html += '</div>';
                });
                html += '</div>';
                
                document.getElementById('driversList').innerHTML = html;
            } catch (error) {
                showError('Failed to load drivers: ' + error.message);
            }
        }

        function showError(message) {
            document.getElementById('error').innerHTML = '<div class="bg-red-500/20 border border-red-500/50 text-red-400 p-4 rounded-lg mb-6">' + message + '</div>';
            setTimeout(() => { document.getElementById('error').innerHTML = ''; }, 5000);
        }

        function loadAll() {
            loadStats();
            loadShipments();
            loadDrivers();
        }

        loadAll();
        setInterval(loadAll, 30000);
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
