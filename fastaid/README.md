# FastAid Demo v27 — Fixed Cheeriyal Map + Moving Ambulance Only

Demo-only prototype. No real ambulance search is used.

## Exact map behavior
- Cheeriyal is the fixed demo/patient center: **17.5192, 78.6298**.
- Browser GPS is intentionally disabled in Demo Mode.
- The map center and zoom are fixed; no `fitBounds()` or automatic re-centering is used during a trip.
- During Captain → Patient and Patient → Hospital movement, **only the ambulance marker changes position**.
- Patient/Cheeriyal marker remains fixed.
- Route line remains on the originally selected trip path.
- Live Captain → Patient distance/ETA updates without rebuilding the map.

## Demo dispatch
- 20 fictional ambulances are generated in 0–5, 5–10, 10–15 and 15–20 km bands around Cheeriyal.
- BOOK NOW sends to the nearest available fictional captain.
- If the captain does not accept, the next nearest captain is requested.
- Captain ACCEPT → START TRIP → ambulance moves to Cheeriyal.
- PICK UP PATIENT → choose a fictional nearby hospital → ambulance moves to that hospital.

Run with `npm install` then `npm start`.


UI privacy fix: patient coordinates are never displayed in the user-facing or captain-facing interface. The demo still uses fixed Cheeriyal coordinates internally only for map rendering and distance calculations.
