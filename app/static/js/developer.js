/* =========================================================
   CHAND ENTERPRISES
   DEVELOPER JAVASCRIPT
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

        console.error(
            'Developer API error:',
            error
        );

        return {
            _ok: false,
            error: 'Network error'
        };
    }
}


/* =========================================================
   STATE
   ========================================================= */

let CFG = {
    whatsapp: '919304285574',
    upi: 'chandenterprises@upi',
    business_name: 'Chand Enterprises',
    business_mobile: '9304295574',
    business_location: 'Darbhanga, Bihar',
    payment_name: 'Chand Enterprises',
    offers: []
};


const DEFAULT_OFFERS = [
    '🥤 Pepsi 200ml @ ₹12',
    '⚡ Energy Drink 250ml - Buy 2, get ₹20 off',
    '🚰 Premium Water 20L - special bulk rate',
    '🚚 Free delivery above ₹500',
    '🎟️ Use code WELCOME10 - 10% off your first order',
    '🍋 Lemon Soda 750ml - summer special'
];


let OFFERS = [
    ...DEFAULT_OFFERS
];


/* =========================================================
   MODAL
   ========================================================= */

function modal(html) {

    const element = $('#modal');

    if (!element) {
        console.error('Modal element not found');
        return;
    }

    element.innerHTML =
        '<div class="box">' +
        html +
        '</div>';

    element.classList.add('open');

    element.onclick = event => {

        if (event.target === element) {
            closeModal();
        }
    };
}


function closeModal() {

    const element = $('#modal');

    if (element) {
        element.classList.remove('open');
    }
}


/* =========================================================
   TICKER
   ========================================================= */

function ticker() {

    const track = $('#track');

    if (!track) {
        return;
    }

    const html = OFFERS
        .map(
            offer =>
                `<span>${esc(offer)}</span>`
        )
        .join('');

    track.innerHTML = html + html;
}


/* =========================================================
   LOAD PUBLIC CONFIG
   ========================================================= */

async function loadDeveloperConfig() {

    const result =
        await api('/api/config');

    if (
        !result ||
        result._ok === false
    ) {
        return;
    }

    CFG = Object.assign(
        CFG,
        result
    );

    if (
        Array.isArray(result.offers) &&
        result.offers.length
    ) {
        OFFERS = result.offers;
    }

    ticker();
}


/* =========================================================
   BUSINESS SETTINGS
   ========================================================= */

async function developerSettings() {

    const result =
        await api(
            '/api/developer/settings'
        );

    if (!result._ok) {

        return alert(
            result.error ||
            'Developer access required'
        );
    }

    /*
       IMPORTANT:
       Backend returns:

       {
           ok: true,
           settings: {...}
       }

       So we must use result.settings.
    */

    const settings =
        result.settings || {};

    modal(`

        <h2>
            Business Settings
        </h2>

        <label>
            Business name

            <input
                id="ds_name"
                value="${esc(
                    settings.business_name || ''
                )}"
            >
        </label>

        <label>
            Business mobile

            <input
                id="ds_mobile"
                value="${esc(
                    settings.business_mobile || ''
                )}"
                maxlength="10"
            >
        </label>

        <label>
            WhatsApp number

            <input
                id="ds_whatsapp"
                value="${esc(
                    settings.whatsapp || ''
                )}"
                maxlength="10"
            >
        </label>

        <label>
            Business location

            <input
                id="ds_location"
                value="${esc(
                    settings.business_location || ''
                )}"
            >
        </label>

        <label>
            UPI ID

            <input
                id="ds_upi"
                value="${esc(
                    settings.upi || ''
                )}"
            >
        </label>

        <label>
            Payment display name

            <input
                id="ds_payment"
                value="${esc(
                    settings.payment_name || ''
                )}"
            >
        </label>

        <p
            class="err"
            id="ds_err"
        ></p>

        <button
            class="primary"
            onclick="saveDeveloperSettings()"
        >
            Save settings
        </button>

        <button
            onclick="closeModal()"
        >
            Close
        </button>

    `);
}


/* =========================================================
   SAVE BUSINESS SETTINGS
   ========================================================= */

async function saveDeveloperSettings() {

    const result =
        await api(
            '/api/developer/settings',
            'PUT',
            {
                business_name:
                    $('#ds_name')
                        ?.value
                        .trim(),

                business_mobile:
                    $('#ds_mobile')
                        ?.value
                        .trim(),

                whatsapp:
                    $('#ds_whatsapp')
                        ?.value
                        .trim(),

                business_location:
                    $('#ds_location')
                        ?.value
                        .trim(),

                upi:
                    $('#ds_upi')
                        ?.value
                        .trim(),

                payment_name:
                    $('#ds_payment')
                        ?.value
                        .trim()
            }
        );

    if (!result._ok) {

        const error =
            $('#ds_err');

        if (error) {
            error.textContent =
                result.error ||
                'Could not save settings';
        }

        return;
    }

    /*
       PUT response may contain updated
       settings or flat values.
    */

    if (result.settings) {

        CFG = Object.assign(
            CFG,
            result.settings
        );

    } else {

        CFG = Object.assign(
            CFG,
            result
        );
    }

    closeModal();

    ticker();

    alert(
        'Business settings saved'
    );
}


/* =========================================================
   OFFERS / TICKER
   ========================================================= */

async function developerOffers() {

    const result =
        await api(
            '/api/developer/offers'
        );

    if (!result._ok) {

        return alert(
            result.error ||
            'Developer access required'
        );
    }

    const offers =
        result.offers || [];

    modal(`

        <h2>
            Offers &amp; Ticker
        </h2>

        <label>
            New offer

            <input
                id="newOffer"
                placeholder="Example: Free delivery above ₹500"
            >
        </label>

        <button
            class="primary"
            onclick="addDeveloperOffer()"
        >
            Add offer
        </button>

        <div id="offerList">

            ${
                offers.length

                    ? offers
                        .map(
                            (offer, index) => `

                            <div
                                class="row"
                                style="
                                    gap:8px;
                                    margin:8px 0
                                "
                            >

                                <input
                                    id="offer_${index}"
                                    value="${esc(offer)}"
                                    style="flex:1"
                                >

                                <button
                                    onclick="
                                        updateDeveloperOffer(
                                            ${index}
                                        )
                                    "
                                >
                                    Save
                                </button>

                                <button
                                    onclick="
                                        deleteDeveloperOffer(
                                            ${index}
                                        )
                                    "
                                >
                                    Delete
                                </button>

                            </div>
                        `
                        )
                        .join('')

                    : `
                        <p class="muted">
                            No offers added.
                        </p>
                    `
            }

        </div>

        <button
            onclick="closeModal()"
        >
            Close
        </button>

    `);
}


/* =========================================================
   ADD OFFER
   ========================================================= */

async function addDeveloperOffer() {

    const input =
        $('#newOffer');

    const text =
        input?.value.trim();

    if (!text) {

        return alert(
            'Enter an offer'
        );
    }

    const result =
        await api(
            '/api/developer/offers',
            'POST',
            {
                text
            }
        );

    if (!result._ok) {

        return alert(
            result.error ||
            'Could not add offer'
        );
    }

    OFFERS =
        result.offers ||
        OFFERS;

    ticker();

    developerOffers();
}


/* =========================================================
   UPDATE OFFER
   ========================================================= */

async function updateDeveloperOffer(index) {

    const input =
        $(`#offer_${index}`);

    if (!input) {
        return;
    }

    const result =
        await api(
            `/api/developer/offers/${index}`,
            'PUT',
            {
                text:
                    input.value.trim()
            }
        );

    if (!result._ok) {

        return alert(
            result.error ||
            'Could not update offer'
        );
    }

    OFFERS =
        result.offers ||
        OFFERS;

    ticker();

    developerOffers();
}


/* =========================================================
   DELETE OFFER
   ========================================================= */

async function deleteDeveloperOffer(index) {

    if (
        !confirm(
            'Delete this offer?'
        )
    ) {
        return;
    }

    const result =
        await api(
            `/api/developer/offers/${index}`,
            'DELETE'
        );

    if (!result._ok) {

        return alert(
            result.error ||
            'Could not delete offer'
        );
    }

    OFFERS =
        result.offers ||
        [];

    ticker();

    developerOffers();
}


/* =========================================================
   DEVELOPER PRODUCTS
   ========================================================= */

async function loadDeveloperProducts() {

    const result =
        await api(
            '/api/developer/products'
        );

    if (!result._ok) {

        return alert(
            result.error ||
            'Developer access required'
        );
    }

    const rows =
        $('#developerProductRows');

    if (!rows) {
        return;
    }

    rows.innerHTML =
        (result.products || [])
            .map(
                product => `

                <tr>

                    <td>
                        ${product.id}
                    </td>

                    <td>

                        <input
                            id="dp_name_${product.id}"
                            value="${esc(
                                product.name
                            )}"
                        >

                    </td>

                    <td>

                        <input
                            id="dp_cat_${product.id}"
                            value="${esc(
                                product.category
                            )}"
                        >

                    </td>

                    <td>

                        <input
                            id="dp_price_${product.id}"
                            type="number"
                            min="0"
                            step="0.01"
                            value="${product.price}"
                        >

                    </td>

                    <td>

                        <input
                            id="dp_stock_${product.id}"
                            type="number"
                            min="0"
                            value="${product.stock}"
                        >

                    </td>

                    <td>

                        <input
                            id="dp_icon_${product.id}"
                            value="${esc(
                                product.icon ||
                                '🥤'
                            )}"
                            maxlength="10"
                        >

                    </td>

                    <td>

                        ${
                            product.active
                                ? 'Active'
                                : 'Hidden'
                        }

                    </td>

                    <td>

                        <button
                            onclick="
                                saveDeveloperProduct(
                                    ${product.id}
                                )
                            "
                        >
                            Save
                        </button>

                        <button
                            onclick="
                                toggleDeveloperProduct(
                                    ${product.id},
                                    ${
                                        product.active
                                            ? 'false'
                                            : 'true'
                                    }
                                )
                            "
                        >
                            ${
                                product.active
                                    ? 'Hide'
                                    : 'Show'
                            }
                        </button>

                    </td>

                </tr>
            `
            )
            .join('');
}


/* =========================================================
   ADD PRODUCT
   ========================================================= */

async function addDeveloperProduct() {

    modal(`

        <h2>
            Add Product
        </h2>

        <label>
            Product name

            <input
                id="new_dp_name"
                placeholder="Product name"
            >
        </label>

        <label>
            Category

            <input
                id="new_dp_category"
                placeholder="Cold Drinks"
            >
        </label>

        <label>
            Price

            <input
                id="new_dp_price"
                type="number"
                min="0"
                step="0.01"
            >
        </label>

        <label>
            Stock

            <input
                id="new_dp_stock"
                type="number"
                min="0"
                value="0"
            >
        </label>

        <label>
            Icon

            <input
                id="new_dp_icon"
                value="🥤"
                maxlength="10"
            >
        </label>

        <p
            class="err"
            id="new_dp_err"
        ></p>

        <button
            class="primary"
            onclick="saveNewDeveloperProduct()"
        >
            Add product
        </button>

        <button
            onclick="closeModal()"
        >
            Cancel
        </button>

    `);
}


/* =========================================================
   SAVE NEW PRODUCT
   ========================================================= */

async function saveNewDeveloperProduct() {

    const result =
        await api(
            '/api/developer/product',
            'POST',
            {
                name:
                    $('#new_dp_name')
                        ?.value
                        .trim(),

                category:
                    $('#new_dp_category')
                        ?.value
                        .trim(),

                price:
                    $('#new_dp_price')
                        ?.value,

                stock:
                    $('#new_dp_stock')
                        ?.value,

                icon:
                    $('#new_dp_icon')
                        ?.value ||
                    '🥤'
            }
        );

    if (!result._ok) {

        const error =
            $('#new_dp_err');

        if (error) {
            error.textContent =
                result.error ||
                'Could not create product';
        }

        return;
    }

    closeModal();

    loadDeveloperProducts();
}


/* =========================================================
   UPDATE PRODUCT
   ========================================================= */

async function saveDeveloperProduct(id) {

    const result =
        await api(
            `/api/developer/product/${id}`,
            'PUT',
            {
                name:
                    $(`#dp_name_${id}`)
                        ?.value
                        .trim(),

                category:
                    $(`#dp_cat_${id}`)
                        ?.value
                        .trim(),

                price:
                    $(`#dp_price_${id}`)
                        ?.value,

                stock:
                    $(`#dp_stock_${id}`)
                        ?.value,

                icon:
                    $(`#dp_icon_${id}`)
                        ?.value ||
                    '🥤'
            }
        );

    if (!result._ok) {

        return alert(
            result.error ||
            'Could not update product'
        );
    }

    alert(
        'Product updated'
    );

    loadDeveloperProducts();
}


/* =========================================================
   SHOW / HIDE PRODUCT
   ========================================================= */

async function toggleDeveloperProduct(
    id,
    active
) {

    const result =
        await api(
            `/api/developer/product/${id}`,
            'PUT',
            {
                active:
                    active === true ||
                    active === 'true'
            }
        );

    if (!result._ok) {

        return alert(
            result.error ||
            'Could not change product status'
        );
    }

    loadDeveloperProducts();
}


/* =========================================================
   DEVELOPER DASHBOARD
   ========================================================= */

async function developerDashboard() {

    const result =
        await api(
            '/api/developer/settings'
        );

    if (!result._ok) {
        return;
    }

    /*
       Backend returns:

       {
           ok: true,
           settings: {...}
       }
    */

    const settings =
        result.settings || {};

    CFG =
        Object.assign(
            CFG,
            settings
        );

    if (
        Array.isArray(
            settings.offers
        )
    ) {

        OFFERS =
            settings.offers;
    }

    ticker();

    await loadDeveloperProducts();
}


/* =========================================================
   REFRESH CONFIG
   ========================================================= */

async function refreshConfig() {

    const result =
        await api(
            '/api/config'
        );

    if (
        !result ||
        result._ok === false
    ) {
        return;
    }

    CFG =
        Object.assign(
            CFG,
            result
        );

    if (
        Array.isArray(
            result.offers
        )
    ) {

        OFFERS =
            result.offers;
    }

    ticker();

    return CFG;
}


/* =========================================================
   DEVELOPER REFRESH
   ========================================================= */

async function developerRefresh() {

    await refreshConfig();

    if (
        $('#developerProductRows')
    ) {

        await loadDeveloperProducts();
    }
}


/* =========================================================
   LOGOUT
   ========================================================= */

function logout() {

    window.location.href =
        '/logout';
}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.loadDeveloperConfig =
    loadDeveloperConfig;

window.developerSettings =
    developerSettings;

window.saveDeveloperSettings =
    saveDeveloperSettings;

window.developerOffers =
    developerOffers;

window.addDeveloperOffer =
    addDeveloperOffer;

window.updateDeveloperOffer =
    updateDeveloperOffer;

window.deleteDeveloperOffer =
    deleteDeveloperOffer;

window.loadDeveloperProducts =
    loadDeveloperProducts;

window.addDeveloperProduct =
    addDeveloperProduct;

window.saveNewDeveloperProduct =
    saveNewDeveloperProduct;

window.saveDeveloperProduct =
    saveDeveloperProduct;

window.toggleDeveloperProduct =
    toggleDeveloperProduct;

window.developerDashboard =
    developerDashboard;

window.refreshConfig =
    refreshConfig;

window.developerRefresh =
    developerRefresh;

window.closeModal =
    closeModal;

window.logout =
    logout;


/* =========================================================
   STARTUP
   ========================================================= */

document.addEventListener(
    'DOMContentLoaded',
    () => {

        if (
            document.querySelector(
                '#developerProductRows'
            )
        ) {

            developerDashboard();
        }

    }
);