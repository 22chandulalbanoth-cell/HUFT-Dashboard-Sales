# Changelog

All notable changes to the **HUFT Sales Report Dashboard** are documented in this file.

## [v1.0.4] - 2026-10-30

### Fixed
- **SPA Sale Reversal Classification**: Refined package sale reversal regex to exclusively target `AD...` prefixes instead of matching `CHHYG` (general store credit notes). Food returns and retail returns are no longer mistakenly deducted from SPA services.
- **Order Type Mapping**: Enhanced detection for order type column variants (`_orderType`, `Column U`, `SPA Subscription`).

### Added
- **Modern Main Loading Animation**: Added a clean, white-card startup overlay with an animated circular progress ring and 5 verification milestones:
  1. Loading saved sales data
  2. Processing sales records
  3. Calculating Retail, SPA and food sales
  4. Updating dashboard cards and charts
  5. Preparing reports
- **Sara's Gravy in Hourly Sales**:
  - Filter logic: detects items matching `Nourishing Gravy`.
  - Computes paid quantity, net revenue value, and 99.99% discount POS sampling count.
  - Integrated into the Hourly popup dialog, live report cards, and WhatsApp message generator.

---

## [v1.0.3] - 2026-10-29
- Local browser data persistence and fast bootloader.
- Performance optimizations for large multi-month datasets.

## [v1.0.2] - 2026-10-29
- Dashboard interaction and chart tooltip improvements.

## [v1.0.1] - 2026-10-29
- 3D pie chart mouse tracking and smooth hover transitions.

## [v1.0.0] - 2026-10-28
- Baseline release of the HUFT Sales Report Dashboard.
