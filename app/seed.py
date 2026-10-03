import os, secrets, string
from . import db
from .models import User, Product, Coupon, SiteSetting, Category
from werkzeug.security import generate_password_hash


def _password(env_name, local_default):
    value = os.getenv(env_name)
    if value:
        return value
    if not os.getenv("DATABASE_URL"):
        return local_default
    generated = secrets.token_urlsafe(18)
    print(f"[Chand Enterprises] Generated initial {env_name}: {generated}")
    return generated


def seed():
    # Existing installations keep their current credentials. New production
    # installs should set ADMIN_PASSWORD / DELIVERY_PASSWORD / DEVELOPER_PASSWORD.
    accounts = [
        ("Admin", "admin", _password("ADMIN_PASSWORD", "admin123"), "admin"),
        ("Delivery", "delivery", _password("DELIVERY_PASSWORD", "delivery123"), "delivery"),
        ("Developer", "developer", _password("DEVELOPER_PASSWORD", "developer123"), "developer"),
    ]
    for name, username, password, role in accounts:
        if not User.query.filter_by(username=username).first():
            db.session.add(User(name=name, username=username, password=generate_password_hash(password), role=role, active=True))

    if Product.query.count() == 0:
        db.session.add_all([
            Product(name="Cola 750ml",category="Cold Drinks",price=45,stock=100,icon="🥤",low_stock_threshold=10),
            Product(name="Orange Drink 750ml",category="Cold Drinks",price=45,stock=80,icon="🍊",low_stock_threshold=10),
            Product(name="Energy Drink 250ml",category="Energy Drinks",price=120,stock=50,icon="⚡",low_stock_threshold=10),
            Product(name="Energy Drink 500ml",category="Energy Drinks",price=180,stock=35,icon="⚡",low_stock_threshold=10),
            Product(name="Premium Water 1L",category="Premium Water",price=40,stock=120,icon="💧",low_stock_threshold=10),
            Product(name="Premium Water 20L",category="Premium Water",price=150,stock=30,icon="🚰",low_stock_threshold=5),
            Product(name="Lemon Soda 750ml",category="Cold Drinks",price=50,stock=65,icon="🍋",low_stock_threshold=10),
            Product(name="Premium Water 2L",category="Premium Water",price=65,stock=70,icon="💧",low_stock_threshold=10)
        ])

    # Backfill categories from products, then keep them as the source of truth.
    for p in Product.query.all():
        name = (p.category or "Uncategorised").strip() or "Uncategorised"
        if not Category.query.filter(db.func.lower(Category.name) == name.lower()).first():
            db.session.add(Category(name=name, icon="🛍️", active=True))

    if not Coupon.query.filter_by(code="WELCOME10").first():
        db.session.add(Coupon(code="WELCOME10", discount_type="percent", discount_value=10, max_discount=100, min_order=0, active=True))
    if not Coupon.query.filter_by(code="WATER50").first():
        db.session.add(Coupon(code="WATER50", discount_type="fixed", discount_value=50, min_order=500, active=True))

    defaults = {
        "business_lat": "", "business_lng": "", "delivery_base": "30", "delivery_per_km": "10",
        "delivery_free_above": "500", "instagram_url": "", "facebook_url": "", "brochure_url": ""
    }
    for key, value in defaults.items():
        if not SiteSetting.query.filter_by(key=key).first():
            db.session.add(SiteSetting(key=key, value=value))
    db.session.commit()
