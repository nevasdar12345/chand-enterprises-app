from datetime import datetime
from . import db


class OtpChallenge(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    mobile = db.Column(db.String(20), nullable=False, index=True)          # index added (OTP lookups)
    otp_hash = db.Column(db.String(255), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    last_sent_at = db.Column(db.DateTime, nullable=False)
    attempts = db.Column(db.Integer, default=0)
    verified = db.Column(db.Boolean, default=False)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(
        db.String(120),
        nullable=False
    )

    mobile = db.Column(
        db.String(20),
        unique=True
    )

    username = db.Column(
        db.String(80),
        unique=True
    )

    password = db.Column(
        db.String(255)
    )

    role = db.Column(
        db.String(30),
        default="customer",
        index=True
    )

    # True = account can log in
    # False = account disabled
    active = db.Column(
        db.Boolean,
        default=True,
        nullable=False,
        index=True
    )

    address = db.Column(
        db.Text,
        default=""
    )

    landmark = db.Column(
        db.String(160),
        default=""
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )


# ============================================================
# CATEGORY
# ============================================================

class Category(db.Model):
    id = db.Column(
        db.Integer,
        primary_key=True
    )

    name = db.Column(
        db.String(80),
        unique=True,
        nullable=False,
        index=True
    )

    icon = db.Column(
        db.String(20),
        default="🛍️"
    )

    # False = hidden category
    active = db.Column(
        db.Boolean,
        default=True,
        nullable=False,
        index=True
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )


# ============================================================
# PRODUCT
# ============================================================

class Product(db.Model):
    id = db.Column(
        db.Integer,
        primary_key=True
    )

    name = db.Column(
        db.String(160),
        nullable=False
    )

    # Category name is kept as a string to remain compatible
    # with the existing product/category system.
    category = db.Column(
        db.String(80),
        nullable=False,
        index=True
    )

    # Product size / quantity
    # Examples: 250ml, 500ml, 750ml, 1L, 20L
    size = db.Column(
        db.String(40),
        default="",
        nullable=False
    )

    price = db.Column(
        db.Float,
        nullable=False
    )

    stock = db.Column(
        db.Integer,
        default=0
    )

    low_stock_threshold = db.Column(
        db.Integer,
        default=10
    )

    icon = db.Column(
        db.String(10),
        default="🥤"
    )

    # Public product image URL. Images uploaded from Admin/Developer
    # are stored in a public GitHub repository so Render restarts do not
    # remove them. A normal public image URL can also be pasted here.
    image_url = db.Column(
        db.Text,
        default="",
        nullable=False
    )

    active = db.Column(
        db.Boolean,
        default=True,
        index=True
    )


# ============================================================
# ORDER
# ============================================================

class Order(db.Model):
    id = db.Column(
        db.Integer,
        primary_key=True
    )

    code = db.Column(
        db.String(30),
        unique=True,
        nullable=False
    )

    customer_name = db.Column(
        db.String(120),
        nullable=False
    )

    # index added: "My orders" and order ownership checks filter on this
    mobile = db.Column(
        db.String(20),
        nullable=False,
        index=True
    )

    address = db.Column(
        db.Text,
        nullable=False
    )

    latitude = db.Column(
        db.Float,
        nullable=True
    )

    longitude = db.Column(
        db.Float,
        nullable=True
    )

    total = db.Column(
        db.Float,
        nullable=False
    )

    payment_method = db.Column(
        db.String(40)
    )

    payment_status = db.Column(
        db.String(30),
        default="Pending",
        index=True
    )

    delivery_charge = db.Column(
        db.Float,
        default=0
    )

    cash_collected = db.Column(
        db.Float,
        default=0
    )

    # index added: the delivery dashboard filters on this
    delivery_person_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=True,
        index=True
    )

    coupon_code = db.Column(
        db.String(40)
    )

    discount = db.Column(
        db.Float,
        default=0
    )

    status = db.Column(
        db.String(40),
        default="Confirmed",
        index=True
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        index=True
    )

    items = db.relationship(
        "OrderItem",
        backref="order",
        lazy=True
    )

    payments = db.relationship(
        "Payment",
        backref="order",
        lazy=True,
        order_by="Payment.id.desc()"
    )

    delivery_person = db.relationship(
        "User",
        foreign_keys=[delivery_person_id],
        lazy=True
    )

    @property
    def map_url(self):
        if self.latitude is None or self.longitude is None:
            return ""

        return (
            f"https://www.google.com/maps?"
            f"q={self.latitude:.6f},{self.longitude:.6f}"
        )

    @property
    def subtotal(self):
        return sum(
            item.line_total
            for item in self.items
        )


# ============================================================
# ORDER ARCHIVE
# ============================================================

class OrderArchive(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    period_start = db.Column(db.DateTime, nullable=False)
    period_end = db.Column(db.DateTime, nullable=False)
    order_count = db.Column(db.Integer, default=0, nullable=False)
    total_amount = db.Column(db.Float, default=0, nullable=False)
    delivery_method = db.Column(db.String(20), default="email", nullable=False)
    recipient = db.Column(db.String(255), default="", nullable=False)
    status = db.Column(db.String(40), default="WAITING_CONFIRMATION", nullable=False, index=True)
    sent_at = db.Column(db.DateTime, nullable=True)
    confirmed_at = db.Column(db.DateTime, nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    note = db.Column(db.Text, default="")
    download_token = db.Column(db.String(80), unique=True, nullable=True, index=True)
    file_name = db.Column(db.String(255), default="")
    drive_file_url = db.Column(db.String(500), default="")


class ArchivedOrder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    archive_id = db.Column(db.Integer, db.ForeignKey("order_archive.id"), nullable=False, index=True)
    order_id = db.Column(db.Integer, nullable=False, index=True)



# ============================================================
# ORDER ITEM
# ============================================================

class OrderItem(db.Model):
    id = db.Column(
        db.Integer,
        primary_key=True
    )

    # index added: every order list loads items by order_id
    order_id = db.Column(
        db.Integer,
        db.ForeignKey("order.id"),
        nullable=False,
        index=True
    )

    product_id = db.Column(
        db.Integer,
        db.ForeignKey("product.id"),
        nullable=False
    )

    # Snapshot of product name at the time of the order
    product_name = db.Column(
        db.String(160),
        nullable=False
    )

    # Snapshot of product size at the time of the order
    # This ensures old orders keep their original size.
    product_size = db.Column(
        db.String(40),
        default="",
        nullable=False
    )

    quantity = db.Column(
        db.Integer,
        nullable=False
    )

    unit_price = db.Column(
        db.Float,
        nullable=False
    )

    @property
    def line_total(self):
        return self.quantity * self.unit_price


# ============================================================
# PAYMENT
# ============================================================

class Payment(db.Model):
    id = db.Column(
        db.Integer,
        primary_key=True
    )

    # index added: every order list loads payments by order_id
    order_id = db.Column(
        db.Integer,
        db.ForeignKey("order.id"),
        nullable=False,
        index=True
    )

    transaction_id = db.Column(
        db.String(100),
        unique=True,
        nullable=True
    )

    gateway_order_id = db.Column(
        db.String(100),
        unique=True,
        nullable=True
    )

    signature = db.Column(
        db.String(255),
        nullable=True
    )

    method = db.Column(
        db.String(40),
        nullable=False
    )

    amount = db.Column(
        db.Float,
        nullable=False
    )

    status = db.Column(
        db.String(30),
        default="Pending"
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )


# ============================================================
# ENQUIRY
# ============================================================

class Enquiry(db.Model):
    id = db.Column(
        db.Integer,
        primary_key=True
    )

    name = db.Column(
        db.String(120)
    )

    mobile = db.Column(
        db.String(20)
    )

    message = db.Column(
        db.Text
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )


# ============================================================
# SITE SETTINGS
# ============================================================

class SiteSetting(db.Model):
    id = db.Column(
        db.Integer,
        primary_key=True
    )

    key = db.Column(
        db.String(80),
        unique=True,
        nullable=False
    )

    value = db.Column(
        db.Text,
        default=""
    )


# ============================================================
# COUPON
# ============================================================

class Coupon(db.Model):
    id = db.Column(
        db.Integer,
        primary_key=True
    )

    code = db.Column(
        db.String(40),
        unique=True,
        nullable=False
    )

    # percent or fixed
    discount_type = db.Column(
        db.String(20),
        default="percent"
    )

    discount_value = db.Column(
        db.Float,
        default=0
    )

    max_discount = db.Column(
        db.Float,
        nullable=True
    )

    min_order = db.Column(
        db.Float,
        default=0
    )

    active = db.Column(
        db.Boolean,
        default=True
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )


# ============================================================
# LEDGER
# ============================================================

class LedgerEntry(db.Model):
    id = db.Column(
        db.Integer,
        primary_key=True
    )

    customer_mobile = db.Column(
        db.String(20),
        nullable=False,
        index=True
    )

    customer_name = db.Column(
        db.String(120),
        nullable=False
    )

    # debit or payment
    entry_type = db.Column(
        db.String(20),
        nullable=False
    )

    amount = db.Column(
        db.Float,
        nullable=False
    )

    note = db.Column(
        db.String(255),
        default=""
    )

    order_id = db.Column(
        db.Integer,
        db.ForeignKey("order.id"),
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )


# ============================================================
# TELEGRAM LOGIN
# ============================================================

class TelegramLink(db.Model):
    """Permanent link: customer mobile <-> Telegram chat (created after 'Share my number')."""
    id = db.Column(db.Integer, primary_key=True)
    mobile = db.Column(db.String(20), unique=True, nullable=False, index=True)
    chat_id = db.Column(db.BigInteger, nullable=False, index=True)
    linked_at = db.Column(db.DateTime, default=datetime.utcnow)


class TelegramToken(db.Model):
    """Short-lived token carried in the t.me/<bot>?start=<token> link."""
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(40), unique=True, nullable=False, index=True)
    mobile = db.Column(db.String(20), nullable=False, index=True)
    chat_id = db.Column(db.BigInteger, nullable=True, index=True)
    used = db.Column(db.Boolean, default=False, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
