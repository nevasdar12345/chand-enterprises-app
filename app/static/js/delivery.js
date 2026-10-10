/* =========================================================
   CHAND ENTERPRISES
   DELIVERY JAVASCRIPT
   ========================================================= */


/* =========================
   HELPERS
   ========================= */

const $ = selector =>
    document.querySelector(selector);


const money = value =>
    '₹' + Number(value || 0).toFixed(0);


const esc = value =>
    String(value ?? '').replace(
        /[&<>"']/g,
        char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char])
    );


async function api(
    url,
    method = 'GET',
    body = undefined
) {

    try {

        const response = await fetch(url, {

            method,

            headers: {
                'Content-Type': 'application/json'
            },

            body: body
                ? JSON.stringify(body)
                : undefined
        });


        const data =
            await response
                .json()
                .catch(() => ({}));


        /*
         * Arrays cannot reliably carry our
         * custom _ok flag in the same way
         * as normal response objects.
         */

        if (
            data &&
            typeof data === 'object'
        ) {
            data._ok = response.ok;
        }


        if (!response.ok) {

            return {
                _ok: false,
                error:
                    data.error ||
                    'Request failed'
            };
        }


        return data;

    } catch (error) {

        console.error(
            'Delivery API error:',
            error
        );


        return {
            _ok: false,
            error: 'Network error'
        };
    }
}


/* =========================
   STATE
   ========================= */

let DELIVERY_ORDERS = [];


/* =========================
   ITEMS HTML
   ========================= */

function deliveryItems(order) {
    const items = Array.isArray(order.lines) ? order.lines : [];
    if (!items.length) return '<span class="muted">No item details</span>';
    return items.map(item => `<div>${esc(item.name || 'Product')} × ${Number(item.qty || 0)}</div>`).join('');
}


/* =========================
   PAYMENT HTML
   ========================= */

function deliveryPayment(order) {

    const method =
        order.payment_method ||
        order.payment ||
        '—';


    const status =
        order.payment_status ||
        'Pending';


    return `

        <div>
            <b>
                ${esc(method)}
            </b>
        </div>

        <small>
            ${esc(status)}
            ·
            ${money(order.total)}
        </small>
    `;
}


/* =========================
   UPDATE METRICS
   ========================= */

function updateDeliveryMetrics() {

    const assigned =
        DELIVERY_ORDERS.filter(
            order =>
                order.status !==
                'Delivered' &&
                order.status !==
                'Cancelled'
        ).length;


    const out =
        DELIVERY_ORDERS.filter(
            order =>
                order.status ===
                'Out for Delivery'
        ).length;


    const delivered =
        DELIVERY_ORDERS.filter(
            order =>
                order.status ===
                'Delivered'
        ).length;


    const assignedElement =
        $('#assigned');

    const outElement =
        $('#out');

    const deliveredElement =
        $('#delivered');


    if (assignedElement) {
        assignedElement.textContent =
            assigned;
    }


    if (outElement) {
        outElement.textContent =
            out;
    }


    if (deliveredElement) {
        deliveredElement.textContent =
            delivered;
    }
}


let ceDeliveryLeafletPromise = null;
let ceDeliveryMap = null;
let ceDeliveryMarkers = null;

function loadLeafletForDeliveryMap() {
    if (window.L) return Promise.resolve();
    if (ceDeliveryLeafletPromise) return ceDeliveryLeafletPromise;
    ceDeliveryLeafletPromise = new Promise((resolve, reject) => {
        if (!document.getElementById('ce-delivery-leaflet-css')) {
            const css = document.createElement('link');
            css.id = 'ce-delivery-leaflet-css'; css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(css);
        }
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Map library could not load'));
        document.head.appendChild(script);
    });
    return ceDeliveryLeafletPromise;
}

async function loadDeliveryMap() {
    const panel = document.getElementById('ceDeliveryMapPanel');
    const mapBox = document.getElementById('ceDeliveryMap');
    const note = document.getElementById('ceDeliveryMapNote');
    if (!panel || !mapBox || !note) return;
    const config = await api('/api/config');
    if (config && config.maps_enabled === false) { panel.style.display = 'none'; return; }
    panel.style.display = '';
    const orders = DELIVERY_ORDERS.filter(order => order.latitude != null && order.longitude != null && !(Number(order.latitude) === 0 && Number(order.longitude) === 0) && order.status !== 'Cancelled');
    try {
        await loadLeafletForDeliveryMap();
        if (!ceDeliveryMap) {
            ceDeliveryMap = L.map(mapBox).setView([26.15, 85.90], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(ceDeliveryMap);
            ceDeliveryMarkers = L.layerGroup().addTo(ceDeliveryMap);
        }
        ceDeliveryMarkers.clearLayers();
        const bounds = [];
        orders.forEach(order => {
            const lat = Number(order.latitude), lng = Number(order.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            L.marker([lat, lng]).bindPopup(`<b>${esc(order.code)}</b><br>${esc(order.customer || '')}<br>${esc(order.status || '')}<br>${esc(order.address || '')}<br><a target="_blank" rel="noopener" href="${esc(order.directions_url || order.map_url || '')}">Open directions</a>`).addTo(ceDeliveryMarkers);
            bounds.push([lat, lng]);
        });
        if (bounds.length) ceDeliveryMap.fitBounds(bounds, {padding:[24,24], maxZoom:14});
        setTimeout(() => ceDeliveryMap.invalidateSize(), 100);
        note.textContent = orders.length ? `${orders.length} assigned order(s) have map coordinates.` : 'No assigned orders have saved coordinates yet. You can still use address details and call the customer.';
    } catch (error) {
        console.error('Delivery map error:', error);
        note.textContent = 'Map could not load. Use the Navigate link on each order instead.';
    }
}
window.loadDeliveryMap = loadDeliveryMap;

/* =========================
   LOAD DELIVERY ORDERS
   ========================= */

async function loadDelivery() {

    const rows =
        $('#deliveryRows');


    if (!rows) {
        return;
    }


    rows.innerHTML = `<div class="dlv-empty">Loading assigned orders...</div>`;


    const result =
        await api(
            '/api/delivery/orders'
        );


    if (
        result &&
        result._ok === false
    ) {

        rows.innerHTML = `<div class="dlv-empty">${esc(result.error || 'Could not load delivery orders')}</div>`;

        return;
    }


    /*
     * Backend currently returns the
     * delivery orders as an array.
     *
     * Also support {orders: []}
     * so this remains flexible.
     */

    DELIVERY_ORDERS =
        Array.isArray(result)
            ? result
            : (
                Array.isArray(result?.orders)
                    ? result.orders
                    : []
            );


    updateDeliveryMetrics();

    renderDeliveryOrders();
    loadDeliveryMap();
}


/* =========================
   RENDER DELIVERY ORDERS
   ========================= */

function renderDeliveryOrders() {

    const rows =
        $('#deliveryRows');


    if (!rows) {
        return;
    }


    if (!DELIVERY_ORDERS.length) {

        rows.innerHTML = `<div class="dlv-empty">No orders assigned to you.</div>`;

        return;
    }


    rows.innerHTML = DELIVERY_ORDERS.map(deliveryCard).join('');
}


function statusClass(status) {
    return 'dlv-status s-' + String(status || 'Confirmed').toLowerCase().replace(/[^a-z]+/g, '-');
}


function deliveryCard(order) {
    const status = order.status || 'Confirmed';
    const name = order.customer || order.customer_name || '';

    return `
    <article class="dlv-card ${status === 'Delivered' ? 'is-done' : ''}">

        <div class="dlv-top">
            <div>
                <strong class="dlv-code">${esc(order.code)}</strong>
                <small>#${esc(order.id)}</small>
            </div>
            <span class="${statusClass(status)}">${esc(status)}</span>
        </div>

        <div class="dlv-grid">

            <div class="dlv-block">
                <span class="dlv-label">Customer</span>
                <b>${esc(name)}</b>
                <small>${esc(order.mobile || '')}</small>
            </div>

            <div class="dlv-block">
                <span class="dlv-label">Address</span>
                <div>${esc(order.address || '')}</div>
                ${order.map_url && order.map_features?.delivery_navigation ? `<a class="loc-map-link" target="_blank" rel="noopener" href="${esc(order.directions_url || order.map_url)}">📍 Navigate</a>` : (order.map_url ? '<small class="dlv-note">Map navigation disabled by developer</small>' : '<small class="dlv-note">No map pin saved</small>')}
            </div>

            <div class="dlv-block">
                <span class="dlv-label">Items</span>
                ${deliveryItems(order)}
            </div>

            <div class="dlv-block">
                <span class="dlv-label">Payment</span>
                ${deliveryPayment(order)}
            </div>

        </div>

        ${deliveryAction(order)}

    </article>`;
}


/* =========================
   DELIVERY ACTION
   Call + both WhatsApp buttons stay visible in EVERY status
   (also after Delivered). Only the status button changes:
   Confirmed -> Out for Delivery -> Delivered
   ========================= */

function deliveryAction(order) {
    const status = order.status || 'Confirmed';

    if (status === 'Cancelled') {
        return '<div class="dlv-actions"><span class="dlv-note">Order cancelled</span></div>';
    }

    const st = esc(status);
    const contact = `
        <a class="dlv-btn dlv-call" href="tel:${esc(order.mobile || '')}">📞 Call</a>
        <button type="button" class="dlv-btn dlv-wa" onclick="deliveryWhatsApp(${order.id}, '${st}', 'customer')">💬 WhatsApp customer</button>
        <button type="button" class="dlv-btn dlv-wa-admin" onclick="deliveryWhatsApp(${order.id}, '${st}', 'admin')">💬 WhatsApp admin</button>`;

    let step;
    if (status === 'Delivered') {
        step = '<span class="dlv-done">✓ Delivered</span>';
    } else if (status === 'Out for Delivery') {
        step = `<button type="button" class="dlv-btn dlv-main" onclick="deliveryStatus(${order.id}, 'Delivered')">✓ Delivered</button>`;
    } else {
        step = `<button type="button" class="dlv-btn dlv-main" onclick="deliveryStatus(${order.id}, 'Out for Delivery')">🚚 Out for Delivery</button>`;
    }

    let cash = '';
    if (order.payment === 'COD') {
        cash = `<div class="dlv-cash">
            <input id="cash_${order.id}" type="number" min="0" max="${Number(order.total || 0)}" value="${Number(order.cash_collected || 0)}" placeholder="Cash collected">
            <button type="button" class="dlv-btn" onclick="saveCash(${order.id})">Save cash</button>
        </div>`;
    }

    return `<div class="dlv-actions">${step}${contact}</div>${cash}`;
}


/* =========================
   UPDATE DELIVERY STATUS
   ========================= */

async function deliveryStatus(
    id,
    status
) {

    const result =
        await api(
            `/api/delivery/order/${id}/status`,
            'POST',
            {
                status
            }
        );


    if (
        result &&
        result._ok === false
    ) {

        alert(
            result.error ||
            'Could not update order'
        );

        return;
    }


    await loadDelivery();
}



async function deliveryWhatsApp(id, status, to = 'customer') {
    const result=await api(`/api/delivery/order/${id}/whatsapp`,'POST',{status, to});
    if(!result._ok) return alert(result.error||'Could not open WhatsApp');
    window.open(result.whatsapp_url,'_blank','noopener');
}
async function saveCash(id) {
    const input=document.getElementById(`cash_${id}`);
    const result=await api(`/api/delivery/order/${id}/cash`,'POST',{cash_collected:Number(input?.value||0)});
    if(!result._ok) return alert(result.error||'Could not save cash');
    await loadDelivery();
}

/* =========================
   DELIVERY STARTUP
   ========================= */

async function deliveryStartup() {

    try {

        await loadDelivery();

    } catch (error) {

        console.error(
            'Delivery startup error:',
            error
        );
    }
}


/* =========================
   GLOBAL FUNCTIONS
   ========================= */

window.loadDelivery =
    loadDelivery;


window.deliveryStatus =
    deliveryStatus;


window.renderDeliveryOrders = renderDeliveryOrders;
window.deliveryWhatsApp = deliveryWhatsApp;
window.saveCash = saveCash;


/* =========================
   START
   ========================= */

document.addEventListener(
    'DOMContentLoaded',
    () => {

        if (
            document.querySelector(
                '#deliveryRows'
            )
        ) {

            deliveryStartup();
        }

    }
);
