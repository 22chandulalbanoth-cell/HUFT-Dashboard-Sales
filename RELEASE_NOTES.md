# HUFT Sales Dashboard v1.0.6 — Update Popup

- Adds a modal update notification when a new `index.html` commit is detected.
- Shows a GitHub build ID and published timestamp.
- Popup can be dismissed with Got it, Later, click outside, or Escape.
- Remembers the dismissed build in localStorage so the same update does not keep popping up.
- Uses the public GitHub API; API failure does not block dashboard use.
