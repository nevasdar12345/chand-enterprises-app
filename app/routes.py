import csv, io, secrets, urllib.parse

import segno

from datetime import datetime, timedelta

from flask import (Blueprint, render_template, request, redirect, url_for,

                   session, jsonify, Response, current_app)

from werkzeug.security import generate_password_hash, check_password_hash

from . import db

from .models import User, Product, Order, OrderItem, Enquiry, Payment, OtpChallenge, SiteSetting



main = Blueprint("main", __name__)

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
}

DEFAULT_OFFERS = [
    "🥤 Pepsi 200ml @ ₹12",
    "⚡ Energy Drink 250ml - Buy 2, get ₹20 off",
    "🚰 Premium Water 20L - special bulk rate",
    "🚚 Free delivery above ₹500",
    "🎟️ Use code WELCOME10 - 10% off your first order",
    "🍋 Lemon Soda 750ml - summer special",
]

def setting_value(key):
    row = SiteSetting.query.filter_by(key=key).first()
    if row and row.value is not None:
        return row.value
    return DEFAULT_SETTINGS.get(key, "")

def set_setting(key, value):
    row = SiteSetting.query.filter_by(key=key).first()
    if not row:
        row = SiteSetting(key=key, value="")
        db.session.add(row)
    row.value = str(value or "")

def developer_settings():
    raw = setting_value("offers")
    offers = [x.strip() for x in raw.splitlines() if x.strip()] if raw else DEFAULT_OFFERS[:]
    return {"business_name": setting_value("business_name"), "business_mobile": setting_value("business_mobile"), "whatsapp": setting_value("whatsapp"), "business_location": setting_value("business_location"), "upi": setting_value("upi"), "payment_name": setting_value("payment_name"), "offers": offers}

def developer_product_dict(p):
    return dict(id=p.id, name=p.name, category=p.category, price=p.price, stock=p.stock, low_stock_threshold=p.low_stock_threshold or 10, icon=p.icon, active=p.active)



# ---------- helpers ----------

def wa_number():

    n = "".join(c for c in (setting_value("whatsapp") or current_app.config["WHATSAPP_NUMBER"]) if c.isdigit())

    return "91" + n if len(n) == 10 else n          # wa.me needs the country code



def wa_link(text):

    return f"https://wa.me/{wa_number()}?text=" + urllib.parse.quote(text)



def role_ok(*roles):

    r = session.get("role")

    return bool(r) and (not roles or r in roles)



def current_user():

    uid = session.get("user_id")

    return db.session.get(User, uid) if uid else None



def product_dict(p):

    return dict(id=p.id, name=p.name, category=p.category, price=p.price,

                stock=p.stock, icon=p.icon, low=p.stock <= (p.low_stock_threshold or 10))



def upi_uri(o):

    """UPI deep-link with the exact order amount pre-filled (this is what the QR encodes)."""

    q = urllib.parse.quote

    return (f"upi://pay?pa={q(setting_value("upi") or current_app.config['UPI_ID'], safe='@')}&pn={q(setting_value("payment_name") or 'Chand Enterprises')}"

            f"&am={o.total:.2f}&cu=INR&tn={q('Order ' + o.code)}")



def order_dict(o):

    dp = db.session.get(User, o.delivery_person_id) if o.delivery_person_id else None

    pay = Payment.query.filter_by(order_id=o.id).order_by(Payment.id.desc()).first()

    paid = o.total if o.payment_status == "Paid" else 0

    return dict(id=o.id, code=o.code, customer=o.customer_name, mobile=o.mobile,

                address=o.address, total=o.total, subtotal=o.subtotal, discount=o.discount,

                delivery_charge=o.delivery_charge, payment=o.payment_method,

                payment_status=o.payment_status, status=o.status,

                created=o.created_at.strftime("%d-%m-%Y %H:%M"),

                delivery_person_id=o.delivery_person_id, delivery_person=dp.name if dp else "",

                items=[f"{i.product_name} x {i.quantity}" for i in o.items],

                lines=[dict(name=i.product_name, qty=i.quantity, price=i.unit_price, total=i.line_total) for i in o.items],

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

    db.session.add(OtpChallenge(mobile=mobile, otp_hash=generate_password_hash(otp),

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

            delivery_users=User.query.filter_by(role="delivery").all(),

            products=Product.query.order_by(Product.id).all())

    if role == "developer":
        return render_template("developer.html", settings=developer_settings())
    return render_template("role.html", role=role)



@main.route("/whatsapp")

def whatsapp_page():

    return render_template("whatsapp.html", number=wa_number())



@main.post("/logout")

def logout():

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

    u = User.query.filter_by(username=d.get("username")).first()

    if not u or not u.password or u.role == "customer" or not check_password_hash(u.password, d.get("password", "")):

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

    if not check_password_hash(ch.otp_hash, str(d.get("otp", ""))):     db.session.commit()     return jsonify(ok=False, error="Incorrect OTP", attempts_left=max(0, 5 - ch.attempts)), 400

        db.session.commit()

        return jsonify(ok=False, error="Incorrect OTP", attempts_left=max(0, 5 - ch.attempts)), 400

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

@main.get("/api/config")

def config():

    cfg = developer_settings()
    return jsonify(_ok=True, whatsapp=wa_number(), upi=cfg["upi"] or current_app.config["UPI_ID"], business_name=cfg["business_name"], business_mobile=cfg["business_mobile"], business_location=cfg["business_location"], payment_name=cfg["payment_name"], offers=cfg["offers"])



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

    discount = 0

    if coupon == "WELCOME10":

        discount = min(subtotal * 0.10, 100)

    elif coupon == "WATER50" and subtotal >= 500:

        discount = 50

    delivery = 0 if subtotal - discount >= 500 else 30

    total = max(0, subtotal - discount + delivery)

    code = "CE" + datetime.now().strftime("%y%m%d%H%M%S") + secrets.token_hex(1).upper()

    o = Order(code=code, customer_name=name, mobile=u.mobile, address=address, total=total,

              delivery_charge=delivery, payment_method=method, payment_status="Pending",

              coupon_code=coupon or None, discount=discount)

    db.session.add(o)

    db.session.flush()

    for p, qty in lines:

        p.stock -= qty

        db.session.add(OrderItem(order_id=o.id, product_id=p.id, product_name=p.name,

                                 quantity=qty, unit_price=p.price))

    db.session.add(Payment(order_id=o.id, method=method, amount=total))

    if not u.address:

        u.address = address

    db.session.commit()

    return jsonify(ok=True, order_id=code, total=total, subtotal=subtotal, discount=discount,

                   delivery_charge=delivery, payment_method=method, upi=current_app.config["UPI_ID"],

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

    rows = Order.query.filter_by(mobile=u.mobile).order_by(Order.created_at.desc()).limit(30)

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

    lines = "\n".join(f"- {i.product_name} x {i.quantity} = ₹{i.line_total:.0f}" for i in o.items)

    return (f"{setting_value('business_name') or 'Chand Enterprises'} - Order {o.code}\n\nCustomer: {o.customer_name}\nMobile: {o.mobile}\n"

            f"Address: {o.address}\n\nItems:\n{lines}\n\nSubtotal: ₹{o.subtotal:.0f}\n"

            f"Discount: ₹{o.discount:.0f}\nDelivery: ₹{o.delivery_charge:.0f}\nTotal: ₹{o.total:.0f}\n"

            f"Payment: {o.payment_method} / {o.payment_status}")



@main.get("/api/orders/<code>/whatsapp")

def order_whatsapp(code):

    o, err = own_order(code)

    if err:

        return err

    return jsonify(ok=True, whatsapp_url=wa_link(order_text(o)))



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

    rows = q.order_by(Order.created_at.desc()).limit(200).all()

    live = Order.query.filter(Order.status != "Cancelled")

    stats = dict(orders=live.count(),

                 revenue=sum(o.total for o in live if o.payment_status == "Paid"),

                 pending=Order.query.filter(Order.payment_status.in_(["Pending", "Verifying"]),

                                            Order.status != "Cancelled").count(),

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

                    icon=d.get("icon") or "🥤", active=bool(d.get("active", True)))

    except (TypeError, ValueError):

        return jsonify(error="Invalid product data"), 400

    if not p.name or p.price < 0 or p.stock < 0:

        return jsonify(error="Invalid product data"), 400

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

        if "name" in d: p.name = d["name"].strip()

        if "category" in d: p.category = d["category"].strip()

        if "price" in d: p.price = float(d["price"])

        if "stock" in d: p.stock = int(d["stock"])

        if "icon" in d: p.icon = d["icon"]

        if "active" in d: p.active = bool(d["active"])

    except (TypeError, ValueError):

        db.session.rollback()

        return jsonify(error="Invalid product data"), 400

    if not p.name or p.price < 0 or p.stock < 0:

        db.session.rollback()

        return jsonify(error="Invalid product data"), 400

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

                "Delivery", "Total", "Payment", "Payment Status", "Status", "Delivery Person"])

    for o in Order.query.order_by(Order.created_at.desc()):

        d = order_dict(o)

        w.writerow([o.code, d["created"], o.customer_name, o.mobile, o.address, "; ".join(d["items"]),

                    o.subtotal, o.discount, o.delivery_charge, o.total, o.payment_method,

                    o.payment_status, o.status, d["delivery_person"]])

    return Response(out.getvalue(), mimetype="text/csv",

                    headers={"Content-Disposition": "attachment; filename=chand-orders.csv"})



# ---------- delivery ----------

@main.get("/api/delivery/orders")

def delivery_orders():

    if not role_ok("delivery"):

        return jsonify(error="Forbidden"), 403

    rows = Order.query.filter_by(delivery_person_id=session["user_id"]).order_by(Order.created_at.desc()).all()

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

        o.payment_status = "Paid"            # cash collected at the door

        pay = Payment.query.filter_by(order_id=o.id).order_by(Payment.id.desc()).first()

        if pay:

            pay.status = "Paid"

    db.session.commit()

    return jsonify(ok=True)


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
    for key in ["business_name", "business_mobile", "whatsapp", "business_location", "upi", "payment_name"]:
        if key in d:
            value = str(d.get(key) or "").strip()
            if key in {"business_name", "whatsapp", "upi"} and not value:
                return jsonify(error=f"{key.replace('_', ' ').title()} is required"), 400
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
        p = Product(name=str(d.get("name") or "").strip(), category=str(d.get("category") or "Cold Drinks").strip(), price=float(d.get("price", 0)), stock=int(d.get("stock", 0)), low_stock_threshold=int(d.get("low_stock_threshold", 10)), icon=str(d.get("icon") or "🥤"), active=bool(d.get("active", True)))
    except (TypeError, ValueError):
        return jsonify(error="Invalid product data"), 400
    if not p.name or not p.category or p.price < 0 or p.stock < 0:
        return jsonify(error="Invalid product data"), 400
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
        if "name" in d: p.name = str(d["name"] or "").strip()
        if "category" in d: p.category = str(d["category"] or "").strip()
        if "price" in d: p.price = float(d["price"])
        if "stock" in d: p.stock = int(d["stock"])
        if "low_stock_threshold" in d: p.low_stock_threshold = int(d["low_stock_threshold"])
        if "icon" in d: p.icon = str(d["icon"] or "🥤")
        if "active" in d: p.active = bool(d["active"])
    except (TypeError, ValueError):
        db.session.rollback()
        return jsonify(error="Invalid product data"), 400
    if not p.name or not p.category or p.price < 0 or p.stock < 0 or p.low_stock_threshold < 0:
        db.session.rollback()
        return jsonify(error="Invalid product data"), 400
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
