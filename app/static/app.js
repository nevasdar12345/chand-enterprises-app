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

let ME = null;

let ORD = {};

/* Remember if login was started from checkout */
let LOGIN_FROM_CHECKOUT = false;

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

function save(anim = false) {
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
  }

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
      product.name.toLowerCase().includes(query),
  );

  grid.innerHTML =
    list
      .map((product, index) => {
        const quantity = CART[product.id] || 0;

        return `

                        <div
                            class="card${anim ? " pop" : ""}"
                            style="--i:${index}"
                        >

                            <div class="ic product-image-box">
                                ${product.image_url
                                  ? `<img src="${esc(product.image_url)}" alt="${esc(product.name)}" loading="lazy" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">`
                                  : esc(product.icon || "🥤")}
                            </div>


                            <b>
                                ${esc(product.name)}
                                ${product.size ? `<span class="product-size">${esc(product.size)}</span>` : ""}
                            </b>


                            <small>
                                ${esc(product.category)}
                            </small>


                            <div class="price">
                                ${money(product.price)}
                            </div>


                            ${
                              product.stock < 1
                                ? `
                                    <span class="badge">
                                        Out of stock
                                    </span>
                                `
                                : (product.low
                                    ? `
                                        <span class="badge">
                                            Only ${product.stock} left
                                        </span>
                                        <br>
                                    `
                                    : "") +
                                  (quantity
                                    ? `
                                        <div class="qty">

                                            <button
                                                onclick="
                                                    chg(
                                                        ${product.id},
                                                        -1
                                                    )
                                                "
                                            >
                                                −
                                            </button>


                                            <b>
                                                ${quantity}
                                            </b>


                                            <button
                                                onclick="
                                                    chg(
                                                        ${product.id},
                                                        1
                                                    )
                                                "
                                            >
                                                +
                                            </button>

                                        </div>
                                    `
                                    : `
                                        <button
                                            class="primary"
                                            onclick="
                                                chg(
                                                    ${product.id},
                                                    1
                                                )
                                            "
                                        >
                                            Add
                                        </button>
                                    `)
                            }

                        </div>

                    `;
      })
      .join("") ||
    `
            <p class="muted">
                No products found.
            </p>
        `;
}

/* =========================
   CHANGE CART
   ========================= */

function chg(id, change) {
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

  save();
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
    : (subtotal - discount >= 500 ? 0 : 30);

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

function cart() {
  const ids = Object.keys(CART);

  if (!ids.length) {
    return modal(`

            <h2>
                Your cart
            </h2>


            <p class="muted">
                Cart is empty.
            </p>


            <button
                onclick="closeModal()"
            >
                Close
            </button>

        `);
  }

  const total = totals();

  modal(`

        <h2>
            Your cart
        </h2>


        ${ids
          .map((id) => {
            const product = find(id);

            return `

                        <div class="row">

                            <span>
                                ${esc(product.icon)}
                                ${esc(product.name)}
                                ${product.size ? `(${esc(product.size)})` : ""}
                                × ${CART[id]}
                            </span>


                            <b>
                                ${money(product.price * CART[id])}
                            </b>

                        </div>
                    `;
          })
          .join("")}


        <div class="row">

            <span>
                Delivery
            </span>


            <span>
                ${total.del ? money(total.del) : "Free"}
            </span>

        </div>


        <div class="row">

            <b>
                Subtotal
            </b>


            <b>
                ${money(total.sub)}
            </b>

        </div>


        <small>
            Free delivery above ₹500 ·
            coupons: WELCOME10, WATER50
        </small>


        <br>


        <button
            class="primary"
            onclick="checkout()"
        >
            Checkout
        </button>


        <button
            onclick="closeModal()"
        >
            Close
        </button>

    `);
}

/* =========================
   CHECKOUT
   ========================= */

async function checkout() {
  if (!ME) {
    ME = await api("/api/me");
  }

  // pick up coupons the admin created after this page was opened
  try { await refreshConfig(); } catch (e) { /* ignore */ }

  if (!ME.authenticated || ME.role !== "customer") {
    LOGIN_FROM_CHECKOUT = true;

    return account("Login to place your order");
  }

  modal(`

        <h2>
            Checkout
        </h2>


        <label>

            Name

            <input
                id="cn"
                value="${esc(ME.name === "Customer" ? "" : ME.name)}"
            >

        </label>


        <label>

            Delivery address

            <textarea
                id="ca"
                rows="3"
            >${esc(ME.address || "")}</textarea>

        </label>

        ${LocPicker.html()}


        <label>

            Coupon (optional)

            <input
                id="cc"
                oninput="cTot()"
                autocapitalize="characters"
                autocomplete="off"
            >

        </label>
        <div id="couponMsg" class="muted" style="margin:-6px 0 8px;font-size:.9rem"></div>


        <label>

            Payment

            <select id="cp">

                <option value="COD">
                    Cash on delivery
                </option>

                <option value="QR">
                    Pay by QR (UPI)
                </option>

            </select>

        </label>


        <div id="deliveryInfo" class="muted">Delivery charge will be calculated from your location.</div>

        <div class="row">

            <b>
                Total
            </b>


            <b id="ctot">
            </b>

        </div>


        <p
            class="err"
            id="cerr"
        ></p>


        <button
            class="primary"
            onclick="placeOrder()"
        >
            Place order
        </button>


        <button
            onclick="cart()"
        >
            Back
        </button>

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
    return ($("#cerr").textContent = result.error || "Could not place order");
  }

  CART = {};

  localStorage.setItem("cart", "{}");

  const products = await api("/api/products");

  if (Array.isArray(products)) {
    products.forEach((product) => {
      const current = find(product.id);

      if (current) {
        Object.assign(current, product);
      }
    });
  }

  save();

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

            <h2>
                Scan &amp; pay
            </h2>


            <div class="amt">
                ${money(total)}
            </div>


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

                <small>
                    Paying to
                </small>


                <b>
                    ${esc(CFG.upi)}
                </b>

            </p>


            ${
              order.upi_url
                ? `
                    <a
                        class="add upilink"
                        href="${esc(order.upi_url)}"
                    >
                        📱 Pay with UPI app
                        (on phone)
                    </a>
                `
                : ""
            }


            <label>

                UPI reference / UTR
                (after paying)

                <input
                    id="utr"
                    inputmode="numeric"
                    placeholder="12-digit reference"
                >

            </label>


            <p
                class="err"
                id="uerr"
            ></p>


            <button
                class="primary"
                onclick="
                    paid('${esc(code)}')
                "
            >
                I have paid
                ${money(total)}
            </button>


            <button
                onclick="
                    done({
                        order_id:
                            '${esc(code)}',
                        pay_later: 1
                    })
                "
            >
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

async function done(result) {
  const whatsapp = await api(`/api/orders/${result.order_id}/whatsapp`);

  modal(`

        <svg
            class="tick"
            viewBox="0 0 52 52"
        >

            <circle
                cx="26"
                cy="26"
                r="24"
                fill="none"
                stroke="#12a150"
                stroke-width="3"
            />


            <path
                d="M14 27l8 8 16-16"
                fill="none"
                stroke="#12a150"
                stroke-width="4"
                stroke-linecap="round"
                stroke-linejoin="round"
            />

        </svg>


        <h2
            style="text-align:center"
        >
            Order placed
        </h2>


        <p>

            Order ID:

            <b>
                ${esc(result.order_id)}
            </b>

        </p>


        ${
          result.verifying
            ? `
                <p>
                    Payment is being
                    verified by our team.
                </p>
            `
            : result.pay_later
              ? `
                <p>
                    Please complete the
                    payment from My Orders.
                </p>
            `
              : ""
        }


        <p class="muted">
            We will confirm your
            delivery shortly.
        </p>


        ${
          whatsapp.whatsapp_url
            ? `
                <a
                    class="primary"
                    target="_blank"
                    rel="noopener"
                    href="${whatsapp.whatsapp_url}"
                >
                    Send order on WhatsApp
                </a>
            `
            : ""
        }


        <button
            class="add"
            onclick="
                bill(
                    '${esc(result.order_id)}'
                )
            "
        >
            View bill
        </button>


        <button
            onclick="closeModal()"
        >
            Close
        </button>

    `);
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

                <b>
                    ${esc(CFG.business_name || "Chand Enterprises")}
                </b>


                <small>
                    ${esc(CFG.business_location || "Darbhanga, Bihar")}
                    · Bill
                </small>

            </div>


            <div class="row">

                <span>
                    Order
                </span>


                <b>
                    ${esc(order.code)}
                </b>

            </div>


            <div class="row">

                <span>
                    Date
                </span>


                <span>
                    ${esc(order.created)}
                </span>

            </div>


            <div class="row">

                <span>
                    Customer
                </span>


                <span>
                    ${esc(order.customer)}
                </span>

            </div>


            <div class="row">

                <span>
                    Mobile
                </span>


                <span>
                    ${esc(order.mobile)}
                </span>

            </div>


            <div class="row">

                <span>
                    Address
                </span>


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


                                <b>
                                    ${money(item.total)}
                                </b>

                            </div>

                        `,
              )
              .join("")}


            <hr>


            <div class="row">

                <span>
                    Subtotal
                </span>


                <span>
                    ${money(order.subtotal)}
                </span>

            </div>


            <div class="row">

                <span>
                    Discount
                </span>


                <span>
                    ${money(order.discount)}
                </span>

            </div>


            <div class="row">

                <span>
                    Delivery
                </span>


                <span>
                    ${
                      order.delivery_charge
                        ? money(order.delivery_charge)
                        : "Free"
                    }
                </span>

            </div>


            <div class="row total">

                <b>
                    Total
                </b>


                <b>
                    ${money(order.total)}
                </b>

            </div>


            <div
                class="billstatus ${status[1]}"
            >
                ${status[0]}
            </div>


            <button
                class="primary"
                onclick="window.print()"
            >
                Print bill
            </button>


            <button
                onclick="closeModal()"
            >
                Close
            </button>

        </div>

    `);
}

/* =========================
   CUSTOMER LOGIN
   ========================= */

async function account(message = "") {
  modal(`

        <h2>
            Customer Login
        </h2>


        ${
          message
            ? `
                <p class="muted">
                    ${esc(message)}
                </p>
            `
            : ""
        }


        <label>

            Mobile number

            <input
                id="lm"
                maxlength="10"
                inputmode="numeric"
                placeholder="10-digit mobile number"
            >

        </label>


        <p
            class="err"
            id="lerr"
        ></p>


        <button
            class="primary"
            onclick="sendOTP()"
        >
            Continue
        </button>


        <button
            onclick="closeModal()"
        >
            Close
        </button>

    `);
}

async function sendOTP() {
  const mobile = $("#lm").value.trim();

  const result = await api("/api/login", "POST", {
    role: "customer",
    mobile,
  });

  if (!result._ok) {
    return ($("#lerr").textContent = result.error || "Could not send OTP");
  }

  modal(`

        <h2>
            Verify OTP
        </h2>


        <p>
            OTP sent to
            <b>${esc(mobile)}</b>
        </p>


        ${
          result.dev_otp
            ? `
                <p class="muted">
                    Demo OTP:
                    <b>
                        ${esc(result.dev_otp)}
                    </b>
                </p>
            `
            : ""
        }


        <label>

            Enter OTP

            <input
                id="otp"
                maxlength="4"
                inputmode="numeric"
                autofocus
            >

        </label>


        <p
            class="err"
            id="oerr"
        ></p>


        <button
            class="primary"
            onclick="verifyOTP()"
        >
            Verify
        </button>


        <button
            onclick="resendOTP()"
        >
            Resend OTP
        </button>

    `);
}

async function resendOTP() {
  const result = await api("/api/otp/resend", "POST");

  if (!result._ok) {
    return ($("#oerr").textContent = result.error || "Could not resend OTP");
  }

  if (result.dev_otp) {
    $("#oerr").textContent = "Demo OTP: " + result.dev_otp;
  }
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
}

/* =========================
   CUSTOMER PROFILE
   ========================= */

function profile() {
  if (!ME || !ME.authenticated) {
    return account();
  }

  modal(`

        <h2>
            My Profile
        </h2>


        <label>

            Name

            <input
                id="pn"
                value="${esc(ME.name || "")}"
            >

        </label>


        <label>

            Mobile

            <input
                value="${esc(ME.mobile || "")}"
                disabled
            >

        </label>


        <label>

            Address

            <textarea
                id="pa"
                rows="3"
            >${esc(ME.address || "")}</textarea>

        </label>


        <label>

            Landmark

            <input
                id="pl"
                value="${esc(ME.landmark || "")}"
            >

        </label>


        <p
            class="err"
            id="perr"
        ></p>


        <button
            class="primary"
            onclick="saveProfile()"
        >
            Save
        </button>


        <button
            onclick="closeModal()"
        >
            Close
        </button>

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

        <h2>
            My Orders
        </h2>


        ${
          rows.length
            ? rows
                .map(
                  (order) => `

                        <div
                            class="ordercard"
                        >

                            <div class="row">

                                <b>
                                    ${esc(order.code)}
                                </b>


                                <span>
                                    ${esc(order.status)}
                                </span>

                            </div>


                            <div class="row">

                                <span>
                                    ${esc(order.created)}
                                </span>


                                <b>
                                    ${money(order.total)}
                                </b>

                            </div>


                            <small>
                                ${order.items.map(esc).join(" · ")}
                            </small>


                            <br>


                            <button
                                class="add"
                                onclick="
                                    bill(
                                        '${esc(order.code)}'
                                    )
                                "
                            >
                                View bill
                            </button>


                            ${
                              order.payment_method === "QR" &&
                              order.payment_status !== "Paid" &&
                              order.status !== "Cancelled"
                                ? `
                                    <button
                                        class="primary"
                                        onclick="
                                            payQR(
                                                '${esc(order.code)}',
                                                ${order.total}
                                            )
                                        "
                                    >
                                        Pay
                                        ${money(order.total)}
                                    </button>
                                `
                                : ""
                            }


                            ${
                              order.status === "Confirmed"
                                ? `
                                    <button
                                        onclick="
                                            cancelMyOrder(
                                                '${esc(order.code)}'
                                            )
                                        "
                                    >
                                        Cancel
                                    </button>
                                `
                                : ""
                            }

                        </div>

                    `,
                )
                .join("")
            : `
                <p class="muted">
                    No orders yet.
                </p>
            `
        }


        <button
            onclick="closeModal()"
        >
            Close
        </button>

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

        <h2>
            Contact us
        </h2>


        <label>

            Name

            <input id="en">

        </label>


        <label>

            Mobile

            <input
                id="em"
                maxlength="10"
                inputmode="numeric"
            >

        </label>


        <label>

            Message

            <textarea
                id="et"
                rows="4"
            ></textarea>

        </label>


        <p
            class="err"
            id="eerr"
        ></p>


        <button
            class="primary"
            onclick="sendEnquiry()"
        >
            Send enquiry
        </button>


        <button
            onclick="closeModal()"
        >
            Close
        </button>

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

        <h2>
            WhatsApp
        </h2>


        <label>

            Message

            <textarea
                id="wm"
                rows="5"
                placeholder="Type your message..."
            ></textarea>

        </label>


        <p
            class="err"
            id="werr"
        ></p>


        <button
            class="primary"
            onclick="sendWhatsAppMessage()"
        >
            Open WhatsApp
        </button>


        <button
            onclick="closeModal()"
        >
            Close
        </button>

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

  return true;
}

/* =========================
   CONFIG
   ========================= */

async function refreshConfig() {
  const result = await api("/api/config");

  if (!result || result._ok === false) {
    return;
  }

  CFG = Object.assign(CFG, result);

  if (Array.isArray(result.offers)) {
    OFFERS = result.offers;
  }

  ticker();

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
  const socialHtml = [
    CFG.instagram_url ? `<a href="${esc(CFG.instagram_url)}" target="_blank" rel="noopener">Instagram</a>` : "",
    CFG.facebook_url ? `<a href="${esc(CFG.facebook_url)}" target="_blank" rel="noopener">Facebook</a>` : ""
  ].filter(Boolean).join(" · ");
  ["#socialLinks", "#contactSocial"].forEach(sel => { const social = $(sel); if (social) social.innerHTML = socialHtml; });
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

        <h2>
            Message
        </h2>


        <p>
            ${esc(message)}
        </p>


        <button
            class="primary"
            onclick="closeModal()"
        >
            OK
        </button>

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

    ticker();

    await refreshMe();

    await refreshConfig();

    await refreshProducts();
  }

  /*
   * IMPORTANT:
   * Admin, delivery and developer
   * are now handled by their own
   * JavaScript files.
   */
});

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

/* Compatibility */

window.openAccount = openAccount;

window.openOrders = openOrders;

window.openProfile = openProfile;

window.openCart = openCart;

window.openCheckout = openCheckout;

window.openEnquiry = openEnquiry;

window.openWhatsApp = openWhatsApp;
