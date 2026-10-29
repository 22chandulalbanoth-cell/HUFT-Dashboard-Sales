# HUFT Sales Dashboard v1.0.6 — Update Popup

## Feature
The dashboard checks the latest commit that changed `index.html` in the public GitHub repository. When it detects a new commit compared with the last build dismissed in this browser profile, it displays a popup with the build ID and published date/time. The user can select **Got it**, **Later**, click outside the popup, or press Escape to dismiss it. The same build is not shown repeatedly after dismissal.

The first successful check silently records the current build so existing users do not get a surprise popup just for installing this feature. The popup appears on a subsequent `index.html` update. It relies on the public GitHub API; if the API is unavailable/rate-limited, the dashboard still works but the popup cannot verify updates.

## Publish
1. Back up the current `index.html`.
2. Upload this package's `index.html` to the `main` branch of:
   https://github.com/22chandulalbanoth-cell/HUFT-Dashboard-Sales
3. Commit changes.
4. Wait for a successful GitHub Pages deployment in Actions.
5. Open the existing site and press Ctrl+F5.

Website: https://22chandulalbanoth-cell.github.io/HUFT-Dashboard-Sales/

Keep the previous HTML backup and test the dashboard, Excel upload, saved data, and the popup after the next update.
