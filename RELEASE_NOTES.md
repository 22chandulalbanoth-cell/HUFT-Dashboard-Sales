# HUFT Sales Dashboard v1.0.5 — Storage Fix

- Fixed IndexedDB connection lifecycle so a closed connection is not reused.
- Removed the premature close after a successful sales-data save.
- Made Clear Saved Data retry with a fresh connection and report an error if deletion cannot complete.
- Preserves existing sales calculation and dashboard code.

Testing status: not yet confirmed in the live deployment.
