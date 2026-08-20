# FastAid Demo v21 — Distance Bands + Captain Dispatch

Demo-only ambulance booking prototype. No real ambulance search/API is used.

- 20 fictional ambulances are generated around the user's current browser location.
- They are placed in 0–5 km, 5–10 km, 10–15 km and 15–20 km bands.
- The map shows a small sample from every band plus 5 nearest in the list.
- Browser GPS is used only for the user's own map position; ambulance data remains fictional.
- BOOK NOW sends a request to the nearest available demo captain.
- Captain dashboard can ACCEPT REQUEST; if nobody accepts, the request falls through to the next nearest captain after a timeout.
- Demo never displays a real-world "no ambulance" search result.

Run:

```bash
npm install
npm start
```

For Render, use `npm ci` as build command and `npm start` as start command.
