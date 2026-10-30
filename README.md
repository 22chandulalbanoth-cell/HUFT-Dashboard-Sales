# HUFT Sales Report Dashboard (v1.0.4)

[![Release](https://img.shields.io/badge/Release-v1.0.4-orange.svg)](https://github.com/)
[![Updated](https://img.shields.io/badge/Date-30_Oct_2026-blue.svg)](https://github.com/)
[![Platform](https://img.shields.io/badge/Format-Standalone_HTML_SPA-success.svg)](https://github.com/)

An interactive, responsive single-page web dashboard application designed for Heads Up For Tails (HUFT) store sales analytics, POS reconciliation, employee performance tracking, and automated WhatsApp hourly/EOD reporting.

---

## 🌟 What's New in Version 1.0.4 (30 Oct 2026)

1. **SPA Sales Accuracy Fix**:
   - Fixed reversal prefix classification where general store credit notes (`CHHYG/...`) were mistakenly treated as SPA package returns.
   - SPA gross and net sales now accurately match official Odoo/POS figures without erroneous negative deductions.

2. **Modern Main Loading Animation**:
   - Interactive startup modal featuring a circular SVG progress spinner with warm HUFT gradient (`#ea580c` to `#fb923c`).
   - 5 real-time milestone checkmarks verifying data loading, record processing, category calculations, dashboard updates, and report generation.
   - Fluid, non-blocking dismissal with fallback auto-dismissal timeout.

3. **Hourly Sale – Sara's Gravy Integration**:
   - Integrated **Sara's Gravy** into the hourly sales update card and WhatsApp report.
   - Real-time tracking of:
     - **Sold Quantity** (Units)
     - **Net Sales Value** (₹)
     - **Sampling Count** (`(Sample: X Qty)`) based on 99.99% discount POS lines.
   - Product detection logic uniquely targets `Nourishing Gravy`.

---

## 🚀 Key Features

- **Standalone Architecture**: 100% self-contained single-page application (`index.html`). No server, Node.js runtime, or external database required.
- **Drag-and-Drop POS Upload**: Automatically maps columns from exported Excel/CSV POS sales files.
- **Local Persistence**: Restores previously loaded sales data via browser `IndexedDB`/`localStorage` so data is never lost on refresh.
- **Automated WhatsApp Messages**: Instant one-click generation and clipboard copy for:
  - Hourly Sales Progress Report
  - End of Day (EOD) Summary with Employee-wise breakdown
- **3D Interactive Charts & Hover**: Visual KPI cards, daywise trends, brand breakdowns, and pet count analytics.
- **Print & PDF Export**: Clean, paper-formatted print styling for physical store records.

---

## 📁 Repository Structure

```text
├── index.html                                  # Primary dashboard entrypoint (ideal for GitHub Pages)
├── HUFT_Sales_Report_Release_Version_1_0_4.html  # Version-stamped copy
├── README.md                                   # Project documentation and guide
├── CHANGELOG.md                                # Version history & release notes
└── .gitignore                                  # Git ignore rules
```

---

## 🌐 Deploying to GitHub & GitHub Pages

1. **Create a GitHub Repository**:
   - Go to [GitHub.com](https://github.com/) and click **New Repository**.
   - Name it `HUFT-Sales-Report` (or your preferred name).
2. **Upload Files**:
   - Drag and drop all files from this folder (`index.html`, `README.md`, `CHANGELOG.md`, `.gitignore`) into the repository.
   - Commit changes to `main`.
3. **Enable GitHub Pages (Optional for Live Web Link)**:
   - Go to **Settings** > **Pages** in your GitHub repository.
   - Under **Build and deployment > Branch**, select `main` and root `/`.
   - Click **Save**. Your dashboard will be live at `https://<username>.github.io/<repo-name>/`!

---

## 📄 License
Internal Store Operations Dashboard — Heads Up For Tails (Earth Paws Private Limited).
