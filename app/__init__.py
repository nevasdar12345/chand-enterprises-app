import os
from pathlib import Path
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def create_app():
    app = Flask(__name__, instance_relative_config=True)

    Path(app.instance_path).mkdir(parents=True, exist_ok=True)

    # Database
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

        DEV_OTP=os.getenv(
            "DEV_OTP",
            "1"
        ) == "1",
    )

    db.init_app(app)

    from .routes import main
    app.register_blueprint(main)

    # ---- Friendly fallbacks -------------------------------------------
    # Wrong URL (404) or wrong method (405):
    #   * /api/... calls get a clean JSON error (the JS code reads this)
    #   * everything else (a page the user opened) goes back to the home page
    from flask import jsonify, redirect, request, url_for

    def _fallback(status, message):
        if request.path.startswith("/api/"):
            return jsonify(error=message), status
        return redirect(url_for("main.home"))

    @app.errorhandler(404)
    def not_found(_e):
        return _fallback(404, "Not found")

    @app.errorhandler(405)
    def method_not_allowed(_e):
        return _fallback(405, "Method not allowed")

    @app.errorhandler(500)
    def server_error(_e):
        if request.path.startswith("/api/"):
            return jsonify(error="Something went wrong. Please try again."), 500
        return redirect(url_for("main.home"))

    # UptimeRobot / Render health check
    @app.route("/health")
    def health():
        return "OK", 200

    with app.app_context():
        db.create_all()

        # Version 2: add location columns to an existing "order" table
        from sqlalchemy import inspect, text
        existing = {c["name"] for c in inspect(db.engine).get_columns("order")}
        for col in ("latitude", "longitude", "cash_collected"):
            if col not in existing:
                db.session.execute(text(f'ALTER TABLE "order" ADD COLUMN {col} FLOAT DEFAULT 0'))
        db.session.commit()

        from .seed import seed
        seed()

    return app
