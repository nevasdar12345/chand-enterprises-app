import os
import re
from pathlib import Path

from flask import Flask, request
from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()


def create_app():
    app = Flask(__name__, instance_relative_config=True)

    Path(app.instance_path).mkdir(
        parents=True,
        exist_ok=True
    )

    # ============================================================
    # DATABASE
    # ============================================================

    database_url = os.getenv("DATABASE_URL")

    if database_url:
        # Render PostgreSQL
        if database_url.startswith("postgres://"):
            database_url = database_url.replace(
                "postgres://",
                "postgresql://",
                1
            )

        database_uri = database_url

    else:
        # Local development
        database_uri = "sqlite:///" + str(
            Path(app.instance_path) / "chand.db"
        )

    app.config.update(
        SECRET_KEY=os.getenv(
            "SECRET_KEY",
            "change-this-in-production"
        ),

        SQLALCHEMY_DATABASE_URI=database_uri,

        SQLALCHEMY_TRACK_MODIFICATIONS=False,

        WHATSAPP_NUMBER=os.getenv(
            "WHATSAPP_NUMBER",
            "9304285574"
        ),

        UPI_ID=os.getenv(
            "UPI_ID",
            "chandenterprises@upi"
        ),

        # Development OTP switch
        DEV_OTP=os.getenv(
            "DEV_OTP",
            "0"
        ) == "1",

        # Testing master OTP
        MASTER_OTP=os.getenv(
            "MASTER_OTP",
            ""
        ),
    )

    db.init_app(app)

    # ============================================================
    # ROUTES
    # ============================================================

    from .routes import main

    app.register_blueprint(main)

    # ============================================================
    # RESPONSE COMPRESSION + STATIC CACHE
    # ============================================================

    @app.after_request
    def compress_response(response):

        accept = request.headers.get(
            "Accept-Encoding",
            ""
        )

        if (
            "gzip" in accept.lower()
            and response.status_code == 200
            and response.direct_passthrough is False
            and response.content_length
            and response.content_length > 700
            and not response.headers.get("Content-Encoding")
            and response.mimetype in {
                "text/html",
                "text/css",
                "application/javascript",
                "application/json",
                "text/plain",
            }
        ):

            import gzip

            response.set_data(
                gzip.compress(
                    response.get_data(),
                    compresslevel=6
                )
            )

            response.headers["Content-Encoding"] = "gzip"

            response.headers["Vary"] = "Accept-Encoding"

            response.headers["Content-Length"] = str(
                len(response.get_data())
            )

        # Browser/CDN cache for static files
        if request.path.startswith("/static/"):

            response.headers.setdefault(
                "Cache-Control",
                "public, max-age=604800"
            )

        return response

    # ============================================================
    # FRIENDLY ERROR FALLBACKS
    # ============================================================

    from flask import jsonify, redirect, url_for

    def _fallback(status, message):

        if request.path.startswith("/api/"):

            return jsonify(
                error=message
            ), status

        return redirect(
            url_for("main.home")
        )

    @app.errorhandler(404)
    def not_found(_e):

        return _fallback(
            404,
            "Not found"
        )

    @app.errorhandler(405)
    def method_not_allowed(_e):

        return _fallback(
            405,
            "Method not allowed"
        )

    @app.errorhandler(500)
    def server_error(_e):

        if request.path.startswith("/api/"):

            return jsonify(
                error="Something went wrong. Please try again."
            ), 500

        return redirect(
            url_for("main.home")
        )

    # ============================================================
    # HEALTH CHECK
    # ============================================================

    @app.route("/health")
    def health():

        return "OK", 200

    # ============================================================
    # DATABASE INITIALIZATION + MIGRATIONS
    # ============================================================

    with app.app_context():

        # Create missing tables.
        #
        # This creates Category and any other newly introduced
        # tables on a fresh database.
        db.create_all()

        # SQLAlchemy inspection tools
        from sqlalchemy import inspect, text

        inspector = inspect(
            db.engine
        )

        tables = set(
            inspector.get_table_names()
        )

        # ========================================================
        # EXISTING ORDER MIGRATIONS
        # ========================================================

        if "order" in tables:

            existing = {
                c["name"]
                for c in inspector.get_columns(
                    "order"
                )
            }

            for col in (
                "latitude",
                "longitude",
                "cash_collected",
            ):

                if col not in existing:

                    try:

                        db.session.execute(
                            text(
                                f'''
                                ALTER TABLE "order"
                                ADD COLUMN {col}
                                FLOAT DEFAULT 0
                                '''
                            )
                        )

                        db.session.commit()

                    except Exception:

                        db.session.rollback()

        # ========================================================
        # PRODUCT IMAGE URL MIGRATION
        # ========================================================

        if "product" in tables:

            existing = {
                c["name"]
                for c in inspector.get_columns("product")
            }

            if "image_url" not in existing:

                try:
                    db.session.execute(
                        text(
                            "ALTER TABLE product ADD COLUMN image_url TEXT DEFAULT ''"
                        )
                    )
                    db.session.commit()
                except Exception:
                    db.session.rollback()

        # ========================================================
        # USER ACTIVE STATUS MIGRATION
        # ========================================================

        if "user" in tables:

            existing = {
                c["name"]
                for c in inspector.get_columns(
                    "user"
                )
            }

            if "active" not in existing:

                try:

                    db.session.execute(
                        text(
                            '''
                            ALTER TABLE "user"
                            ADD COLUMN active
                            BOOLEAN DEFAULT TRUE
                            '''
                        )
                    )

                    db.session.commit()

                except Exception:

                    db.session.rollback()

        # ========================================================
        # PRODUCT SIZE MIGRATION
        # ========================================================

        #
        # New Product field:
        #
        #     size
        #
        # Examples:
        #
        #     250ml
        #     500ml
        #     750ml
        #     1L
        #     20L
        #

        if "product" in tables:

            existing = {
                c["name"]
                for c in inspector.get_columns(
                    "product"
                )
            }

            if "size" not in existing:

                try:

                    db.session.execute(
                        text(
                            '''
                            ALTER TABLE product
                            ADD COLUMN size
                            VARCHAR(40)
                            DEFAULT ''
                            '''
                        )
                    )

                    db.session.commit()

                except Exception:

                    db.session.rollback()

        # ========================================================
        # ORDER ITEM SIZE MIGRATION
        # ========================================================

        #
        # New OrderItem field:
        #
        #     product_size
        #
        # This stores the size at the time the order was placed.
        #

        if "order_item" in tables:

            existing = {
                c["name"]
                for c in inspector.get_columns(
                    "order_item"
                )
            }

            if "product_size" not in existing:

                try:

                    db.session.execute(
                        text(
                            '''
                            ALTER TABLE order_item
                            ADD COLUMN product_size
                            VARCHAR(40)
                            DEFAULT ''
                            '''
                        )
                    )

                    db.session.commit()

                except Exception:

                    db.session.rollback()

        # ========================================================
        # REFRESH INSPECTOR AFTER MIGRATIONS
        # ========================================================

        inspector = inspect(
            db.engine
        )

        tables = set(
            inspector.get_table_names()
        )

        # ========================================================
        # MIGRATE OLD PRODUCT NAMES → PRODUCT SIZE
        # ========================================================

        #
        # Existing products may currently look like:
        #
        #     Cola 750ml
        #     Energy Drink 250ml
        #     Premium Water 20L
        #
        # We don't want to force you to manually edit them.
        #
        # This extracts the size and stores it separately:
        #
        #     name = Cola
        #     size = 750ml
        #

        if "product" in tables:

            try:

                from .models import Product

                products = Product.query.all()

                changed = False

                size_pattern = re.compile(
                    r"""
                    \b
                    (
                        \d+(?:\.\d+)?
                        \s*
                        (?:ml|ML|l|L|litre|litres|liter|liters)
                    )
                    \b
                    """,
                    re.VERBOSE
                )

                for product in products:

                    # Only migrate products which don't
                    # already have a size.
                    if product.size:
                        continue

                    name = (
                        product.name or ""
                    ).strip()

                    match = size_pattern.search(
                        name
                    )

                    if not match:
                        continue

                    detected_size = (
                        match.group(1)
                        .replace(" ", "")
                    )

                    new_name = (
                        name[:match.start()]
                        + name[match.end():]
                    ).strip()

                    # Clean accidental double spaces
                    new_name = re.sub(
                        r"\s{2,}",
                        " ",
                        new_name
                    ).strip()

                    if new_name:

                        product.name = new_name

                    product.size = detected_size

                    changed = True

                if changed:

                    db.session.commit()

            except Exception:

                db.session.rollback()

        # ========================================================
        # DATABASE INDEXES
        # ========================================================

        #
        # Helpful indexes for the most common dashboard/store
        # queries.
        #

        for sql in (

            'CREATE INDEX IF NOT EXISTS '
            'ix_product_category '
            'ON product(category)',

            'CREATE INDEX IF NOT EXISTS '
            'ix_product_active '
            'ON product(active)',

            'CREATE INDEX IF NOT EXISTS '
            'ix_product_size '
            'ON product(size)',

            'CREATE INDEX IF NOT EXISTS '
            'ix_order_created_at '
            'ON "order"(created_at)',

            'CREATE INDEX IF NOT EXISTS '
            'ix_order_status '
            'ON "order"(status)',

            'CREATE INDEX IF NOT EXISTS '
            'ix_order_payment_status '
            'ON "order"(payment_status)',

        ):

            try:

                db.session.execute(
                    text(sql)
                )

            except Exception:

                db.session.rollback()

        db.session.commit()

        # ========================================================
        # SEED DATA
        # ========================================================

        from .seed import seed

        seed()

    return app
