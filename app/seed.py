from . import db
from .models import User,Product
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
    db.session.commit()
