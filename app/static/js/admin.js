/* =========================================================
   CHAND ENTERPRISES
   ADMIN JAVASCRIPT
   Matches current admin.html
   ========================================================= */


/* =========================================================
   HELPERS
   ========================================================= */

const $ = selector => document.querySelector(selector);

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


async function api(url, method = 'GET', body = undefined) {

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

        data._ok = response.ok;

        return data;

    } catch (error) {

        console.error('Admin API error:', error);

        return {
            _ok: false,
            error: 'Network error'
        };
    }
}


/* =========================================================
   MODAL (shared popup used by coupon / credit / brochure forms)
   The admin page had no global modal() / closeModal(), which is why
   "Create coupon" and "Record payment" did nothing.
   ========================================================= */

function modal(html) {
    const element = document.getElementById('modal');
    if (!element) { alert('Popup area missing on this page'); return; }
    element.innerHTML = `<div class="box">${html}</div>`;
    element.style.display = '';
    element.classList.add('open');
    element.onclick = event => { if (event.target === element) closeModal(); };
}

function closeModal() {
    const element = document.getElementById('modal');
    if (!element) return;
    element.classList.remove('open');
    element.style.display = '';
    element.innerHTML = '';
}

window.modal = modal;
window.closeModal = closeModal;


/* =========================================================
   STATE
   ========================================================= */

let ADMIN_ORDERS = [];

let ADMIN_PRODUCTS = [];


/* =========================================================
   TABS
   ========================================================= */

function showTab(tab, button) {

    const tabs = ['orders','products','stock','sales','ledger','coupons','brochure','team'];

    tabs.forEach(name => {

        const section =
            document.getElementById(
                `tab-${name}`
            );

        if (section) {
            section.style.display =
                name === tab
                    ? ''
                    : 'none';
        }
    });


    document
        .querySelectorAll('.admin-tabs button')
        .forEach(btn => {
            btn.classList.remove('on');
        });


    if (button) {
        button.classList.add('on');
    }


    /* Load appropriate data */

    if (tab === 'orders') {
        loadAdminOrders();
    }

    if (tab === 'products') {
        loadAdminProducts();
    }

    if (tab === 'stock') filterStock();
    if (tab === 'sales') loadSalesDashboard();
    if (tab === 'ledger') loadLedger();
    if (tab === 'coupons') loadCoupons();
    if (tab === 'brochure') loadBrochure();
    if (tab === 'team') loadTeam();
}


/* =========================================================
   ADMIN ORDERS
   ========================================================= */

async function loadAdminOrders() {

    const rows = $('#orderRows');

    if (!rows) {
        return;
    }


    rows.innerHTML = `
        <tr>
            <td colspan="6">
                Loading orders...
            </td>
        </tr>
    `;


    const result =
        await api('/api/admin/orders');


    if (!result._ok) {

        rows.innerHTML = `
            <tr>
                <td colspan="6">
                    ${esc(
                        result.error ||
                        'Could not load orders'
                    )}
                </td>
            </tr>
        `;

        return;
    }


    ADMIN_ORDERS =
        Array.isArray(result.orders)
            ? result.orders
            : [];


    updateOrderMetrics();


    renderAdminOrders();
    loadPendingArchives();
}

async function loadPendingArchives() {
    const box = document.getElementById('archiveConfirmBanner');
    if (!box) return;
    const result = await api('/api/admin/archive/pending');
    if (!result._ok || !Array.isArray(result.archives) || !result.archives.length) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }
    box.hidden = false;
    box.innerHTML = result.archives.map(a => `
        <div class="archive-confirm-card">
            <div><strong>📦 Archive #${esc(a.id)}</strong><br><small>${esc(a.orders)} orders · ${money(a.total)} · ${esc(a.method)} · ${esc(a.created_at)}</small></div>
            <button class="primary" onclick="confirmOrderArchive(${a.id})">✓ Confirm Received</button>
        </div>
    `).join('');
}

async function deleteAllOrderData() {
    const verified = confirm(
        'WARNING: This will permanently delete ALL order data.\n\n' +
        'Please confirm that you have received and verified all required Excel archive backups.\n\n' +
        'Click OK only after the backup has been verified.'
    );
    if (!verified) return;

    const confirmation = prompt(
        'PERMANENT DELETION\n\n' +
        'This will delete ALL orders, order items, payments and archive links.\n\n' +
        'Type DELETE to continue:'
    );
    if (confirmation !== 'DELETE') {
        alert('Deletion cancelled. You must type DELETE exactly.');
        return;
    }

    const result = await api('/api/admin/archive/delete-all', 'POST');
    if (!result._ok) {
        alert(result.error || 'Could not delete order data.');
        return;
    }

    alert(`Deleted ${result.deleted || 0} orders successfully.`);
    await loadAdminOrders();
    await loadPendingArchives();
}

async function confirmOrderArchive(id) {
    if (!confirm('Confirm that you received this archive? The archived orders will then be permanently removed from the active database.')) return;
    const result = await api(`/api/admin/archive/${id}/confirm`, 'POST');
    if (!result._ok) return alert(result.error || 'Could not confirm archive');
    alert(`Archive #${id} confirmed. ${result.deleted || 0} orders removed from the active database.`);
    loadAdminOrders();
}


/* =========================================================
   ORDER FILTER
   ========================================================= */

function getFilteredOrders() {

    const search =
        ($('#filter')?.value || '')
            .trim()
            .toLowerCase();


    const status =
        $('#fstatus')?.value || 'All';


    const payment =
        $('#fpay')?.value || 'All';


    return ADMIN_ORDERS.filter(order => {

        const searchable = [
            order.code,
            order.customer,
            order.mobile,
            order.address
        ]
            .join(' ')
            .toLowerCase();


        const searchMatch =
            !search ||
            searchable.includes(search);


        const statusMatch =
            status === 'All' ||
            order.status === status;


        const paymentMatch =
            payment === 'All' ||
            order.payment_status === payment;


        return (
            searchMatch &&
            statusMatch &&
            paymentMatch
        );
    });
}


/* =========================================================
   RENDER ORDERS
   ========================================================= */

function renderAdminOrders() {

    const rows = $('#orderRows');

    if (!rows) {
        return;
    }


    const orders =
        getFilteredOrders();


    if (!orders.length) {

        rows.innerHTML = `
            <tr>
                <td colspan="6">
                    No orders found.
                </td>
            </tr>
        `;

        return;
    }


    rows.innerHTML =
        orders
            .map(order => {

                const deliveryIds =
                    Array.isArray(window.DELIVERY)
                        ? window.DELIVERY
                        : [];


                const deliveryNames =
                    Array.isArray(window.DNAMES)
                        ? window.DNAMES
                        : [];


                let deliveryHTML = `
                    <select
                        onchange="
                            assignDelivery(
                                ${order.id},
                                this.value
                            )
                        "
                    >
                        <option value="">
                            Assign
                        </option>
                `;


                deliveryIds.forEach(
                    (deliveryId, index) => {

                        const selected =
                            String(
                                order.delivery_person_id || ''
                            ) ===
                            String(deliveryId)
                                ? 'selected'
                                : '';


                        deliveryHTML += `
                            <option
                                value="${deliveryId}"
                                ${selected}
                            >
                                ${esc(
                                    deliveryNames[index] ||
                                    `Delivery #${deliveryId}`
                                )}
                            </option>
                        `;
                    }
                );


                deliveryHTML += `
                    </select>
                `;


                const statusOptions = [
                    'Confirmed',
                    'Preparing',
                    'Out for Delivery',
                    'Delivered',
                    'Cancelled'
                ];


                const statusHTML = `
                    <select
                        onchange="
                            adminStatus(
                                ${order.id},
                                this.value
                            )
                        "
                    >
                        ${statusOptions
                            .map(status => `
                                <option
                                    value="${esc(status)}"
                                    ${
                                        status ===
                                        order.status
                                            ? 'selected'
                                            : ''
                                    }
                                >
                                    ${esc(status)}
                                </option>
                            `)
                            .join('')
                        }
                    </select>
                `;


                const paymentOptions = [
                    'Pending',
                    'Verifying',
                    'Paid',
                    'Failed'
                ];


                const paymentHTML = `
                    <select
                        onchange="
                            adminPaymentStatus(
                                ${order.id},
                                this.value
                            )
                        "
                    >
                        ${paymentOptions
                            .map(status => `
                                <option
                                    value="${esc(status)}"
                                    ${
                                        status ===
                                        order.payment_status
                                            ? 'selected'
                                            : ''
                                    }
                                >
                                    ${esc(status)}
                                </option>
                            `)
                            .join('')
                        }
                    </select>
                `;


                return `
                    <tr>

                        <td>
                            <strong>
                                ${esc(order.code)}
                            </strong>

                            <small>
                                #${esc(order.id)}
                            </small>

                            <small style="display:block;margin-top:5px">
                                📅 ${esc(order.created || '')}
                            </small>
                        </td>


                        <td>

                            <strong>
                                ${esc(order.customer)}
                            </strong>

                            <small>
                                ${esc(order.mobile || '')}
                            </small>

                            <small style="display:block;margin-top:4px">
                                🏠 ${esc(order.address || '')}
                            </small>

                            ${order.map_url
                                ? `<a class="loc-map-link" target="_blank" rel="noopener" href="${esc(order.map_url)}">📍 Open in Google Maps</a>
                                   <small style="display:block">${Number(order.latitude).toFixed(6)}, ${Number(order.longitude).toFixed(6)}</small>`
                                : ''}

                        </td>


                        <td>
                            ${money(order.total)}
                        </td>


                        <td>
                            ${paymentHTML}
                        </td>


                        <td>
                            ${statusHTML}
                        </td>


                        <td>
                            ${deliveryHTML}
                            <button class="add" onclick="sendOrderBill(${order.id})">🧾 WhatsApp bill</button>
                        </td>

                    </tr>
                `;
            })
            .join('');
}


/* =========================================================
   ORDER METRICS
   ========================================================= */

function updateOrderMetrics() {

    const orders =
        ADMIN_ORDERS;


    const totalOrders =
        orders.length;


    const paidRevenue =
        orders
            .filter(
                order =>
                    String(
                        order.payment_status || ''
                    ).toLowerCase() === 'paid'
            )
            .reduce(
                (sum, order) =>
                    sum +
                    Number(order.total || 0),
                0
            );


    const pendingPayments =
        orders.filter(order => {

            const payment =
                String(
                    order.payment_status || ''
                ).toLowerCase();

            return (
                payment === 'pending' ||
                payment === 'verifying'
            );

        }).length;


    const lowStock =
        ADMIN_PRODUCTS.filter(product => {

            const threshold =
                Number(
                    product.low_stock_threshold || 10
                );

            return (
                Number(product.stock || 0) <=
                threshold
            );

        }).length;


    if ($('#mOrders')) {
        $('#mOrders').textContent =
            totalOrders;
    }


    if ($('#mRev')) {
        $('#mRev').textContent =
            money(paidRevenue);
    }


    if ($('#mPend')) {
        $('#mPend').textContent =
            pendingPayments;
    }


    if ($('#mLow')) {
        $('#mLow').textContent =
            lowStock;
    }
}


/* =========================================================
   ORDER STATUS
   ========================================================= */

async function adminStatus(id, status) {

    const result =
        await api(
            `/api/admin/order/${id}`,
            'POST',
            {
                status
            }
        );


    if (!result._ok) {

        alert(
            result.error ||
            'Could not update order'
        );

        return;
    }


    await loadAdminOrders();
}


/* =========================================================
   PAYMENT STATUS
   ========================================================= */

async function adminPaymentStatus(
    id,
    payment_status
) {

    const result =
        await api(
            `/api/admin/order/${id}`,
            'POST',
            {
                payment_status
            }
        );


    if (!result._ok) {

        alert(
            result.error ||
            'Could not update payment'
        );

        return;
    }


    await loadAdminOrders();
}


/* =========================================================
   DELIVERY ASSIGNMENT
   ========================================================= */

async function assignDelivery(
    id,
    delivery_person_id
) {

    if (!delivery_person_id) {
        return;
    }


    const result =
        await api(
            `/api/admin/order/${id}/delivery`,
            'POST',
            {
                delivery_person_id
            }
        );


    if (!result._ok) {

        alert(
            result.error ||
            'Could not assign delivery'
        );

        return;
    }


    await loadAdminOrders();
}


/* =========================================================
   PRODUCTS
   ========================================================= */

async function loadAdminProducts() {

    const result =
        await api('/api/products');


    if (!result._ok &&
        !Array.isArray(result)) {

        console.error(
            result.error ||
            'Could not load products'
        );

        return;
    }


    ADMIN_PRODUCTS =
        Array.isArray(result)
            ? result
            : (
                Array.isArray(result.products)
                    ? result.products
                    : []
            );


    updateOrderMetrics();

    const low = ADMIN_PRODUCTS.filter(p => Number(p.stock || 0) <= Number(p.low_stock_threshold || 10));
    const banner = $('#lowStockBanner');
    if (banner) {
        banner.hidden = !low.length;
        banner.innerHTML = low.length
            ? `⚠️ <b>Low stock:</b> ${low.map(p => `${esc(p.name)}${p.size ? ` (${esc(p.size)})` : ''} (${p.stock})`).join(', ')}`
            : '';
    }

    /*
       The current admin.html already renders
       products through Jinja.

       If #productRows exists, support it too.
    */

    const rows =
        $('#productRows');


    if (!rows) {
        return;
    }


    rows.innerHTML =
        ADMIN_PRODUCTS
            .map(product => `
                <tr>

                    <td>
                        ${esc(product.icon || '')}
                    </td>

                    <td>
                        ${esc(product.name)}
                    </td>

                    <td>
                        ${product.image_url ? `<img src="${esc(product.image_url)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px">` : esc(product.icon || '🥤')}
                        <br><button type="button" onclick="openProductImageManager(${product.id}, ${esc(JSON.stringify(product.image_url || ''))})">📷 Image</button>
                    </td>

                    <td>
                        ${esc(product.category)}
                    </td>

                    <td>
                        ${esc(product.size || '')}
                    </td>

                    <td>
                        ${money(product.price)}
                    </td>

                    <td>
                        ${Number(product.stock || 0)}
                    </td>

                    <td>
                        ${
                            product.active === false
                                ? 'Hidden'
                                : 'Active'
                        }
                    </td>

                </tr>
            `)
            .join('');
}


/* =========================================================
   PRODUCT FORM
   ========================================================= */

function productForm(
    id = null,
    name = '',
    category = '',
    price = '',
    stock = '',
    icon = '🥤',
    size = ''
) {

    const modal =
        $('#modal');


    if (!modal) {

        /*
           Fallback for installations where
           the common modal is not available.
        */

        const newName =
            prompt(
                'Product name:',
                name
            );

        if (!newName) {
            return;
        }


        const newCategory =
            prompt(
                'Category:',
                category
            );


        const newPrice =
            prompt(
                'Price:',
                price
            );


        const newStock =
            prompt(
                'Stock:',
                stock
            );


        const newSize =
            prompt(
                'Size (e.g. 750ml, 1L, 20L):',
                size
            );


        const newIcon =
            prompt(
                'Icon:',
                icon
            );


        const data = {
            name: newName,
            category: newCategory,
            size: newSize || '',
            price: Number(newPrice || 0),
            stock: Number(newStock || 0),
            icon: newIcon || '🥤',
            active: true
        };


        if (id) {
            updateAdminProduct(id, data);
        } else {
            createProductDirect(data);
        }

        return;
    }


    const editing =
        id !== null &&
        id !== undefined;


    modal.innerHTML = `

        <div
            style="
                background:#fff;
                max-width:520px;
                width:calc(100% - 30px);
                margin:40px auto;
                padding:24px;
                border-radius:18px;
                box-shadow:0 20px 60px rgba(0,0,0,.2);
            "
        >

            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:20px;
                "
            >

                <h2 style="margin:0;">
                    ${editing
                        ? 'Edit product'
                        : 'Add product'
                    }
                </h2>


                <button
                    type="button"
                    onclick="closeModal()"
                    style="
                        border:0;
                        background:none;
                        font-size:24px;
                        cursor:pointer;
                    "
                >
                    ×
                </button>

            </div>


            <label>
                Product name
            </label>

            <input
                id="adminProductName"
                type="text"
                value="${esc(name)}"
                placeholder="Product name"
                style="
                    width:100%;
                    margin:6px 0 14px;
                    padding:11px;
                    box-sizing:border-box;
                "
            >


            <label>
                Category
            </label>

            <select id="adminProductCategory" style="
                    width:100%;
                    margin:6px 0 14px;
                    padding:11px;
                    box-sizing:border-box;
                ">${ADMIN_CATEGORIES.filter(c=>c.active).map(c=>`<option value="${esc(c.name)}" ${c.name===category?'selected':''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>


            <label>
                Size
            </label>

            <input
                id="adminProductSize"
                type="text"
                value="${esc(size)}"
                placeholder="e.g. 250ml, 750ml, 1L, 20L"
                style="
                    width:100%;
                    margin:6px 0 14px;
                    padding:11px;
                    box-sizing:border-box;
                "
            >


            <label>
                Price
            </label>

            <input
                id="adminProductPrice"
                type="number"
                min="0"
                value="${esc(price)}"
                placeholder="Price"
                style="
                    width:100%;
                    margin:6px 0 14px;
                    padding:11px;
                    box-sizing:border-box;
                "
            >


            <label>
                Stock
            </label>

            <input
                id="adminProductStock"
                type="number"
                min="0"
                value="${esc(stock)}"
                placeholder="Stock"
                style="
                    width:100%;
                    margin:6px 0 14px;
                    padding:11px;
                    box-sizing:border-box;
                "
            >


            <label>
                Icon
            </label>

            <input
                id="adminProductIcon"
                type="text"
                value="${esc(icon || '🥤')}"
                placeholder="🥤"
                style="
                    width:100%;
                    margin:6px 0 20px;
                    padding:11px;
                    box-sizing:border-box;
                "
            >


            <button
                type="button"
                class="primary"
                onclick="
                    saveProductForm(
                        ${editing ? id : 'null'}
                    )
                "
                style="
                    width:100%;
                    padding:13px;
                    cursor:pointer;
                "
            >
                ${
                    editing
                        ? 'Save changes'
                        : 'Add product'
                }
            </button>

        </div>

    `;


    modal.style.display = 'block';
}


/* =========================================================
   SAVE PRODUCT FORM
   ========================================================= */

async function saveProductForm(id) {

    const name =
        $('#adminProductName')
            ?.value
            .trim();


    const category =
        $('#adminProductCategory')
            ?.value
            .trim();


    const size =
        $('#adminProductSize')
            ?.value
            .trim() || '';


    const price =
        Number(
            $('#adminProductPrice')
                ?.value || 0
        );


    const stock =
        Number(
            $('#adminProductStock')
                ?.value || 0
        );


    const icon =
        $('#adminProductIcon')
            ?.value
            .trim() ||
        '🥤';


    if (!name) {

        alert('Enter product name');

        return;
    }


    if (!category) {

        alert('Enter category');

        return;
    }


    const data = {
        name,
        category,
        size,
        price,
        stock,
        icon,
        active: true
    };


    let result;


    if (id !== null) {

        result =
            await updateAdminProduct(
                id,
                data
            );

    } else {

        result =
            await createAdminProduct(
                data
            );
    }


    if (result?._ok) {

        if (typeof closeModal === 'function') {
            closeModal();
        }

        await loadAdminProducts();

        location.reload();
    }
}


/* =========================================================
   CREATE PRODUCT
   ========================================================= */

async function createAdminProduct(
    customData = null
) {

    const data =
        customData || {

            name:
                $('#pname')
                    ?.value
                    .trim(),

            category:
                $('#pcategory')
                    ?.value
                    .trim(),

            size:
                $('#psize')
                    ?.value
                    .trim() || '',

            price:
                Number(
                    $('#pprice')
                        ?.value || 0
                ),

            stock:
                Number(
                    $('#pstock')
                        ?.value || 0
                ),

            icon:
                $('#picon')
                    ?.value ||
                '🥤',

            active: true
        };


    const result =
        await api(
            '/api/admin/product',
            'POST',
            data
        );


    if (!result._ok) {

        alert(
            result.error ||
            'Could not create product'
        );

        return result;
    }


    alert('Product added');

    return result;
}


/* =========================================================
   DIRECT CREATE FALLBACK
   ========================================================= */

async function createProductDirect(data) {

    const result =
        await createAdminProduct(data);


    if (result?._ok) {
        location.reload();
    }
}


/* =========================================================
   UPDATE PRODUCT
   ========================================================= */

async function updateAdminProduct(
    id,
    data
) {

    const result =
        await api(
            `/api/admin/product/${id}`,
            'PUT',
            data
        );


    if (!result._ok) {

        alert(
            result.error ||
            'Could not update product'
        );

        return result;
    }


    return result;
}


/* =========================================================
   HIDE / DEACTIVATE PRODUCT
   ========================================================= */

async function hideAdminProduct(id) {

    const result =
        await api(
            `/api/admin/product/${id}`,
            'DELETE'
        );


    if (!result._ok) {

        alert(
            result.error ||
            'Could not deactivate product'
        );

        return result;
    }


    location.reload();

    return result;
}


/* =========================================================
   ACTIVATE PRODUCT
   ========================================================= */

async function activateProduct(id) {

    const result =
        await api(
            `/api/admin/product/${id}`,
            'PUT',
            {
                active: true
            }
        );


    if (!result._ok) {

        alert(
            result.error ||
            'Could not activate product'
        );

        return;
    }


    location.reload();
}


/* =========================================================
   DEACTIVATE PRODUCT
   ========================================================= */

async function deactivateProduct(id) {

    await hideAdminProduct(id);
}


/* =========================================================
   STOCK
   ========================================================= */

async function updateStock(
    id,
    stock
) {

    const result =
        await api(
            `/api/admin/stock/${id}`,
            'POST',
            {
                stock: Number(stock)
            }
        );


    if (!result._ok) {

        alert(
            result.error ||
            'Could not update stock'
        );

        return result;
    }


    return result;
}


/* =========================================================
   OLD HTML COMPATIBILITY
   stock(id)
   ========================================================= */

async function stock(id) {

    const input =
        document.getElementById(
            `s${id}`
        );


    if (!input) {
        return;
    }


    const value =
        Number(input.value);


    if (
        !Number.isFinite(value) ||
        value < 0
    ) {

        alert('Enter a valid stock value');

        return;
    }


    const result =
        await updateStock(
            id,
            value
        );


    if (result?._ok) {

        alert('Stock updated');

        await loadAdminProducts();

        location.reload();
    }
}


/* =========================================================
   STOCK FILTER
   ========================================================= */

function filterStock() {

    const input =
        $('#stockFilter');


    const table =
        $('#stockTable');


    if (!input || !table) {
        return;
    }


    const search =
        input.value
            .trim()
            .toLowerCase();


    const rows =
        table.querySelectorAll(
            'tr'
        );


    rows.forEach(
        (row, index) => {

            /* Keep table header */

            if (index === 0) {
                return;
            }


            const text =
                row.textContent
                    .toLowerCase();


            row.style.display =
                !search ||
                text.includes(search)
                    ? ''
                    : 'none';
        }
    );
}



/* =========================================================
   SALES / LEDGER / COUPONS
   ========================================================= */

let salesChart = null;

async function loadSalesDashboard() {
    const result = await api('/api/admin/sales');
    if (!result._ok) return;
    if ($('#salesToday')) $('#salesToday').textContent = money(result.today_sales);
    if ($('#salesMonth')) $('#salesMonth').textContent = money(result.month_sales);
    if ($('#ordersToday')) $('#ordersToday').textContent = `${result.today_orders} orders`;
    if ($('#ordersMonth')) $('#ordersMonth').textContent = `${result.month_orders} orders`;
    const canvas = $('#salesChart');
    if (canvas && window.Chart) {
        if (salesChart) salesChart.destroy();
        salesChart = new Chart(canvas, {
            type: 'line',
            data: { labels: result.daily.map(x=>x.label), datasets: [{ label:'Paid sales', data:result.daily.map(x=>x.sales), tension:.3 }] },
            options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
        });
    }
    if ($('#topProducts')) {
        $('#topProducts').innerHTML = result.top_products.length
            ? result.top_products.map((x,i)=>`<div class="row"><span>${i+1}. ${esc(x.name)}</span><b>${x.qty} sold</b></div>`).join('')
            : '<p class="muted">No paid sales yet.</p>';
    }
}

async function loadLedger() {
    const result=await api('/api/admin/ledger');
    const rows=$('#ledgerRows');
    if (!rows) return;
    if (!result._ok) { rows.innerHTML=`<tr><td colspan="4">${esc(result.error||'Could not load ledger')}</td></tr>`; return; }
    rows.innerHTML=result.customers.length ? result.customers.map(c=>`
      <tr><td><b>${esc(c.name)}</b></td><td>${esc(c.mobile)}</td>
      <td><strong class="${Number(c.balance)>0?'ledger-due':''}">${money(c.balance)}</strong></td>
      <td><button class="add" onclick="ledgerEntryForm('payment','${esc(c.mobile)}','${esc(c.name)}')">Record payment</button></td></tr>`).join('')
      : '<tr><td colspan="4">No credit entries yet.</td></tr>';
}

function ledgerEntryForm(type='payment', mobile='', name='') {
    modal(`<h2>${type==='payment'?'Record payment':'Add credit'}</h2>
      <label>Customer name<input id="lgName" value="${esc(name)}"></label>
      <label>Mobile<input id="lgMobile" value="${esc(mobile)}" maxlength="10"></label>
      <label>Amount<input id="lgAmount" type="number" min="1"></label>
      <label>Note<input id="lgNote" placeholder="${type==='payment'?'Payment received':'Credit sale'}"></label>
      <p class="err" id="lgErr"></p>
      <button class="primary" onclick="saveLedger('${type}')">Save</button>
      <button onclick="closeModal()">Cancel</button>`);
}
async function saveLedger(type) {
    const result=await api('/api/admin/ledger','POST',{name:$('#lgName').value,mobile:$('#lgMobile').value,amount:Number($('#lgAmount').value),note:$('#lgNote').value,type});
    if(!result._ok) return $('#lgErr').textContent=result.error||'Could not save';
    closeModal(); loadLedger();
}

async function loadCoupons() {
    const result=await api('/api/admin/coupons'), rows=$('#couponRows');
    if(!rows) return;
    if(!result._ok) return rows.innerHTML=`<tr><td colspan="5">${esc(result.error||'Could not load coupons')}</td></tr>`;
    rows.innerHTML=result.coupons.map(c=>`<tr><td><b>${esc(c.code)}</b></td>
      <td>${c.discount_type==='percent'?esc(c.discount_value)+'%':money(c.discount_value)}${c.max_discount!=null?` <small>max ${money(c.max_discount)}</small>`:''}</td>
      <td>${money(c.min_order)}</td><td>${c.active?'Active':'Off'}</td>
      <td><button class="${c.active?'danger':'add'}" onclick="toggleCoupon(${c.id},${!c.active})">${c.active?'Switch off':'Switch on'}</button></td></tr>`).join('');
}
function couponForm() {
    modal(`<h2>Create coupon</h2>
      <label>Code<input id="cpCode" maxlength="40" placeholder="SUMMER10"></label>
      <label>Type<select id="cpType"><option value="percent">Percent</option><option value="fixed">Fixed ₹</option></select></label>
      <label>Discount value<input id="cpValue" type="number" min="0"></label>
      <label>Maximum discount (optional)<input id="cpMax" type="number" min="0"></label>
      <label>Minimum order<input id="cpMin" type="number" min="0" value="0"></label>
      <p class="err" id="cpErr"></p>
      <button class="primary" onclick="saveCoupon()">Create</button><button onclick="closeModal()">Cancel</button>`);
}
async function saveCoupon() {
    const err = $('#cpErr');
    const code = ($('#cpCode')?.value || '').trim().toUpperCase();
    const value = Number($('#cpValue')?.value);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) { err.textContent = 'Code: 3-40 letters/numbers (e.g. SUMMER10)'; return; }
    if (!(value > 0)) { err.textContent = 'Enter a discount value greater than 0'; return; }
    const result = await api('/api/admin/coupon', 'POST', {
        code,
        discount_type: $('#cpType').value,
        discount_value: value,
        max_discount: $('#cpMax').value,
        min_order: Number($('#cpMin').value || 0)
    });
    if (!result._ok) { err.textContent = result.error || 'Could not create coupon'; return; }
    closeModal();
    loadCoupons();
}
async function toggleCoupon(id, active) {
    const result=await api(`/api/admin/coupon/${id}`,'PUT',{active});
    if(!result._ok) return alert(result.error||'Could not update coupon');
    loadCoupons();
}

/* =========================================================
   BROCHURE LINK  (paste a Google Drive / Docs / PDF / DOCX link)
   ========================================================= */

async function loadBrochure() {
    const box = $('#brochureBox');
    if (!box) return;
    const result = await api('/api/admin/brochure');
    if (!result._ok) {
        box.innerHTML = `<p class="err">${esc(result.error || 'Could not load brochure settings')}</p>`;
        return;
    }
    const links = result.links || {};
    const current = result.url
        ? `<p>Current brochure: <a href="${esc(links.view || result.url)}" target="_blank" rel="noopener">open link</a>
             &nbsp;·&nbsp; <a href="/brochure" target="_blank">see it on the website</a></p>`
        : '<p class="muted">No brochure link saved yet.</p>';
    box.innerHTML = `
        ${current}
        <label>Brochure link (Google Drive, Google Docs, or a direct .pdf / .docx link)
            <input id="brochureUrl" type="url" placeholder="https://drive.google.com/file/d/..." value="${esc(result.url || '')}">
        </label>
        <p class="muted"><small>For Google Drive / Docs, set sharing to <b>“Anyone with the link – Viewer”</b>, otherwise customers will see a “request access” page.</small></p>
        <p class="err" id="brochureErr"></p>
        <button class="primary" onclick="saveBrochure()">Save brochure</button>
        ${result.url ? '<button class="danger" onclick="removeBrochure()">Remove</button>' : ''}`;
}

async function saveBrochure() {
    const url = ($('#brochureUrl')?.value || '').trim();
    const result = await api('/api/admin/brochure', 'POST', { url });
    if (!result._ok) { $('#brochureErr').textContent = result.error || 'Could not save'; return; }
    await loadBrochure();
    alert('Brochure saved. Customers can now open it from the Brochure page.');
}

async function removeBrochure() {
    if (!confirm('Remove the brochure link?')) return;
    const result = await api('/api/admin/brochure', 'POST', { url: '' });
    if (!result._ok) return alert(result.error || 'Could not remove');
    loadBrochure();
}

window.loadBrochure = loadBrochure;
window.saveBrochure = saveBrochure;
window.removeBrochure = removeBrochure;


/* =========================================================
   DASHBOARD STARTUP
   ========================================================= */

async function adminStartup() {
    await loadAdminCategories();

    try {

        await loadAdminOrders();

        await loadAdminProducts();

        filterStock();

    } catch (error) {

        console.error(
            'Admin startup error:',
            error
        );
    }
}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.showTab =
    showTab;

window.loadAdminOrders =
    loadAdminOrders;

window.adminStatus =
    adminStatus;

window.adminPaymentStatus =
    adminPaymentStatus;

window.assignDelivery =
    assignDelivery;

window.updateStock =
    updateStock;

window.stock =
    stock;

window.filterStock =
    filterStock;

window.loadAdminProducts =
    loadAdminProducts;

window.productForm =
    productForm;

window.saveProductForm =
    saveProductForm;

window.createAdminProduct =
    createAdminProduct;



/* =========================================================
   PRODUCT IMAGE MANAGER — FREE GITHUB HOSTING
   ========================================================= */

async function openProductImageManager(id, currentUrl = '') {
    const config = await api('/api/product-image-config');
    const githubReady = config._ok && config.github_configured;
    modal(`
        <div style="max-width:620px">
            <h2 style="margin-top:0">📷 Product Image</h2>
            <p class="muted">Upload to your public GitHub repository for free, or paste a public image URL.</p>
            <div style="margin:14px 0;text-align:center">${currentUrl ? `<img src="${esc(currentUrl)}" alt="Current product image" style="max-width:220px;max-height:220px;object-fit:contain;border-radius:14px;border:1px solid #dbe4ea">` : '<div style="padding:36px;background:#f4f8fa;border-radius:14px">No image added yet</div>'}</div>
            <label><b>Upload image to GitHub</b><input id="productImageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" style="width:100%;margin-top:8px"></label>
            <small class="muted">JPG, PNG, WEBP or GIF · maximum 5 MB</small>
            <button class="primary" type="button" onclick="uploadProductImage(${id})" style="width:100%;margin-top:14px" ${githubReady ? '' : 'disabled'}>☁️ Upload to GitHub</button>
            ${githubReady ? `<small class="muted">GitHub: ${esc(config.repository)} / ${esc(config.folder)}</small>` : `<div class="err" style="margin-top:10px">GitHub upload is not configured yet. Add GITHUB_TOKEN and GITHUB_REPO in Render Environment Variables.</div>`}
            <hr style="margin:20px 0;border:0;border-top:1px solid #e4e9ed">
            <label><b>Or paste a public image URL</b><input id="productImageUrl" type="url" value="${esc(currentUrl)}" placeholder="https://.../product.webp" style="width:100%;margin-top:8px;box-sizing:border-box"></label>
            <button type="button" onclick="saveProductImageUrl(${id})" style="width:100%;margin-top:10px">🔗 Save image URL</button>
            ${currentUrl ? `<button type="button" class="danger" onclick="removeProductImage(${id})" style="width:100%;margin-top:10px">Remove image</button>` : ''}
            <button type="button" onclick="closeModal()" style="width:100%;margin-top:10px">Close</button>
            <p id="productImageMsg" class="err"></p>
        </div>`);
}

async function uploadProductImage(id) {
    const input = document.getElementById('productImageFile');
    const msg = document.getElementById('productImageMsg');
    const file = input?.files?.[0];
    if (!file) { if (msg) msg.textContent = 'Choose an image first.'; return; }
    if (file.size > 5 * 1024 * 1024) { if (msg) msg.textContent = 'Image is larger than 5 MB.'; return; }
    const form = new FormData(); form.append('image', file);
    if (msg) msg.textContent = 'Uploading to GitHub…';
    try {
        const response = await fetch(`/api/product/${id}/image`, { method: 'POST', body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { if (msg) msg.textContent = data.error || 'Upload failed'; return; }
        if (msg) msg.textContent = 'Image uploaded successfully.';
        setTimeout(() => location.reload(), 700);
    } catch (e) { if (msg) msg.textContent = 'Network error while uploading image.'; }
}

async function saveProductImageUrl(id) {
    const url = document.getElementById('productImageUrl')?.value.trim();
    const msg = document.getElementById('productImageMsg');
    if (!url) { if (msg) msg.textContent = 'Paste an image URL first.'; return; }
    const form = new FormData(); form.append('image_url', url);
    if (msg) msg.textContent = 'Saving…';
    const response = await fetch(`/api/product/${id}/image`, { method: 'POST', body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { if (msg) msg.textContent = data.error || 'Could not save image URL'; return; }
    location.reload();
}

async function removeProductImage(id) {
    if (!confirm('Remove this product image?')) return;
    const response = await fetch(`/api/product/${id}/image`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return alert(data.error || 'Could not remove image');
    location.reload();
}

window.openProductImageManager = openProductImageManager;
window.uploadProductImage = uploadProductImage;
window.saveProductImageUrl = saveProductImageUrl;
window.removeProductImage = removeProductImage;

window.updateAdminProduct =
    updateAdminProduct;

window.hideAdminProduct =
    hideAdminProduct;

window.deactivateProduct =
    deactivateProduct;

window.activateProduct = activateProduct;
window.loadSalesDashboard = loadSalesDashboard;
window.loadLedger = loadLedger;
window.ledgerEntryForm = ledgerEntryForm;
window.saveLedger = saveLedger;
window.loadCoupons = loadCoupons;
window.couponForm = couponForm;
window.saveCoupon = saveCoupon;
window.toggleCoupon = toggleCoupon;


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
    'DOMContentLoaded',
    () => {

        if (
            document.querySelector(
                '.admin-panel'
            ) ||
            document.querySelector(
                '#orderRows'
            )
        ) {

            adminStartup();
        }

    }
);async function sendOrderBill(id) {
  const r = await api(`/api/admin/order/${id}/whatsapp`, 'POST');
  if (!r._ok) return alert(r.error || 'Could not create bill');
  window.open(r.whatsapp_url, '_blank', 'noopener');
}

/* =========================================================
   CATEGORIES / TEAM
   ========================================================= */
let ADMIN_CATEGORIES = [];

async function loadAdminCategories() {
  const result = await api('/api/admin/categories');
  if (!result._ok) return [];
  ADMIN_CATEGORIES = result.categories || [];
  window.ADMIN_CATEGORIES_HTML = ADMIN_CATEGORIES.filter(c => c.active)
    .map(c => `<option value="${esc(c.name)}">${esc(c.icon)} ${esc(c.name)}</option>`).join('');
  return ADMIN_CATEGORIES;
}

async function loadTeam() {
  const rows = $('#teamRows');
  if (!rows) return;
  const result = await api('/api/team');
  if (!result._ok) {
    rows.innerHTML = `<tr><td colspan="6">${esc(result.error || 'Could not load team')}</td></tr>`;
    return;
  }
  rows.innerHTML = (result.users || []).map(u => `
    <tr>
      <td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${esc(u.mobile)}</td>
      <td>${u.active ? 'Active' : 'Disabled'}</td>
      <td>
        <button onclick="editTeam(${u.id})">Edit</button>
        <button class="${u.active ? 'danger' : 'add'}" onclick="toggleTeam(${u.id},${!u.active})">${u.active ? 'Disable' : 'Enable'}</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6">No staff accounts.</td></tr>';
}

function teamForm(user=null) {
  modal(`
    <h2>${user ? 'Edit staff account' : 'Add staff account'}</h2>
    <label>Name<input id="team_name" value="${esc(user?.name || '')}"></label>
    <label>Username<input id="team_username" value="${esc(user?.username || '')}" ${user ? 'disabled' : ''}></label>
    <label>Role<select id="team_role" ${user ? 'disabled' : ''}><option value="delivery" ${user?.role==='delivery'?'selected':''}>Delivery</option><option value="admin" ${user?.role==='admin'?'selected':''}>Admin</option></select></label>
    <label>Mobile<input id="team_mobile" maxlength="10" value="${esc(user?.mobile || '')}"></label>
    <label>${user ? 'New password (leave blank to keep)' : 'Password'}<input id="team_password" type="password" minlength="8"></label>
    <p class="err" id="team_err"></p>
    <button class="primary" onclick="saveTeam(${user?.id || 'null'})">Save</button>
    <button onclick="closeModal()">Cancel</button>
  `);
}
async function addTeam(){ teamForm(); }
async function editTeam(id){
  const r=await api('/api/team'); const u=(r.users||[]).find(x=>x.id==id); if(u) teamForm(u);
}
async function saveTeam(id){
  const body={name:$('#team_name')?.value.trim(),username:$('#team_username')?.value.trim(),role:$('#team_role')?.value,mobile:$('#team_mobile')?.value.trim(),password:$('#team_password')?.value};
  if(!body.password) delete body.password;
  const r=await api(id?`/api/team/${id}`:'/api/team',id?'PUT':'POST',body);
  if(!r._ok){$('#team_err').textContent=r.error||'Could not save account';return;}
  closeModal(); loadTeam();
}
async function toggleTeam(id,active){
  const r=await api(`/api/team/${id}`,'PUT',{active});
  if(!r._ok) return alert(r.error||'Could not change account');
  loadTeam();
}



window.addTeam=addTeam; window.editTeam=editTeam; window.saveTeam=saveTeam; window.toggleTeam=toggleTeam; window.loadTeam=loadTeam;

window.sendOrderBill=sendOrderBill;

/* =========================================================
   ADMIN THEME + HAMBURGER MENU
   Safe UI-only controls. Does not touch business/API logic.
   ========================================================= */

function applyAdminTheme(theme) {
    const selected = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', selected);
    localStorage.setItem('ce_theme', selected);

    const button = document.getElementById('adminThemeToggle');
    if (button) {
        button.textContent = selected === 'dark' ? '☀️' : '🌙';
        button.setAttribute(
            'aria-label',
            selected === 'dark'
                ? 'Switch to light theme'
                : 'Switch to dark theme'
        );
        button.title = selected === 'dark'
            ? 'Light theme'
            : 'Dark theme';
    }
}

function toggleAdminTheme() {
    const current =
        document.documentElement.getAttribute('data-theme') === 'dark'
            ? 'dark'
            : 'light';

    applyAdminTheme(current === 'dark' ? 'light' : 'dark');
}

function toggleAdminMenu(force) {
    const open =
        typeof force === 'boolean'
            ? force
            : !document.body.classList.contains('admin-menu-open');

    document.body.classList.toggle('admin-menu-open', open);

    const button = document.getElementById('adminMenuToggle');
    if (button) {
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        button.textContent = open ? '✕' : '☰';
        button.setAttribute(
            'aria-label',
            open ? 'Close admin menu' : 'Open admin menu'
        );
    }
}

/* Close the mobile menu after selecting a tab. */
const originalShowTab = window.showTab;
if (typeof originalShowTab === 'function') {
    window.showTab = function(tab, button) {
        const result = originalShowTab(tab, button);
        toggleAdminMenu(false);
        return result;
    };
}

function initAdminThemeAndMenu() {
    let saved = 'light';
    try {
        saved = localStorage.getItem('ce_theme') || localStorage.getItem('admin-theme') || 'light';
    } catch (e) {}

    applyAdminTheme(saved);
    toggleAdminMenu(false);
}

document.addEventListener('DOMContentLoaded', initAdminThemeAndMenu);

window.toggleAdminTheme = toggleAdminTheme;
window.toggleAdminMenu = toggleAdminMenu;


window.loadPendingArchives = loadPendingArchives;
window.deleteAllOrderData = deleteAllOrderData;
window.confirmOrderArchive = confirmOrderArchive;
