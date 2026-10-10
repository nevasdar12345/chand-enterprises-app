/* =========================================================
   CHAND ENTERPRISES
   COMMON / CUSTOMER JAVASCRIPT
   ========================================================= */

/* =========================
   HELPERS
   ========================= */

const $ = (selector) => document.querySelector(selector);

const money = (value) => "₹" + Number(value || 0).toFixed(0);

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

async function api(url, method = "GET", body = undefined) {
  try {
    const response = await fetch(url, {
      method,

      headers: {
        "Content-Type": "application/json",
      },

      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    data._ok = response.ok;

    return data;
  } catch (error) {
    console.error("API error:", error);

    return {
      _ok: false,
      error: "Network error",
    };
  }
}

/* =========================
   CUSTOMER STATE
   ========================= */

let CART = JSON.parse(localStorage.getItem("cart") || "{}");

let CAT = "All";

/* Shop filters, sort and wishlist */
let SORT = "featured";
let SIZE = "";
let INSTOCK = false;
let WISH_ONLY = false;
let WISH = new Set();
try {
  WISH = new Set((JSON.parse(localStorage.getItem("wishlist") || "[]") || []).map(Number));
} catch (e) {
  WISH = new Set();
}

let ME = null;

let ORD = {};

/* Remember if login was started from checkout */
let LOGIN_FROM_CHECKOUT = false;

/* Telegram login: mobile being verified + link-polling state */
let LOGIN_MOBILE = "";
let TG_POLL = null;
let TG_BUSY = false;

let DELIVERY_QUOTE = null;

let deferredInstallPrompt = null;

let CFG = {
  whatsapp: "919304285574",

  upi: "chandenterprises@upi",

  business_name: "Chand Enterprises",

  business_mobile: "9304295574",

  business_location: "Darbhanga, Bihar",

  payment_name: "Chand Enterprises",

  offers: [],
  coupons: [],
  categories: [],
  instagram_url: "",
  facebook_url: "",
  brochure_url: "",
  /* Developer switch. The server writes the real value into the page, so there is no flash. */
  show_prices_home: document.getElementById("productData")?.dataset.showPrices !== "false",
  ordering_enabled: document.documentElement.dataset.ordering !== "off",
  customer_login_enabled: document.documentElement.dataset.login !== "off",
};

/* =========================
   OFFERS / TICKER
   ========================= */

const DEFAULT_OFFERS = [
  "🥤 Pepsi 200ml @ ₹12",

  "⚡ Energy Drink 250ml - Buy 2, get ₹20 off",

  "🚰 Premium Water 20L - special bulk rate",

  "🚚 Free delivery above ₹500",

  "🎟️ Use code WELCOME10 - 10% off your first order",

  "🍋 Lemon Soda 750ml - summer special",
];

let OFFERS = [...DEFAULT_OFFERS];

function renderCategories() {
  const wrap = $("#cats");
  if (!wrap) return;
  const cats = Array.isArray(CFG.categories) ? CFG.categories : [];
  wrap.innerHTML = `<button type="button" class="on category-card" onclick="category('All',this)"><span>🛍️</span><b>All</b></button>` + cats.map(c => `<button type="button" class="category-card" onclick="category(${JSON.stringify(c.name)},this)"><span>${esc(c.icon || "🛍️")}</span><b>${esc(c.name)}</b></button>`).join("");
}

function ticker() {
  const track = $("#track");

  if (!track) {
    return;
  }

  const html = OFFERS.map((offer) => `<span>${esc(offer)}</span>`).join("");

  track.innerHTML = html + html;
}

/* =========================
   MODAL
   ========================= */

function modal(html) {
  const element = $("#modal");

  if (!element) {
    return;
  }

  element.innerHTML = `<div class="box">${html}</div>`;

  element.classList.add("open");

  element.onclick = (event) => {
    if (event.target === element) {
      closeModal();
    }
  };
}

function closeModal() {
  const element = $("#modal");

  if (element) {
    element.classList.remove("open");
  }
}

/* =========================
   CART
   ========================= */

/* Saves the cart and updates the cart counter (no product-grid redraw). */
function persistCart() {
  localStorage.setItem("cart", JSON.stringify(CART));

  const count = $("#count");

  if (count) {
    const total = Object.values(CART).reduce((sum, value) => sum + value, 0);

    if (Number(count.textContent) !== total) {
      count.classList.remove("bump");

      void count.offsetWidth;

      count.classList.add("bump");
    }

    count.textContent = total;
    count.dataset.zero = total ? "" : "1";
  }
}

function save(anim = false) {
  persistCart();

  render(anim);
}

function find(id) {
  return (window.PRODUCTS || []).find((product) => product.id == id);
}

/* =========================
   PRODUCT LIST
   ========================= */

function category(categoryName, button) {
  CAT = categoryName;

  document
    .querySelectorAll("#cats button")
    .forEach((item) => item.classList.remove("on"));

  if (button) {
    button.classList.add("on");
  }

  render(true);
}

/* =========================
   PRODUCT ARTWORK
   (clean bottle / can drawings used when a product has no photo)
   ========================= */

function artKind(product) {
  const t = ((product.category || "") + " " + (product.name || "")).toLowerCase();
  if (/water|aqua|nevas|bisleri|kinley/.test(t)) return "water";
  if (/energy|monster|red ?bull|boost/.test(t)) return "energy";
  if (/cola|coke|pepsi|soda|sprite|fanta|thums|drink|juice|limca/.test(t)) return "cola";
  return "other";
}

function artScale(product) {
  const text = (product.size || "") + " " + (product.name || "");
  const m = text.match(/(\d+(?:\.\d+)?)\s*(ml|ltr|l)\b/i);
  if (!m) return 0.9;
  let ml = parseFloat(m[1]);
  if (m[2].toLowerCase() !== "ml") ml *= 1000;
  return 0.74 + 0.26 * Math.min(1, ml / 2000);
}

function cleanName(name) {
  return String(name || "").replace(/[\s\-\u2013\u2014:]+$/, "");
}

function productArt(product) {
  const kind = artKind(product);
  const id = "pa" + String(product.id).replace(/\W/g, "");
  const scale = artScale(product).toFixed(2);
  const brand = esc(
    cleanName(product.name).split(/\s+/)[0].toUpperCase().slice(0, 9),
  );
  const size = esc(product.size || "");
  const brandSize = brand.length > 7 ? 6.6 : brand.length > 5 ? 8.4 : 9.5;

  const label = (fill, ink, y) => `
      <rect x="37" y="${y}" width="46" height="36" fill="${fill}"/>
      <text x="60" y="${y + 16}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="${brandSize}" font-weight="800" fill="${ink}" letter-spacing=".2">${brand}</text>
      <text x="60" y="${y + 28}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="8" font-weight="600" fill="${ink}" opacity=".8">${size}</text>`;

  let body = "";

  if (kind === "water") {
    body = `
      <defs><linearGradient id="${id}" x1="0" x2="1">
        <stop offset="0" stop-color="#4aa8ee"/><stop offset=".45" stop-color="#cdeeff"/><stop offset="1" stop-color="#3f94dc"/>
      </linearGradient></defs>
      <rect x="47" y="8" width="26" height="15" rx="4" fill="#0a5fc4"/>
      <rect x="47" y="13" width="26" height="2" fill="#fff" opacity=".35"/>
      <path d="M51 23h18v9c0 5 14 11 14 23v83c0 6-5 10-10 10H47c-5 0-10-4-10-10V55c0-12 14-18 14-23z" fill="url(#${id})" stroke="#fff" stroke-opacity=".7"/>
      ${label("#ffffff", "#0a5fc4", 76)}
      <path d="M43 58v70" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>`;
  } else if (kind === "cola" || kind === "other") {
    const liquid = kind === "cola" ? ["#7a3b22", "#2a0f06"] : ["#ffb347", "#e8590c"];
    const band = kind === "cola" ? "#e11d2e" : "#0f766e";
    body = `
      <defs><linearGradient id="${id}" x1="0" x2="1">
        <stop offset="0" stop-color="${liquid[0]}"/><stop offset=".5" stop-color="${liquid[1]}"/><stop offset="1" stop-color="${liquid[0]}"/>
      </linearGradient></defs>
      <rect x="49" y="8" width="22" height="14" rx="4" fill="${band}"/>
      <path d="M52 22h16v13c0 7 11 10 15 23 3 10 3 21 3 32 0 14-2 26-2 42 0 8-4 12-10 12H49c-6 0-10-4-10-12 0-16-2-28-2-42 0-11 0-22 3-32 4-13 15-16 15-23z" fill="url(#${id})" stroke="#fff" stroke-opacity=".35"/>
      ${label(band, "#ffffff", 80)}
      <path d="M43 60v62" stroke="#fff" stroke-opacity=".4" stroke-width="3" stroke-linecap="round"/>`;
  } else {
    body = `
      <defs><linearGradient id="${id}" x1="0" x2="1">
        <stop offset="0" stop-color="#0b0b0f"/><stop offset=".5" stop-color="#2b2b36"/><stop offset="1" stop-color="#0b0b0f"/>
      </linearGradient></defs>
      <rect x="36" y="14" width="48" height="128" rx="9" fill="url(#${id})" stroke="#fff" stroke-opacity=".25"/>
      <rect x="40" y="9" width="40" height="9" rx="3" fill="#b9bcc4"/>
      <rect x="36" y="108" width="48" height="5" fill="#ffd21f"/>
      <path d="M62 36 48 72h10l-4 26 18-38H61z" fill="#ffd21f"/>
      <text x="60" y="128" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="800" fill="#fff" letter-spacing=".4">${brand}</text>
      <path d="M42 30v70" stroke="#fff" stroke-opacity=".25" stroke-width="3" stroke-linecap="round"/>`;
  }

  return `<svg class="pa-svg" viewBox="0 0 120 160" role="img" aria-label="${esc(product.name)}">
      <ellipse cx="60" cy="152" rx="${(34 * scale).toFixed(1)}" ry="4" fill="#000" opacity=".16"/>
      <g transform="translate(60 150) scale(${scale}) translate(-60 -150)">${body}</g>
    </svg>`;
}

/* =========================
   PRODUCT CARDS
   ========================= */

/* Product photos go through a free image-resizing service (wsrv.nl) so phones
   download ~640px WebP files instead of the full-size originals.
   Set to false to load the original image links directly. */
const USE_IMAGE_CDN = true;

function imgSrc(url) {
  if (!USE_IMAGE_CDN || !/^https?:\/\//i.test(url)) return url;

  return (
    "https://wsrv.nl/?url=" +
    encodeURIComponent(url) +
    "&w=640&output=webp&q=85"
  );
}

/* The bottle/can drawings are built once per product, then reused. */
const ART_CACHE = new Map();

function productVisual(product) {
  if (product.image_url) {
    const original = product.image_url;

    const src = esc(imgSrc(original));

    /* The first image is a blurred copy that fills the frame; the second is
       the poster itself, shown whole and never cropped. */
    return `<img class="ph-bg" src="${src}" alt="" aria-hidden="true" loading="lazy" decoding="async">` +
      `<img class="ph" src="${src}" alt="${esc(product.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${esc(original)}'">`;
  }

  const key = [product.id, product.name, product.size, product.category].join("|");

  let svg = ART_CACHE.get(key);

  if (!svg) {
    svg = productArt(product);

    ART_CACHE.set(key, svg);
  }

  return svg;
}

function cardHtml(product, index, anim) {
  const quantity = CART[product.id] || 0;
  const soldOut = product.stock < 1;

  const badge = soldOut
    ? `<span class="badge">Out of stock</span>`
    : product.low
      ? `<span class="badge">Only ${product.stock} left</span>`
      : "";

  const action = CFG.ordering_enabled === false
    ? `<button class="primary" onclick="enquiry()">Enquire</button>`
    : soldOut
    ? ""
    : quantity
      ? `<div class="qty"><button aria-label="Remove one" onclick="chg(${product.id}, -1)">−</button><b>${quantity}</b><button aria-label="Add one more" onclick="chg(${product.id}, 1)">+</button></div>`
      : `<button class="primary" aria-label="Add ${esc(cleanName(product.name))} to cart" onclick="chg(${product.id}, 1)">Add</button>`;

  const liked = WISH.has(Number(product.id));

  return `<div class="card${anim ? " pop" : ""}${soldOut ? " oos" : ""}" data-pid="${product.id}" style="--i:${index}">
    ${badge}
    <button type="button" class="wish-btn${liked ? " on" : ""}" aria-pressed="${liked}" aria-label="${liked ? "Remove from" : "Add to"} wishlist" onclick="toggleWish(${product.id})">${liked ? "♥" : "♡"}</button>
    <div class="ic product-image-box kind-${artKind(product)}">${productVisual(product)}</div>
    <div class="p-info">
      <b class="p-name">${esc(cleanName(product.name))}</b>
      <div class="p-sub">
        ${product.size ? `<span class="product-size">${esc(product.size)}</span>` : ""}
        <small>${esc(product.category)}</small>
      </div>
    </div>
    <div class="p-buy">
      ${CFG.show_prices_home === false ? "" : `<div class="price">${money(product.price)}</div>`}
      ${action}
    </div>
  </div>`;
}

function render(anim = false) {
  const grid = $("#grid");

  if (!grid) {
    return;
  }

  const search = $("#search");

  const query = (search?.value || "").toLowerCase();

  const products = window.PRODUCTS || [];

  const list = products.filter(
    (product) =>
      (CAT === "All" || product.category === CAT) &&
      product.name.toLowerCase().includes(query) &&
      (!SIZE || product.size === SIZE) &&
      (!INSTOCK || product.stock > 0) &&
      (!WISH_ONLY || WISH.has(Number(product.id))),
  );

  if (SORT === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (SORT === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (SORT === "name") list.sort((a, b) => cleanName(a.name).localeCompare(cleanName(b.name)));

  grid.innerHTML =
    list.map((product, index) => cardHtml(product, index, anim)).join("") ||
    `
            <p class="muted">
                ${WISH_ONLY ? "Your wishlist is empty. Tap the heart on a product to save it." : "No products found."}
            </p>
        `;
}

/* Redraw only one product card (used when the cart quantity changes). */
function updateCard(id) {
  const grid = $("#grid");

  const element = grid && grid.querySelector(`.card[data-pid="${id}"]`);

  const product = find(id);

  if (!element || !product) {
    return render();
  }

  const index = parseInt(element.style.getPropertyValue("--i"), 10) || 0;

  element.outerHTML = cardHtml(product, index, false);
}

/* =========================
   CHANGE CART
   ========================= */

function orderingPausedModal() {
  return modal(`
    <h2>Ordering is paused</h2>
    <p>Online ordering is not available right now. Please send us your order on WhatsApp.</p>
    <button class="primary" onclick="enquiry()">Order on WhatsApp</button>
    <button onclick="closeModal()">Close</button>
  `);
}

function loginPausedModal() {
  return modal(`
    <h2>Login is paused</h2>
    <p>Customer login is not available right now. Please send us your order on WhatsApp.</p>
    <button class="primary" onclick="enquiry()">Order on WhatsApp</button>
    <button onclick="closeModal()">Close</button>
  `);
}

/* Hide the Login buttons while customer login is paused (logged-in customers keep their session). */
function applyLoginUI() {
  const paused = CFG.customer_login_enabled === false;
  const loggedIn = !!(ME && ME.authenticated);
  const hideLogin = paused && !loggedIn;
  const accountButton = $("#accountBtn");
  const menuAccountButton = $("#menuAccountBtn");
  if (accountButton) accountButton.hidden = hideLogin;
  if (menuAccountButton) menuAccountButton.hidden = hideLogin || loggedIn;
}

function applyOrderingUI() {
  const on = CFG.ordering_enabled !== false;
  document.querySelectorAll(".premium-cart").forEach((el) => { el.hidden = !on; });
  const note = document.getElementById("orderPaused");
  if (note) note.hidden = on;
}

function chg(id, change) {
  if (CFG.ordering_enabled === false) return;
  const product = find(id);

  if (!product) {
    return;
  }

  let quantity = (CART[id] || 0) + change;

  if (quantity > product.stock) {
    quantity = product.stock;
  }

  if (quantity <= 0) {
    delete CART[id];
  } else {
    CART[id] = quantity;
  }

  persistCart();

  updateCard(id);
}

/* =========================
   TOTALS
   ========================= */

function totals(coupon = "") {
  let subtotal = 0;
  for (const id in CART) {
    const product = find(id);
    if (product) subtotal += product.price * CART[id];
  }

  coupon = coupon.trim().toUpperCase();
  const c = (CFG.coupons || []).find(x => x.code === coupon && x.active);
  let discount = 0;
  if (c && subtotal >= Number(c.min_order || 0)) {
    discount = c.discount_type === "fixed"
      ? Number(c.discount_value || 0)
      : subtotal * Number(c.discount_value || 0) / 100;
    if (c.max_discount != null) discount = Math.min(discount, Number(c.max_discount));
    discount = Math.min(discount, subtotal);
  }

  const quote = DELIVERY_QUOTE;
  const fresh = quote && quote.coupon === coupon && Number(quote.subtotal) === Number(subtotal);
  if (fresh && typeof quote.discount === "number") discount = Number(quote.discount || 0);
  const delivery = fresh
    ? Number(quote.delivery_charge || 0)
    : (subtotal - discount >= freeDeliveryAbove() ? 0 : 30);

  return {
    sub: subtotal,
    disc: discount,
    del: delivery,
    distance: fresh ? (quote?.distance_km ?? null) : null,
    total: Math.max(0, subtotal - discount + delivery)
  };
}

async function refreshDeliveryQuote() {
  const subtotal = Object.entries(CART).reduce((sum, [id, qty]) => {
    const p = find(id);
    return sum + (p ? p.price * qty : 0);
  }, 0);
  const coupon = ($('#cc')?.value || '').trim().toUpperCase();
  if (!subtotal) { DELIVERY_QUOTE = null; return; }
  const loc = typeof LocPicker !== 'undefined' ? LocPicker.get() : {};
  const result = await api('/api/delivery/quote', 'POST', {
    subtotal, coupon, latitude: loc.latitude, longitude: loc.longitude
  });
  if (result?._ok) {
    DELIVERY_QUOTE = Object.assign(result, {coupon});
  } else if (result?.error) {
    DELIVERY_QUOTE = null;
  }
  const total = totals(coupon);
  const el = $('#ctot');
  if (el) el.textContent = money(total.total);
  const cm = $('#couponMsg');
  if (cm) {
    if (!coupon) { cm.textContent = ''; }
    else {
      const ok = result?.coupon_ok;
      cm.textContent = (ok ? '✅ ' : '❌ ') + (result?.coupon_message || (ok ? 'Coupon applied' : 'Invalid or inactive coupon'));
      cm.style.color = ok ? '#0a7a3b' : '#c0392b';
    }
  }
  const info = $('#deliveryInfo');
  if (info) info.textContent = total.distance != null
    ? `Delivery: ${total.del ? money(total.del) : 'Free'} · ${total.distance} km`
    : `Delivery: ${total.del ? money(total.del) : 'Free'}`;
}


/* =========================
   CART MODAL
   ========================= */

function cartHtml() {
  const ids = Object.keys(CART).filter((id) => find(id));

  if (!ids.length) {
    return `
      <div class="cc-empty">
        <div class="big">🛒</div>
        <h2>Your cart is empty</h2>
        <p class="muted">Add some cold drinks or water to get started.</p>
        <button class="primary" onclick="closeModal()">Browse products</button>
      </div>`;
  }

  const total = totals();

  return `
    <div class="cc-head">
      <h2>Your cart</h2>
      <button class="cc-x" aria-label="Close" onclick="closeModal()">✕</button>
    </div>

    <div class="cc-steps">
      <span class="on"><i>1</i>Cart</span><hr><span><i>2</i>Details</span><hr><span><i>3</i>Pay</span>
    </div>

    ${ids
      .map((id, n) => {
        const product = find(id);
        return `
        <div class="cc-item" style="--i:${n}">
          <div class="cc-ic">${esc(product.icon || "🥤")}</div>
          <div class="cc-info">
            <b>${esc(cleanName(product.name))}</b>
            <small>${product.size ? esc(product.size) + " · " : ""}${money(product.price)} each</small>
            <div class="cc-step">
              <button onclick="cartChg(${product.id}, -1)" aria-label="Remove one">−</button>
              <b>${CART[id]}</b>
              <button onclick="cartChg(${product.id}, 1)" aria-label="Add one more">+</button>
            </div>
          </div>
          <div class="cc-price">${money(product.price * CART[id])}</div>
        </div>`;
      })
      .join("")}

    ${freeDeliveryProgress(total)}

    <div class="cc-sum">
      <div class="row"><span>Delivery</span><span>${total.del ? money(total.del) : "Free"}</span></div>
      <div class="row cc-total"><b>Subtotal</b><b>${money(total.sub)}</b></div>
      <small class="muted">${couponHint()}</small>
    </div>

    <div class="cc-foot">
      <button class="primary cc-cta" onclick="checkout()">Checkout →</button>
    </div>`;
}

function cart() {
  if (CFG.ordering_enabled === false) return orderingPausedModal();
  modal(cartHtml());
}

/* +/- inside the cart popup: updates in place (no pop-in replay) */
function cartChg(id, change) {
  chg(id, change);
  const box = $("#modal .box");
  if (!box) return;
  if (!Object.keys(CART).length) return cart();
  box.innerHTML = cartHtml();
  box.querySelectorAll(".cc-item").forEach((el) => (el.style.animation = "none"));
}

/* =========================
   CHECKOUT
   ========================= */

async function checkout() {
  if (CFG.ordering_enabled === false) return orderingPausedModal();
  if (!navigator.onLine) return showMessage("You're offline. Please check your internet connection to place an order.");
  if (!ME) {
    ME = await api("/api/me");
  }

  // pick up coupons the admin created after this page was opened
  // (runs in the background so checkout opens immediately;
  //  the server still checks the coupon and delivery charge)
  refreshConfig().catch(() => {});

  if (!ME.authenticated || ME.role !== "customer") {
    LOGIN_FROM_CHECKOUT = true;

    return account("Login to place your order");
  }

  modal(`
        <div class="cc-head">
          <h2>Checkout</h2>
          <button class="cc-x" aria-label="Close" onclick="closeModal()">✕</button>
        </div>

        <div class="cc-steps">
          <span class="ok"><i>✓</i>Cart</span><hr class="on"><span class="on"><i>2</i>Details</span><hr><span><i>3</i>Pay</span>
        </div>

        <div class="cc-sec" style="--i:0">
          <h4>Your details</h4>
          <label>
            Name
            <input id="cn" value="${esc(ME.name === "Customer" ? "" : ME.name)}">
          </label>
          <label>
            Delivery address
            <textarea id="ca" rows="3">${esc(ME.address || "")}</textarea>
          </label>
        </div>

        <div class="cc-sec" style="--i:1">
          <h4>Delivery location</h4>
          ${LocPicker.html()}
          <div id="deliveryInfo" class="muted">Delivery charge will be calculated from your location.</div>
        </div>

        <div class="cc-sec" style="--i:2">
          <h4>Payment</h4>
          <div class="cc-pay">
            <label><input type="radio" name="cpm" value="COD" checked onchange="$('#cp').value=this.value"><span>💵</span><b>Cash on delivery</b></label>
            <label><input type="radio" name="cpm" value="QR" onchange="$('#cp').value=this.value"><span>📱</span><b>Pay by QR (UPI)</b></label>
          </div>
          <input type="hidden" id="cp" value="COD">
          <label style="margin-top:12px">
            Coupon (optional)
            <input id="cc" oninput="cTot()" autocapitalize="characters" autocomplete="off">
          </label>
          <div id="couponMsg" class="muted" style="margin:-4px 0 0;font-size:.9rem"></div>
        </div>

        <div class="row cc-total" style="font-size:1.15rem"><b>Total</b><b id="ctot"></b></div>

        <p class="err" id="cerr"></p>

        <div class="cc-foot">
          <button onclick="cart()">← Back</button>
          <button class="primary cc-cta" id="placeBtn" onclick="placeOrder()">Place order</button>
        </div>
    `);

  LocPicker.mount();
  DELIVERY_QUOTE = null;
  window.onlocationchange = refreshDeliveryQuote;
  cTot();
  refreshDeliveryQuote();
}

function cTot() {
  const element = $("#ctot");

  if (!element) {
    return;
  }

  element.textContent = money(totals($("#cc")?.value || "").total);
  clearTimeout(window.__quoteTimer);
  window.__quoteTimer = setTimeout(refreshDeliveryQuote, 350);
}

/* =========================
   PLACE ORDER
   ========================= */

async function placeOrder() {
  const btn = $("#placeBtn");
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="cc-spin"></span>Placing order…';
  }
  const items = Object.entries(CART).map(([id, quantity]) => ({
    id: Number(id),
    qty: quantity,
  }));

  const result = await api("/api/orders", "POST", {
    name: $("#cn").value,

    address: $("#ca").value,

    ...LocPicker.get(),

    coupon: $("#cc").value,

    payment_method: $("#cp").value,

    items,
  });

  if (!result._ok) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Place order";
    }
    return ($("#cerr").textContent = result.error || "Could not place order");
  }

  CART = {};

  localStorage.setItem("cart", "{}");

  save();

  // refresh the stock numbers in the background - the customer
  // sees their order confirmation straight away
  api("/api/products").then((products) => {
    if (!Array.isArray(products)) {
      return;
    }

    products.forEach((product) => {
      const current = find(product.id);

      if (current) {
        Object.assign(current, product);
      }
    });

    render();
  });

  ORD[result.order_id] = {
    upi_url: result.upi_url,
  };

  if (result.payment_method === "QR") {
    payQR(result.order_id, result.total);
  } else {
    done(result);
  }
}

/* =========================
   QR PAYMENT
   ========================= */

function payQR(code, total) {
  const order = ORD[code] || {};

  modal(`
        <div class="qrbox">

            <h2>Scan &amp; pay</h2>

            <div class="amt">${money(total)}</div>

            <small>
                The amount is already filled
                in the QR. Open GPay, PhonePe,
                Paytm or any UPI app and scan.
            </small>

            <div class="qrwrap">
                <img
                    src="/api/orders/${encodeURIComponent(code)}/qr.svg?t=${Date.now()}"
                    alt="UPI QR for ${money(total)}"
                >
            </div>

            <p>
                <small>Paying to</small>
                <b>${esc(CFG.upi)}</b>
            </p>

            ${
              order.upi_url
                ? `
                    <a class="add upilink" href="${esc(order.upi_url)}">
                        📱 Pay with UPI app
                        (on phone)
                    </a>
                `
                : ""
            }

            <label>
                UPI reference / UTR
                (after paying)
                <input id="utr" inputmode="numeric" placeholder="12-digit reference">
            </label>

            <p class="err" id="uerr"></p>

            <button class="primary" onclick="paid('${esc(code)}')">
                I have paid
                ${money(total)}
            </button>

            <button onclick="done({order_id: '${esc(code)}', pay_later: 1})">
                Pay later
            </button>

        </div>
    `);
}

async function paid(code) {
  const result = await api(`/api/orders/${code}/paid`, "POST", {
    utr: $("#utr").value,
  });

  if (!result._ok) {
    return ($("#uerr").textContent =
      result.error || "Could not confirm payment");
  }

  done({
    order_id: code,
    verifying: 1,
  });
}

/* =========================
   ORDER COMPLETE
   ========================= */

function confetti() {
  const colors = ["#0a7cff", "#12a150", "#ffb300", "#ff5470", "#2fd0b5"];
  return `<div class="cc-conf">${Array.from({ length: 28 }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${colors[i % 5]};animation-delay:${(Math.random() * 0.5).toFixed(2)}s"></i>`
  ).join("")}</div>`;
}

async function done(result) {
  modal(`
        <div class="cc-done">
        ${confetti()}
        <svg class="tick" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="24" fill="none" stroke="#12a150" stroke-width="3"/>
            <path d="M14 27l8 8 16-16" fill="none" stroke="#12a150" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>

        <h2 style="text-align:center">Order placed</h2>

        <p>
            Order ID:
            <b>${esc(result.order_id)}</b>
        </p>

        ${
          result.verifying
            ? `<p>Payment is being verified by our team.</p>`
            : result.pay_later
              ? `<p>Please complete the payment from My Orders.</p>`
              : ""
        }

        <p class="muted">We will confirm your delivery shortly.</p>

        <span id="waSlot"></span>

        <button class="add" onclick="bill('${esc(result.order_id)}')">View bill</button>
        <button onclick="closeModal()">Close</button>
        </div>
    `);

  // The confirmation is already on screen; the WhatsApp button appears
  // as soon as its link is ready.
  api(`/api/orders/${result.order_id}/whatsapp`).then((whatsapp) => {
    const slot = $("#waSlot");

    if (slot && whatsapp.whatsapp_url) {
      slot.innerHTML = `<a class="primary" target="_blank" rel="noopener" href="${esc(whatsapp.whatsapp_url)}">Send order on WhatsApp</a>`;
    }
  });
}

/* =========================
   BILL
   ========================= */

async function bill(code) {
  const list = await api("/api/my-orders");

  if (Array.isArray(list)) {
    list.forEach((order) => {
      ORD[order.code] = Object.assign(ORD[order.code] || {}, order);
    });
  }

  const order = ORD[code];

  if (!order || !order.lines) {
    return alert("Bill not available");
  }

  const status =
    order.status === "Cancelled"
      ? ["CANCELLED", ""]
      : order.payment_status === "Paid"
        ? ["PAID", "ok"]
        : order.payment_status === "Verifying"
          ? ["PAYMENT BEING VERIFIED", ""]
          : ["PAYMENT PENDING", ""];

  modal(`
        <div class="bill">

            <div class="billhead">
                <b>${esc(CFG.business_name || "Chand Enterprises")}</b>
                <small>
                    ${esc(CFG.business_location || "Darbhanga, Bihar")}
                    · Bill
                </small>
            </div>

            <div class="row"><span>Order</span><b>${esc(order.code)}</b></div>

            <div class="row"><span>Date</span><span>${esc(order.created)}</span></div>

            <div class="row"><span>Customer</span><span>${esc(order.customer)}</span></div>

            <div class="row"><span>Mobile</span><span>${esc(order.mobile)}</span></div>

            <div class="row">
                <span>Address</span>
                <span>
                    ${esc(order.address)}
                    ${order.map_url ? `<br><a class="loc-map-link" target="_blank" rel="noopener" href="${esc(order.map_url)}">📍 View on map</a>` : ""}
                </span>
            </div>

            <hr>

            ${order.lines
              .map(
                (item) => `
                            <div class="row">
                                <span>
                                    ${esc(item.name)}
                                    ${item.size ? `(${esc(item.size)})` : ""}
                                    × ${item.qty}
                                </span>
                                <b>${money(item.total)}</b>
                            </div>
                        `,
              )
              .join("")}

            <hr>

            <div class="row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>

            <div class="row"><span>Discount</span><span>${money(order.discount)}</span></div>

            <div class="row">
                <span>Delivery</span>
                <span>${order.delivery_charge ? money(order.delivery_charge) : "Free"}</span>
            </div>

            <div class="row total"><b>Total</b><b>${money(order.total)}</b></div>

            <div class="billstatus ${status[1]}">${status[0]}</div>

            <button class="primary" onclick="window.print()">Print bill</button>
            <button onclick="closeModal()">Close</button>

        </div>
    `);
}

/* =========================
   CUSTOMER LOGIN
   ========================= */

async function account(message = "") {
  if (CFG.customer_login_enabled === false) return loginPausedModal();
  modal(`
        <h2>Customer Login</h2>

        ${message ? `<p class="muted">${esc(message)}</p>` : ""}

        <label>
            Mobile number
            <input id="lm" maxlength="10" inputmode="numeric" placeholder="10-digit mobile number">
        </label>

        <p class="err" id="lerr"></p>

        <button class="primary" onclick="sendOTP()">Continue</button>
        <button onclick="closeModal()">Close</button>
    `);
}

async function sendOTP() {
  const mobile = $("#lm").value.trim();

  const result = await api("/api/login", "POST", {
    role: "customer",
    mobile,
  });

  if (!result._ok) {
    if (result.login_paused) {
      CFG.customer_login_enabled = false;
      applyLoginUI();
      return loginPausedModal();
    }
    return ($("#lerr").textContent = result.error || "Could not send OTP");
  }

  LOGIN_MOBILE = mobile;

  if (result.needs_link) return telegramLinkModal(mobile, result);

  otpModal(mobile, result);
}

function otpModal(mobile, result) {
  const where =
    result.channel === "telegram"
      ? "Login code sent to your <b>Telegram</b>"
      : `OTP sent to <b>${esc(mobile)}</b>`;

  modal(`
        <h2>Verify OTP</h2>

        <p>${where}</p>

        ${
          result.dev_otp
            ? `<p class="muted">Demo OTP: <b>${esc(result.dev_otp)}</b></p>`
            : ""
        }

        <label>
            Enter OTP
            <input id="otp" maxlength="4" inputmode="numeric" autofocus>
        </label>

        <p class="err" id="oerr"></p>

        <button class="primary" onclick="verifyOTP()">Verify</button>
        <button onclick="resendOTP()">Resend OTP</button>
    `);
}

/* One-time Telegram connection (first login only) */
function telegramLinkModal(mobile, result) {
  modal(`
        <h2>Connect Telegram</h2>

        <p>We send your login code on Telegram. One-time setup for <b>${esc(mobile)}</b>:</p>

        <ol class="muted" style="text-align:left;margin:8px 0 14px 18px">
            <li>Tap <b>Open Telegram</b> and press <b>Start</b></li>
            <li>Tap <b>Share my number</b></li>
        </ol>

        <a class="primary" target="_blank" rel="noopener" href="${esc(result.link)}">✈️ Open Telegram</a>

        <p class="muted" id="tgWait">Waiting for you to press Start…</p>
        <p class="err" id="oerr"></p>

        <button onclick="tgCheckLink('${esc(mobile)}','${esc(result.token)}')">I have pressed Start</button>
        <button onclick="closeModal()">Cancel</button>
    `);

  clearInterval(TG_POLL);
  const started = Date.now();
  TG_POLL = setInterval(() => {
    if (!$("#tgWait") || Date.now() - started > 10 * 60 * 1000) {
      return clearInterval(TG_POLL);
    }
    tgCheckLink(mobile, result.token);
  }, 3000);
}

async function tgCheckLink(mobile, token) {
  if (TG_BUSY || !$("#tgWait")) return;
  TG_BUSY = true;

  try {
    const status = await api(
      "/api/telegram/link-status?token=" + encodeURIComponent(token) + "&_=" + Date.now(),
    );
    if (!status._ok || !status.linked) return;

    const sent = await api("/api/otp/resend", "POST");
    if (!sent._ok) {
      clearInterval(TG_POLL);
      const err = $("#oerr");
      if (err) err.textContent = (sent.error || "Could not send the code.") + " Tap “I have pressed Start” to retry.";
      return;
    }

    clearInterval(TG_POLL);
    if (sent.needs_link) return telegramLinkModal(mobile, sent);
    otpModal(mobile, sent);
  } finally {
    TG_BUSY = false;
  }
}

async function resendOTP() {
  const result = await api("/api/otp/resend", "POST");
  const err = $("#oerr");

  if (!result._ok) {
    return (err.textContent = result.error || "Could not resend OTP");
  }

  if (result.needs_link) return telegramLinkModal(LOGIN_MOBILE, result);

  err.textContent = result.dev_otp ? "Demo OTP: " + result.dev_otp : "New code sent.";
}

async function verifyOTP() {
  const result = await api("/api/verify-otp", "POST", {
    otp: $("#otp").value.trim(),
  });

  if (!result._ok) {
    return ($("#oerr").textContent = result.error || "Incorrect OTP");
  }

  ME = {
    authenticated: true,

    role: "customer",

    name: result.user.name,

    mobile: result.user.mobile,
  };

  await refreshMe();


  if (LOGIN_FROM_CHECKOUT) {
    LOGIN_FROM_CHECKOUT = false;

    return checkout();
  }


  closeModal();
}

async function refreshMe() {
  ME = await api("/api/me");

  const accountButton = $("#accountBtn");
  const logoutButton = $("#logoutBtn");

  // Hamburger menu auth controls
  const menuAccountButton = $("#menuAccountBtn");
  const menuLogoutButton = $("#menuLogoutBtn");

  if (ME && ME.authenticated) {
    if (accountButton) {
      accountButton.textContent = `Hi, ${ME.name || "Customer"}`;
    }

    if (logoutButton) {
      logoutButton.hidden = false;
    }

    // Logged in: show Logout, hide Login in hamburger menu
    if (menuAccountButton) {
      menuAccountButton.hidden = true;
    }

    if (menuLogoutButton) {
      menuLogoutButton.hidden = false;
    }
  } else {
    if (accountButton) {
      accountButton.textContent = "Login";
    }

    if (logoutButton) {
      logoutButton.hidden = true;
    }

    // Logged out: show Login, hide Logout in hamburger menu
    if (menuAccountButton) {
      menuAccountButton.hidden = false;
    }

    if (menuLogoutButton) {
      menuLogoutButton.hidden = true;
    }
  }

  applyLoginUI();
}

/* =========================
   CUSTOMER PROFILE
   ========================= */

function profile() {
  if (!ME || !ME.authenticated) {
    return account();
  }

  modal(`
        <h2>My Profile</h2>

        <label>
            Name
            <input id="pn" value="${esc(ME.name || "")}">
        </label>

        <label>
            Mobile
            <input value="${esc(ME.mobile || "")}" disabled>
        </label>

        <label>
            Address
            <textarea id="pa" rows="3">${esc(ME.address || "")}</textarea>
        </label>

        <label>
            Landmark
            <input id="pl" value="${esc(ME.landmark || "")}">
        </label>

        <p class="err" id="perr"></p>

        <button class="primary" onclick="saveProfile()">Save</button>
        <button onclick="closeModal()">Close</button>
    `);
}

async function saveProfile() {
  const result = await api("/api/profile", "PUT", {
    name: $("#pn").value,

    address: $("#pa").value,

    landmark: $("#pl").value,
  });

  if (!result._ok) {
    return ($("#perr").textContent = result.error || "Could not save profile");
  }

  ME = await api("/api/me");

  closeModal();

  refreshMe();
}

/* =========================
   MY ORDERS
   ========================= */

async function orders() {
  if (!ME || !ME.authenticated) {
    ME = await api("/api/me");
  }

  if (!ME.authenticated) {
    return account("Login to see your orders");
  }

  const rows = await api("/api/my-orders");

  if (!Array.isArray(rows)) {
    return alert(rows.error || "Could not load orders");
  }

  rows.forEach((order) => {
    ORD[order.code] = Object.assign(ORD[order.code] || {}, order);
  });

  modal(`
        <h2>My Orders</h2>

        ${
          rows.length
            ? rows
                .map(
                  (order) => `
                        <div class="ordercard">

                            <div class="row">
                                <b>${esc(order.code)}</b>
                                <span>${esc(order.status)}</span>
                            </div>

                            <div class="row">
                                <span>${esc(order.created)}</span>
                                <b>${money(order.total)}</b>
                            </div>

                            <small>${order.items.map(esc).join(" · ")}</small>

                            <br>

                            <button class="add" onclick="bill('${esc(order.code)}')">View bill</button>

                            <button onclick="reorder('${esc(order.code)}')">🔄 Reorder</button>

                            ${
                              order.payment_method === "QR" &&
                              order.payment_status !== "Paid" &&
                              order.status !== "Cancelled"
                                ? `
                                    <button class="primary" onclick="payQR('${esc(order.code)}', ${order.total})">
                                        Pay ${money(order.total)}
                                    </button>
                                `
                                : ""
                            }

                            ${
                              order.status === "Confirmed"
                                ? `
                                    <button onclick="cancelMyOrder('${esc(order.code)}')">Cancel</button>
                                `
                                : ""
                            }

                        </div>
                    `,
                )
                .join("")
            : `<p class="muted">No orders yet.</p>`
        }

        <button onclick="closeModal()">Close</button>
    `);
}

async function cancelMyOrder(code) {
  const result = await api(`/api/orders/${code}/cancel`, "POST");

  if (!result._ok) {
    return alert(result.error || "Could not cancel order");
  }

  orders();
}

/* =========================
   ENQUIRY
   ========================= */

async function enquiry() {
  modal(`
        <h2>Contact us</h2>

        <label>
            Name
            <input id="en">
        </label>

        <label>
            Mobile
            <input id="em" maxlength="10" inputmode="numeric">
        </label>

        <label>
            Message
            <textarea id="et" rows="4"></textarea>
        </label>

        <p class="err" id="eerr"></p>

        <button class="primary" onclick="sendEnquiry()">Send enquiry</button>
        <button onclick="closeModal()">Close</button>
    `);
}

async function sendEnquiry() {
  const result = await api("/api/enquiry", "POST", {
    name: $("#en").value,

    mobile: $("#em").value,

    message: $("#et").value,
  });

  if (!result._ok) {
    return ($("#eerr").textContent = result.error || "Could not send enquiry");
  }

  if (result.whatsapp_url) {
    window.open(result.whatsapp_url, "_blank", "noopener");
  }

  closeModal();
}

/* =========================
   WHATSAPP
   ========================= */

async function whatsappMessage() {
  modal(`
        <h2>WhatsApp</h2>

        <label>
            Message
            <textarea id="wm" rows="5" placeholder="Type your message..."></textarea>
        </label>

        <p class="err" id="werr"></p>

        <button class="primary" onclick="sendWhatsAppMessage()">Open WhatsApp</button>
        <button onclick="closeModal()">Close</button>
    `);
}

async function sendWhatsAppMessage() {
  const result = await api("/api/whatsapp/message", "POST", {
    message: $("#wm").value,
  });

  if (!result._ok) {
    return ($("#werr").textContent =
      result.error || "Could not create WhatsApp link");
  }

  if (result.whatsapp_url) {
    window.open(result.whatsapp_url, "_blank", "noopener");
  }
}

/* =========================
   SEARCH
   ========================= */

function search() {
  render(true);
}

/* =========================
   NAVIGATION
   ========================= */

function home() {
  closeModal();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

function scrollToProducts() {
  closeModal();

  const grid = $("#grid");

  if (grid) {
    grid.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

function scrollToEnquiry() {
  closeModal();

  const enquirySection = $("#enquiry");

  if (enquirySection) {
    enquirySection.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

/* =========================
   LOGOUT
   ========================= */

async function logout() {
  await api("/logout", "POST");

  location.href = "/";
}

/* =========================
   LOAD PRODUCTS
   ========================= */

async function refreshProducts() {
  const products = await api("/api/products");

  if (!Array.isArray(products)) {
    return false;
  }

  window.PRODUCTS = products;

  render();
  heroArt();

  return true;
}

/* Hero pictures: use the shop's own product photos instead of emoji. */
function heroArt() {
  const main = $("#heroMain");
  const side = $("#heroSide");

  if (!main || !side) {
    return;
  }

  const list = window.PRODUCTS || [];
  const withPhoto = list.filter((product) => product.image_url);
  const pool = withPhoto.length ? withPhoto : list;

  if (!pool.length) {
    return;
  }

  /* second picture: a different product name (e.g. water next to cola) */
  const first = pool[0];
  const second =
    pool.find((product) => cleanName(product.name) !== cleanName(first.name)) ||
    pool[1] ||
    first;

  const fill = (box, product) => {
    box.innerHTML = product.image_url
      ? `<img src="${esc(imgSrc(product.image_url))}" alt="${esc(product.name)}" decoding="async" onerror="this.onerror=null;this.src='${esc(product.image_url)}'">`
      : productVisual(product);

    box.classList.toggle("has-photo", Boolean(product.image_url));
  };

  fill(main, first);
  fill(side, second);
}

/* =========================
   CONFIG
   ========================= */

async function refreshConfig() {
  const result = await api("/api/config");

  if (!result || result._ok === false) {
    return;
  }

  const priceWas = CFG.show_prices_home;
  const orderWas = CFG.ordering_enabled;

  CFG = Object.assign(CFG, result);

  if (Array.isArray(result.offers)) {
    OFFERS = result.offers;
  }

  ticker();

  applyOrderingUI();

  applyLoginUI();

  if (priceWas !== CFG.show_prices_home || orderWas !== CFG.ordering_enabled) render();

  updateBusinessUI();

  return CFG;
}

/* =========================
   BUSINESS INFORMATION
   ========================= */

function updateBusinessUI() {
  const name = CFG.business_name || "Chand Enterprises";

  const location = CFG.business_location || "Darbhanga, Bihar";

  document.querySelectorAll("[data-business-name]").forEach((element) => {
    element.textContent = name;
  });

  document.querySelectorAll("[data-business-location]").forEach((element) => {
    element.textContent = location;
  });

  document.querySelectorAll("[data-business-mobile]").forEach((element) => {
    element.textContent = CFG.business_mobile || "";
  });

  document.querySelectorAll("[data-business-whatsapp]").forEach((element) => {
    element.textContent = CFG.whatsapp || "";
  });

  renderCategories();
  /* Social links are now rendered by the server (footer + About page) from the developer list. */
}

/* =========================
   BUSINESS LOADER
   ========================= */

async function loadBusinessUI() {
  await refreshConfig();

  updateBusinessUI();
}

/* =========================
   SAFE LOADERS
   ========================= */

async function safeLoadProducts() {
  return refreshProducts();
}

async function safeLoadOrders() {
  const rows = await api("/api/my-orders");

  if (!Array.isArray(rows)) {
    return false;
  }

  rows.forEach((order) => {
    ORD[order.code] = Object.assign(ORD[order.code] || {}, order);
  });

  return true;
}

/* =========================
   NUMBER / MESSAGE HELPERS
   ========================= */

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function showMessage(message) {
  modal(`
        <h2>Message</h2>

        <p>${esc(message)}</p>

        <button class="primary" onclick="closeModal()">OK</button>
    `);
}

/* =========================
   COMPATIBILITY HELPERS
   ========================= */

function openAccount() {
  return account();
}

function openOrders() {
  return orders();
}

function openProfile() {
  return profile();
}

function openCart() {
  return cart();
}

function openCheckout() {
  return checkout();
}

function openEnquiry() {
  return enquiry();
}

function openWhatsApp() {
  return whatsappMessage();
}


window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const btn = document.getElementById("installApp");
  if (btn) btn.hidden = false;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById("installApp");
  if (btn) btn.hidden = true;
});

async function installApp() {
  // Chrome/Edge: use the native PWA install prompt when available.
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    const btn = document.getElementById("installApp");
    if (btn) btn.hidden = true;
    return;
  }

  // If the app is already running as an installed PWA, there is nothing to install.
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) return;

  // Some browsers do not expose beforeinstallprompt. Give the user a useful fallback.
  alert("To install Chand Enterprises, use your browser menu and choose 'Install app' or 'Add to Home screen'.");
}

window.installApp = installApp;

/* =========================
   INITIALIZATION
   ========================= */

document.addEventListener("DOMContentLoaded", async () => {
  /* Customer/storefront */

  if ($("#grid")) {
    const searchInput = $("#search");
    if (searchInput) {
      let searchTimer;
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => render(true), 180);
      });
    }
    const heroEm = document.querySelector(".premium-hero h1 em");
    if (heroEm) {
      const words = ["delivered to your door.", "ready for your order.", "freshly delivered."];
      let wi = 0;
      setInterval(() => { wi = (wi + 1) % words.length; heroEm.animate([{opacity:.25},{opacity:1}], {duration:300}); heroEm.textContent = words[wi]; }, 3500);
    }
    save(true);

    initShopTools();
    initNetworkStatus();

    ticker();

    // The page already contains the product list, so draw it straight away
    // instead of waiting for another /api/products round trip.
    const haveProducts = Array.isArray(window.PRODUCTS) && window.PRODUCTS.length > 0;
    if (haveProducts) {
      render();
      heroArt();
    }
    await Promise.all([refreshMe(), refreshConfig(), haveProducts ? Promise.resolve() : refreshProducts()]);
    populateSizes();
  }

  /* Other public pages that share the header (e.g. brochure): wire up
     login state, cart count and business settings. */
  if (!$("#grid") && $("#ceMobileMenu")) {
    persistCart();

    // brochure already ships the product list inside the page
    const haveProducts = Array.isArray(window.PRODUCTS) && window.PRODUCTS.length > 0;
    await Promise.all([refreshMe(), refreshConfig(), haveProducts ? Promise.resolve() : refreshProducts()]);
  }

  /*
   * IMPORTANT:
   * Admin, delivery and developer
   * are now handled by their own
   * JavaScript files.
   */
});

/* =========================================================
   EXTRA STOREFRONT FEATURES
   free-delivery progress · wishlist · sort & filters · reorder
   online status · function / bulk quote (sent to WhatsApp)
   ========================================================= */

/* ---------- free delivery + coupon hint (cart) ---------- */

function freeDeliveryAbove() {
  const n = Number(CFG.free_delivery_above);
  return Number.isFinite(n) ? n : 500;
}

function freeDeliveryProgress(t) {
  const above = freeDeliveryAbove();
  if (above <= 0) return "";

  const amount = t.sub - t.disc;

  if (amount >= above) {
    return `<div class="fd-progress done">🎉 You get FREE delivery on this order!</div>`;
  }

  const left = Math.ceil(above - amount);
  const pct = Math.max(0, Math.min(100, Math.round((amount / above) * 100)));

  return `<div class="fd-progress">
    <span>🚚 Add ${money(left)} more for FREE delivery!</span>
    <div class="fd-bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

function couponHint() {
  const above = freeDeliveryAbove();
  const codes = (CFG.coupons || []).filter((c) => c.active).map((c) => c.code);
  const parts = [];

  if (above > 0) parts.push(`Free delivery above ${money(above)}`);
  if (codes.length) parts.push(`coupons: ${codes.map(esc).join(", ")}`);

  return parts.join(" · ");
}

/* ---------- wishlist ---------- */

function updateWishUI() {
  const el = $("#wishCount");
  if (el) el.textContent = WISH.size ? `(${WISH.size})` : "";
}

function toggleWish(id) {
  id = Number(id);

  if (WISH.has(id)) WISH.delete(id);
  else WISH.add(id);

  try {
    localStorage.setItem("wishlist", JSON.stringify([...WISH]));
  } catch (e) {
    /* private mode: wishlist just lasts for this visit */
  }

  updateWishUI();

  if (WISH_ONLY) return render();

  updateCard(id);
}

/* ---------- sort & filters ---------- */

function sizeValue(label) {
  const m = String(label).trim().toLowerCase().match(/([\d.]+)\s*(ml|ltr|litre|liter|l|kg|g)?/);
  if (!m) return Infinity;
  let n = parseFloat(m[1]);
  if (["l", "ltr", "litre", "liter", "kg"].includes(m[2])) n *= 1000;
  return n;
}

function populateSizes() {
  const select = $("#sizeFilter");
  if (!select) return;

  const sizes = [...new Set((window.PRODUCTS || []).map((p) => p.size).filter(Boolean))]
    .sort((a, b) => sizeValue(a) - sizeValue(b));

  if (!sizes.includes(SIZE)) SIZE = "";

  select.innerHTML =
    `<option value="">All sizes</option>` +
    sizes.map((z) => `<option value="${esc(z)}">${esc(z)}</option>`).join("");

  select.value = SIZE;
}

function initShopTools() {
  const sort = $("#sortBy");
  const size = $("#sizeFilter");
  const stock = $("#inStockOnly");
  const wish = $("#wishFilter");

  if (sort) sort.addEventListener("change", () => { SORT = sort.value; render(true); });
  if (size) size.addEventListener("change", () => { SIZE = size.value; render(true); });
  if (stock) stock.addEventListener("change", () => { INSTOCK = stock.checked; render(true); });

  if (wish) {
    wish.addEventListener("click", () => {
      WISH_ONLY = !WISH_ONLY;
      wish.classList.toggle("on", WISH_ONLY);
      wish.setAttribute("aria-pressed", String(WISH_ONLY));
      render(true);
    });
  }

  populateSizes();
  updateWishUI();
}

/* ---------- reorder ---------- */

function reorder(code) {
  if (CFG.ordering_enabled === false) return orderingPausedModal();

  const lines = (ORD[code] && ORD[code].lines) || [];

  if (!lines.length) return showMessage("Could not find the items of this order.");

  const all = window.PRODUCTS || [];
  let added = 0;
  const notes = [];

  lines.forEach((line) => {
    const label = `${line.name}${line.size ? " (" + line.size + ")" : ""}`;

    let product = line.product_id != null ? find(line.product_id) : null;

    if (!product) {
      product = all.find((p) => p.name === line.name && p.size === line.size);
    }

    if (!product || product.stock < 1) {
      notes.push(`${label}: not available right now`);
      return;
    }

    const current = CART[product.id] || 0;
    const qty = Math.min(current + line.qty, product.stock);

    if (qty - current < line.qty) {
      notes.push(`${label}: only ${product.stock} in stock`);
    }

    if (qty > current) {
      CART[product.id] = qty;
      added++;
    }
  });

  persistCart();
  render();

  modal(`
    <h2>Reorder</h2>
    <p>${added ? `${added} item${added === 1 ? "" : "s"} added to your cart.` : "None of these items could be added."}</p>
    ${notes.length ? `<p class="muted">${notes.map(esc).join("<br>")}</p>` : ""}
    ${added ? `<button class="primary" onclick="cart()">View cart</button>` : ""}
    <button onclick="closeModal()">Close</button>
  `);
}

/* ---------- online / offline banner ---------- */

function initNetworkStatus() {
  let bar = document.getElementById("netBanner");

  if (!bar) {
    bar = document.createElement("div");
    bar.id = "netBanner";
    bar.setAttribute("role", "status");
    bar.hidden = true;
    document.body.appendChild(bar);
  }

  let timer;

  const show = (online) => {
    clearTimeout(timer);
    bar.className = "net-banner " + (online ? "online" : "offline");
    bar.textContent = online
      ? "🟢 Back online"
      : "🔴 You're offline. You can browse, but ordering needs internet.";
    bar.hidden = false;
    if (online) timer = setTimeout(() => { bar.hidden = true; }, 2500);
  };

  window.addEventListener("offline", () => show(false));
  window.addEventListener("online", () => show(true));

  if (!navigator.onLine) show(false);
}

/* ---------- function planner + bulk order (WhatsApp quote) ---------- */

/* Drinks needed PER GUEST for a 5-hour function. Change these numbers to match your experience. */
const EVENT_PROFILES = {
  "Wedding": { water: 1.2, cold: 0.7, energy: 0.2 },
  "Birthday / Party": { water: 1.0, cold: 1.0, energy: 0.1 },
  "Corporate event": { water: 1.5, cold: 0.6, energy: 0.3 },
  "Puja / Religious": { water: 1.5, cold: 0.3, energy: 0 },
  "Other": { water: 1.2, cold: 0.7, energy: 0.2 },
};

function eventEstimate(type, guests, hours) {
  const profile = EVENT_PROFILES[type] || EVENT_PROFILES.Other;
  const factor = Math.max(0.4, hours / 5);
  const count = (rate) => Math.ceil(Math.round(guests * rate * factor * 100) / 100);

  return {
    water: count(profile.water),
    cold: count(profile.cold),
    energy: count(profile.energy),
  };
}

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function prettyDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function quoteContactFields() {
  return `
    <label>Your name <input id="qn" autocomplete="name"></label>
    <label>Mobile <input id="qm" maxlength="10" inputmode="numeric" autocomplete="tel"></label>
    <p class="err" id="qerr"></p>
  `;
}

async function sendQuote(message) {
  const err = $("#qerr");
  const name = ($("#qn")?.value || "").trim();
  const mobile = ($("#qm")?.value || "").replace(/\D/g, "");

  if (!name) return (err.textContent = "Please enter your name");
  if (mobile.length !== 10) return (err.textContent = "Please enter a 10 digit mobile number");

  err.textContent = "";

  const result = await api("/api/enquiry", "POST", { name, mobile, message });

  if (!result._ok) return (err.textContent = result.error || "Could not send the request");

  if (result.whatsapp_url) window.open(result.whatsapp_url, "_blank", "noopener");

  closeModal();
}

function eventPlanner() {
  modal(`
    <h2>🎉 Plan your function</h2>
    <p class="muted">Tell us about the function and we will estimate the drinks you need.</p>

    <label>Function type
      <select id="evType" onchange="updateEventEstimate()">
        ${Object.keys(EVENT_PROFILES).map((t) => `<option>${esc(t)}</option>`).join("")}
      </select>
    </label>

    <label>Number of guests
      <input id="evGuests" type="number" min="1" max="100000" inputmode="numeric" value="100" oninput="updateEventEstimate()">
    </label>

    <label>Duration (hours)
      <input id="evHours" type="number" min="1" max="48" step="0.5" inputmode="decimal" value="5" oninput="updateEventEstimate()">
    </label>

    <label>Function date (optional)
      <input id="evDate" type="date" min="${todayISO()}">
    </label>

    <div class="event-est" id="evResult"></div>

    ${quoteContactFields()}

    <button class="primary" onclick="sendEventQuote()">Request bulk quote on WhatsApp</button>
    <button onclick="closeModal()">Close</button>
  `);

  updateEventEstimate();
}

function readEvent() {
  const guests = Math.floor(Number($("#evGuests")?.value));
  const hours = Number($("#evHours")?.value);

  if (!(guests >= 1) || !(hours > 0)) return null;

  const type = $("#evType").value;

  return { type, guests, hours, date: $("#evDate")?.value || "", est: eventEstimate(type, guests, hours) };
}

function updateEventEstimate() {
  const box = $("#evResult");
  if (!box) return;

  const ev = readEvent();

  box.innerHTML = ev
    ? `<b>Estimated requirement</b>
       <div class="row"><span>💧 Water bottles</span><b>${formatNumber(ev.est.water)}</b></div>
       <div class="row"><span>🥤 Cold drinks</span><b>${formatNumber(ev.est.cold)}</b></div>
       ${ev.est.energy ? `<div class="row"><span>⚡ Energy drinks</span><b>${formatNumber(ev.est.energy)}</b></div>` : ""}
       <small class="muted">This is only an estimate. We will confirm the final quantity with you.</small>`
    : `<small class="muted">Enter the number of guests and hours.</small>`;
}

function sendEventQuote() {
  const ev = readEvent();

  if (!ev) return ($("#qerr").textContent = "Please enter guests and duration");

  const lines = [
    "🎉 Function bulk quote request",
    "",
    `Function: ${ev.type}`,
    `Guests: ${ev.guests}`,
    `Duration: ${ev.hours} hours`,
  ];

  if (ev.date) lines.push(`Date: ${prettyDate(ev.date)}`);

  lines.push(
    "",
    "Estimated requirement:",
    `💧 Water bottles: ${ev.est.water}`,
    `🥤 Cold drinks: ${ev.est.cold}`,
  );

  if (ev.est.energy) lines.push(`⚡ Energy drinks: ${ev.est.energy}`);

  lines.push("", "Please share your best bulk price.");

  return sendQuote(lines.join("\n"));
}

function bulkOrder() {
  const products = (window.PRODUCTS || []).slice().sort((a, b) =>
    cleanName(a.name).localeCompare(cleanName(b.name)));

  modal(`
    <h2>📦 Bulk order</h2>
    <p class="muted">Ordering a large quantity? Send us the details and we will reply with the best price.</p>

    <label>Product
      <select id="bkProduct">
        ${products.map((p) => `<option value="${p.id}">${esc(cleanName(p.name))}${p.size ? " (" + esc(p.size) + ")" : ""}</option>`).join("")}
      </select>
    </label>

    <label>Quantity
      <input id="bkQty" type="number" min="1" max="100000" inputmode="numeric" value="100">
    </label>

    <label>Delivery date
      <input id="bkDate" type="date" min="${todayISO()}">
    </label>

    <label>Function (optional)
      <input id="bkFn" placeholder="e.g. Wedding, Office party">
    </label>

    ${quoteContactFields()}

    <button class="primary" onclick="sendBulkQuote()">Request bulk quote on WhatsApp</button>
    <button onclick="closeModal()">Close</button>
  `);
}

function sendBulkQuote() {
  const product = find($("#bkProduct")?.value);
  const qty = Math.floor(Number($("#bkQty")?.value));

  if (!product) return ($("#qerr").textContent = "Please choose a product");
  if (!(qty >= 1)) return ($("#qerr").textContent = "Please enter a quantity");

  const date = $("#bkDate")?.value || "";
  const fn = ($("#bkFn")?.value || "").trim();

  const lines = [
    "📦 Bulk order request",
    "",
    `Product: ${cleanName(product.name)}${product.size ? " (" + product.size + ")" : ""}`,
    `Quantity: ${qty}`,
  ];

  if (date) lines.push(`Delivery date: ${prettyDate(date)}`);
  if (fn) lines.push(`Function: ${fn}`);

  lines.push("", "Please share your best bulk price and availability.");

  return sendQuote(lines.join("\n"));
}

/* =========================
   GLOBAL FUNCTIONS
   ========================= */

window.category = category;

window.render = render;

window.chg = chg;

window.cart = cart;

window.checkout = checkout;

window.cTot = cTot;

window.placeOrder = placeOrder;

window.payQR = payQR;

window.paid = paid;

window.done = done;

window.bill = bill;

window.account = account;

window.sendOTP = sendOTP;

window.resendOTP = resendOTP;

window.verifyOTP = verifyOTP;

window.tgCheckLink = tgCheckLink;

window.profile = profile;

window.saveProfile = saveProfile;

window.orders = orders;

window.cancelMyOrder = cancelMyOrder;

window.enquiry = enquiry;

window.sendEnquiry = sendEnquiry;

window.whatsappMessage = whatsappMessage;

window.sendWhatsAppMessage = sendWhatsAppMessage;

window.search = search;

window.home = home;

window.scrollToProducts = scrollToProducts;

window.scrollToEnquiry = scrollToEnquiry;

window.logout = logout;

window.closeModal = closeModal;

window.refreshProducts = refreshProducts;

window.refreshConfig = refreshConfig;

window.loadBusinessUI = loadBusinessUI;

window.updateBusinessUI = updateBusinessUI;

window.safeLoadProducts = safeLoadProducts;

window.safeLoadOrders = safeLoadOrders;

window.formatNumber = formatNumber;

window.showMessage = showMessage;

window.toggleWish = toggleWish;

window.reorder = reorder;

window.eventPlanner = eventPlanner;

window.updateEventEstimate = updateEventEstimate;

window.sendEventQuote = sendEventQuote;

window.bulkOrder = bulkOrder;

window.sendBulkQuote = sendBulkQuote;

/* Compatibility */

window.openAccount = openAccount;

window.openOrders = openOrders;

window.openProfile = openProfile;

window.openCart = openCart;

window.openCheckout = openCheckout;

window.openEnquiry = openEnquiry;

window.openWhatsApp = openWhatsApp;
