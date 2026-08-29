# Iron Log

A dependency-free PWA for tracking gym progression — log your lifts, watch the
trend, and get nudged when a lift has been stuck too long. All data lives in the
browser's `localStorage`; there is no backend and no build step.

## Run locally

```powershell
./serve.ps1            # serves the folder on http://localhost:8080
./serve.ps1 -Port 9000
```

Any static file server works too — just serve the repo root.

## Layout

```
index.html            markup shell + service-worker registration
manifest.json          PWA manifest (installable, standalone)
sw.js                  service worker — network-first for code, cache-first for assets
serve.ps1              zero-dependency static server for local dev

css/styles.css         all styling + the @font-face

assets/fonts/          Plus Jakarta Sans (variable woff2)
assets/icons/          app + apple-touch icons

js/utils.js            formatting + tiny DOM helpers
js/storage.js          Store: data model + localStorage persistence (window.Store)
js/timer.js            RestTimer: timestamp-based rest-timer model (window.RestTimer)
js/chart.js            canvas line chart + bar sparkline (no chart library)
js/components.js       shared UI builders: bottom nav, headers, exercise card, modal
js/timer-ui.js         the rest-timer tile and the floating "Resting" pill
js/views.js            the five screens (Today, Today's Lifts, Picker, Log, Progress)
js/app.js              hash router + bootstrap — loaded last
```

Scripts are plain classic `<script>`s (no modules/bundler) and are loaded in
dependency order; everything shares one global script scope. When adding a file,
insert it in `index.html` after its dependencies and in the `sw.js` `ASSETS`
list, and bump `CACHE_NAME`.
