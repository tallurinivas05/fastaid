# FastAid Demo v28 — Hospital Arrivals + Blood Emergency + Static Live Tracking

Demo-only FastAid prototype using fictional data.

## v28 changes
- Hospital Dashboard keeps **AMBULANCE ARRIVALS** visible.
- Hospital Dashboard includes two blood-emergency workflows:
  - **REQUEST BLOOD** — send a fictional emergency blood request.
  - **INCOMING BLOOD REQUESTS** — ACCEPT BLOOD / NOT AVAILABLE.
- Hospital ambulance-arrival card includes live captain/ambulance tracking, distance in km and ETA.
- During movement the Leaflet map is **never re-centered or rebuilt** on each position update.
- Only the ambulance marker moves along a fixed multi-point demo route.
- Patient/Cheeriyal marker stays fixed.
- Hospital tracking uses the same static-map behavior.
- Coordinates remain internal demo data and are not displayed in the UI.
- No real ambulance, captain, hospital or blood-provider data is used.
