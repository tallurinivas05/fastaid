# FastAid — Smart Map Demo

Demo-only FastAid ambulance booking prototype.

- 20 fictional ambulances exist in the backend.
- They are arranged in four distance bands: about 1–5 km, 6–10 km, 11–15 km and 16–20 km from the fictional demo patient location.
- No real ambulance search/API is used.
- The user map shows only the nearest 5 AVAILABLE demo ambulances.
- If there are no available ambulances inside 5 km, the nearest available demo ambulances outside 5 km are shown instead.
- Demo booking automatically requests the nearest captain. The first demo candidate times out and the request automatically moves to the next nearest captain, which accepts shortly after, demonstrating the fallback flow.
- Refresh/reset restores all 20 demo ambulances and allows the booking demo again.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.
