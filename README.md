# DJ Request Live

DJs sign up, add their payment handles (Cash App, Venmo, PayPal, Zelle, Apple Cash), customize a landing page, and get a QR poster. Guests scan, request a song, and tip the DJ directly in the DJ's own payment app.

**Stack:** React + Vite frontend, a small Node server (`server.js`, one dependency: `mysql2`), MySQL on Hostinger. No third-party backend service.

## Deploy on Hostinger (Node.js web app)

1. **hPanel → Databases → MySQL Databases**: create a database and user. Note the database name, user and password.
2. **hPanel → Websites → Add website → Node.js Apps**: import this GitHub repo (branch `main`).
3. In the app's **Environment variables**, add:
   - `DB_HOST` (usually `localhost`), `DB_PORT` (`3306`)
   - `DB_USER`, `DB_PASSWORD`, `DB_NAME`
4. Build command `npm run build`, start command `npm start` (entry file `server.js`).
5. Deploy. On first start the server creates its tables from `schema.sql` (all `CREATE TABLE IF NOT EXISTS`, safe to re-run).
6. Point `djrequestlive.com` at the app and enable SSL. Check `https://djrequestlive.com/api/health`: it should return `{"ok":true,...}`.

### Spotify catalog search and SI DJ

Create a Spotify Developer app and set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in the Node app's server environment (or in local `.env`). Set `SPOTIFY_REDIRECT_URI` to the exact callback URL registered in Spotify, for example `https://djrequestlive.com/api/spotify/callback`. These values stay on the server; do not add them to Vite variables or commit real credentials. DJs connect their own Spotify accounts through SI DJ. Spotify search is live reference data only: search results are not ingested into the database or used for AI training.

SI DJ compares live Spotify candidates with the authenticated DJ's private `library_tracks` rows and returns exact title/artist matches plus available local versions. The library API is owner-scoped: `POST /api/library/import` accepts batches of up to 500 scanned records with `title`, `artist`, `file_path` and optional `album`, `genre`, `bpm`, `year`, `file_type`, `duration_seconds`, and `metadata_source`; `GET /api/library/summary` and `GET /api/library/search?q=...` read only the signed-in DJ's inventory. Import paths and metadata belong to that DJ and are never returned in public DJ pages. Repeated paths are ignored while distinct physical versions are preserved.

## Local development

```bash
npm install
cp .env.example .env     # fill in a MySQL database
npm run dev:api          # API + built site on :3000
npm run dev              # Vite on :5173, proxies /api and /media to :3000
```

Quick no-MySQL test mode: `DB_DRIVER=sqlite DB_FILE=/tmp/rl.sqlite npm start` (Node 22+).

## Security notes

Passwords are hashed with scrypt; sessions are random tokens (only a hash is stored) in an HttpOnly cookie. State-changing requests check Origin. Signup, login and guest requests are rate limited. Uploads are sniffed for real JPEG/PNG/WebP. The app never holds money: tips go from the guest to the DJ's payment app, and the DJ marks requests paid by hand.

## Routes

`/` marketing · `/signup` · `/login` · `/studio` (queue, my page, design, QR) · `/:slug` guest page.
