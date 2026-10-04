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

## Free product image hosting (GitHub)

Admin and Developer can upload product images from their dashboards. Uploaded images are stored in a **public GitHub repository** through the GitHub Contents API, and the resulting public `raw.githubusercontent.com` URL is saved in the Product database. This avoids losing images when Render restarts or redeploys.

### Render Environment Variables

Add these variables in Render:

```text
GITHUB_TOKEN=your_github_token
GITHUB_REPO=YOUR_GITHUB_USERNAME/YOUR_PUBLIC_REPOSITORY
GITHUB_BRANCH=main
GITHUB_IMAGE_FOLDER=static/product-images
```

`GITHUB_TOKEN` stays server-side and is never sent to the browser.

The GitHub repository should be **public**, because the website needs to display the images without authentication. Create a fine-grained GitHub token with access to the selected repository and permission to read/write repository contents.

### Image rules

- JPG / JPEG / PNG / WEBP / GIF
- Maximum 5 MB per image
- Admin and Developer can upload, replace, remove, or paste a public image URL
- Old GitHub image files are intentionally kept when an image is replaced, so replacing an image never breaks an older cached URL

### Dashboard flow

`Admin/Developer → Products → 📷 Image → Upload to GitHub`

You can also use `Save image URL` if an image is already hosted somewhere publicly.
