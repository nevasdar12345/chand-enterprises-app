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

    const items =
        Array.isArray(order.items)
            ? order.items
            : [];


    if (!items.length) {

        return `
            <span class="muted">
                No item details
            </span>
        `;
    }


    return items
        .map(item => {

            const name =
                item.name ||
                item.product_name ||
                'Product';


            const quantity =
                Number(
                    item.quantity || 0
                );


            return `
                <div>
                    ${esc(name)}
                    ×
                    ${quantity}
                </div>
            `;

        })
        .join('');
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


/* =========================
   LOAD DELIVERY ORDERS
   ========================= */

async function loadDelivery() {

    const rows =
        $('#deliveryRows');


    if (!rows) {
        return;
    }


    rows.innerHTML = `

        <tr>

            <td
                colspan="7"
                style="text-align:center"
            >
                Loading assigned orders...
            </td>

        </tr>
    `;


    const result =
        await api(
            '/api/delivery/orders'
        );


    if (
        result &&
        result._ok === false
    ) {

        rows.innerHTML = `

            <tr>

                <td
                    colspan="7"
                    style="text-align:center"
                >
                    ${esc(
                        result.error ||
                        'Could not load delivery orders'
                    )}
                </td>

            </tr>
        `;

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

        rows.innerHTML = `

            <tr>

                <td
                    colspan="7"
                    style="text-align:center"
                >
                    No orders assigned to you.
                </td>

            </tr>
        `;

        return;
    }


    rows.innerHTML =
        DELIVERY_ORDERS
            .map(order => `

                <tr>

                    <!-- ORDER -->

                    <td>

                        <strong>
                            ${esc(order.code)}
                        </strong>

                        <small>
                            #${esc(order.id)}
                        </small>

                    </td>


                    <!-- CUSTOMER -->

                    <td>

                        <strong>
                            ${esc(
                                order.customer ||
                                order.customer_name ||
                                ''
                            )}
                        </strong>

                        <small>
                            ${esc(
                                order.mobile ||
                                ''
                            )}
                        </small>

                    </td>


                    <!-- ADDRESS -->

                    <td>

                        ${esc(
                            order.address ||
                            ''
                        )}

                    </td>


                    <!-- ITEMS -->

                    <td>

                        ${deliveryItems(order)}

                    </td>


                    <!-- PAYMENT -->

                    <td>

                        ${deliveryPayment(order)}

                    </td>


                    <!-- STATUS -->

                    <td>

                        <span class="status">

                            ${esc(
                                order.status ||
                                'Confirmed'
                            )}

                        </span>

                    </td>


                    <!-- ACTION -->

                    <td>

                        ${deliveryAction(order)}

                    </td>

                </tr>

            `)
            .join('');
}


/* =========================
   DELIVERY ACTION
   ========================= */

function deliveryAction(order) {

    if (
        order.status ===
        'Delivered'
    ) {

        return `
            <span>
                ✓ Delivered
            </span>
        `;
    }


    if (
        order.status ===
        'Cancelled'
    ) {

        return `
            <span>
                Cancelled
            </span>
        `;
    }


    if (
        order.status ===
        'Out for Delivery'
    ) {

        return `

            <button
                class="primary"
                onclick="
                    deliveryStatus(
                        ${order.id},
                        'Delivered'
                    )
                "
            >
                ✓ Delivered
            </button>
        `;
    }


    return `

        <button
            class="primary"
            onclick="
                deliveryStatus(
                    ${order.id},
                    'Out for Delivery'
                )
            "
        >
            🚚 Start delivery
        </button>
    `;
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


window.renderDeliveryOrders =
    renderDeliveryOrders;


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