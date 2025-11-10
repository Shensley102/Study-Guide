# Cloudflare Pages — Static Quiz

This repo is ready to deploy on **Cloudflare Pages** as a static site.

## Files
- `index.html` — Entry point
- `static/style.css` — Styles
- `static/script.js` — Frontend logic (uses `/modules.json`)
- `modules.json` — List of question banks (without `.json` suffix)
- `_headers` — Caching + basic security headers

## Deploy
When connecting the repo to Pages:
- Framework preset: **None**
- Build command: *(leave blank)*
- Build output directory: **`.`** (publish repo root)

Then commit your question-bank files (e.g., `Module_1.json`) at the **repo root**.
