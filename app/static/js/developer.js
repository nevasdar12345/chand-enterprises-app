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

        <label>
            Store latitude

            <input id="ds_lat" value="${esc(settings.business_lat || '')}" placeholder="Example: 26.1542">
        </label>

        <label>
            Store longitude

            <input id="ds_lng" value="${esc(settings.business_lng || '')}" placeholder="Example: 85.8918">
        </label>

        <label>
            Base delivery charge (₹)

            <input id="ds_base" type="number" min="0" value="${esc(settings.delivery_base || '30')}">
        </label>

        <label>
            Charge per km (₹)

            <input id="ds_km" type="number" min="0" value="${esc(settings.delivery_per_km || '10')}">
        </label>

        <label>
            Free delivery above (₹)
            <input id="ds_free" type="number" min="0" value="${esc(settings.delivery_free_above || '500')}">
        </label>

        <label>Instagram page URL
            <input id="ds_instagram" type="url" placeholder="https://instagram.com/yourpage" value="${esc(settings.instagram_url || '')}">
        </label>

        <label>Facebook page URL
            <input id="ds_facebook" type="url" placeholder="https://facebook.com/yourpage" value="${esc(settings.facebook_url || '')}">
        </label>

        <label>Brochure PDF / document URL
            <input id="ds_brochure" type="url" placeholder="https://..." value="${esc(settings.brochure_url || '')}">
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
                        .trim(),
                business_lat: $('#ds_lat')?.value.trim(),
                business_lng: $('#ds_lng')?.value.trim(),
                delivery_base: $('#ds_base')?.value,
                delivery_per_km: $('#ds_km')?.value,
                delivery_free_above: $('#ds_free')?.value,
                instagram_url: $('#ds_instagram')?.value.trim(),
                facebook_url: $('#ds_facebook')?.value.trim(),
                brochure_url: $('#ds_brochure')?.value.trim()
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
    await loadDeveloperCategories();

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
                        ${product.image_url ? `<img src="${esc(product.image_url)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;display:block;margin-bottom:6px">` : `<span style="font-size:24px">${esc(product.icon || '🥤')}</span>`}
                        <button type="button" onclick="openProductImageManager(${product.id}, ${JSON.stringify(product.image_url || '')})">📷 Image</button>
                    </td>

                    <td>

                        <input
                            id="dp_size_${product.id}"
                            value="${esc(
                                product.size || ''
                            )}"
                            placeholder="e.g. 750ml"
                            maxlength="40"
                        >

                    </td>

                    <td>

                        <select id="dp_cat_${product.id}">
                            ${categoryOptions(product.category)}
                        </select>

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
    await loadDeveloperCategories();
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
            Size
            <input
                id="new_dp_size"
                placeholder="e.g. 250ml, 750ml, 1L, 20L"
                maxlength="40"
            >
        </label>

        <label>
            Category
            <select id="new_dp_category">${categoryOptions()}</select>
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

                size:
                    $('#new_dp_size')
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

    await loadDeveloperProducts();
    if (result.product?.id) {
        openProductImageManager(result.product.id, result.product.image_url || '');
    }
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

                size:
                    $(`#dp_size_${id}`)
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
   CATEGORIES
   ========================================================= */
let DEV_CATEGORIES = [];

async function loadDeveloperCategories() {
  const result = await api('/api/admin/categories');
  if (!result._ok) return [];
  DEV_CATEGORIES = (result.categories || []).filter(c => c.active);
  return DEV_CATEGORIES;
}

function categoryOptions(selected='') {
  return DEV_CATEGORIES.map(c =>
    `<option value="${esc(c.name)}" ${c.name === selected ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`
  ).join('');
}

async function developerCategories() {
  const result = await api('/api/admin/categories');
  if (!result._ok) return alert(result.error || 'Could not load categories');
  const categories = result.categories || [];
  DEV_CATEGORIES = categories.filter(c => c.active);
  modal(`
    <h2>Category manager</h2>
    <label>New category
      <input id="cat_name" maxlength="80" placeholder="e.g. Sports Drinks">
    </label>
    <label>Icon
      <input id="cat_icon" maxlength="10" value="🛍️">
    </label>
    <button class="primary" onclick="createDeveloperCategory()">Add category</button>
    <div style="margin-top:16px">
      ${categories.map(c => `
        <div class="row" style="gap:8px;margin:8px 0;align-items:center">
          <span>${esc(c.icon)}</span>
          <input id="cat_${c.id}" value="${esc(c.name)}" style="flex:1">
          <button onclick="saveDeveloperCategory(${c.id})">Save</button>
          <button onclick="toggleDeveloperCategory(${c.id},${!c.active})">${c.active ? 'Hide' : 'Show'}</button>
          <button class="danger" onclick="deleteDeveloperCategory(${c.id})">Delete</button>
        </div>
      `).join('') || '<p class="muted">No categories yet.</p>'}
    </div>
    <button onclick="closeModal()">Close</button>
  `);
}

async function createDeveloperCategory() {
  const result = await api('/api/admin/categories', 'POST', {
    name: $('#cat_name')?.value.trim(),
    icon: $('#cat_icon')?.value.trim()
  });
  if (!result._ok) return alert(result.error || 'Could not create category');
  await loadDeveloperCategories();
  developerCategories();
}

async function saveDeveloperCategory(id) {
  const result = await api(`/api/admin/categories/${id}`, 'PUT', {
    name: $(`#cat_${id}`)?.value.trim()
  });
  if (!result._ok) return alert(result.error || 'Could not rename category');
  await loadDeveloperCategories();
  developerCategories();
}

async function toggleDeveloperCategory(id, active) {
  const result = await api(`/api/admin/categories/${id}`, 'PUT', {active});
  if (!result._ok) return alert(result.error || 'Could not change category');
  await loadDeveloperCategories();
  developerCategories();
}

async function deleteDeveloperCategory(id) {
  if (!confirm('Delete this empty category?')) return;
  const result = await api(`/api/admin/categories/${id}`, 'DELETE');
  if (!result._ok) return alert(result.error || 'Could not delete category');
  await loadDeveloperCategories();
  developerCategories();
}

/* =========================================================
   TEAM
   ========================================================= */
async function developerTeam() {
  const result = await api('/api/team');
  if (!result._ok) return alert(result.error || 'Could not load team');
  const users = result.users || [];
  modal(`
    <h2>Team accounts</h2>
    <button class="primary" onclick="developerAddTeam()">+ Add account</button>
    <div style="margin-top:14px">
      ${users.map(u=>`
        <div class="row" style="gap:8px;margin:8px 0;align-items:center">
          <b>${esc(u.name)}</b><span>${esc(u.username)}</span><span>${esc(u.role)}</span><span>${u.active?'Active':'Disabled'}</span>
          <button onclick="developerEditTeam(${u.id})">Edit</button>
          <button onclick="developerToggleTeam(${u.id},${!u.active})">${u.active?'Disable':'Enable'}</button>
        </div>`).join('')}
    </div>
    <button onclick="closeModal()">Close</button>
  `);
}
function developerAddTeam(){ developerTeamForm(); }
async function developerEditTeam(id){
  const r=await api('/api/team'); const u=(r.users||[]).find(x=>x.id==id); if(u) developerTeamForm(u);
}
function developerTeamForm(u=null){
  modal(`<h2>${u?'Edit':'Add'} staff account</h2>
    <label>Name<input id="dev_team_name" value="${esc(u?.name||'')}"></label>
    <label>Username<input id="dev_team_username" value="${esc(u?.username||'')}" ${u?'disabled':''}></label>
    <label>Role<select id="dev_team_role" ${u?'disabled':''}><option value="delivery" ${u?.role==='delivery'?'selected':''}>Delivery</option><option value="admin" ${u?.role==='admin'?'selected':''}>Admin</option></select></label>
    <label>Mobile<input id="dev_team_mobile" value="${esc(u?.mobile||'')}"></label>
    <label>${u?'New password (optional)':'Password'}<input id="dev_team_password" type="password"></label>
    <p class="err" id="dev_team_err"></p>
    <button class="primary" onclick="developerSaveTeam(${u?.id||'null'})">Save</button><button onclick="developerTeam()">Cancel</button>`);
}
async function developerSaveTeam(id){
  const body={name:$('#dev_team_name')?.value.trim(),username:$('#dev_team_username')?.value.trim(),role:$('#dev_team_role')?.value,mobile:$('#dev_team_mobile')?.value.trim(),password:$('#dev_team_password')?.value};
  if(!body.password) delete body.password;
  const r=await api(id?`/api/team/${id}`:'/api/team',id?'PUT':'POST',body);
  if(!r._ok){$('#dev_team_err').textContent=r.error||'Could not save account';return;}
  developerTeam();
}
async function developerToggleTeam(id,active){
  const r=await api(`/api/team/${id}`,'PUT',{active});
  if(!r._ok) return alert(r.error||'Could not change account');
  developerTeam();
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

window.developerCategories = developerCategories;
window.createDeveloperCategory = createDeveloperCategory;
window.saveDeveloperCategory = saveDeveloperCategory;
window.toggleDeveloperCategory = toggleDeveloperCategory;
window.deleteDeveloperCategory = deleteDeveloperCategory;

window.developerTeam=developerTeam; window.developerAddTeam=developerAddTeam; window.developerEditTeam=developerEditTeam; window.developerSaveTeam=developerSaveTeam; window.developerToggleTeam=developerToggleTeam;


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


/* =========================================================
   ORDER ARCHIVE
   ========================================================= */

async function loadDeveloperArchive() {
    const result = await api('/api/developer/archive/settings');
    if (!result._ok) return;
    const s = result.settings || {};
    const days = document.getElementById('archiveDays');
    const method = document.getElementById('archiveMethod');
    const email = document.getElementById('archiveEmail');
    const wa = document.getElementById('archiveWhatsApp');
    if (days) days.value = s.archive_days || 7;
    if (method) method.value = s.archive_method || 'email';
    if (email) email.value = s.archive_email || '';
    if (wa) wa.value = s.archive_whatsapp || '';
    toggleArchiveRecipient();
    await loadDeveloperArchiveHistory();
}

function toggleArchiveRecipient() {
    const method = document.getElementById('archiveMethod')?.value || 'email';
    const email = document.getElementById('archiveEmailWrap');
    const wa = document.getElementById('archiveWhatsAppWrap');
    if (email) email.style.display = method === 'email' ? '' : 'none';
    if (wa) wa.style.display = method === 'whatsapp' ? '' : 'none';
}

async function saveDeveloperArchiveSettings() {
    const result = await api('/api/developer/archive/settings', 'PUT', {
        archive_days: document.getElementById('archiveDays')?.value || 7,
        archive_method: document.getElementById('archiveMethod')?.value || 'email',
        archive_email: document.getElementById('archiveEmail')?.value.trim() || '',
        archive_whatsapp: document.getElementById('archiveWhatsApp')?.value.trim() || ''
    });
    const msg = document.getElementById('archiveMessage');
    if (msg) msg.textContent = result._ok ? 'Archive settings saved.' : (result.error || 'Could not save archive settings.');
    if (result._ok) await loadDeveloperArchiveHistory();
}

async function checkDeveloperArchive() {
    const msg = document.getElementById('archiveMessage');
    if (msg) msg.textContent = 'Checking eligible orders…';
    const result = await api('/api/developer/archive/check', 'POST');
    if (!result._ok) {
        if (msg) msg.textContent = result.error || 'Archive failed.';
        return;
    }
    if (!result.created) {
        if (msg) msg.textContent = result.message || 'No orders are eligible.';
        return;
    }
    if (result.whatsapp_url) {
        if (msg) msg.innerHTML = `Archive #${esc(result.archive.id)} prepared. <a href="${esc(result.whatsapp_url)}" target="_blank" rel="noopener">Open WhatsApp</a> and send the archive message.`;
    } else if (msg) {
        msg.textContent = `Archive #${result.archive.id} sent successfully. Waiting for Admin confirmation.`;
    }
    await loadDeveloperArchiveHistory();
}

async function loadDeveloperArchiveHistory() {
    const box = document.getElementById('developerArchiveHistory');
    if (!box) return;
    const result = await api('/api/developer/archive/history');
    if (!result._ok) { box.textContent = result.error || 'Could not load archive history.'; return; }
    if (!result.archives?.length) { box.innerHTML = '<p class="muted">No archives yet.</p>'; return; }
    box.innerHTML = `<table><thead><tr><th>Archive</th><th>Period</th><th>Orders</th><th>Total</th><th>Method</th><th>Status</th></tr></thead><tbody>` +
        result.archives.map(a => `<tr><td>#${esc(a.id)}</td><td>${esc(a.period_start)} → ${esc(a.period_end)}</td><td>${esc(a.orders)}</td><td>${money(a.total)}</td><td>${esc(a.method)}</td><td>${esc(a.status)}</td></tr>`).join('') +
        '</tbody></table>';
}

window.loadDeveloperArchive = loadDeveloperArchive;
window.toggleArchiveRecipient = toggleArchiveRecipient;
window.saveDeveloperArchiveSettings = saveDeveloperArchiveSettings;
window.checkDeveloperArchive = checkDeveloperArchive;
window.loadDeveloperArchiveHistory = loadDeveloperArchiveHistory;

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('developerArchivePanel')) loadDeveloperArchive();
});
