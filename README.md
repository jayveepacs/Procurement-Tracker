# Thaison Procurement Dashboard

A single-page procurement dashboard for ACM Landholdings, built with HTML, Tailwind CSS, and vanilla JavaScript. It reads Purchase Order data from Excel (via SheetJS) or lets you enter records manually, then visualizes KPIs, aging, delivery status, supplier spend, and risk using Chart.js.

## Features
- Import Purchase Order Excel files (`.xlsx` / `.xls`) in the browser
- Manual data entry form (no Excel needed)
- KPI cards, PO aging, status donut, delivery bars, spend-by-project, top suppliers, risk gauge
- Filter by project
- Export current data back to Excel
- Data persists in the browser (localStorage) — nothing is uploaded to a server

## Run locally
Option A — open directly: double-click `index.html` (needs internet for CDN libraries).

Option B — local server:
```bash
node server.js
```
Then open http://localhost:5173

## Deploy (GitHub Pages)
This is a static site. Push these files to a GitHub repo and enable Pages
(Settings → Pages → Deploy from branch → `main` / root).

## Note on data
Real procurement spreadsheets are excluded via `.gitignore`. Users load their own
data at runtime; no company data is stored in this repository.
