import csv, io, secrets, urllib.parse, math, re, os, base64, json, mimetypes, urllib.request, urllib.error, smtplib, tempfile, uuid, threading
from pathlib import Path

import segno
from email.message import EmailMessage
from sqlalchemy import case

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from sqlalchemy.orm import joinedload, selectinload

from datetime import datetime, timedelta

from flask import (Blueprint, render_template, request, redirect, url_for,
                   session, jsonify, Response, current_app, g, send_file)

from werkzeug.security import generate_password_hash, check_password_hash

from . import db

from .models import User, Product, Category, Order, OrderItem, Enquiry, Payment, OtpChallenge, SiteSetting, Coupon, LedgerEntry, OrderArchive, ArchivedOrder, OrderTrackingEvent, TelegramLink, TelegramToken, StaffTelegramLink


main = Blueprint("main", __name__)

# Fast hash for the short-lived 4-digit OTP (the default scrypt costs ~100 ms and 32 MB per call).
# Old hashes keep working: check_password_hash reads the method from the stored hash.
OTP_HASH_METHOD = "pbkdf2:sha256:30000"

ORDER_STATUSES = {"Confirmed", "Preparing", "Out for Delivery", "Delivered", "Cancelled"}

PAY_STATUSES = {"Pending", "Verifying", "Paid", "Failed"}

# ---------- developer settings ----------
DEFAULT_SETTINGS = {
    "business_name": "Chand Enterprises",
    "business_mobile": "9304285574",
    "whatsapp": "9304285574",
    "business_location": "Darbhanga, Bihar",
    "upi": "chandenterprises@upi",
    "payment_name": "Chand Enterprises",
    "business_lat": "",
    "business_lng": "",
    "delivery_base": "30",
    "delivery_per_km": "10",
    "delivery_free_above": "500",
    "maps_enabled": "1",
    "map_customer_tracking": "1",
    "map_delivery_navigation": "1",
    "map_admin_view": "1",
    "show_prices_home": "1",
    "show_prices_brochure": "1",
    "ordering_enabled": "1",
    "customer_login_enabled": "1",
    "brochure_url": "",
    "brochure_eyebrow": "CHAND ENTERPRISES · DARBHANGA, BIHAR",
    "brochure_title": "Premium Product Brochure",
    "brochure_subtitle": "Explore our three product collections — Nevas Package Drinking Water, Cold Drinks and Energy Drinks.",
    "instagram_url": "",
    "facebook_url": "",
    "social_links": "",
    "about_title": "About Chand Enterprises",
    "about_text": "Chand Enterprises supplies cold drinks, energy drinks and premium packaged drinking water across Darbhanga, Bihar. We deliver locally, accept QR or cash on delivery, and welcome bulk orders for shops, events and offices.",
    "footer_tagline": "Drinks & premium water",
    "home_delivery_title": "Local delivery",
    "home_delivery_text": "Fast delivery across Darbhanga",
    "home_payment_title": "Easy payment",
    "home_payment_text": "Pay by QR or Cash on Delivery",
    "home_support_title": "WhatsApp support",
    "home_support_text": "Bulk orders are welcome",
    "home_store_eyebrow": "OUR STORE",
    "home_products_title": "Popular products",
    "home_products_text": "Quality drinks, simple pricing.",
    "home_bulk_badge": "WhatsApp enquiry",
    "home_bulk_title": "Need a bulk order?",
    "home_bulk_text": "Tell us what you need and we'll help you arrange your order directly.",
    "home_bulk_button": "Enquire on WhatsApp",
    "home_event_button": "🎉 Plan a function",
    "home_bulk_order_button": "📦 Bulk order",
    "footer_contact_title": "Contact",
    "footer_whatsapp_label": "WhatsApp us",
    "footer_copyright_prefix": "©",
    "archive_days": "7",
    "archive_method": "email",
    "archive_email": "",
    "archive_whatsapp": "",
    "otp_provider": "demo",
    "telegram_bot_username": "",
    "notify_customer_status": "1",
    "notify_admin_orders": "1",
    "notify_admin_low_stock": "1",
    "notify_delivery_assign": "1",
    "notify_daily_summary": "1",
    "last_summary_date": "",
    "summary_time": "21:30",
    "last_cron_tick": "",
}

# Maximum length of the brochure heading texts the developer can edit
BROCHURE_TEXT_LIMITS = {"brochure_eyebrow": 80, "brochure_title": 80, "brochure_subtitle": 300}

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


def _flag(key, legacy=None):
    """On/off site switch. Anything except "0" means ON. `legacy` = older single
    key to fall back to, so a site that already saved the old setting keeps its choice."""
    cache = _settings_cache()
    raw = cache.get(key)
    if raw is None and legacy:
        raw = cache.get(legacy)
    return str(raw if raw is not None else "1").strip() != "0"


def prices_home():
    """Developer switch: show prices on the home page product cards."""
    return _flag("show_prices_home", "show_prices")


def prices_brochure():
    """Developer switch: show prices on the brochure page."""
    return _flag("show_prices_brochure", "show_prices")


def ordering_enabled():
    """Developer switch: cart + checkout on/off."""
    return _flag("ordering_enabled")


def customer_login_enabled():
    """Developer switch: customer (OTP) login on/off. Staff/admin/developer login is never affected."""
    return _flag("customer_login_enabled")


LOGIN_PAUSED_MESSAGE = "Customer login is paused right now. Please order on WhatsApp."


SOCIAL_LIMIT = 12


def social_links():
    """
    Social media links shown in the footer and on the About page.
    Developer manages them as a list: [{"name": "Instagram", "url": "https://..."}, ...]
    Older sites that only saved instagram_url / facebook_url keep working.
    """
    raw = setting_value("social_links")
    links = []
    if raw:
        try:
            data = json.loads(raw)
        except ValueError:
            data = []
        for item in data if isinstance(data, list) else []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()[:30]
            url = _clean_http_url(item.get("url"))
            if name and url:
                links.append({"name": name, "url": url})
        return links[:SOCIAL_LIMIT]
    for name, key in (("Instagram", "instagram_url"), ("Facebook", "facebook_url")):
        url = _clean_http_url(setting_value(key))
        if url:
            links.append({"name": name, "url": url})
    return links


def site_info():
    """Everything the nav, footer and About page need - all editable by the developer."""
    mobile = "".join(c for c in setting_value("business_mobile") if c.isdigit())
    return {
        "name": setting_value("business_name") or "Chand Enterprises",
        "mobile": mobile,
        "tel": ("+91" + mobile[-10:]) if len(mobile) >= 10 else mobile,
        "location": setting_value("business_location") or "Darbhanga, Bihar",
        "whatsapp_url": "https://wa.me/" + wa_number(),
        "tagline": setting_value("footer_tagline") or DEFAULT_SETTINGS["footer_tagline"],
        "about_title": setting_value("about_title") or DEFAULT_SETTINGS["about_title"],
        "about_text": setting_value("about_text") or DEFAULT_SETTINGS["about_text"],
        "social": social_links(),
        "footer_contact_title": setting_value("footer_contact_title") or DEFAULT_SETTINGS["footer_contact_title"],
        "footer_whatsapp_label": setting_value("footer_whatsapp_label") or DEFAULT_SETTINGS["footer_whatsapp_label"],
        "copyright_prefix": setting_value("footer_copyright_prefix") or DEFAULT_SETTINGS["footer_copyright_prefix"],
    }


@main.app_context_processor
def inject_site_flags():
    try:
        return {"ordering_on": ordering_enabled(), "login_on": customer_login_enabled(), "site": site_info()}
    except Exception:
        return {"ordering_on": True, "login_on": True, "site": {
            "name": "Chand Enterprises", "mobile": "", "tel": "", "location": "Darbhanga, Bihar",
            "whatsapp_url": "", "tagline": "Drinks & premium water",
            "about_title": "About Chand Enterprises", "about_text": "", "social": []}}


def offers_list():
    raw = setting_value("offers")
    return [x.strip() for x in raw.splitlines() if x.strip()] if raw else DEFAULT_OFFERS[:]


def image_thumb(url, width=640):
    """Same resized WebP URL the storefront uses, so the browser cache is shared
    and the brochure no longer downloads multi-MB originals."""
    url = (url or "").strip()
    if not url.lower().startswith(("http://", "https://")):
        return url
    return "https://wsrv.nl/?url=" + urllib.parse.quote(url, safe="") + f"&w={width}&output=webp&q=85"


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
    return {"business_name": setting_value("business_name"), "business_mobile": setting_value("business_mobile"), "whatsapp": setting_value("whatsapp"), "business_location": setting_value("business_location"), "upi": setting_value("upi"), "payment_name": setting_value("payment_name"), "business_lat": setting_value("business_lat"), "business_lng": setting_value("business_lng"), "delivery_base": setting_value("delivery_base"), "delivery_per_km": setting_value("delivery_per_km"), "delivery_free_above": setting_value("delivery_free_above"), "instagram_url": setting_value("instagram_url"), "facebook_url": setting_value("facebook_url"), "social_links": social_links(), "about_title": setting_value("about_title"), "about_text": setting_value("about_text"), "footer_tagline": setting_value("footer_tagline"), "home_delivery_title": setting_value("home_delivery_title"), "home_delivery_text": setting_value("home_delivery_text"), "home_payment_title": setting_value("home_payment_title"), "home_payment_text": setting_value("home_payment_text"), "home_support_title": setting_value("home_support_title"), "home_support_text": setting_value("home_support_text"), "home_store_eyebrow": setting_value("home_store_eyebrow"), "home_products_title": setting_value("home_products_title"), "home_products_text": setting_value("home_products_text"), "home_bulk_badge": setting_value("home_bulk_badge"), "home_bulk_title": setting_value("home_bulk_title"), "home_bulk_text": setting_value("home_bulk_text"), "home_bulk_button": setting_value("home_bulk_button"), "home_event_button": setting_value("home_event_button"), "home_bulk_order_button": setting_value("home_bulk_order_button"), "footer_contact_title": setting_value("footer_contact_title"), "footer_whatsapp_label": setting_value("footer_whatsapp_label"), "footer_copyright_prefix": setting_value("footer_copyright_prefix"), "show_prices_home": prices_home(), "show_prices_brochure": prices_brochure(), "ordering_enabled": ordering_enabled(), "customer_login_enabled": customer_login_enabled(), "brochure_url": setting_value("brochure_url"), "brochure_eyebrow": setting_value("brochure_eyebrow"), "brochure_title": setting_value("brochure_title"), "brochure_subtitle": setting_value("brochure_subtitle"), "archive_days": setting_value("archive_days") or "7", "archive_method": setting_value("archive_method") or "email", "archive_email": setting_value("archive_email"), "archive_whatsapp": setting_value("archive_whatsapp"), "offers": offers, "otp_provider": setting_value("otp_provider") or "demo", "telegram_bot_username": setting_value("telegram_bot_username"), "notify_customer_status": _flag("notify_customer_status"), "notify_admin_orders": _flag("notify_admin_orders"), "notify_admin_low_stock": _flag("notify_admin_low_stock"), "notify_delivery_assign": _flag("notify_delivery_assign"), "notify_daily_summary": _flag("notify_daily_summary"), "summary_time": setting_value("summary_time") or "21:30",
            "maps_enabled": _flag("maps_enabled"), "map_customer_tracking": _flag("map_customer_tracking"),
            "map_delivery_navigation": _flag("map_delivery_navigation"), "map_admin_view": _flag("map_admin_view"),
            }


def display_datetime(dt):
    if not dt:
        return ""
    # Existing database timestamps are stored as UTC; display in India time.
    return (dt + timedelta(hours=5, minutes=30)).strftime("%d-%m-%Y %I:%M %p")


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
                map_url=o.map_url, directions_url=o.directions_url,
                map_features={"enabled": _flag("maps_enabled"),
                              "customer_tracking": _flag("maps_enabled") and _flag("map_customer_tracking"),
                              "delivery_navigation": _flag("maps_enabled") and _flag("map_delivery_navigation"),
                              "admin_view": _flag("maps_enabled") and _flag("map_admin_view")},
                total=o.total, subtotal=o.subtotal, discount=o.discount,
                delivery_charge=o.delivery_charge, payment=o.payment_method,
                payment_status=o.payment_status, status=o.status,
                created=display_datetime(o.created_at),
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
                        product_id=i.product_id,
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


def add_tracking_event(o, title, event_type="status", status=None, note="", actor_user_id=None):
    """Append a customer-safe order timeline event; caller commits the transaction."""
    db.session.add(OrderTrackingEvent(
        order_id=o.id, event_type=event_type, status=status or o.status,
        title=str(title or "Order updated")[:120], note=str(note or "")[:500],
        actor_user_id=actor_user_id if actor_user_id is not None else session.get("user_id")
    ))


def set_status(o, status):
    old_status = o.status
    if status == "Cancelled" and old_status != "Cancelled":
        restock(o)
    o.status = status
    if old_status != status:
        labels = {
            "Confirmed": "Order confirmed", "Preparing": "Order is being prepared",
            "Out for Delivery": "Order is out for delivery", "Delivered": "Order delivered",
            "Cancelled": "Order cancelled"
        }
        add_tracking_event(o, labels.get(status, f"Status changed to {status}"), status=status)


# ---------- login code (OTP) delivery ----------

# Where the customer's login code is sent. The developer picks one in
# Developer > Login and OTP Settings.
#   demo     = old behaviour (code shown on screen when env DEV_OTP=1)
#   telegram = free Telegram bot
# Add "whatsapp" / "sms" here later (see the commented lines in deliver_otp).
OTP_PROVIDERS = {"demo", "telegram"}


def telegram_ready():
    return bool(os.getenv("TELEGRAM_BOT_TOKEN") and os.getenv("TELEGRAM_WEBHOOK_SECRET")
                and setting_value("telegram_bot_username"))


def tg_call(method, payload=None):
    """Call the Telegram Bot API. Returns the parsed JSON, or None if the token is missing / network fails."""
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        return None
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload or {}).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return json.loads(exc.read().decode("utf-8"))      # Telegram explains 4xx errors in JSON
        except Exception:
            return {"ok": False, "error_code": exc.code}
    except Exception:
        current_app.logger.warning("Telegram call %s failed", method)   # never log the URL: it contains the token
        return None


def telegram_send_otp(mobile, otp):
    if not telegram_ready():
        return {"ok": False, "error": "Telegram login is not set up yet. Please order on WhatsApp."}
    now = datetime.utcnow()

    link = TelegramLink.query.filter_by(mobile=mobile).first()
    if link:
        business = setting_value("business_name") or "Chand Enterprises"
        r = tg_call("sendMessage", {
            "chat_id": link.chat_id,
            "text": f"🔐 Your {business} login code: {otp}\nValid for 5 minutes. Do not share it with anyone."})
        if r and r.get("ok"):
            return {"ok": True, "channel": "telegram"}
        if r is None:
            return {"ok": False, "error": "Could not reach Telegram. Please try again."}
        if r.get("error_code") in (400, 403):          # user blocked the bot / chat no longer exists -> relink
            db.session.delete(link)
            db.session.commit()
        else:
            return {"ok": False, "error": "Could not send the code on Telegram. Please try again."}

    # Not linked yet: give the website a one-time "Open Telegram" link.
    TelegramToken.query.filter(TelegramToken.expires_at < now - timedelta(days=1)).delete(synchronize_session=False)
    pending = TelegramToken.query.filter(TelegramToken.mobile == mobile, TelegramToken.used == False,
                                         TelegramToken.expires_at > now).count()
    if pending >= 5:
        db.session.commit()
        return {"ok": False, "error": "Too many attempts. Please wait a few minutes and try again."}
    token = secrets.token_urlsafe(12)
    db.session.add(TelegramToken(token=token, mobile=mobile, expires_at=now + timedelta(minutes=10)))
    db.session.commit()
    return {"ok": True, "needs_link": True, "token": token,
            "link": f"https://t.me/{setting_value('telegram_bot_username')}?start={token}"}


def deliver_otp(mobile, otp):
    """Send the code through whichever provider the developer selected."""
    provider = (setting_value("otp_provider") or "demo").strip().lower()
    if provider == "telegram":
        return telegram_send_otp(mobile, otp)
    # --- later, add more providers here and in OTP_PROVIDERS: ---
    # if provider == "whatsapp": return whatsapp_send_otp(mobile, otp)
    # if provider == "sms":      return sms_send_otp(mobile, otp)
    out = {"ok": True, "channel": "demo"}
    if current_app.config["DEV_OTP"]:               # demo only: code is shown on screen
        out["dev_otp"] = otp
    return out


def new_otp(mobile):
    now = datetime.utcnow()
    last = OtpChallenge.query.filter_by(mobile=mobile, verified=False).order_by(OtpChallenge.id.desc()).first()
    if last and (now - last.last_sent_at).total_seconds() < 30:
        wait = 30 - int((now - last.last_sent_at).total_seconds())
        return jsonify(ok=False, error=f"Please wait {wait} seconds before requesting another OTP"), 429
    otp = f"{secrets.randbelow(10000):04d}"
    challenge = OtpChallenge(mobile=mobile, otp_hash=generate_password_hash(otp, method=OTP_HASH_METHOD),
                             expires_at=now + timedelta(minutes=5), last_sent_at=now)
    db.session.add(challenge)
    db.session.commit()
    session["otp_mobile"] = mobile

    sent = deliver_otp(mobile, otp)
    if not sent.get("ok") or sent.get("needs_link"):
        # nothing was delivered yet, so don't make the customer wait 30 s (resend right after linking)
        challenge.last_sent_at = now - timedelta(seconds=31)
        db.session.commit()
    if not sent.get("ok"):
        return jsonify(ok=False, error=sent.get("error") or "Could not send the login code"), 502

    out = dict(ok=True, otp_sent=not sent.get("needs_link"), expires_in=300, channel=sent.get("channel", ""))
    if sent.get("needs_link"):
        out.update(needs_link=True, channel="telegram", link=sent["link"], token=sent["token"])
    if sent.get("dev_otp"):
        out["dev_otp"] = sent["dev_otp"]
    return jsonify(out)


# ---------- pages ----------

@main.route("/")
def home():
    prods = [product_dict(p) for p in Product.query.filter_by(active=True)]
    home_keys = ["home_delivery_title", "home_delivery_text", "home_payment_title", "home_payment_text",
                 "home_support_title", "home_support_text", "home_store_eyebrow", "home_products_title",
                 "home_products_text", "home_bulk_badge", "home_bulk_title", "home_bulk_text",
                 "home_bulk_button", "home_event_button", "home_bulk_order_button"]
    home_copy = {key: setting_value(key) for key in home_keys}
    return render_template("index.html", products=prods, show_prices=prices_home(), home_copy=home_copy)


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


@main.route("/about")
def about():
    return render_template("about.html", offers=offers_list())


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
    brochure_text = {
        "eyebrow": setting_value("brochure_eyebrow").strip() or DEFAULT_SETTINGS["brochure_eyebrow"],
        "title": setting_value("brochure_title").strip() or DEFAULT_SETTINGS["brochure_title"],
        "subtitle": setting_value("brochure_subtitle").strip() or DEFAULT_SETTINGS["brochure_subtitle"],
    }
    return render_template("brochure.html", brochure_pdf_exists=os.path.exists(pdf_path), b=links,
                           product_groups=grouped, brochure_text=brochure_text,
                           show_prices=prices_brochure(), offers=offers_list(),
                           products=[product_dict(p) for p in products], thumb=image_thumb)


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


def github_path_from_url(url):
    """
    Return the repo path of an image that WE uploaded (inside GITHUB_IMAGE_FOLDER of our
    repo/branch), or "" for anything else (pasted external URLs are never touched).
    """
    cfg = github_image_config()
    url = (url or "").strip()
    if not (cfg["token"] and cfg["repo"] and url):
        return ""
    prefix = f"https://raw.githubusercontent.com/{cfg['repo']}/{urllib.parse.quote(cfg['branch'], safe='')}/"
    if not url.lower().startswith(prefix.lower()):
        return ""
    path = urllib.parse.unquote(url[len(prefix):].split("?")[0].split("#")[0])
    if ".." in path or not path.startswith(cfg["folder"] + "/"):
        return ""
    return path


def github_delete_file(path, message):
    """Delete one file from the GitHub repo (Contents API). A file that is already gone counts as deleted."""
    cfg = github_image_config()
    api_url = f"https://api.github.com/repos/{cfg['repo']}/contents/{urllib.parse.quote(path, safe='/-._')}"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {cfg['token']}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Chand-Enterprises/1.0",
    }
    try:
        get_req = urllib.request.Request(api_url + "?ref=" + urllib.parse.quote(cfg["branch"], safe=""), headers=headers)
        with urllib.request.urlopen(get_req, timeout=20) as response:
            sha = json.loads(response.read().decode("utf-8")).get("sha")
        if not sha:
            raise RuntimeError("GitHub did not return the file id")
        del_req = urllib.request.Request(
            api_url,
            data=json.dumps({"message": message, "sha": sha, "branch": cfg["branch"]}).encode("utf-8"),
            method="DELETE",
            headers=dict(headers, **{"Content-Type": "application/json"}),
        )
        with urllib.request.urlopen(del_req, timeout=25):
            pass
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return True
        raise RuntimeError(f"GitHub returned HTTP {exc.code}")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach GitHub: {exc.reason}")
    return True


def delete_replaced_image(old_url, new_url=""):
    """
    Call AFTER the product row is saved. If old_url was one of our uploaded GitHub images and
    nothing uses it any more, delete it from the repo. Best-effort: a GitHub problem never
    breaks the product update. Returns True (deleted), False (tried, failed) or None (nothing to do).
    """
    old_url = (old_url or "").strip()
    if not old_url or old_url == (new_url or "").strip():
        return None
    path = github_path_from_url(old_url)
    if not path:
        return None
    if Product.query.filter(Product.image_url == old_url).first():
        return None                      # another product still shows this image
    try:
        return github_delete_file(path, f"Remove replaced product image: {path.rsplit('/', 1)[-1]}")
    except RuntimeError as exc:
        current_app.logger.warning("Could not delete old product image %s: %s", path, exc)
        return False


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
        old_url = p.image_url
        p.image_url = clean
        db.session.commit()
        deleted = delete_replaced_image(old_url, clean)
        return jsonify(ok=True, image_url=p.image_url, source="url", old_image_deleted=deleted)

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

    old_url = p.image_url
    p.image_url = raw_url
    db.session.commit()
    deleted = delete_replaced_image(old_url, raw_url)
    return jsonify(ok=True, image_url=raw_url, github_path=path, source="github", old_image_deleted=deleted)


@main.delete("/api/product/<int:pid>/image")
def product_image_remove(pid):
    if not role_ok("admin", "developer"):
        return jsonify(error="Forbidden"), 403
    p = db.session.get(Product, pid)
    if not p:
        return jsonify(error="Product not found"), 404
    old_url = p.image_url
    p.image_url = ""
    db.session.commit()
    deleted = delete_replaced_image(old_url, "")      # also removes the file from GitHub
    return jsonify(ok=True, old_image_deleted=deleted)


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
        if not customer_login_enabled():
            return jsonify(ok=False, login_paused=True, error=LOGIN_PAUSED_MESSAGE), 403
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
    if not customer_login_enabled():
        return jsonify(ok=False, login_paused=True, error=LOGIN_PAUSED_MESSAGE), 403
    m = session.get("otp_mobile")
    if not m:
        return jsonify(ok=False, error="OTP session expired"), 400
    return new_otp(m)


@main.post("/api/verify-otp")
def verify_otp():
    if not customer_login_enabled():
        return jsonify(ok=False, login_paused=True, error=LOGIN_PAUSED_MESSAGE), 403
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


# ---------- Telegram alerts (orders, admin, delivery, daily summary) ----------
# All alerts are sent from a background thread so a slow Telegram never slows down an order,
# and a Telegram problem can never make an order, status change or assignment fail.

def telegram_bot_ready():
    """Bot token is set and the bot has been connected from the Developer panel."""
    return bool(os.getenv("TELEGRAM_BOT_TOKEN") and setting_value("telegram_bot_username"))


def tg_send_async(chat_ids, text):
    chat_ids = [c for c in dict.fromkeys(chat_ids or []) if c]
    if not chat_ids or not text or not telegram_bot_ready():
        return
    app = current_app._get_current_object()

    def run():
        with app.app_context():
            for chat_id in chat_ids:
                try:
                    tg_call("sendMessage", {"chat_id": chat_id, "text": text[:4000],
                                            "disable_web_page_preview": True})
                except Exception:
                    pass

    threading.Thread(target=run, daemon=True).start()


def safe_notify(fn, *args):
    try:
        fn(*args)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Telegram alert failed (%s)", getattr(fn, "__name__", "?"))


def admin_chat_ids():
    rows = (db.session.query(StaffTelegramLink.chat_id)
            .join(User, User.id == StaffTelegramLink.user_id)
            .filter(User.role == "admin", User.active == True).all())
    return [r[0] for r in rows]


def staff_chat_id(user_id):
    row = StaffTelegramLink.query.filter_by(user_id=user_id).first() if user_id else None
    return row.chat_id if row else None


def customer_chat_id(mobile):
    row = TelegramLink.query.filter_by(mobile=mobile).first() if mobile else None
    return row.chat_id if row else None


def _business_name():
    return setting_value("business_name") or "Chand Enterprises"


def _order_lines_text(o):
    return "\n".join(
        f"• {i.product_name}" + (f" ({i.product_size})" if i.product_size else "") + f" x {i.quantity} = ₹{i.line_total:.0f}"
        for i in o.items)


def notify_customer_order(o, kind):
    """kind: 'placed' | an order status | 'paid'. Only customers who linked Telegram get it."""
    if not _flag("notify_customer_status"):
        return
    chat_id = customer_chat_id(o.mobile)
    if not chat_id:
        return
    biz = _business_name()
    if kind == "placed":
        text = (f"✅ {biz}: order received\nOrder: {o.code}\n\n{_order_lines_text(o)}\n\n"
                f"Subtotal: ₹{o.subtotal:.0f}\nDiscount: ₹{o.discount:.0f}\nDelivery: ₹{o.delivery_charge:.0f}\n"
                f"Total: ₹{o.total:.0f}\nPayment: {o.payment_method} ({o.payment_status})\n\n"
                "We will update you here as your order moves.")
    elif kind == "Confirmed":
        text = f"✅ Your order {o.code} is confirmed."
    elif kind == "Preparing":
        text = f"👨‍🍳 Your order {o.code} is being prepared."
    elif kind == "Out for Delivery":
        who = o.delivery_person.name if o.delivery_person else ""
        text = f"🚚 Your order {o.code} is out for delivery." + (f"\nDelivery partner: {who}" if who else "")
    elif kind == "Delivered":
        text = f"📦 Your order {o.code} has been delivered. Total ₹{o.total:.0f}. Thank you for choosing {biz}!"
    elif kind == "Cancelled":
        text = f"❌ Your order {o.code} has been cancelled."
    elif kind == "paid":
        text = f"💰 Payment of ₹{o.total:.0f} received for order {o.code}. Thank you!"
    else:
        return
    tg_send_async([chat_id], text)


def _admin_order_text(o, title):
    loc = f"\n📍 {o.map_url}" if o.map_url else ""
    return (f"{title}\nOrder: {o.code}\n{o.customer_name} · {o.mobile}\n{o.address}{loc}\n\n"
            f"{_order_lines_text(o)}\n\nTotal: ₹{o.total:.0f} · {o.payment_method} ({o.payment_status})")


def notify_admins_order(o, title, extra=""):
    if not _flag("notify_admin_orders"):
        return
    tg_send_async(admin_chat_ids(), _admin_order_text(o, title) + (("\n" + extra) if extra else ""))


def notify_low_stock(products):
    if not _flag("notify_admin_low_stock"):
        return
    low = [p for p in products if p.stock <= (p.low_stock_threshold or 10)]
    if not low:
        return
    lines = [f"• {p.name}" + (f" ({p.size})" if p.size else "") + f": {p.stock} left (alert at {p.low_stock_threshold or 10})"
             for p in low]
    tg_send_async(admin_chat_ids(), "⚠️ Low stock\n" + "\n".join(lines))


def notify_delivery_assigned(o):
    if not _flag("notify_delivery_assign"):
        return
    chat_id = staff_chat_id(o.delivery_person_id)
    if not chat_id:
        return
    loc = f"\n📍 {o.map_url}" if o.map_url else ""
    cash = ""
    if o.payment_method == "COD" and o.payment_status != "Paid":
        cash = f"\n💵 Collect cash: ₹{max(0, o.total - (o.cash_collected or 0)):.0f}"
    text = (f"📦 New delivery assigned\nOrder: {o.code}\n{o.customer_name} · {o.mobile}\n{o.address}{loc}\n\n"
            f"{_order_lines_text(o)}\n\nTotal: ₹{o.total:.0f} · {o.payment_method} ({o.payment_status}){cash}")
    tg_send_async([chat_id], text)


def build_daily_summary():
    """Summary of today (India time) for the admin chats."""
    ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
    day_ist = ist_now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = day_ist - timedelta(hours=5, minutes=30)          # back to UTC for the database
    end = start + timedelta(days=1)
    orders = Order.query.filter(Order.created_at >= start, Order.created_at < end).all()
    live = [o for o in orders if o.status != "Cancelled"]
    revenue = sum(o.total for o in live if o.payment_status == "Paid")
    unpaid = sum(o.total for o in live if o.payment_status != "Paid")
    cash = sum((o.cash_collected or 0) for o in live if o.payment_method == "COD")
    delivered = sum(1 for o in live if o.status == "Delivered")
    qty_sum = db.func.sum(OrderItem.quantity)
    top = (db.session.query(OrderItem.product_name, qty_sum)
           .join(Order, Order.id == OrderItem.order_id)
           .filter(Order.created_at >= start, Order.created_at < end, Order.status != "Cancelled")
           .group_by(OrderItem.product_name).order_by(qty_sum.desc()).limit(3).all())
    low = Product.query.filter(Product.active == True, Product.stock <= Product.low_stock_threshold).count()
    lines = [f"📊 {_business_name()} · {day_ist.strftime('%d %b %Y')}",
             f"Orders: {len(live)} (cancelled {len(orders) - len(live)})",
             f"Delivered: {delivered}",
             f"Paid revenue: ₹{revenue:.0f}",
             f"Not paid yet: ₹{unpaid:.0f}",
             f"COD cash collected: ₹{cash:.0f}"]
    if top:
        lines.append("Top products: " + ", ".join(f"{n} x{int(q)}" for n, q in top))
    if low:
        lines.append(f"⚠️ {low} product(s) at or below the low-stock alert")
    return day_ist.strftime("%Y-%m-%d"), "\n".join(lines)


def _ist_today():
    return (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d")


def claim_summary_day(day):
    """Atomically mark `day` as sent. True only for the ONE caller that wins (safe with several workers)."""
    if not SiteSetting.query.filter_by(key="last_summary_date").first():
        try:
            db.session.add(SiteSetting(key="last_summary_date", value=""))
            db.session.commit()
        except Exception:
            db.session.rollback()
    won = SiteSetting.query.filter(SiteSetting.key == "last_summary_date", SiteSetting.value != day) \
        .update({"value": day}, synchronize_session=False)
    db.session.commit()
    _settings_cache()["last_summary_date"] = day
    return won == 1


def send_daily_summary(force=False):
    """force=True is the manual 'send now' button: it never blocks the scheduled summary."""
    if not telegram_bot_ready():
        return {"ok": False, "error": "Telegram bot is not connected yet"}
    today = _ist_today()
    if not force and setting_value("last_summary_date") == today:
        return {"ok": True, "skipped": "already sent today"}
    chats = admin_chat_ids()
    if not chats:
        return {"ok": False, "error": "No admin has linked Telegram yet"}
    if not force and not claim_summary_day(today):
        return {"ok": True, "skipped": "already sent today"}
    try:
        _, text = build_daily_summary()
    except Exception:
        if not force:
            set_setting("last_summary_date", "")
            db.session.commit()
        raise
    tg_send_async(chats, text)
    return {"ok": True, "sent_to": len(chats)}


TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def cron_run():
    """One scheduler pass. A free pinger calls this every few minutes (and the Developer
    'Run check now' button). It decides what is due, using the settings the developer chose."""
    now_utc = datetime.utcnow()
    set_setting("last_cron_tick", now_utc.strftime("%Y-%m-%d %H:%M:%S"))
    db.session.commit()
    result = {"ok": True, "tick": True, "summary": "switched off"}
    if _flag("notify_daily_summary"):
        hhmm = setting_value("summary_time") or "21:30"
        if not TIME_RE.match(hhmm):
            hhmm = "21:30"
        ist = now_utc + timedelta(hours=5, minutes=30)
        if ist.strftime("%H:%M") < hhmm:
            result["summary"] = f"waiting for {hhmm} India time"
        else:
            r = send_daily_summary()
            result["summary"] = ("sent" if r.get("sent_to") else (r.get("skipped") or r.get("error") or "not sent"))
    return result


def _staff_link_payload(u):
    """One-time t.me link that connects THIS staff account's Telegram (no contact sharing needed)."""
    if not telegram_bot_ready():
        return None, "Connect the Telegram bot first (Settings > Login and OTP)"
    now = datetime.utcnow()
    TelegramToken.query.filter(TelegramToken.mobile == f"staff:{u.id}").delete(synchronize_session=False)
    token = secrets.token_urlsafe(12)
    db.session.add(TelegramToken(token=token, mobile=f"staff:{u.id}", expires_at=now + timedelta(minutes=10)))
    db.session.commit()
    link = f"https://t.me/{setting_value('telegram_bot_username')}?start={token}"
    digits = "".join(c for c in (u.mobile or "") if c.isdigit())
    wa = ""
    if len(digits) >= 10:
        wa = "https://wa.me/91" + digits[-10:] + "?text=" + urllib.parse.quote(
            f"Open this link on your phone to get {_business_name()} alerts on Telegram (valid 10 minutes): {link}")
    return {"link": link, "whatsapp_url": wa, "expires_in": 600}, None


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
    return jsonify(_ok=True, whatsapp=wa_number(), upi=cfg["upi"] or current_app.config["UPI_ID"], business_name=cfg["business_name"], business_mobile=cfg["business_mobile"], business_location=cfg["business_location"], payment_name=cfg["payment_name"], offers=cfg["offers"], show_prices_home=cfg["show_prices_home"], show_prices_brochure=cfg["show_prices_brochure"], ordering_enabled=cfg["ordering_enabled"], customer_login_enabled=cfg["customer_login_enabled"], maps_enabled=cfg["maps_enabled"], map_customer_tracking=cfg["map_customer_tracking"], map_delivery_navigation=cfg["map_delivery_navigation"], map_admin_view=cfg["map_admin_view"], free_delivery_above=float_setting("delivery_free_above", 500), instagram_url=cfg["instagram_url"], facebook_url=cfg["facebook_url"], social_links=cfg["social_links"], about_title=cfg["about_title"], about_text=cfg["about_text"], footer_tagline=cfg["footer_tagline"], brochure_url=cfg["brochure_url"], categories=[category_dict(c) for c in active_categories()], coupons=[coupon_dict(c) for c in Coupon.query.filter_by(active=True).order_by(Coupon.code).all()])


@main.get("/api/categories")
def api_categories():
    return jsonify([category_dict(c) for c in active_categories()])


@main.get("/api/products")
def api_products():
    return jsonify([product_dict(p) for p in Product.query.filter_by(active=True)])


@main.post("/api/orders")
def create_order():
    if not ordering_enabled():
        return jsonify(error="Online ordering is paused right now. Please order on WhatsApp."), 403

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
    add_tracking_event(o, "Order placed", status=o.status, note="Your order has been received.", actor_user_id=u.id)

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

    # Telegram alerts (never block or fail the order)
    safe_notify(notify_customer_order, o, "placed")
    safe_notify(notify_admins_order, o, "🛒 New order")
    safe_notify(notify_low_stock, [p for p, _ in lines])

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


@main.get("/api/orders/<code>/tracking")
def order_tracking(code):
    u = current_user()
    if not u:
        return jsonify(error="Please login to view order tracking"), 401
    o = Order.query.filter_by(code=code).first()
    if not o:
        return jsonify(error="Order not found"), 404
    if u.role == "customer" and u.mobile != o.mobile:
        return jsonify(error="You can only track your own orders"), 403
    if u.role == "delivery" and o.delivery_person_id != u.id:
        return jsonify(error="This order is not assigned to you"), 403
    if u.role not in {"customer", "admin", "developer", "delivery"}:
        return jsonify(error="Forbidden"), 403
    if not _flag("maps_enabled") or not _flag("map_customer_tracking"):
        return jsonify(error="Customer order tracking is disabled by the store"), 403
    events = OrderTrackingEvent.query.filter_by(order_id=o.id).order_by(OrderTrackingEvent.created_at.asc(), OrderTrackingEvent.id.asc()).all()
    flags = {
        "maps_enabled": _flag("maps_enabled"),
        "customer_tracking": _flag("maps_enabled") and _flag("map_customer_tracking"),
        "delivery_navigation": _flag("maps_enabled") and _flag("map_delivery_navigation"),
    }
    return jsonify(ok=True, order={"code": o.code, "status": o.status, "created": display_datetime(o.created_at),
                                  "address": o.address, "latitude": o.latitude, "longitude": o.longitude,
                                  "map_url": o.map_url, "directions_url": o.directions_url, "delivery_person": o.delivery_person.name if o.delivery_person else "",
                                  "delivery_mobile": o.delivery_person.mobile if o.delivery_person else "",
                                  "payment_status": o.payment_status},
                   events=[{"title": e.title, "type": e.event_type, "status": e.status,
                            "note": e.note or "", "at": display_datetime(e.created_at)} for e in events],
                   features=flags)


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
    add_tracking_event(o, "UPI payment submitted for verification", event_type="payment", status=o.status)
    db.session.commit()
    safe_notify(notify_admins_order, o, "💳 Payment to verify (UPI)", f"UTR: {pay.transaction_id or 'not given'}")
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
    safe_notify(notify_admins_order, o, "❌ Customer cancelled an order")
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

@main.get("/api/admin/delivery-map")
def admin_delivery_map():
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    if not _flag("maps_enabled") or not _flag("map_admin_view"):
        return jsonify(ok=True, enabled=False, orders=[])
    rows = Order.query.options(joinedload(Order.delivery_person)).filter(
        Order.latitude.isnot(None), Order.longitude.isnot(None),
        db.or_(Order.latitude != 0, Order.longitude != 0),
        Order.status.notin_(["Delivered", "Cancelled"])
    ).order_by(Order.created_at.desc()).limit(250).all()
    return jsonify(ok=True, enabled=True, orders=[{
        "code": o.code, "customer": o.customer_name, "address": o.address,
        "latitude": o.latitude, "longitude": o.longitude, "status": o.status,
        "delivery_person": o.delivery_person.name if o.delivery_person else "Unassigned",
        "map_url": o.map_url, "directions_url": o.directions_url
    } for o in rows])


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

    old_status, old_pay = o.status, o.payment_status

    if d.get("status"):
        if d["status"] not in ORDER_STATUSES:
            return jsonify(error="Invalid status"), 400
        set_status(o, d["status"])

    if d.get("payment_status"):
        if d["payment_status"] not in PAY_STATUSES:
            return jsonify(error="Invalid payment status"), 400
        o.payment_status = d["payment_status"]
        add_tracking_event(o, f"Payment status: {d['payment_status']}", event_type="payment", status=o.status)
        pay = Payment.query.filter_by(order_id=o.id).order_by(Payment.id.desc()).first()
        if pay:
            pay.status = d["payment_status"]

    db.session.commit()

    if o.status != old_status:
        safe_notify(notify_customer_order, o, o.status)
    if o.payment_status == "Paid" and old_pay != "Paid":
        safe_notify(notify_customer_order, o, "paid")
    return jsonify(ok=True)


@main.post("/api/admin/order/<int:oid>/delivery")
def assign_delivery(oid):
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    o = db.session.get(Order, oid)
    if not o:
        return jsonify(error="Order not found"), 404
    old_person = o.delivery_person_id
    val = (request.json or {}).get("delivery_person_id")
    o.delivery_person_id = int(val) if val else None
    if o.delivery_person_id != old_person:
        assigned = db.session.get(User, o.delivery_person_id) if o.delivery_person_id else None
        add_tracking_event(o, "Delivery partner assigned" if assigned else "Delivery partner unassigned",
                           event_type="assignment", note=(assigned.name if assigned else "Assignment removed"))
    db.session.commit()
    if o.delivery_person_id and o.delivery_person_id != old_person:
        safe_notify(notify_delivery_assigned, o)
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
    previous_image_url = p.image_url

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



def _xlsx_response(workbook, filename):
    out = io.BytesIO()
    workbook.save(out)
    out.seek(0)
    return Response(
        out.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _style_xlsx_sheet(ws):
    header_fill = PatternFill("solid", fgColor="DCEEFF")
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for column_cells in ws.columns:
        width = min(max(max(len(str(c.value or "")) for c in column_cells) + 2, 10), 40)
        ws.column_dimensions[column_cells[0].column_letter].width = width


@main.get("/admin/export-stock.xlsx")
def export_stock_xlsx():
    if not role_ok("admin"):
        return redirect(url_for("main.staff_login"))

    wb = Workbook()
    ws = wb.active
    ws.title = "Stock"
    ws.append(["ID", "Product", "Size", "Category", "Price", "Current Stock", "Alert At", "Status"])
    for p in Product.query.order_by(Product.category, Product.name, Product.id).all():
        ws.append([p.id, p.name, p.size or "1L", p.category, p.price, p.stock,
                   p.low_stock_threshold or 10, "Active" if p.active else "Inactive"])
    _style_xlsx_sheet(ws)
    return _xlsx_response(wb, "chand-stock.xlsx")


@main.get("/admin/export-sales.xlsx")
def export_sales_xlsx():
    if not role_ok("admin"):
        return redirect(url_for("main.staff_login"))

    wb = Workbook()
    ws = wb.active
    ws.title = "Sales"
    ws.append(["Order", "Date", "Customer", "Mobile", "Product", "Size", "Qty", "Unit Price",
               "Line Total", "Order Total", "Payment Method", "Payment Status", "Order Status"])

    orders = (Order.query
              .options(selectinload(Order.items))
              .filter(Order.status != "Cancelled", Order.payment_status == "Paid")
              .order_by(Order.created_at.desc()).all())
    for o in orders:
        if o.items:
            for item in o.items:
                ws.append([o.code, o.created_at.strftime("%d-%m-%Y %H:%M"), o.customer_name, o.mobile,
                           item.product_name, item.product_size or "1L", item.quantity, item.unit_price,
                           item.line_total, o.total, o.payment_method or "", o.payment_status, o.status])
        else:
            ws.append([o.code, o.created_at.strftime("%d-%m-%Y %H:%M"), o.customer_name, o.mobile,
                       "", "", 0, 0, 0, o.total, o.payment_method or "", o.payment_status, o.status])
    _style_xlsx_sheet(ws)

    top = wb.create_sheet("Top Products")
    top.append(["Product", "Quantity Sold"])
    qty_sum = db.func.sum(OrderItem.quantity)
    top_rows = (db.session.query(OrderItem.product_name, qty_sum)
                .join(Order, Order.id == OrderItem.order_id)
                .filter(Order.status != "Cancelled", Order.payment_status == "Paid")
                .group_by(OrderItem.product_name)
                .order_by(qty_sum.desc(), db.func.min(OrderItem.id)).all())
    for name, qty in top_rows:
        top.append([name, int(qty)])
    _style_xlsx_sheet(top)
    return _xlsx_response(wb, "chand-sales.xlsx")


@main.get("/admin/export-credit.xlsx")
def export_credit_xlsx():
    if not role_ok("admin"):
        return redirect(url_for("main.staff_login"))

    entries = LedgerEntry.query.order_by(LedgerEntry.created_at.desc()).all()
    balances = {}
    for e in entries:
        key = e.customer_mobile
        item = balances.setdefault(key, {"mobile": key, "name": e.customer_name, "balance": 0})
        item["balance"] += e.amount if e.entry_type == "debit" else -e.amount

    wb = Workbook()
    ws = wb.active
    ws.title = "Credit Summary"
    ws.append(["Customer", "Mobile", "Outstanding Credit"])
    for item in sorted(balances.values(), key=lambda x: x["balance"], reverse=True):
        ws.append([item["name"], item["mobile"], item["balance"]])
    _style_xlsx_sheet(ws)

    tx = wb.create_sheet("Transactions")
    tx.append(["Date", "Customer", "Mobile", "Type", "Amount", "Note", "Order ID"])
    for e in entries:
        tx.append([e.created_at.strftime("%d-%m-%Y %H:%M"), e.customer_name, e.customer_mobile,
                   "Credit" if e.entry_type == "debit" else "Payment", e.amount, e.note or "", e.order_id or ""])
    _style_xlsx_sheet(tx)
    return _xlsx_response(wb, "chand-credit.xlsx")


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

    old_status, old_pay = o.status, o.payment_status
    set_status(o, s)

    if s == "Delivered" and o.payment_method == "COD":
        if (o.cash_collected or 0) >= o.total:
            o.payment_status = "Paid"
            add_tracking_event(o, "Cash payment recorded", event_type="payment", status=o.status,
                               note=f"₹{(o.cash_collected or 0):.0f} collected")
            pay = Payment.query.filter_by(order_id=o.id).order_by(Payment.id.desc()).first()
            if pay:
                pay.status = "Paid"

    db.session.commit()

    if o.status != old_status:
        safe_notify(notify_customer_order, o, o.status)
        if s == "Delivered":
            who = session.get("name") or "Delivery partner"
            extra = f"Delivered by: {who}" + (f"\nCash collected: ₹{(o.cash_collected or 0):.0f}" if o.payment_method == "COD" else "")
            safe_notify(notify_admins_order, o, "✅ Order delivered", extra)
    if o.payment_status == "Paid" and old_pay != "Paid":
        safe_notify(notify_customer_order, o, "paid")
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
    """WhatsApp link for an order. body: {to: "customer" | "admin", status: optional}"""
    if not role_ok("delivery", "admin"):
        return jsonify(error="Forbidden"), 403
    o = db.session.get(Order, oid)
    if not o:
        return jsonify(error="Order not found"), 404
    if role_ok("delivery") and o.delivery_person_id != session.get("user_id"):
        return jsonify(error="Order not assigned to you"), 403
    d = request.json or {}
    status = str(d.get("status") or o.status)
    to = "admin" if str(d.get("to") or "customer").lower() == "admin" else "customer"

    if to == "admin":
        who = session.get("name") or "Delivery partner"
        lines = [f"Delivery update - order {o.code}",
                 f"Status: {status}",
                 f"Customer: {o.customer_name} ({o.mobile})",
                 f"Amount: Rs {o.total:.0f} | {o.payment_method or '-'} | {o.payment_status}"]
        if o.payment_method == "COD":
            lines.append(f"Cash collected: Rs {(o.cash_collected or 0):.0f}")
        lines.append(f"By: {who}")
        return jsonify(ok=True, whatsapp_url=wa_link("\n".join(lines)))

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
    old_pay = o.payment_status
    o.cash_collected = amount
    if amount >= o.total:
        o.payment_status = "Paid"
        pay = Payment.query.filter_by(order_id=o.id).order_by(Payment.id.desc()).first()
        if pay:
            pay.status = "Paid"
    db.session.commit()
    if o.payment_status == "Paid" and old_pay != "Paid":
        safe_notify(notify_customer_order, o, "paid")
    return jsonify(ok=True, cash_collected=o.cash_collected, payment_status=o.payment_status)


# ---------- order archive ----------

def _archive_days():
    try:
        return max(1, int(setting_value("archive_days") or 7))
    except (TypeError, ValueError):
        return 7


def _archive_workbook(orders, archive):
    wb = Workbook()
    ws = wb.active
    ws.title = "Orders"
    headers = ["Order ID", "Order #", "Booking Date", "Booking Time", "Customer", "Mobile", "Address", "Total", "Payment", "Status", "Delivery", "Coupon", "Discount"]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for o in orders:
        ws.append([
            o.id, o.code, o.created_at.strftime("%d-%m-%Y"), o.created_at.strftime("%I:%M %p"),
            o.customer_name, o.mobile, o.address, o.total, o.payment_status, o.status,
            o.delivery_person.name if o.delivery_person else "", o.coupon_code or "", o.discount or 0
        ])
    items = wb.create_sheet("Order Items")
    items.append(["Order ID", "Order #", "Product", "Size", "Category", "Quantity", "Unit Price", "Item Total"])
    for cell in items[1]:
        cell.font = Font(bold=True)
    for o in orders:
        for i in o.items:
            product = db.session.get(Product, i.product_id)
            items.append([o.id, o.code, i.product_name, i.product_size or "1L", product.category if product else "", i.quantity, i.unit_price, i.line_total])
    summary = wb.create_sheet("Archive Summary")
    summary.append(["Archive ID", "Period Start", "Period End", "Orders", "Total", "Method", "Recipient", "Status"])
    summary.append([archive.id, display_datetime(archive.period_start), display_datetime(archive.period_end), archive.order_count, archive.total_amount, archive.delivery_method, archive.recipient, archive.status])
    for sh in wb.worksheets:
        sh.freeze_panes = "A2"
        for col in sh.columns:
            max_len = min(max(len(str(c.value or "")) for c in col) + 2, 40)
            sh.column_dimensions[col[0].column_letter].width = max_len
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return out.getvalue()


def _send_archive_email(recipient, filename, data):
    host = os.getenv("SMTP_HOST", "")
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", user)
    if not host or not sender or not recipient:
        raise RuntimeError("Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM in Render, and set the archive email in Developer Settings.")
    port = int(os.getenv("SMTP_PORT", "587"))
    msg = EmailMessage()
    msg["Subject"] = "Chand Enterprises · Order Archive"
    msg["From"] = sender
    msg["To"] = recipient
    msg.set_content("Attached is the Chand Enterprises order archive. Admin confirmation is required before archived orders are deleted from the active database.")
    msg.add_attachment(data, maintype="application", subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=filename)
    with smtplib.SMTP(host, port, timeout=30) as smtp:
        if os.getenv("SMTP_USE_TLS", "1") == "1":
            smtp.starttls()
        if user:
            smtp.login(user, password)
        smtp.send_message(msg)


def _archive_whatsapp_link(recipient, archive):
    number = "".join(c for c in (recipient or "") if c.isdigit())
    if len(number) == 10:
        number = "91" + number
    text = (f"Chand Enterprises order archive #{archive.id}\\n"
            f"Orders: {archive.order_count}\\n"
            f"Total: ₹{archive.total_amount:.2f}\\n"
            f"Period: {archive.period_start.strftime('%d-%m-%Y')} to {archive.period_end.strftime('%d-%m-%Y')}\\n"
            f"Download archive: {url_for('main.archive_download', token=archive.download_token, _external=True)}\n"
            f"Please confirm receipt in the Admin Panel after receiving the archive.")
    return "https://wa.me/" + number + "?text=" + urllib.parse.quote(text)


def _create_archive(send=True):
    days = _archive_days()
    cutoff = datetime.utcnow() - timedelta(days=days)
    method = (setting_value("archive_method") or "email").lower()
    recipient = setting_value("archive_email") if method == "email" else setting_value("archive_whatsapp")
    if not recipient:
        raise RuntimeError("Set the archive recipient in Developer Settings first.")
    archived_ids = {x.order_id for x in ArchivedOrder.query.all()}
    q = Order.query.options(selectinload(Order.items), joinedload(Order.delivery_person)).filter(Order.created_at < cutoff)
    candidates = [o for o in q.order_by(Order.created_at.asc()).all() if o.id not in archived_ids]
    if not candidates:
        return None
    period_start = min(o.created_at for o in candidates)
    period_end = max(o.created_at for o in candidates)
    archive = OrderArchive(period_start=period_start, period_end=period_end, order_count=len(candidates), total_amount=sum(float(o.total or 0) for o in candidates), delivery_method=method, recipient=recipient, status="PREPARING", download_token=secrets.token_urlsafe(32))
    db.session.add(archive)
    db.session.flush()
    for o in candidates:
        db.session.add(ArchivedOrder(archive_id=archive.id, order_id=o.id))
    data = _archive_workbook(candidates, archive)
    filename = f"chand-enterprises-order-archive-{archive.id}.xlsx"
    archive.file_name = filename
    archive_dir = Path(current_app.instance_path) / "archives"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_path = archive_dir / filename
    archive_path.write_bytes(data)
    try:
        if method == "email":
            _send_archive_email(recipient, filename, data)
            archive.note = "Email sent successfully. Waiting for Admin confirmation."
            archive.status = "WAITING_CONFIRMATION"
            archive.sent_at = datetime.utcnow()
            result = {"method": "email"}
        elif method == "whatsapp":
            archive.note = "WhatsApp handoff link generated. Open it and send the archive to the configured number."
            archive.status = "WAITING_CONFIRMATION"
            archive.sent_at = datetime.utcnow()
            result = {"method": "whatsapp", "whatsapp_url": _archive_whatsapp_link(recipient, archive)}
        else:
            raise RuntimeError("Archive method must be email or whatsapp.")
        db.session.commit()
        return {"archive": archive, **result}
    except Exception:
        db.session.rollback()
        raise


@main.get("/archive/download/<token>")
def archive_download(token):
    archive = OrderArchive.query.filter_by(download_token=token).first()
    if not archive or archive.status == "RECEIVED_AND_DELETED":
        return "Archive not available", 404
    path = Path(current_app.instance_path) / "archives" / archive.file_name
    if not path.exists():
        return "Archive file is no longer available", 404
    return send_file(path, as_attachment=True, download_name=archive.file_name)


@main.get("/api/developer/archive/settings")
def developer_archive_settings():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    return jsonify(ok=True, settings={"archive_days": _archive_days(), "archive_method": setting_value("archive_method") or "email", "archive_email": setting_value("archive_email"), "archive_whatsapp": setting_value("archive_whatsapp")})


@main.put("/api/developer/archive/settings")
def developer_save_archive_settings():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    d = request.json or {}
    try:
        days = max(1, int(d.get("archive_days", 7)))
    except (TypeError, ValueError):
        return jsonify(error="Archive days must be a positive number"), 400
    method = str(d.get("archive_method") or "email").lower()
    if method not in {"email", "whatsapp"}:
        return jsonify(error="Choose Email or WhatsApp"), 400
    email = str(d.get("archive_email") or "").strip()
    wa = str(d.get("archive_whatsapp") or "").strip()
    if method == "email" and (not email or "@" not in email):
        return jsonify(error="Enter a valid archive email"), 400
    if method == "whatsapp" and len("".join(c for c in wa if c.isdigit())) < 10:
        return jsonify(error="Enter a valid WhatsApp number"), 400
    set_setting("archive_days", days); set_setting("archive_method", method); set_setting("archive_email", email); set_setting("archive_whatsapp", wa)
    db.session.commit()
    return jsonify(ok=True, settings={"archive_days": days, "archive_method": method, "archive_email": email, "archive_whatsapp": wa})


@main.post("/api/developer/archive/check")
def developer_archive_check():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    try:
        result = _create_archive()
        if not result:
            return jsonify(ok=True, created=False, message=f"No orders older than {_archive_days()} days are waiting for archive.")
        a = result["archive"]
        return jsonify(ok=True, created=True, archive={"id": a.id, "orders": a.order_count, "total": a.total_amount, "method": a.delivery_method, "status": a.status}, whatsapp_url=result.get("whatsapp_url", ""))
    except Exception as e:
        return jsonify(error=str(e)), 400


@main.get("/api/developer/archive/history")
def developer_archive_history():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    rows = OrderArchive.query.order_by(OrderArchive.id.desc()).limit(100).all()
    return jsonify(ok=True, archives=[{"id":a.id,"created_at":a.created_at.strftime("%d-%m-%Y %H:%M"),"period_start":a.period_start.strftime("%d-%m-%Y"),"period_end":a.period_end.strftime("%d-%m-%Y"),"orders":a.order_count,"total":a.total_amount,"method":a.delivery_method,"recipient":a.recipient,"status":a.status,"sent_at":a.sent_at.strftime("%d-%m-%Y %H:%M") if a.sent_at else "","confirmed_at":a.confirmed_at.strftime("%d-%m-%Y %H:%M") if a.confirmed_at else "","deleted_at":a.deleted_at.strftime("%d-%m-%Y %H:%M") if a.deleted_at else ""} for a in rows])


@main.get("/api/admin/archive/pending")
def admin_archive_pending():
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    rows = OrderArchive.query.filter_by(status="WAITING_CONFIRMATION").order_by(OrderArchive.id.desc()).all()
    return jsonify(ok=True, archives=[{"id":a.id,"orders":a.order_count,"total":a.total_amount,"method":a.delivery_method,"recipient":a.recipient,"created_at":a.created_at.strftime("%d-%m-%Y %H:%M")} for a in rows])


@main.post("/api/admin/archive/delete-all")
def admin_archive_delete_all():
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403

    order_ids = [row[0] for row in db.session.query(Order.id).all()]
    deleted = len(order_ids)

    if order_ids:
        # Remove every child record that references an order before deleting
        # the parent Order rows.  LedgerEntry also has an order_id foreign key.
        Payment.query.filter(Payment.order_id.in_(order_ids)).delete(synchronize_session=False)
        OrderItem.query.filter(OrderItem.order_id.in_(order_ids)).delete(synchronize_session=False)
        LedgerEntry.query.filter(LedgerEntry.order_id.in_(order_ids)).delete(synchronize_session=False)
        ArchivedOrder.query.filter(ArchivedOrder.order_id.in_(order_ids)).delete(synchronize_session=False)
        Order.query.filter(Order.id.in_(order_ids)).delete(synchronize_session=False)

    # Keep archive history as an audit record; only the actual order data is deleted.
    now = datetime.utcnow()
    pending = OrderArchive.query.filter_by(status="WAITING_CONFIRMATION").all()
    for archive in pending:
        archive.status = "RECEIVED_AND_DELETED"
        archive.confirmed_at = now
        archive.deleted_at = now
        archive.note = "Admin verified the Excel backup and deleted all order data."
        # An older archive row may have an empty/NULL file_name.
        # Never let cleanup of an already-delivered Excel file break deletion.
        file_name = str(archive.file_name or "").strip()
        if file_name:
            archive_path = Path(current_app.instance_path) / "archives" / file_name
            try:
                if archive_path.exists():
                    archive_path.unlink()
            except (OSError, TypeError):
                pass

    db.session.commit()
    return jsonify(ok=True, deleted=deleted)


@main.post("/api/admin/archive/<int:archive_id>/confirm")
def admin_archive_confirm(archive_id):
    if not role_ok("admin"):
        return jsonify(error="Forbidden"), 403
    archive = db.session.get(OrderArchive, archive_id)
    if not archive or archive.status != "WAITING_CONFIRMATION":
        return jsonify(error="Archive is not awaiting confirmation"), 404
    links = ArchivedOrder.query.filter_by(archive_id=archive.id).all()
    order_ids = [x.order_id for x in links]
    for link in links:
        db.session.delete(link)
    if order_ids:
        payments = Payment.query.filter(Payment.order_id.in_(order_ids)).all()
        items = OrderItem.query.filter(OrderItem.order_id.in_(order_ids)).all()
        for p in payments: db.session.delete(p)
        for i in items: db.session.delete(i)
        orders = Order.query.filter(Order.id.in_(order_ids)).all()
        for o in orders: db.session.delete(o)
    archive.status = "RECEIVED_AND_DELETED"
    archive.confirmed_at = datetime.utcnow()
    archive_path = Path(current_app.instance_path) / "archives" / archive.file_name
    try:
        if archive_path.exists():
            archive_path.unlink()
    except OSError:
        pass
    archive.deleted_at = datetime.utcnow()
    db.session.commit()
    return jsonify(ok=True, deleted=len(order_ids), archive_id=archive.id)


# ---------- developer console ----------

@main.get("/api/developer/settings")
def developer_get_settings():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    return jsonify(ok=True, settings=developer_settings())


NOTIFY_FLAGS = {"notify_customer_status", "notify_admin_orders", "notify_admin_low_stock",
                "notify_delivery_assign", "notify_daily_summary"}
MAP_FLAGS = {"maps_enabled", "map_customer_tracking", "map_delivery_navigation", "map_admin_view"}


@main.put("/api/developer/settings")
def developer_save_settings():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    d = request.json or {}
    if "social_links" in d:
        raw_links = d.get("social_links")
        if not isinstance(raw_links, list):
            return jsonify(error="Social links must be a list"), 400
        if len(raw_links) > SOCIAL_LIMIT:
            return jsonify(error=f"You can add up to {SOCIAL_LIMIT} social links"), 400
        clean_links = []
        for item in raw_links:
            name = str((item or {}).get("name") or "").strip()[:30]
            url = str((item or {}).get("url") or "").strip()
            if not name and not url:
                continue                      # ignore empty rows
            if not name:
                return jsonify(error="Every social link needs a name"), 400
            if not _clean_http_url(url):
                return jsonify(error=f"{name}: link must be a valid http(s) URL"), 400
            clean_links.append({"name": name, "url": url})
        set_setting("social_links", json.dumps(clean_links))
        # keep the two legacy keys in step so nothing else breaks
        for legacy, label in (("instagram_url", "instagram"), ("facebook_url", "facebook")):
            match = next((x["url"] for x in clean_links if x["name"].strip().lower() == label), "")
            set_setting(legacy, match)
    home_text_limits = {
        "home_delivery_title": 80, "home_delivery_text": 180,
        "home_payment_title": 80, "home_payment_text": 180,
        "home_support_title": 80, "home_support_text": 180,
        "home_store_eyebrow": 80, "home_products_title": 100,
        "home_products_text": 240, "home_bulk_badge": 80,
        "home_bulk_title": 120, "home_bulk_text": 500,
        "home_bulk_button": 80, "home_event_button": 80,
        "home_bulk_order_button": 80, "footer_contact_title": 80,
        "footer_whatsapp_label": 80, "footer_copyright_prefix": 20,
    }
    for key, limit in home_text_limits.items():
        if key in d:
            value = str(d.get(key) or "").strip()
            if len(value) > limit:
                return jsonify(error=f"{key.replace('_', ' ').title()} must be {limit} characters or fewer"), 400
            set_setting(key, value)
    for key in ["about_title", "about_text", "footer_tagline"]:
        if key in d:
            value = str(d.get(key) or "").strip()
            limit = {"about_title": 80, "about_text": 900, "footer_tagline": 80}[key]
            if len(value) > limit:
                return jsonify(error=f"{key.replace('_', ' ').title()} must be {limit} characters or fewer"), 400
            set_setting(key, value)
    for key in ["business_name", "business_mobile", "whatsapp", "business_location", "upi", "payment_name", "business_lat", "business_lng", "delivery_base", "delivery_per_km", "delivery_free_above", "show_prices_home", "show_prices_brochure", "ordering_enabled", "customer_login_enabled", "brochure_url", "brochure_eyebrow", "brochure_title", "brochure_subtitle", "archive_days", "archive_method", "archive_email", "archive_whatsapp", "summary_time"] + sorted(NOTIFY_FLAGS | MAP_FLAGS):
        if key in d:
            if key in {"show_prices_home", "show_prices_brochure", "ordering_enabled", "customer_login_enabled"} | NOTIFY_FLAGS | MAP_FLAGS:
                set_setting(key, "0" if str(d.get(key)).strip().lower() in {"0", "false", "no", "off", ""} else "1")
                continue
            value = str(d.get(key) or "").strip()
            if key in {"business_name", "whatsapp", "upi"} and not value:
                return jsonify(error=f"{key.replace('_', ' ').title()} is required"), 400
            if key in {"instagram_url", "facebook_url", "brochure_url"} and value and not _clean_http_url(value):
                return jsonify(error=f"{key.replace('_', ' ').title()} must be a valid http(s) URL"), 400
            if key in BROCHURE_TEXT_LIMITS and len(value) > BROCHURE_TEXT_LIMITS[key]:
                return jsonify(error=f"{key.replace('_', ' ').title()} must be {BROCHURE_TEXT_LIMITS[key]} characters or fewer"), 400
            if key == "archive_days":
                try:
                    value = str(max(1, int(value or 7)))
                except ValueError:
                    return jsonify(error="Archive days must be a positive number"), 400
            if key == "archive_method" and value not in {"email", "whatsapp"}:
                return jsonify(error="Archive method must be email or whatsapp"), 400
            if key == "summary_time" and not TIME_RE.match(value):
                return jsonify(error="Summary time must look like 21:30 (24-hour, India time)"), 400
            set_setting(key, value)
    if "otp_provider" in d:
        provider = str(d.get("otp_provider") or "").strip().lower()
        if provider not in OTP_PROVIDERS:
            return jsonify(error="Unknown login code provider"), 400
        if provider == "telegram" and not telegram_ready():
            return jsonify(error="Telegram is not connected yet. Add the bot token and webhook secret in Render, then press “Connect Telegram bot” first."), 400
        set_setting("otp_provider", provider)
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
    previous_image_url = p.image_url
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


# ---------- Telegram bot: webhook, linking, developer tools ----------

def _telegram_handle(update):
    msg = update.get("message") or {}
    chat = msg.get("chat") or {}
    chat_id = chat.get("id")
    if not chat_id or chat.get("type") != "private":
        return
    now = datetime.utcnow()
    business = _business_name()

    def say(text, keyboard=None):
        payload = {"chat_id": chat_id, "text": text}
        if keyboard:
            payload["reply_markup"] = keyboard
        tg_call("sendMessage", payload)

    text = (msg.get("text") or "").strip()
    contact = msg.get("contact")

    if text.startswith("/stop"):
        TelegramLink.query.filter_by(chat_id=chat_id).delete()
        StaffTelegramLink.query.filter_by(chat_id=chat_id).delete()
        db.session.commit()
        return say("Done. This chat will no longer receive alerts or login codes. Send /start from the website link to connect again.")

    if text.startswith("/start"):
        parts = text.split(None, 1)
        token = parts[1].strip() if len(parts) > 1 else ""
        row = TelegramToken.query.filter_by(token=token, used=False).first() if token else None
        if row and row.expires_at > now:
            if row.mobile.startswith("staff:"):
                # Staff alert link created by the developer: the staff account is already known.
                try:
                    uid = int(row.mobile.split(":", 1)[1])
                except ValueError:
                    return say("This link is not valid. Please ask for a new one.")
                u = db.session.get(User, uid)
                if not u or not u.active or u.role not in ("admin", "delivery", "developer"):
                    return say("This staff account is not active. Please ask for a new link.")
                StaffTelegramLink.query.filter_by(user_id=uid).delete()
                db.session.add(StaffTelegramLink(user_id=uid, chat_id=chat_id))
                row.used = True
                db.session.commit()
                return say(f"Connected ✅ {u.name}, you will get {business} alerts here.\nSend /stop to turn them off.")
            row.chat_id = chat_id
            db.session.commit()
            return say(f"Welcome to {business}! 👋\nTap the button below to verify your mobile number.",
                       {"keyboard": [[{"text": "📱 Share my number", "request_contact": True}]],
                        "resize_keyboard": True, "one_time_keyboard": True})
        if TelegramLink.query.filter_by(chat_id=chat_id).first() or StaffTelegramLink.query.filter_by(chat_id=chat_id).first():
            return say("You're already connected ✅\nSend /stop to turn alerts off.")
        return say("Please open the website, enter your mobile number and tap “Open Telegram” to connect.")

    if contact:
        # must be the sender's OWN contact, not a forwarded contact card
        if contact.get("user_id") != (msg.get("from") or {}).get("id"):
            return say("Please share your own number using the button.")
        phone = "".join(c for c in str(contact.get("phone_number") or "") if c.isdigit())[-10:]
        row = (TelegramToken.query.filter_by(chat_id=chat_id, used=False)
               .order_by(TelegramToken.id.desc()).first())
        if not row or row.expires_at <= now or row.mobile.startswith("staff:"):
            return say("This link has expired. Please go back to the website and try again.",
                       {"remove_keyboard": True})
        if row.mobile[-10:] != phone:
            return say("This Telegram number does not match the mobile number you entered on the website.",
                       {"remove_keyboard": True})
        TelegramLink.query.filter_by(mobile=row.mobile).delete()
        db.session.add(TelegramLink(mobile=row.mobile, chat_id=chat_id))
        row.used = True
        db.session.commit()
        say("Connected ✅\nGo back to the website. Your login code is on its way, and you will get order updates here too.\nSend /stop to turn this off.",
            {"remove_keyboard": True})


@main.post("/telegram/webhook")
def telegram_webhook():
    secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    got = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not secret or not secrets.compare_digest(got.encode("utf-8"), secret.encode("utf-8")):
        return "", 403
    try:
        _telegram_handle(request.get_json(silent=True) or {})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Telegram webhook error")
    return "ok"            # always 200 so Telegram does not keep retrying


@main.get("/api/telegram/link-status")
def telegram_link_status():
    """The login popup polls this until the customer has pressed Start + Share number in Telegram."""
    token = str(request.args.get("token") or "")
    row = TelegramToken.query.filter_by(token=token).first() if token else None
    mobile = session.get("otp_mobile")                       # token only works for the browser that asked for it
    return jsonify(ok=True, linked=bool(row and mobile and row.mobile == mobile and row.used))


@main.get("/api/developer/telegram/status")
def developer_telegram_status():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    token_set = bool(os.getenv("TELEGRAM_BOT_TOKEN"))
    info = tg_call("getWebhookInfo") if token_set else None
    result = (info or {}).get("result") or {}
    return jsonify(ok=True, token_set=token_set, secret_set=bool(os.getenv("TELEGRAM_WEBHOOK_SECRET")),
                   bot_username=setting_value("telegram_bot_username"),
                   webhook_url=result.get("url") or "", last_error=result.get("last_error_message") or "",
                   linked_count=TelegramLink.query.count(),
                   staff_linked_count=StaffTelegramLink.query.count(),
                   cron_secret_set=bool(os.getenv("CRON_SECRET")),
                   provider=setting_value("otp_provider") or "demo")


@main.post("/api/developer/telegram/setup")
def developer_telegram_setup():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    if not os.getenv("TELEGRAM_BOT_TOKEN"):
        return jsonify(error="TELEGRAM_BOT_TOKEN is not set in the Render environment"), 400
    secret = (os.getenv("TELEGRAM_WEBHOOK_SECRET") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,256}", secret):
        return jsonify(error="TELEGRAM_WEBHOOK_SECRET must be 16+ characters: letters, numbers, _ and - only"), 400
    me_info = tg_call("getMe")
    if not me_info or not me_info.get("ok"):
        return jsonify(error="Telegram rejected the bot token. Check TELEGRAM_BOT_TOKEN."), 400
    base = (os.getenv("PUBLIC_BASE_URL") or request.url_root).rstrip("/")
    if base.startswith("http://") and "localhost" not in base and "127.0.0.1" not in base:
        base = "https://" + base[len("http://"):]            # Render terminates TLS; Telegram needs https
    r = tg_call("setWebhook", {"url": base + url_for("main.telegram_webhook"), "secret_token": secret,
                               "allowed_updates": ["message"], "drop_pending_updates": True})
    if not r or not r.get("ok"):
        return jsonify(error=(r or {}).get("description") or "Telegram could not set the webhook"), 400
    set_setting("telegram_bot_username", me_info["result"].get("username") or "")
    db.session.commit()
    return jsonify(ok=True, bot=me_info["result"].get("username"))


@main.get("/api/developer/telegram/staff")
def developer_telegram_staff():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    linked = {r.user_id for r in StaffTelegramLink.query.all()}
    users = User.query.filter(User.role.in_(["admin", "delivery"])).order_by(User.role, User.id).all()
    return jsonify(ok=True, bot_ready=telegram_bot_ready(),
                   users=[dict(id=u.id, name=u.name, username=u.username or "", role=u.role,
                               active=bool(u.active), mobile=u.mobile or "", linked=u.id in linked) for u in users])


@main.post("/api/developer/telegram/staff/<int:uid>/link")
def developer_telegram_staff_link(uid):
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    u = db.session.get(User, uid)
    if not u or u.role not in ("admin", "delivery") or not u.active:
        return jsonify(error="Staff account not found"), 404
    payload, error = _staff_link_payload(u)
    if error:
        return jsonify(error=error), 400
    return jsonify(ok=True, **payload)


@main.delete("/api/developer/telegram/staff/<int:uid>")
def developer_telegram_staff_unlink(uid):
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    StaffTelegramLink.query.filter_by(user_id=uid).delete()
    db.session.commit()
    return jsonify(ok=True)


@main.route("/api/staff/telegram", methods=["GET", "POST", "DELETE"])
def staff_telegram_self():
    """For a logged-in admin / delivery person to connect their own Telegram (a button can call this later)."""
    u = current_user()
    if not u or u.role not in ("admin", "delivery", "developer"):
        return jsonify(error="Forbidden"), 403
    if request.method == "DELETE":
        StaffTelegramLink.query.filter_by(user_id=u.id).delete()
        db.session.commit()
        return jsonify(ok=True)
    if request.method == "POST":
        payload, error = _staff_link_payload(u)
        if error:
            return jsonify(error=error), 400
        return jsonify(ok=True, **payload)
    return jsonify(ok=True, bot_ready=telegram_bot_ready(),
                   linked=bool(StaffTelegramLink.query.filter_by(user_id=u.id).first()))


@main.post("/api/developer/telegram/test")
def developer_telegram_test():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    if not telegram_bot_ready():
        return jsonify(error="Telegram bot is not connected yet"), 400
    chats = admin_chat_ids()
    if not chats:
        return jsonify(error="No admin has linked Telegram yet"), 400
    tg_send_async(chats, f"✅ Test alert from {_business_name()}. Telegram alerts are working.")
    return jsonify(ok=True, sent_to=len(chats))


@main.post("/api/developer/telegram/summary-now")
def developer_telegram_summary_now():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    result = send_daily_summary(force=True)
    return jsonify(result), (200 if result.get("ok") else 400)


def _cron_authorised():
    secret = os.getenv("CRON_SECRET", "")
    got = request.headers.get("X-Cron-Key") or request.args.get("key") or ""
    return bool(secret) and secrets.compare_digest(got.encode("utf-8"), secret.encode("utf-8"))


@main.route("/api/cron/tick", methods=["GET", "POST"])
@main.route("/api/cron/daily-summary", methods=["GET", "POST"])        # old address keeps working
def cron_tick():
    """Call every 5-15 minutes from a free scheduler (cron-job.org). Needs env CRON_SECRET,
    sent as header X-Cron-Key (or ?key=). Keeps the free Render service awake as a bonus."""
    if not _cron_authorised():
        return "", 403
    return jsonify(cron_run())


@main.get("/api/developer/scheduler/status")
def developer_scheduler_status():
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    last = setting_value("last_cron_tick")
    ago = None
    if last:
        try:
            ago = max(0, int((datetime.utcnow() - datetime.strptime(last, "%Y-%m-%d %H:%M:%S")).total_seconds()))
        except ValueError:
            ago = None
    return jsonify(ok=True, cron_secret_set=bool(os.getenv("CRON_SECRET")), last_tick_seconds_ago=ago,
                   summary_enabled=_flag("notify_daily_summary"),
                   summary_time=setting_value("summary_time") or "21:30",
                   last_summary_date=setting_value("last_summary_date"), today=_ist_today(),
                   ist_now=(datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%d %b %Y %I:%M %p"),
                   bot_ready=telegram_bot_ready(), admins_linked=len(admin_chat_ids()))


@main.post("/api/developer/scheduler/run")
def developer_scheduler_run():
    """Same pass the pinger makes, for testing from the Developer panel."""
    if not role_ok("developer"):
        return jsonify(error="Forbidden"), 403
    return jsonify(cron_run())
