import csv, io, secrets, urllib.parse, math, re, os, base64, json, mimetypes, urllib.request, urllib.error
from pathlib import Path

import segno
from sqlalchemy import case
from sqlalchemy.orm import joinedload, selectinload

from datetime import datetime, timedelta

from flask import (Blueprint, render_template, request, redirect, url_for,
                   session, jsonify, Response, current_app, g)

from werkzeug.security import generate_password_hash, check_password_hash

from . import db

from .models import User, Product, Category, Order, OrderItem, Enquiry, Payment, OtpChallenge, SiteSetting, Coupon, LedgerEntry


main = Blueprint("main", __name__)

# Fast hash for the short-lived 4-digit OTP (the default scrypt costs ~100 ms and 32 MB per call).
# Old hashes keep working: check_password_hash reads the method from the stored hash.
OTP_HASH_METHOD = "pbkdf2:sha256:30000"

ORDER_STATUSES = {"Confirmed", "Preparing", "Out for Delivery", "Delivered", "Cancelled"}

PAY_STATUSES = {"Pending", "Verifying", "Paid", "Failed"}

# ---------- developer settings ----------
DEFAULT_SETTINGS = {
    "business_name": "Chand Enterprises",
    "business_mobile": "9304295574",
    "whatsapp": "9304295574",
    "business_location": "Darbhanga, Bihar",
    "upi": "chandenterprises@upi",
    "payment_name": "Chand Enterprises",
    "business_lat": "",
    "business_lng": "",
    "delivery_base": "30",
    "delivery_per_km": "10",
    "delivery_free_above": "500",
    "brochure_url": "",
    "instagram_url": "",
    "facebook_url": "",
}

DEFAULT_OFFERS = [
    "🥤 Pepsi 200ml @ ₹12",
    "⚡ Energy Drink 250ml - Buy 2, get ₹20 off",
    "🚰 Premium Water 20L - special bulk rate",
    "🚚 Free delivery above ₹500",
    "🎟️ Use code WELCOME10 - 10% off your first order",
    "🍋 Lemon Soda 750ml - summer special",
]


def _settings_cache():
    """
    All SiteSetting rows, loaded ONCE per request.
    (Before: every setting_value() call ran its own database query -
    /api/config alone ran about 20 of them.)
    """
    cache = getattr(g, "_site_settings", None)
    if cache is None:
        cache = {row.key: row.value for row in SiteSetting.query.all()}
        g._site_settings = cache
    return cache


def setting_value(key):
    value = _settings_cache().get(key)
    if value is not None:
        return value
    return DEFAULT_SETTINGS.get(key, "")


def set_setting(key, value):
    row = SiteSetting.query.filter_by(key=key).first()
    if not row:
        row = SiteSetting(key=key, value="")
        db.session.add(row)
    row.value = str(value or "")
    _settings_cache()[key] = row.value      # keep this request's cache in sync


def float_setting(key, default=0):
    try:
        return float(setting_value(key) or default)
    except (TypeError, ValueError):
        return float(default)


def haversine_km(lat1, lon1, lat2, lon2):
    rad = math.pi / 180
    dlat = (lat2 - lat1) * rad
    dlon = (lon2 - lon1) * rad
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(dlon / 2) ** 2
    return 6371.0 * 2 * math.asin(min(1, math.sqrt(a)))


def calculate_delivery(subtotal_after_discount, lat=None, lng=None):
    free_above = float_setting("delivery_free_above", 500)
    if subtotal_after_discount >= free_above:
        return 0, 0
    store_lat = parse_coord(setting_value("business_lat"), -90, 90)
    store_lng = parse_coord(setting_value("business_lng"), -180, 180)
    if store_lat is None or store_lng is None or lat is None or lng is None:
        return float_setting("delivery_base", 30), None
    distance = haversine_km(store_lat, store_lng, lat, lng)
    base = float_setting("delivery_base", 30)
    per_km = float_setting("delivery_per_km", 10)
    # Simple, predictable formula: base + per-km charge, rounded up to nearest ₹5.
    charge = math.ceil((base + distance * per_km) / 5) * 5
    return float(charge), distance


def coupon_dict(c):
    return dict(id=c.id, code=c.code, discount_type=c.discount_type,
                discount_value=c.discount_value, max_discount=c.max_discount,
                min_order=c.min_order, active=c.active)


def calculate_coupon(code, subtotal):
    if not code:
        return None, 0
    c = Coupon.query.filter_by(code=code.upper(), active=True).first()
    if not c:
        return None, 0
    if subtotal < (c.min_order or 0):
        return c, 0
    if c.discount_type == "fixed":
        discount = c.discount_value
    else:
        discount = subtotal * c.discount_value / 100
    if c.max_discount is not None:
        discount = min(discount, c.max_discount)
    return c, max(0, min(discount, subtotal))


def developer_settings():
    raw = setting_value("offers")
    offers = [x.strip() for x in raw.splitlines() if x.strip()] if raw else DEFAULT_OFFERS[:]
    return {"business_name": setting_value("business_name"), "business_mobile": setting_value("business_mobile"), "whatsapp": setting_value("whatsapp"), "business_location": setting_value("business_location"), "upi": setting_value("upi"), "payment_name": setting_value("payment_name"), "business_lat": setting_value("business_lat"), "business_lng": setting_value("business_lng"), "delivery_base": setting_value("delivery_base"), "delivery_per_km": setting_value("delivery_per_km"), "delivery_free_above": setting_value("delivery_free_above"), "instagram_url": setting_value("instagram_url"), "facebook_url": setting_value("facebook_url"), "brochure_url": setting_value("brochure_url"), "offers": offers}


def developer_product_dict(p):
    return dict(
        id=p.id,
        name=p.name,
        category=p.category,
        size=p.size or "1L",
        price=p.price,
        stock=p.stock,
        low_stock_threshold=p.low_stock_threshold or 10,
        icon=p.icon,
        image_url=p.image_url or "",
        active=p.active,
    )


# ---------- helpers ----------

def wa_number():
    n = "".join(c for c in (setting_value("whatsapp") or current_app.config["WHATSAPP_NUMBER"]) if c.isdigit())
    return "91" + n if len(n) == 10 else n          # wa.me needs the country code


def wa_link(text):
    return f"https://wa.me/{wa_number()}?text=" + urllib.parse.quote(text)


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    u = db.session.get(User, uid)
    if u and u.active is False:
        session.clear()
        return None
    return u


def role_ok(*roles):
    u = current_user()
    return bool(u) and (not roles or u.role in roles)


def active_categories():
    return Category.query.filter_by(active=True).order_by(Category.id).all()


def category_dict(c):
    return dict(id=c.id, name=c.name, icon=c.icon or "🛍️", active=bool(c.active))


def validate_category_name(name, current_id=None):
    name = str(name or "").strip()
    if not name or len(name) > 80:
        return None, "Category name is required (max 80 characters)"
    q = Category.query.filter(db.func.lower(Category.name) == name.lower())
    if current_id is not None:
        q = q.filter(Category.id != current_id)
    if q.first():
        return None, "Category already exists"
    return name, None


def bill_text(o):
    lines = [
        "🧾 *Chand Enterprises Bill*",
        f"Order: {o.code}",
        f"Customer: {o.customer_name}",
        "",
    ]

    for i in o.items:
        item_name = i.product_name
        if i.product_size:
            item_name += f" ({i.product_size})"
        lines.append(
            f"• {item_name} x {i.quantity} = ₹{i.line_total:.0f}"
        )

    lines += [
        "",
        f"Subtotal: ₹{o.subtotal:.0f}",
        f"Discount: ₹{o.discount:.0f}",
        f"Delivery: ₹{o.delivery_charge:.0f}",
        f"*Total: ₹{o.total:.0f}*",
        f"Payment: {o.payment_method} ({o.payment_status})",
        f"Status: {o.status}",
    ]

    return "\n".join(lines)


def product_dict(p):
    return dict(id=p.id, name=p.name, category=p.category, size=p.size or "1L", price=p.price,
                stock=p.stock, icon=p.icon, image_url=p.image_url or "", low=p.stock <= (p.low_stock_threshold or 10))


def upi_uri(o):
    """UPI deep-link with the exact order amount pre-filled (this is what the QR encodes)."""
    q = urllib.parse.quote
    pa = q(setting_value("upi") or current_app.config["UPI_ID"], safe="@")
    pn = q(setting_value("payment_name") or "Chand Enterprises")
    return f"upi://pay?pa={pa}&pn={pn}&am={o.total:.2f}&cu=INR&tn={q('Order ' + o.code)}"


def parse_coord(value, low, high):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if low <= number <= high else None


def order_dict(o):
    dp = o.delivery_person
    pay = o.payments[0] if o.payments else None
    paid = o.total if o.payment_status == "Paid" else 0

    return dict(id=o.id, code=o.code, customer=o.customer_name, mobile=o.mobile,
                address=o.address, latitude=o.latitude, longitude=o.longitude,
                map_url=o.map_url, total=o.total, subtotal=o.subtotal, discount=o.discount,
                delivery_charge=o.delivery_charge, payment=o.payment_method,
                payment_status=o.payment_status, status=o.status,
                created=o.created_at.strftime("%d-%m-%Y %H:%M"),
                delivery_person_id=o.delivery_person_id, delivery_person=dp.name if dp else "",
                items=[
                    (
                        f"{i.product_name} ({i.product_size}) x {i.quantity}"
                        if i.product_size
                        else f"{i.product_name} x {i.quantity}"
                    )
                    for i in o.items
                ],
                lines=[
                    dict(
                        name=i.product_name,
                        size=i.product_size or "1L",
                        qty=i.quantity,
                        price=i.unit_price,
                        total=i.line_total,
                    )
                    for i in o.items
                ],
                coupon=o.coupon_code or "", paid=paid, due=0 if o.status == "Cancelled" else o.total - paid,
                utr=(pay.transaction_id or "") if pay else "",
                upi_url=upi_uri(o) if o.payment_method == "QR" else "")


def restock(o):
    for i in o.items:
        p = db.session.get(Product, i.product_id)
        if p:
            p.stock += i.quantity


def set_status(o, status):
    if status == "Cancelled" and o.status != "Cancelled":
        restock(o)
    o.status = status


def new_otp(mobile):
    now = datetime.utcnow()
    last = OtpChallenge.query.filter_by(mobile=mobile, verified=False).order_by(OtpChallenge.id.desc()).first()
    if last and (now - last.last_sent_at).total_seconds() < 30:
        wait = 30 - int((now - last.last_sent_at).total_seconds())
        return jsonify(ok=False, error=f"Please wait {wait} seconds before requesting another OTP"), 429
    otp = f"{secrets.randbelow(10000):04d}"
    db.session.add(OtpChallenge(mobile=mobile, otp_hash=generate_password_hash(otp, method=OTP_HASH_METHOD),
                                expires_at=now + timedelta(minutes=5), last_sent_at=now))
    db.session.commit()
    session["otp_mobile"] = mobile
    out = dict(ok=True, otp_sent=True, expires_in=300)
    if current_app.config["DEV_OTP"]:               # demo only: replace with an SMS provider
        out["dev_otp"] = otp
    return jsonify(out)


# ---------- pages ----------

@main.route("/")
def home():
    prods = [product_dict(p) for p in Product.query.filter_by(active=True)]
    return render_template("index.html", products=prods)


def _clean_http_url(value):
    """Return a safe http(s) URL or '' (blocks javascript:, data:, etc.)."""
    value = (value or "").strip()
    try:
        parts = urllib.parse.urlsplit(value)
    except ValueError:
        return ""
    if parts.scheme not in ("http", "https") or not parts.netloc or any(ch in value for ch in " \t\r\n<>\"'"):
        return ""
    return value


def brochure_links(url):
    """
    Turn whatever link the admin pasted (Google Drive, Google Docs/Slides,
    or a direct .pdf/.docx link) into links the brochure page can use.
    Returns dict: embed, view, pdf, docx, kind  (empty strings when unknown)
    """
    url = _clean_http_url(url)
    out = dict(url=url, embed="", view=url, pdf="", docx="", kind="")
    if not url:
        return out
    q = urllib.parse.quote
    m = re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]+)", url)
    if m:
        fid = m.group(1)
        out.update(kind="drive", embed=f"https://drive.google.com/file/d/{fid}/preview",
                   view=f"https://drive.google.com/file/d/{fid}/view",
                   pdf=f"https://drive.google.com/uc?export=download&id={fid}")
        return out
    m = re.search(r"docs\.google\.com/document/d/([\w-]+)", url)
    if m:
        did = m.group(1)
        base = f"https://docs.google.com/document/d/{did}"
        out.update(kind="gdoc", embed=f"{base}/preview", view=f"{base}/preview",
                   pdf=f"{base}/export?format=pdf", docx=f"{base}/export?format=docx")
        return out
    m = re.search(r"docs\.google\.com/presentation/d/([\w-]+)", url)
    if m:
        did = m.group(1)
        base = f"https://docs.google.com/presentation/d/{did}"
        out.update(kind="gslides", embed=f"{base}/embed", view=f"{base}/preview",
                   pdf=f"{base}/export/pdf")
        return out
    path = urllib.parse.urlsplit(url).path.lower()
    if path.endswith(".pdf"):
        out.update(kind="pdf", pdf=url, embed=f"https://docs.google.com/gview?embedded=1&url={q(url, safe='')}")
    elif path.endswith((".docx", ".doc")):
        out.update(kind="docx", docx=url,
                   embed=f"https://view.officeapps.live.com/op/embed.aspx?src={q(url, safe='')}")
    return out


@main.route("/brochure")
def brochure():
    pdf_path = os.path.join(current_app.static_folder, "brochure.pdf")
    links = brochure_links(setting_value("brochure_url"))
    products = Product.query.filter_by(active=True).order_by(Product.category, Product.id).all()
    # Keep the most useful catalog order for the brochure while still showing
    # any future categories created by Developer/Admin.
    preferred = ["Premium Water", "Nevas Package Drinking Water", "Cold Drinks", "Energy Drinks"]
    grouped = []
    seen = set()
    for category_name in preferred:
        items = [p for p in products if (p.category or "").strip().lower() == category_name.lower()]
        if items:
            grouped.append((category_name, items))
            seen.add(category_name.lower())
    for category_name in sorted({(p.category or "Other").strip() or "Other" for p in products}, key=str.lower):
        if category_name.lower() not in seen:
            grouped.append((category_name, [p for p in products if (p.category or "Other").strip().lower() == category_name.lower()]))
    return render_template("brochure.html", brochure_pdf_exists=os.path.exists(pdf_path), b=links, product_groups=grouped)


# ============================================================
# PRODUCT IMAGE HOSTING (FREE GITHUB STORAGE)
# ============================================================

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024


def github_image_config():
    """Read GitHub image-hosting settings from environment variables."""
    return {
        "token": (os.getenv("GITHUB_TOKEN") or "").strip(),
        "repo": (os.getenv("GITHUB_REPO") or "").strip().strip("/"),
        "branch": (os.getenv("GITHUB_BRANCH") or "main").strip() or "main",
        "folder": (os.getenv("GITHUB_IMAGE_FOLDER") or "static/product-images").strip("/") or "static/product-images",
    }


def github_upload_bytes(filename, content, content_type, message):
    """Upload a file to a PUBLIC GitHub repository using the Contents API."""
    cfg = github_image_config()
    if not cfg["token"] or not cfg["repo"]:
        raise RuntimeError("GitHub image storage is not configured. Add GITHUB_TOKEN and GITHUB_REPO in Render Environment Variables.")
    if "/" not in cfg["repo"]:
        raise RuntimeError("GITHUB_REPO must be in owner/repository format.")

    # Keep the file name safe and predictable.
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-") or "product-image"
    path = f"{cfg['folder']}/{safe_name}"
    api_url = f"https://api.github.com/repos/{cfg['repo']}/contents/{urllib.parse.quote(path, safe='/-._')}"
    payload = {
        "message": message,
        "content": base64.b64encode(content).decode("ascii"),
        "branch": cfg["branch"],
    }
    request_obj = urllib.request.Request(
        api_url,
        data=json.dumps(payload).encode("utf-8"),
        method="PUT",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {cfg['token']}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Chand-Enterprises/1.0",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request_obj, timeout=25) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode("utf-8"))
            detail = body.get("message") or f"GitHub returned HTTP {exc.code}"
        except Exception:
            detail = f"GitHub returned HTTP {exc.code}"
        raise RuntimeError(detail)
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach GitHub: {exc.reason}")

    # Raw GitHub URL works for public repositories.
    raw_url = f"https://raw.githubusercontent.com/{cfg['repo']}/{urllib.parse.quote(cfg['branch'], safe='')}/{urllib.parse.quote(path, safe='/')}"
    return raw_url, path, data


@main.post("/api/product/<int:pid>/image")
def product_image(pid):
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    p = db.session.get(Product, pid)
    if not p:
        return jsonify(error="Product not found"), 404

    # URL mode: no GitHub upload required.
    image_url = str(request.form.get("image_url") or "").strip()
    if image_url:
        clean = _clean_http_url(image_url)
        if not clean:
            return jsonify(error="Image URL must start with https:// or http://"), 400
        p.image_url = clean
        db.session.commit()
        return jsonify(ok=True, image_url=p.image_url, source="url")

    uploaded = request.files.get("image")
    if not uploaded or not uploaded.filename:
        return jsonify(error="Choose an image or paste an image URL"), 400

    ext = Path(uploaded.filename).suffix.lower()
    content_type = (uploaded.mimetype or mimetypes.guess_type(uploaded.filename)[0] or "").lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS or not content_type.startswith("image/"):
        return jsonify(error="Allowed image types: JPG, JPEG, PNG, WEBP and GIF"), 400

    content = uploaded.read(MAX_PRODUCT_IMAGE_BYTES + 1)
    if len(content) > MAX_PRODUCT_IMAGE_BYTES:
        return jsonify(error="Image is too large. Maximum size is 5 MB."), 400

    # Unique name means changing an image never requires deleting an old Git blob.
    base = re.sub(r"[^A-Za-z0-9]+", "-", p.name.lower()).strip("-") or "product"
    filename = f"{base}-{p.id}-{int(datetime.utcnow().timestamp())}{ext}"
    try:
        raw_url, path, _ = github_upload_bytes(
            filename,
            content,
            content_type,
            f"Add product image: {p.name} (#{p.id})",
        )
    except RuntimeError as exc:
        return jsonify(error=str(exc)), 400

    p.image_url = raw_url
    db.session.commit()
    return jsonify(ok=True, image_url=raw_url, github_path=path, source="github")


@main.delete("/api/product/<int:pid>/image")
def product_image_remove(pid):
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    # Only clear the database pointer. GitHub files are intentionally kept as history.
    p = db.session.get(Product, pid)
    if not p:
        return jsonify(error="Product not found"), 404
    p.image_url = ""
    db.session.commit()
    return jsonify(ok=True)


@main.get("/api/product-image-config")
def product_image_config():
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    cfg = github_image_config()
    return jsonify(
        ok=True,
        github_configured=bool(cfg["token"] and cfg["repo"]),
        repository=cfg["repo"],
        branch=cfg["branch"],
        folder=cfg["folder"],
    )


@main.get("/api/admin/brochure")
def admin_get_brochure():
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    return jsonify(url=setting_value("brochure_url"), links=brochure_links(setting_value("brochure_url")))


@main.post("/api/admin/brochure")
def admin_save_brochure():
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    raw = str((request.json or {}).get("url") or "").strip()
    if raw and not _clean_http_url(raw):
        return jsonify(error="Please paste a full link starting with https://"), 400
    set_setting("brochure_url", raw)
    db.session.commit()
    return jsonify(ok=True, url=raw, links=brochure_links(raw))


@main.route("/staff")
def staff_login():
    if role_ok("admin", "delivery", "developer"):
        return redirect(url_for("main.dashboard"))
    return render_template("staff.html")


@main.route("/dashboard")
def dashboard():
    if not role_ok("admin", "delivery", "developer"):
        return redirect(url_for("main.staff_login"))

    role = session["role"]

    if role == "admin":
        return render_template("admin.html",
                               delivery_users=User.query.filter_by(role="delivery", active=True).all(),
                               products=Product.query.order_by(Product.id).all())

    if role == "developer":
        return render_template("developer.html", settings=developer_settings())
    return render_template("role.html", role=role)


@main.route("/whatsapp")
def whatsapp_page():
    return render_template("whatsapp.html", number=wa_number())


@main.route("/logout", methods=["GET", "POST"])
def logout():
    # GET as well as POST, so a plain link / address-bar visit never gives 405
    session.clear()
    return redirect(url_for("main.home"))


# ---------- auth ----------

@main.post("/api/login")
def login():
    d = request.json or {}

    if d.get("role", "customer") == "customer":
        mobile = str(d.get("mobile", "")).strip()
        if not (mobile.isdigit() and len(mobile) == 10):
            return jsonify(ok=False, error="Enter a valid 10-digit mobile number"), 400
        return new_otp(mobile)

    username = str(d.get("username") or "").strip()
    u = User.query.filter(db.func.lower(User.username) == username.lower()).first()

    if not u or not u.active or not u.password or u.role == "customer" or not check_password_hash(u.password, d.get("password", "")):
        return jsonify(ok=False, error="Invalid credentials"), 401

    session.clear()
    session.update(user_id=u.id, role=u.role, name=u.name)
    return jsonify(ok=True, redirect=url_for("main.dashboard"))


@main.post("/api/otp/resend")
def resend_otp():
    m = session.get("otp_mobile")
    if not m:
        return jsonify(ok=False, error="OTP session expired"), 400
    return new_otp(m)


@main.post("/api/verify-otp")
def verify_otp():
    d = request.json or {}
    mobile = session.get("otp_mobile")

    if not mobile:
        return jsonify(ok=False, error="OTP session expired. Request a new OTP."), 400

    ch = OtpChallenge.query.filter_by(mobile=mobile, verified=False).order_by(OtpChallenge.id.desc()).first()

    if not ch or datetime.utcnow() > ch.expires_at:
        return jsonify(ok=False, error="OTP expired. Request a new OTP."), 400

    if ch.attempts >= 5:
        return jsonify(ok=False, error="Too many attempts. Request a new OTP."), 429

    ch.attempts += 1

    entered_otp = str(d.get("otp", "")).strip()

    # Master OTP for testing
    master_otp = current_app.config.get("MASTER_OTP", "")
    if (not master_otp or entered_otp != master_otp) and not check_password_hash(ch.otp_hash, entered_otp):
        db.session.commit()
        return jsonify(
            ok=False,
            error="Incorrect OTP",
            attempts_left=max(0, 5 - ch.attempts)
        ), 400

    ch.verified = True

    u = User.query.filter_by(mobile=mobile).first()

    if not u:
        u = User(name="Customer", mobile=mobile, role="customer")
        db.session.add(u)
        db.session.flush()

    session.clear()
    session.update(user_id=u.id, role="customer", name=u.name)
    db.session.commit()
    return jsonify(ok=True, user=dict(name=u.name, mobile=u.mobile))


@main.get("/api/me")
def me():
    u = current_user()
    if not u:
        return jsonify(authenticated=False)
    return jsonify(authenticated=True, id=u.id, name=u.name, mobile=u.mobile, role=u.role,
                   address=u.address or "", landmark=u.landmark or "")


@main.put("/api/profile")
def update_profile():
    u = current_user()
    if not u or u.role != "customer":
        return jsonify(error="Please login"), 401

    d = request.json or {}
    name = (d.get("name") or "").strip()

    if not name:
        return jsonify(error="Name is required"), 400

    u.name, u.address, u.landmark = name, (d.get("address") or "").strip(), (d.get("landmark") or "").strip()
    session["name"] = u.name
    db.session.commit()
    return jsonify(ok=True)


# ---------- shop ----------

@main.post("/api/delivery/quote")
def delivery_quote():
    """Live total preview for checkout: coupon discount + distance-based delivery."""
    d = request.json or {}
    try:
        subtotal = float(d.get("subtotal") or 0)
    except (TypeError, ValueError):
        return jsonify(error="Invalid subtotal"), 400
    code = str(d.get("coupon") or "").strip().upper()
    lat = parse_coord(d.get("latitude"), -90, 90)
    lng = parse_coord(d.get("longitude"), -180, 180)
    if lat is None or lng is None:
        lat = lng = None
    row, discount = calculate_coupon(code, subtotal)
    coupon_msg, coupon_ok = "", False
    if code:
        if not row:
            coupon_msg = "Invalid or inactive coupon"
        elif discount <= 0:
            coupon_msg = f"Minimum order for {row.code} is \u20b9{(row.min_order or 0):.0f}"
        else:
            coupon_ok = True
            coupon_msg = f"{row.code} applied: \u2212\u20b9{discount:.0f}"
    delivery, distance = calculate_delivery(subtotal - discount, lat, lng)
    return jsonify(ok=True, subtotal=subtotal, discount=discount, delivery_charge=delivery,
                   distance_km=None if distance is None else round(distance, 1),
                   coupon_ok=coupon_ok, coupon_message=coupon_msg)


@main.get("/api/config")
def config():
    cfg = developer_settings()
    return jsonify(_ok=True, whatsapp=wa_number(), upi=cfg["upi"] or current_app.config["UPI_ID"], business_name=cfg["business_name"], business_mobile=cfg["business_mobile"], business_location=cfg["business_location"], payment_name=cfg["payment_name"], offers=cfg["offers"], instagram_url=cfg["instagram_url"], facebook_url=cfg["facebook_url"], brochure_url=cfg["brochure_url"], categories=[category_dict(c) for c in active_categories()], coupons=[coupon_dict(c) for c in Coupon.query.filter_by(active=True).order_by(Coupon.code).all()])


@main.get("/api/categories")
def api_categories():
    return jsonify([category_dict(c) for c in active_categories()])


@main.get("/api/products")
def api_products():
    return jsonify([product_dict(p) for p in Product.query.filter_by(active=True)])


@main.post("/api/orders")
def create_order():
    u = current_user()

    if not u or u.role != "customer":
        return jsonify(error="Please login as customer"), 401

    d = request.json or {}
    name = (d.get("name") or u.name or "").strip()
    address = (d.get("address") or u.address or "").strip()
    method = d.get("payment_method", "COD")
    lat = parse_coord(d.get("latitude"), -90, 90)
    lng = parse_coord(d.get("longitude"), -180, 180)

    if lat is None or lng is None:
        lat = lng = None

    coupon = (d.get("coupon") or "").strip().upper()
    items = d.get("items") or []

    if not name or not address:
        return jsonify(error="Name and delivery address are required"), 400

    if not items:
        return jsonify(error="Cart is empty"), 400

    if method not in {"COD", "QR"}:
        return jsonify(error="Invalid payment method"), 400

    subtotal, lines = 0, []

    for x in items:
        try:
            p, qty = db.session.get(Product, int(x["id"])), int(x["qty"])
        except (KeyError, TypeError, ValueError):
            return jsonify(error="Invalid cart"), 400

        if not p or not p.active:
            return jsonify(error="Product unavailable"), 400

        if qty < 1 or p.stock < qty:
            return jsonify(error=f"Insufficient stock for {p.name}"), 400

        subtotal += p.price * qty
        lines.append((p, qty))

    coupon_row, discount = calculate_coupon(coupon, subtotal)
    if coupon and not coupon_row:
        return jsonify(error="Invalid or inactive coupon"), 400
    delivery, distance_km = calculate_delivery(subtotal - discount, lat, lng)
    total = max(0, subtotal - discount + delivery)

    code = "CE" + datetime.now().strftime("%y%m%d%H%M%S") + secrets.token_hex(1).upper()

    o = Order(code=code, customer_name=name, mobile=u.mobile, address=address, latitude=lat, longitude=lng, total=total,
              delivery_charge=delivery, cash_collected=0, payment_method=method, payment_status="Pending",
              coupon_code=coupon_row.code if coupon_row else None, discount=discount)

    db.session.add(o)
    db.session.flush()

    for p, qty in lines:
        p.stock -= qty
        db.session.add(
            OrderItem(
                order_id=o.id,
                product_id=p.id,
                product_name=p.name,
                product_size=p.size or "1L",
                quantity=qty,
                unit_price=p.price,
            )
        )

    db.session.add(Payment(order_id=o.id, method=method, amount=total))

    if not u.address:
        u.address = address

    db.session.commit()

    return jsonify(ok=True, order_id=code, total=total, subtotal=subtotal, discount=discount,
                   delivery_charge=delivery, cash_collected=0, payment_method=method, upi=current_app.config["UPI_ID"],
                   upi_url=upi_uri(o))


def own_order(code):
    u = current_user()
    o = Order.query.filter_by(code=code).first()

    if not o:
        return None, (jsonify(error="Order not found"), 404)

    if role_ok("customer") and (not u or u.mobile != o.mobile):
        return None, (jsonify(error="Forbidden"), 403)

    if not role_ok():
        return None, (jsonify(error="Please login"), 401)

    return o, None


@main.get("/api/my-orders")
def my_orders():
    u = current_user()
    if not u or u.role != "customer":
        return jsonify(error="Please login"), 401
    rows = Order.query.options(selectinload(Order.items), selectinload(Order.payments), joinedload(Order.delivery_person)).filter_by(mobile=u.mobile).order_by(Order.created_at.desc()).limit(30)
    return jsonify([order_dict(o) for o in rows])


@main.get("/api/orders/<code>/qr.svg")
def order_qr(code):
    """Scannable UPI QR for exactly this order's total."""
    o, err = own_order(code)
    if err:
        return err
    if o.payment_method != "QR" or o.status == "Cancelled" or o.payment_status == "Paid":
        return jsonify(error="No payment due"), 400
    buf = io.BytesIO()
    segno.make(upi_uri(o), error="m").save(buf, kind="svg", scale=6, border=2,
                                           dark="#000000", light="#ffffff", xmldecl=False)
    return Response(buf.getvalue(), mimetype="image/svg+xml", headers={"Cache-Control": "no-store"})


@main.post("/api/orders/<code>/paid")
def mark_paid(code):
    """Customer says they paid via QR and gives the UPI reference; admin then confirms."""
    o, err = own_order(code)
    if err:
        return err
    if o.payment_method != "QR" or o.payment_status == "Paid":
        return jsonify(error="Nothing to confirm"), 400
    utr = ((request.json or {}).get("utr") or "").strip()
    pay = Payment.query.filter_by(order_id=o.id).order_by(Payment.id.desc()).first()
    if utr and not Payment.query.filter(Payment.transaction_id == utr, Payment.id != pay.id).first():
        pay.transaction_id = utr
    o.payment_status = pay.status = "Verifying"
    db.session.commit()
    return jsonify(ok=True, status="Verifying")


@main.post("/api/orders/<code>/cancel")
def cancel_order(code):
    o, err = own_order(code)
    if err:
        return err
    if o.status != "Confirmed":
        return jsonify(error="Order can no longer be cancelled"), 400
    set_status(o, "Cancelled")
    db.session.commit()
    return jsonify(ok=True)


def order_text(o):
    lines = "\n".join(
        f"- {i.product_name}"
        + (f" ({i.product_size})" if i.product_size else "")
        + f" x {i.quantity} = ₹{i.line_total:.0f}"
        for i in o.items
    )

    return (f"{setting_value('business_name') or 'Chand Enterprises'} - Order {o.code}\n\nCustomer: {o.customer_name}\nMobile: {o.mobile}\n"
            f"Address: {o.address}\n" + (f"Location: {o.map_url}\n" if o.map_url else "") + f"\nItems:\n{lines}\n\nSubtotal: ₹{o.subtotal:.0f}\n"
            f"Discount: ₹{o.discount:.0f}\nDelivery: ₹{o.delivery_charge:.0f}\nTotal: ₹{o.total:.0f}\n"
            f"Payment: {o.payment_method} / {o.payment_status}")


@main.get("/api/orders/<code>/whatsapp")
def order_whatsapp(code):
    o, err = own_order(code)
    if err:
        return err
    text = bill_text(o)                       # built once (was built twice)
    return jsonify(ok=True, message=text, whatsapp_url=wa_link(text))


@main.post("/api/whatsapp/message")
def whatsapp_message():
    m = ((request.json or {}).get("message") or "").strip()
    if not m:
        return jsonify(error="Message is required"), 400
    return jsonify(ok=True, whatsapp_url=wa_link(m))


@main.post("/api/enquiry")
def enquiry():
    d = request.json or {}
    name, mobile, msg = [(d.get(k) or "").strip() for k in ("name", "mobile", "message")]

    if not (name and mobile and msg):
        return jsonify(error="Name, mobile and message are required"), 400

    db.session.add(Enquiry(name=name, mobile=mobile, message=msg))
    db.session.commit()

    return jsonify(ok=True, whatsapp_url=wa_link(
        f"New enquiry - {setting_value('business_name') or 'Chand Enterprises'}\n\nName: {name}\nMobile: {mobile}\n\n{msg}"))


# ---------- admin ----------

@main.get("/api/admin/orders")
def admin_orders():
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403

    q = Order.query
    s, pay, text = request.args.get("status", "All"), request.args.get("pay", "All"), request.args.get("q", "").strip()

    if s != "All":
        q = q.filter_by(status=s)

    if pay != "All":
        q = q.filter_by(payment_status=pay)

    if text:
        like = f"%{text}%"
        q = q.filter(db.or_(Order.code.like(like), Order.customer_name.like(like), Order.mobile.like(like)))

    rows = q.options(selectinload(Order.items), selectinload(Order.payments), joinedload(Order.delivery_person)).order_by(Order.created_at.desc()).limit(200).all()

    # ONE aggregate query for orders, revenue and pending count
    # (before: one query for orders+revenue and a second one for pending)
    live_orders, live_revenue, pending_count = db.session.query(
        db.func.count(Order.id),
        db.func.coalesce(db.func.sum(case((Order.payment_status == "Paid", Order.total), else_=0)), 0),
        db.func.coalesce(db.func.sum(case((Order.payment_status.in_(["Pending", "Verifying"]), 1), else_=0)), 0),
    ).filter(Order.status != "Cancelled").one()

    stats = dict(orders=live_orders,
                 revenue=float(live_revenue or 0),
                 pending=int(pending_count or 0),
                 low=Product.query.filter(Product.active == True, Product.stock <= Product.low_stock_threshold).count())

    return jsonify(orders=[order_dict(o) for o in rows], stats=stats)


@main.post("/api/admin/order/<int:oid>")
def update_order(oid):
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403

    o, d = db.session.get(Order, oid), request.json or {}

    if not o:
        return jsonify(error="Order not found"), 404

    if d.get("status"):
        if d["status"] not in ORDER_STATUSES:
            return jsonify(error="Invalid status"), 400
        set_status(o, d["status"])

    if d.get("payment_status"):
        if d["payment_status"] not in PAY_STATUSES:
            return jsonify(error="Invalid payment status"), 400
        o.payment_status = d["payment_status"]
        pay = Payment.query.filter_by(order_id=o.id).order_by(Payment.id.desc()).first()
        if pay:
            pay.status = d["payment_status"]

    db.session.commit()
    return jsonify(ok=True)


@main.post("/api/admin/order/<int:oid>/delivery")
def assign_delivery(oid):
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    o = db.session.get(Order, oid)
    if not o:
        return jsonify(error="Order not found"), 404
    val = (request.json or {}).get("delivery_person_id")
    o.delivery_person_id = int(val) if val else None
    db.session.commit()
    return jsonify(ok=True)


@main.post("/api/admin/stock/<int:pid>")
def stock(pid):
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    p = db.session.get(Product, pid)
    if not p:
        return jsonify(error="Product not found"), 404
    try:
        p.stock = max(0, int((request.json or {}).get("stock", p.stock)))
    except (TypeError, ValueError):
        return jsonify(error="Invalid stock"), 400
    db.session.commit()
    return jsonify(ok=True, stock=p.stock)


@main.post("/api/admin/product")
def create_product():
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403

    d = request.json or {}

    try:
        p = Product(name=(d.get("name") or "").strip(), category=(d.get("category") or "Cold Drinks").strip(),
                    price=float(d.get("price", 0)), stock=int(d.get("stock", 0)),
                    icon=d.get("icon") or "🥤", image_url=_clean_http_url(d.get("image_url") or ""), size=str(d.get("size") or "1L").strip() or "1L", active=bool(d.get("active", True)))
    except (TypeError, ValueError):
        return jsonify(error="Invalid product data"), 400

    if not p.name or p.price < 0 or p.stock < 0:
        return jsonify(error="Invalid product data"), 400
    cat = Category.query.filter(db.func.lower(Category.name) == p.category.lower(), Category.active == True).first()
    if not cat:
        return jsonify(error="Choose an active category"), 400
    p.category = cat.name
    db.session.add(p)
    db.session.commit()
    return jsonify(ok=True, id=p.id)


@main.put("/api/admin/product/<int:pid>")
def update_product(pid):
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403

    p, d = db.session.get(Product, pid), request.json or {}

    if not p:
        return jsonify(error="Product not found"), 404

    try:
        if "name" in d:
            p.name = d["name"].strip()

        if "category" in d:
            p.category = d["category"].strip()

        if "size" in d:
            p.size = str(d["size"] or "1L").strip() or "1L"

        if "price" in d:
            p.price = float(d["price"])

        if "stock" in d:
            p.stock = int(d["stock"])

        if "icon" in d:
            p.icon = d["icon"]

        if "image_url" in d:
            raw_image_url = str(d.get("image_url") or "").strip()
            if raw_image_url and not _clean_http_url(raw_image_url):
                return jsonify(error="Image URL must start with https:// or http://"), 400
            p.image_url = raw_image_url

        if "active" in d:
            p.active = bool(d["active"])

    except (TypeError, ValueError):
        db.session.rollback()
        return jsonify(error="Invalid product data"), 400

    if not p.name or p.price < 0 or p.stock < 0:
        db.session.rollback()
        return jsonify(error="Invalid product data"), 400
    cat = Category.query.filter(db.func.lower(Category.name) == p.category.lower(), Category.active == True).first()
    if not cat:
        db.session.rollback()
        return jsonify(error="Choose an active category"), 400
    p.category = cat.name
    db.session.commit()
    return jsonify(ok=True)


@main.delete("/api/admin/product/<int:pid>")
def delete_product(pid):
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    p = db.session.get(Product, pid)
    if not p:
        return jsonify(error="Product not found"), 404
    p.active = False
    db.session.commit()
    return jsonify(ok=True)


@main.get("/admin/export.csv")
def export_csv():
    if not role_ok("admin"):
        return redirect(url_for("main.staff_login"))

    out = io.StringIO()
    w = csv.writer(out)

    w.writerow(["Order", "Date", "Customer", "Mobile", "Address", "Items", "Subtotal", "Discount",
                "Delivery", "Total", "Payment", "Payment Status", "Status", "Delivery Person",
                "Latitude", "Longitude", "Google Maps"])

    for o in Order.query.options(selectinload(Order.items), selectinload(Order.payments), joinedload(Order.delivery_person)).order_by(Order.created_at.desc()):
        d = order_dict(o)
        w.writerow([o.code, d["created"], o.customer_name, o.mobile, o.address, "; ".join(d["items"]),
                    o.subtotal, o.discount, o.delivery_charge, o.total, o.payment_method,
                    o.payment_status, o.status, d["delivery_person"],
                    o.latitude if o.latitude is not None else "",
                    o.longitude if o.longitude is not None else "", o.map_url])

    return Response(out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=chand-orders.csv"})


# ---------- delivery ----------

@main.get("/api/delivery/orders")
def delivery_orders():
    if not role_ok("delivery"):
        return jsonify(error="Forbidden"), 403
    rows = Order.query.options(selectinload(Order.items), selectinload(Order.payments), joinedload(Order.delivery_person)).filter_by(delivery_person_id=session["user_id"]).order_by(Order.created_at.desc()).all()
    return jsonify([order_dict(o) for o in rows])


@main.post("/api/delivery/order/<int:oid>/status")
def delivery_status(oid):
    if not role_ok("delivery"):
        return jsonify(error="Forbidden"), 403

    o = db.session.get(Order, oid)

    if not o or o.delivery_person_id != session["user_id"]:
        return jsonify(error="Order not assigned to you"), 404

    s = (request.json or {}).get("status")

    if s not in {"Out for Delivery", "Delivered"}:
        return jsonify(error="Invalid status"), 400

    if o.status == "Cancelled":
        return jsonify(error="Order is cancelled"), 400

    o.status = s

    if s == "Delivered" and o.payment_method == "COD":
        if (o.cash_collected or 0) >= o.total:
            o.payment_status = "Paid"
            pay = Payment.query.filter_by(order_id=o.id).order_by(Payment.id.desc()).first()
            if pay:
                pay.status = "Paid"

    db.session.commit()
    return jsonify(ok=True)


# ---------- categories / team ----------

@main.get("/api/admin/categories")
def admin_categories():
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    return jsonify(categories=[category_dict(c) for c in Category.query.order_by(Category.id).all()])


@main.post("/api/admin/categories")
def create_category():
    if not role_ok("developer"):
        return jsonify(error="Developer access required"), 403
    d = request.json or {}
    name, error = validate_category_name(d.get("name"))
    if error:
        return jsonify(error=error), 400
    c = Category(name=name, icon=str(d.get("icon") or "🛍️")[:20], active=True)
    db.session.add(c)
    db.session.commit()
    return jsonify(ok=True, category=category_dict(c))


@main.put("/api/admin/categories/<int:cid>")
def update_category(cid):
    if not role_ok("developer"):
        return jsonify(error="Developer access required"), 403
    c = db.session.get(Category, cid)
    if not c:
        return jsonify(error="Category not found"), 404
    d = request.json or {}
    if "name" in d:
        name, error = validate_category_name(d.get("name"), cid)
        if error:
            return jsonify(error=error), 400
        old = c.name
        c.name = name
        Product.query.filter_by(category=old).update({"category": name}, synchronize_session=False)
    if "icon" in d:
        c.icon = str(d.get("icon") or "🛍️")[:20]
    if "active" in d:
        c.active = bool(d["active"])
    db.session.commit()
    return jsonify(ok=True, category=category_dict(c))


@main.delete("/api/admin/categories/<int:cid>")
def delete_category(cid):
    if not role_ok("developer"):
        return jsonify(error="Developer access required"), 403
    c = db.session.get(Category, cid)
    if not c:
        return jsonify(error="Category not found"), 404
    if Product.query.filter_by(category=c.name).count():
        return jsonify(error="Category still has products. Rename or move those products first."), 409
    db.session.delete(c)
    db.session.commit()
    return jsonify(ok=True)


def _team_dict(u):
    return dict(id=u.id, name=u.name, username=u.username, mobile=u.mobile or "", role=u.role, active=bool(u.active))


@main.get("/api/team")
def team_list():
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    allowed = ["admin", "delivery"] if session.get("role") == "developer" else ["delivery"]
    return jsonify(users=[_team_dict(u) for u in User.query.filter(User.role.in_(allowed)).order_by(User.role, User.id).all()])


@main.post("/api/team")
def team_create():
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    d = request.json or {}
    role = str(d.get("role") or "delivery").lower()
    if session.get("role") == "admin" and role != "delivery":
        return jsonify(error="Admins can create delivery accounts only"), 403
    if role not in {"admin", "delivery"}:
        return jsonify(error="Invalid staff role"), 400
    username = str(d.get("username") or "").strip()
    name = str(d.get("name") or "").strip()
    password = str(d.get("password") or "")
    if not re.match(r"^[A-Za-z0-9_.-]{3,40}$", username) or not name or len(password) < 8:
        return jsonify(error="Name, username and a password of at least 8 characters are required"), 400
    if User.query.filter(db.func.lower(User.username) == username.lower()).first():
        return jsonify(error="Username already exists"), 409
    u = User(name=name, username=username, password=generate_password_hash(password), role=role, mobile=str(d.get("mobile") or "").strip(), active=True)
    db.session.add(u)
    db.session.commit()
    return jsonify(ok=True, user=_team_dict(u))


@main.put("/api/team/<int:uid>")
def team_update(uid):
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    u = db.session.get(User, uid)
    if not u or u.role == "customer":
        return jsonify(error="Staff account not found"), 404
    if session.get("role") == "admin" and u.role != "delivery":
        return jsonify(error="Admins can manage delivery accounts only"), 403
    d = request.json or {}
    if "name" in d:
        u.name = str(d["name"] or "").strip() or u.name
    if "mobile" in d:
        u.mobile = str(d["mobile"] or "").strip()
    if "password" in d and str(d["password"]):
        if len(str(d["password"])) < 8:
            return jsonify(error="Password must be at least 8 characters"), 400
        u.password = generate_password_hash(str(d["password"]))
    if "active" in d:
        active = bool(d["active"])
        if u.role == "admin" and not active:
            active_admins = User.query.filter_by(role="admin", active=True).count()
            if active_admins <= 1:
                return jsonify(error="The last active admin cannot be disabled"), 409
        u.active = active
        if not active and session.get("user_id") == u.id:
            session.clear()
    db.session.commit()
    return jsonify(ok=True, user=_team_dict(u))


@main.delete("/api/team/<int:uid>")
def team_disable(uid):
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    u = db.session.get(User, uid)
    if not u or u.role == "customer":
        return jsonify(error="Staff account not found"), 404
    if session.get("role") == "admin" and u.role != "delivery":
        return jsonify(error="Admins can manage delivery accounts only"), 403
    if u.role == "admin" and User.query.filter_by(role="admin", active=True).count() <= 1:
        return jsonify(error="The last active admin cannot be disabled"), 409
    u.active = False
    if session.get("user_id") == u.id:
        session.clear()
    db.session.commit()
    return jsonify(ok=True)


@main.get("/api/admin/order/<int:oid>/bill")
def admin_bill(oid):
    if not role_ok("admin", "delivery"):
        return jsonify(error="Forbidden"), 403
    o = db.session.get(Order, oid)
    if not o:
        return jsonify(error="Order not found"), 404
    if session.get("role") == "delivery" and o.delivery_person_id != session.get("user_id"):
        return jsonify(error="Order not assigned to you"), 403
    text = bill_text(o)
    return jsonify(ok=True, message=text, whatsapp_url=f"https://wa.me/{''.join(c for c in o.mobile if c.isdigit())}?text=" + urllib.parse.quote(text))


@main.post("/api/admin/order/<int:oid>/whatsapp")
def admin_send_bill(oid):
    if not role_ok("admin", "delivery"):
        return jsonify(error="Forbidden"), 403
    o = db.session.get(Order, oid)
    if not o:
        return jsonify(error="Order not found"), 404
    if session.get("role") == "delivery" and o.delivery_person_id != session.get("user_id"):
        return jsonify(error="Order not assigned to you"), 403
    mobile = "".join(c for c in o.mobile if c.isdigit())
    if len(mobile) == 10:
        mobile = "91" + mobile
    return jsonify(ok=True, whatsapp_url=f"https://wa.me/{mobile}?text=" + urllib.parse.quote(bill_text(o)))


# ---------- admin analytics / credits / coupons ----------

@main.get("/api/admin/sales")
def admin_sales():
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    month_start = datetime(now.year, now.month, 1)
    # earliest moment the charts below need (start of the month 5 months ago)
    y0, m0 = now.year, now.month - 5
    while m0 <= 0:
        y0 -= 1
        m0 += 12
    since = datetime(y0, m0, 1)
    # only two columns of the recent paid orders (no full order objects)
    paid_rows = db.session.query(Order.created_at, Order.total).filter(
        Order.status != "Cancelled", Order.payment_status == "Paid", Order.created_at >= since).all()
    today = [r for r in paid_rows if r.created_at >= today_start]
    month = [r for r in paid_rows if r.created_at >= month_start]
    daily = []
    for days_ago in range(6, -1, -1):
        start = datetime(now.year, now.month, now.day) - timedelta(days=days_ago)
        end = start + timedelta(days=1)
        daily.append({"label": start.strftime("%d %b"), "sales": round(sum(r.total for r in paid_rows if start <= r.created_at < end), 2)})
    monthly = []
    for months_ago in range(5, -1, -1):
        y, m = now.year, now.month - months_ago
        while m <= 0:
            y -= 1
            m += 12
        start = datetime(y, m, 1)
        if m == 12:
            end = datetime(y + 1, 1, 1)
        else:
            end = datetime(y, m + 1, 1)
        monthly.append({"label": start.strftime("%b %Y"), "sales": round(sum(r.total for r in paid_rows if start <= r.created_at < end), 2)})

    # top products: computed inside SQLite (before: every paid order item ever sold
    # was loaded into Python and added up). Ties keep first-sold-first order.
    qty_sum = db.func.sum(OrderItem.quantity)
    top_rows = (db.session.query(OrderItem.product_name, qty_sum)
                .join(Order, Order.id == OrderItem.order_id)
                .filter(Order.status != "Cancelled", Order.payment_status == "Paid")
                .group_by(OrderItem.product_name)
                .order_by(qty_sum.desc(), db.func.min(OrderItem.id))
                .limit(8).all())
    top = [{"name": n, "qty": int(q)} for n, q in top_rows]

    return jsonify(today_sales=round(sum(r.total for r in today), 2), month_sales=round(sum(r.total for r in month), 2),
                   today_orders=len(today), month_orders=len(month), daily=daily, monthly=monthly, top_products=top)


@main.get("/api/admin/ledger")
def admin_ledger():
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    entries = LedgerEntry.query.order_by(LedgerEntry.created_at.desc()).limit(500).all()
    balances = {}
    for e in entries:
        key = e.customer_mobile
        item = balances.setdefault(key, {"mobile": key, "name": e.customer_name, "balance": 0, "entries": []})
        item["balance"] += e.amount if e.entry_type == "debit" else -e.amount
        item["entries"].append(dict(id=e.id, type=e.entry_type, amount=e.amount, note=e.note or "",
                                    order_id=e.order_id, created=e.created_at.strftime("%d-%m-%Y %H:%M")))
    return jsonify(customers=sorted(balances.values(), key=lambda x: x["balance"], reverse=True))


@main.post("/api/admin/ledger")
def add_ledger_entry():
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    d = request.json or {}
    mobile = "".join(c for c in str(d.get("mobile") or "") if c.isdigit())
    name = str(d.get("name") or "").strip() or "Customer"
    typ = str(d.get("type") or "payment").lower()
    try:
        amount = float(d.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify(error="Invalid amount"), 400
    if len(mobile) < 10 or amount <= 0 or typ not in {"debit", "payment"}:
        return jsonify(error="Enter valid customer and amount"), 400
    e = LedgerEntry(customer_mobile=mobile, customer_name=name, entry_type=typ, amount=amount,
                    note=str(d.get("note") or "").strip(), order_id=d.get("order_id") or None)
    db.session.add(e)
    db.session.commit()
    return jsonify(ok=True, id=e.id)


@main.post("/api/admin/coupon")
def create_coupon():
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    d = request.json or {}
    code = str(d.get("code") or "").strip().upper()
    typ = str(d.get("discount_type") or "percent").lower()
    try:
        value = float(d.get("discount_value", 0))
        max_discount = d.get("max_discount")
        max_discount = None if max_discount in (None, "",) else float(max_discount)
        min_order = float(d.get("min_order", 0))
    except (TypeError, ValueError):
        return jsonify(error="Invalid coupon values"), 400
    if not re.match(r"^[A-Z0-9_-]{3,40}$", code) or typ not in {"percent", "fixed"} or value <= 0 or min_order < 0:
        return jsonify(error="Invalid coupon"), 400
    if typ == "percent" and value > 100:
        return jsonify(error="Percent cannot exceed 100"), 400
    if Coupon.query.filter_by(code=code).first():
        return jsonify(error="Coupon already exists"), 400
    c = Coupon(code=code, discount_type=typ, discount_value=value, max_discount=max_discount, min_order=min_order, active=True)
    db.session.add(c)
    db.session.commit()
    return jsonify(ok=True, coupon=coupon_dict(c))


@main.get("/api/admin/coupons")
def admin_coupons():
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    return jsonify(coupons=[coupon_dict(c) for c in Coupon.query.order_by(Coupon.id.desc()).all()])


@main.put("/api/admin/coupon/<int:cid>")
def update_coupon(cid):
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    c = db.session.get(Coupon, cid)
    if not c:
        return jsonify(error="Coupon not found"), 404
    d = request.json or {}
    try:
        if "active" in d:
            c.active = bool(d["active"])
        if "discount_value" in d:
            c.discount_value = float(d["discount_value"])
        if "max_discount" in d:
            c.max_discount = None if d["max_discount"] in (None, "") else float(d["max_discount"])
        if "min_order" in d:
            c.min_order = float(d["min_order"])
    except (TypeError, ValueError):
        return jsonify(error="Invalid values"), 400
    db.session.commit()
    return jsonify(ok=True, coupon=coupon_dict(c))


@main.post("/api/delivery/order/<int:oid>/whatsapp")
def delivery_whatsapp(oid):
    if not role_ok("delivery", "admin"):
        return jsonify(error="Forbidden"), 403
    o = db.session.get(Order, oid)
    if not o:
        return jsonify(error="Order not found"), 404
    if role_ok("delivery") and o.delivery_person_id != session.get("user_id"):
        return jsonify(error="Order not assigned to you"), 403
    status = str((request.json or {}).get("status") or o.status)
    messages = {
        "Out for Delivery": f"Hello {o.customer_name}, your Chand Enterprises order {o.code} is out for delivery. Our delivery partner is on the way.",
        "Delivered": f"Hello {o.customer_name}, your Chand Enterprises order {o.code} has been delivered. Thank you!",
        "Confirmed": f"Hello {o.customer_name}, your Chand Enterprises order {o.code} is confirmed."
    }
    text = messages.get(status, f"Hello {o.customer_name}, update for order {o.code}: {status}.")
    mobile = "".join(c for c in o.mobile if c.isdigit())
    mobile = mobile if len(mobile) > 10 else "91" + mobile
    return jsonify(ok=True, whatsapp_url=f"https://wa.me/{mobile}?text=" + urllib.parse.quote(text))


@main.post("/api/delivery/order/<int:oid>/cash")
def delivery_cash(oid):
    if not role_ok("delivery"):
        return jsonify(error="Forbidden"), 403
    o = db.session.get(Order, oid)
    if not o or o.delivery_person_id != session.get("user_id"):
        return jsonify(error="Order not assigned to you"), 404
    if o.payment_method != "COD":
        return jsonify(error="Only COD orders can record cash"), 400
    try:
        amount = float((request.json or {}).get("cash_collected", 0))
    except (TypeError, ValueError):
        return jsonify(error="Invalid cash amount"), 400
    if amount < 0 or amount > o.total:
        return jsonify(error="Cash amount cannot exceed order total"), 400
    o.cash_collected = amount
    if amount >= o.total:
        o.payment_status = "Paid"
        pay = Payment.query.filter_by(order_id=o.id).order_by(Payment.id.desc()).first()
        if pay:
            pay.status = "Paid"
    db.session.commit()
    return jsonify(ok=True, cash_collected=o.cash_collected, payment_status=o.payment_status)


# ---------- developer console ----------

@main.get("/api/developer/settings")
def developer_get_settings():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    return jsonify(ok=True, settings=developer_settings())


@main.put("/api/developer/settings")
def developer_save_settings():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    d = request.json or {}
    for key in ["business_name", "business_mobile", "whatsapp", "business_location", "upi", "payment_name", "business_lat", "business_lng", "delivery_base", "delivery_per_km", "delivery_free_above", "instagram_url", "facebook_url", "brochure_url"]:
        if key in d:
            value = str(d.get(key) or "").strip()
            if key in {"business_name", "whatsapp", "upi"} and not value:
                return jsonify(error=f"{key.replace('_', ' ').title()} is required"), 400
            if key in {"instagram_url", "facebook_url", "brochure_url"} and value and not _clean_http_url(value):
                return jsonify(error=f"{key.replace('_', ' ').title()} must be a valid http(s) URL"), 400
            set_setting(key, value)
    db.session.commit()
    return jsonify(ok=True, settings=developer_settings())


@main.get("/api/developer/offers")
def developer_get_offers():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    return jsonify(ok=True, offers=developer_settings()["offers"])


@main.post("/api/developer/offers")
def developer_add_offer():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    text = str((request.json or {}).get("text") or "").strip()
    if not text:
        return jsonify(error="Offer text is required"), 400
    offers = developer_settings()["offers"]
    offers.append(text)
    set_setting("offers", "\n".join(offers))
    db.session.commit()
    return jsonify(ok=True, offers=offers)


@main.put("/api/developer/offers/<int:index>")
def developer_update_offer(index):
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    text = str((request.json or {}).get("text") or "").strip()
    offers = developer_settings()["offers"]
    if index < 0 or index >= len(offers):
        return jsonify(error="Offer not found"), 404
    if not text:
        return jsonify(error="Offer text is required"), 400
    offers[index] = text
    set_setting("offers", "\n".join(offers))
    db.session.commit()
    return jsonify(ok=True, offers=offers)


@main.delete("/api/developer/offers/<int:index>")
def developer_delete_offer(index):
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    offers = developer_settings()["offers"]
    if index < 0 or index >= len(offers):
        return jsonify(error="Offer not found"), 404
    offers.pop(index)
    set_setting("offers", "\n".join(offers))
    db.session.commit()
    return jsonify(ok=True, offers=offers)


@main.get("/api/developer/products")
def developer_products():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    return jsonify(ok=True, products=[developer_product_dict(p) for p in Product.query.order_by(Product.id).all()])


@main.post("/api/developer/product")
def developer_create_product():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    d = request.json or {}
    try:
        p = Product(name=str(d.get("name") or "").strip(), category=str(d.get("category") or "Cold Drinks").strip(), price=float(d.get("price", 0)), stock=int(d.get("stock", 0)), low_stock_threshold=int(d.get("low_stock_threshold", 10)), icon=str(d.get("icon") or "🥤"), image_url=_clean_http_url(d.get("image_url") or ""), size=str(d.get("size") or "1L").strip() or "1L", active=bool(d.get("active", True)))
    except (TypeError, ValueError):
        return jsonify(error="Invalid product data"), 400
    if not p.name or not p.category or p.price < 0 or p.stock < 0:
        return jsonify(error="Invalid product data"), 400
    cat = Category.query.filter(db.func.lower(Category.name) == p.category.lower(), Category.active == True).first()
    if not cat:
        return jsonify(error="Choose an active category"), 400
    p.category = cat.name
    db.session.add(p)
    db.session.commit()
    return jsonify(ok=True, product=developer_product_dict(p))


@main.put("/api/developer/product/<int:pid>")
def developer_update_product(pid):
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    p = db.session.get(Product, pid)
    if not p:
        return jsonify(error="Product not found"), 404
    d = request.json or {}
    try:
        if "name" in d:
            p.name = str(d["name"] or "").strip()
        if "category" in d:
            p.category = str(d["category"] or "").strip()
        if "price" in d:
            p.price = float(d["price"])
        if "stock" in d:
            p.stock = int(d["stock"])
        if "low_stock_threshold" in d:
            p.low_stock_threshold = int(d["low_stock_threshold"])
        if "icon" in d:
            p.icon = str(d["icon"] or "🥤")
        if "size" in d:
            p.size = str(d["size"] or "1L").strip() or "1L"
        if "image_url" in d:
            raw_image_url = str(d.get("image_url") or "").strip()
            if raw_image_url and not _clean_http_url(raw_image_url):
                return jsonify(error="Image URL must start with https:// or http://"), 400
            p.image_url = raw_image_url
        if "active" in d:
            p.active = bool(d["active"])
    except (TypeError, ValueError):
        db.session.rollback()
        return jsonify(error="Invalid product data"), 400
    if not p.name or not p.category or p.price < 0 or p.stock < 0 or p.low_stock_threshold < 0:
        db.session.rollback()
        return jsonify(error="Invalid product data"), 400
    cat = Category.query.filter(db.func.lower(Category.name) == p.category.lower(), Category.active == True).first()
    if not cat:
        db.session.rollback()
        return jsonify(error="Choose an active category"), 400
    p.category = cat.name
    db.session.commit()
    return jsonify(ok=True, product=developer_product_dict(p))


@main.delete("/api/developer/product/<int:pid>")
def developer_delete_product(pid):
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    p = db.session.get(Product, pid)
    if not p:
        return jsonify(error="Product not found"), 404
    p.active = False
    db.session.commit()
    return jsonify(ok=True)
