# Lawn Route Tracker

A local-first PWA for a solo lawn-care operator: plans routes, auto-times on-site
visits via GPS arrival zones, logs revenue, and keeps EPA application records.
All data lives in the browser (IndexedDB) — no backend, no accounts.

Built to the spec in [SPEC.md](SPEC.md); UI to [DESIGN.md](DESIGN.md).

## Run it locally

```bash
npm install
cp .env.example .env.local   # then paste your Google Maps key into .env.local
npm run dev                  # http://localhost:5193
npm test                     # 105 unit/integration/replay tests
```

Load demo data anytime from **Settings → Developer → Load sample data** (dev only).

## Put it on your phone (GitHub Pages)

This deploys a live HTTPS URL you can open on a phone and "Add to Home Screen"
(it's an installable, offline-capable PWA).

1. **Create a GitHub repo named `lawn-route-tracker`** (public). If you use a
   different name, change `BASE` in `vite.config.js` to `/<your-repo-name>/`.
2. **Push this code** (`git remote add origin … && git push -u origin main`).
3. **Add the Maps key as a secret:** repo → Settings → Secrets and variables →
   Actions → *New repository secret* → name `VITE_GOOGLE_MAPS_API_KEY`, value =
   your key.
4. **Enable Pages:** repo → Settings → Pages → *Source: GitHub Actions*.
5. Push (or re-run the workflow). The **Deploy to GitHub Pages** action builds
   and publishes to `https://<username>.github.io/lawn-route-tracker/`.
6. **Restrict the key:** in Google Cloud Console, add an HTTP-referrer
   restriction for `https://<username>.github.io/*` (and `http://localhost:5193/*`).

Open that URL on your phone → browser menu → **Add to Home Screen**.

## Notes for real field use

- **Screen-on:** browser PWAs can't geofence in the background — keep the phone
  mounted with the Live screen open (a wake lock is requested automatically).
- **Wipe demo data** before real use: Settings → Developer → Wipe all data.
- **Back up:** a full JSON snapshot auto-downloads at every Day Review save;
  manual backup/restore is in Settings.
- Maps/weather need signal; the live timer + visit tracking work fully offline.
