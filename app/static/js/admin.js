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
   STATE
   ========================================================= */

let ADMIN_ORDERS = [];

let ADMIN_PRODUCTS = [];


/* =========================================================
   TABS
   ========================================================= */

function showTab(tab, button) {

    const tabs = [
        'orders',
        'products',
        'stock'
    ];

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

    if (tab === 'stock') {
        filterStock();
    }
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
                        </td>


                        <td>

                            <strong>
                                ${esc(order.customer)}
                            </strong>

                            <small>
                                ${esc(order.mobile || '')}
                            </small>

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
                        ${esc(product.category)}
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
    icon = '🥤'
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


        const newIcon =
            prompt(
                'Icon:',
                icon
            );


        const data = {
            name: newName,
            category: newCategory,
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

            <input
                id="adminProductCategory"
                type="text"
                value="${esc(category)}"
                placeholder="Category"
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
   DASHBOARD STARTUP
   ========================================================= */

async function adminStartup() {

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

window.updateAdminProduct =
    updateAdminProduct;

window.hideAdminProduct =
    hideAdminProduct;

window.deactivateProduct =
    deactivateProduct;

window.activateProduct =
    activateProduct;


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
);