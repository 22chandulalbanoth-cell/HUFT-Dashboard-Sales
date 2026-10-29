# HUFT Sales Dashboard v1.0.5 — Storage Fix

## What's addressed
- Keeps the IndexedDB connection reusable instead of closing it while retaining a cached promise.
- Resets the cached database connection when it closes or a version change occurs.
- Retries the clear-data database transaction once with a fresh connection.
- Prevents the app from reporting a successful clear if deleting the saved IndexedDB record failed.

## Publish to the existing GitHub Pages site
Repository: https://github.com/22chandulalbanoth-cell/HUFT-Dashboard-Sales

1. Back up the current `index.html`.
2. Upload this package's `index.html` to the repository's `main` branch, replacing the existing site entry file.
3. Commit with message: `Fix IndexedDB storage and clear-data handling v1.0.5`.
4. Open Actions and wait for GitHub Pages deployment to succeed.
5. Open https://22chandulalbanoth-cell.github.io/HUFT-Dashboard-Sales/ and press Ctrl+F5.
6. Test upload, refresh/reopen, and Clear Saved Data. Confirm targets remain saved and sales data is cleared.

Do not delete unrelated repository files. If replacing `index.html` is blocked, stop and share a screenshot before deleting anything.

## Important
The code changes address the connection-lifecycle issue identified in the uploaded HTML. They have not been validated in the user's live browser or against their actual Excel files. Keep a backup and test with a small sample first.
