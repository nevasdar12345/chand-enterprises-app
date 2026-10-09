import gzip
import os
import re
from pathlib import Path

from flask import Flask, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Engine


db = SQLAlchemy()


# ============================================================
# SQLITE SPEED SETTINGS (ignored automatically on PostgreSQL)
# ============================================================

@event.listens_for(Engine, "connect")
def _sqlite_speed(dbapi_conn, _record):
    if dbapi_conn.__class__.__module__.startswith("sqlite3"):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")      # readers no longer block the writer
        cur.execute("PRAGMA synchronous=NORMAL")    # much faster commits, still safe with WAL
        cur.execute("PRAGMA temp_store=MEMORY")
        cur.execute("PRAGMA cache_size=-20000")     # ~20 MB page cache
        cur.close()


# Content types worth gzip-compressing
GZIP_TYPES = {
    "text/html",
    "text/css",
    "text/plain",
    "text/javascript",
    "application/javascript",
    "application/json",
    "application/manifest+json",
    "image/svg+xml",
}


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

        TELEGRAM_BOT_TOKEN=os.getenv("TELEGRAM_BOT_TOKEN", "").strip(),
        TELEGRAM_WEBHOOK_SECRET=os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip(),
        PUBLIC_BASE_URL=os.getenv("PUBLIC_BASE_URL", "").strip(),
    )

    if database_url:
        # PostgreSQL only: drop dead connections instead of failing the request
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
            "pool_pre_ping": True,
            "pool_recycle": 280,
        }

    db.init_app(app)

    # ============================================================
    # ROUTES
    # ============================================================

    from .routes import main

    app.register_blueprint(main)

    # ============================================================
    # STATIC FILE VERSIONING
    # ------------------------------------------------------------
    # Every {{ url_for('static', filename='x.js') }} in the templates
    # automatically becomes /static/x.js?v=<file modified time>.
    # That lets the browser cache static files for a long time, and
    # still pick up new code right after you deploy a change.
    # ============================================================

    asset_versions = {}

    def versioned_url_for(endpoint, **values):
        if endpoint == "static":
            filename = values.get("filename")
            if filename and "v" not in values:
                version = None if app.debug else asset_versions.get(filename)
                if version is None:
                    try:
                        version = int(
                            os.stat(
                                os.path.join(app.static_folder, filename)
                            ).st_mtime
                        )
                    except OSError:
                        version = 0
                    asset_versions[filename] = version
                if version:
                    values["v"] = version
        return url_for(endpoint, **values)

    @app.context_processor
    def inject_versioned_url_for():
        return {"url_for": versioned_url_for}

    # ============================================================
    # RESPONSE COMPRESSION + STATIC CACHE
    # ============================================================

    static_gzip_cache = {}

    @app.after_request
    def compress_response(response):

        is_static = request.path.startswith("/static/")

        accept = request.headers.get(
            "Accept-Encoding",
            ""
        )

        if (
            "gzip" in accept.lower()
            and response.status_code == 200
            and not response.headers.get("Content-Encoding")
            and response.mimetype in GZIP_TYPES
        ):

            # Static files are streamed from disk (direct_passthrough);
            # turn that off so they can be compressed too.
            if is_static and response.direct_passthrough:
                response.direct_passthrough = False

            if response.direct_passthrough is False:

                data = response.get_data()

                if len(data) > 700:

                    cache_key = None

                    if is_static and response.headers.get("ETag"):
                        cache_key = (request.path, response.headers["ETag"])

                    packed = static_gzip_cache.get(cache_key) if cache_key else None

                    if packed is None:
                        packed = gzip.compress(data, compresslevel=6)

                        if cache_key:
                            static_gzip_cache[cache_key] = packed

                    response.set_data(packed)

                    response.headers["Content-Encoding"] = "gzip"

                    response.headers["Vary"] = "Accept-Encoding"

        # Browser cache for static files.
        # Flask already sets "Cache-Control: no-cache" on static files, so this
        # is assigned (not setdefault) - otherwise it would never apply.
        if is_static and response.status_code in (200, 304):

            if "v" in request.args:
                # versioned URL: safe to cache for a year
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            else:
                # unversioned (sw.js, manifest, icons): re-check hourly
                response.headers["Cache-Control"] = "public, max-age=3600"

        return response

    # ============================================================
    # FRIENDLY ERROR FALLBACKS
    # ============================================================

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
    # HEALTH CHECK  (point your uptime pinger here: it needs no database)
    # ============================================================

    @app.route("/health")
    def health():

        return "OK", 200

    # ============================================================
    # DATABASE INITIALIZATION + MIGRATIONS
    # ============================================================

    with app.app_context():

        # Create missing tables (Category and any other new tables).
        db.create_all()

        inspector = inspect(db.engine)

        tables = set(inspector.get_table_names())

        def add_column(table_sql, column_sql, table_name, column_name):
            """ALTER TABLE ... ADD COLUMN, only if the column is missing."""
            if table_name not in tables:
                return
            existing = {c["name"] for c in inspector.get_columns(table_name)}
            if column_name in existing:
                return
            try:
                db.session.execute(
                    text(f"ALTER TABLE {table_sql} ADD COLUMN {column_sql}")
                )
                db.session.commit()
            except Exception:
                db.session.rollback()

        # --------------------------------------------------------
        # Column migrations (same columns as before)
        # --------------------------------------------------------

        for col in ("latitude", "longitude", "cash_collected"):
            add_column('"order"', f"{col} FLOAT DEFAULT 0", "order", col)

        add_column("product", "image_url TEXT DEFAULT ''", "product", "image_url")

        add_column('"user"', "active BOOLEAN DEFAULT TRUE", "user", "active")

        add_column("product", "size VARCHAR(40) DEFAULT ''", "product", "size")

        add_column("order_item", "product_size VARCHAR(40) DEFAULT ''", "order_item", "product_size")

        # Add the archive Drive URL column to older PostgreSQL databases.
        # create_all() does not alter an existing table.
        add_column(
            "order_archive",
            "drive_file_url TEXT DEFAULT ''",
            "order_archive",
            "drive_file_url"
        )

        # Refresh after migrations
        inspector = inspect(db.engine)

        tables = set(inspector.get_table_names())

        # --------------------------------------------------------
        # MIGRATE OLD PRODUCT NAMES -> PRODUCT SIZE
        #
        #     "Cola 750ml"  ->  name = "Cola", size = "750ml"
        #
        # Only products that still have NO size are loaded
        # (before: every product was loaded on every start-up,
        # which slowed down each Render wake-up).
        # --------------------------------------------------------

        if "product" in tables:

            try:

                from .models import Product

                products = Product.query.filter(
                    db.or_(Product.size == "", Product.size.is_(None))
                ).all()

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

                    # Only migrate products which don't already have a size.
                    if product.size:
                        continue

                    name = (product.name or "").strip()

                    match = size_pattern.search(name)

                    if not match:
                        continue

                    detected_size = match.group(1).replace(" ", "")

                    new_name = (name[:match.start()] + name[match.end():]).strip()

                    # Clean accidental double spaces
                    new_name = re.sub(r"\s{2,}", " ", new_name).strip()

                    if new_name:
                        product.name = new_name

                    product.size = detected_size

                    changed = True

                if changed:
                    db.session.commit()

            except Exception:

                db.session.rollback()

        # --------------------------------------------------------
        # DATABASE INDEXES
        # (IF NOT EXISTS: safe on every start, SQLite and PostgreSQL)
        # --------------------------------------------------------

        for sql in (

            'CREATE INDEX IF NOT EXISTS ix_product_category ON product(category)',

            'CREATE INDEX IF NOT EXISTS ix_product_active ON product(active)',

            'CREATE INDEX IF NOT EXISTS ix_product_size ON product(size)',

            'CREATE INDEX IF NOT EXISTS ix_order_created_at ON "order"(created_at)',

            'CREATE INDEX IF NOT EXISTS ix_order_status ON "order"(status)',

            'CREATE INDEX IF NOT EXISTS ix_order_payment_status ON "order"(payment_status)',

            # --- new: these were missing and made order lists slow ---

            'CREATE INDEX IF NOT EXISTS ix_order_item_order_id ON order_item(order_id)',

            'CREATE INDEX IF NOT EXISTS ix_payment_order_id ON payment(order_id)',

            'CREATE INDEX IF NOT EXISTS ix_order_mobile ON "order"(mobile)',

            'CREATE INDEX IF NOT EXISTS ix_order_delivery_person_id ON "order"(delivery_person_id)',

            'CREATE INDEX IF NOT EXISTS ix_otp_challenge_mobile ON otp_challenge(mobile)',

        ):

            try:

                db.session.execute(text(sql))

            except Exception:

                db.session.rollback()

        db.session.commit()

        # --------------------------------------------------------
        # SEED DATA
        # --------------------------------------------------------

        from .seed import seed

        seed()

    return app
