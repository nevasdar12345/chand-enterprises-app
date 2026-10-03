from . import db
from .models import User,Product,Coupon,SiteSetting
from werkzeug.security import generate_password_hash

def seed():
    if not User.query.filter_by(username="admin").first():
        db.session.add_all([
            User(name="Admin",username="admin",password=generate_password_hash("admin123"),role="admin"),
            User(name="Delivery",username="delivery",password=generate_password_hash("delivery123"),role="delivery"),
            User(name="Developer",username="developer",password=generate_password_hash("developer123"),role="developer")
        ])
    if Product.query.count()==0:
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
    if not Coupon.query.filter_by(code="WELCOME10").first():
        db.session.add(Coupon(code="WELCOME10", discount_type="percent", discount_value=10, max_discount=100, min_order=0, active=True))
    if not Coupon.query.filter_by(code="WATER50").first():
        db.session.add(Coupon(code="WATER50", discount_type="fixed", discount_value=50, min_order=500, active=True))
    defaults = {
        "business_lat": "",
        "business_lng": "",
        "delivery_base": "30",
        "delivery_per_km": "10",
        "delivery_free_above": "500",
    }
    for key, value in defaults.items():
        if not SiteSetting.query.filter_by(key=key).first():
            db.session.add(SiteSetting(key=key, value=value))
    db.session.commit()
