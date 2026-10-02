# Chand Enterprises – ordering app (light version)
    pip install -r requirements.txt
    python run.py            # http://127.0.0.1:5000
Staff login: /staff  (admin/admin123, delivery/delivery123, developer/developer123) – change these before going live.
Env vars (optional): SECRET_KEY, WHATSAPP_NUMBER (default 9304285574), UPI_ID, DEV_OTP=0 to hide the demo OTP.
**Set UPI_ID to your real UPI id** (e.g. `set UPI_ID=yourshop@okhdfcbank`) – the payment QR is generated automatically per order with the exact amount, no static QR image needed.
Delete the old `instance/chand.db` if you get column errors after changing models (not needed for this update – no model changes).
Offers ticker text: edit `OFFERS` in `app/static/app.js`.
