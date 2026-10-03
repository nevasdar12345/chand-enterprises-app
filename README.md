# Chand Enterprises – ordering app (light version)
    pip install -r requirements.txt
    python run.py            # http://127.0.0.1:5000
Staff login: /staff  (admin/admin123, delivery/delivery123, developer/developer123) – change these before going live.
Env vars (optional): SECRET_KEY, WHATSAPP_NUMBER (default 9304285574), UPI_ID, DEV_OTP=0 to hide the demo OTP.
**Set UPI_ID to your real UPI id** (e.g. `set UPI_ID=yourshop@okhdfcbank`) – the payment QR is generated automatically per order with the exact amount, no static QR image needed.
Delete the old `instance/chand.db` if you get column errors after changing models (not needed for this update – no model changes).
Offers ticker text: edit `OFFERS` in `app/static/app.js`.


## Production environment settings

Set these on Render (or your production host):

- `SECRET_KEY` — a long random secret.
- `DATABASE_URL` — PostgreSQL connection string.
- `ADMIN_PASSWORD` — initial admin password (8+ characters).
- `DELIVERY_PASSWORD` — initial delivery password.
- `DEVELOPER_PASSWORD` — initial developer password.
- `WHATSAPP_NUMBER` — business WhatsApp number.
- `UPI_ID` — business UPI ID.
- `DEV_OTP=0` in production. Set `DEV_OTP=1` only for local/demo testing.
- `MASTER_OTP` — leave empty in production; there is no universal OTP.

On a new production database, if an initial staff password is not supplied, the application generates a random one and prints it once to the startup log. Existing accounts are not overwritten by reseeding.

### Feature notes

- Categories are developer-managed and are the only valid product categories. Renaming a category updates its products; hidden categories cannot be newly assigned.
- Admins manage delivery accounts. Developers can manage both admins and delivery accounts. The last active admin cannot be disabled.
- Customer bills are itemised and can be opened in WhatsApp. The website uses a pre-filled WhatsApp link; automatic server-side WhatsApp sending requires a WhatsApp Business API provider.
- Instagram, Facebook and brochure links are configured by the developer and validated as HTTP(S) URLs.
- The map library loads only when the customer actually opens the location picker.
