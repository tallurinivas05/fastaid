# FastAid v19 — Live Multi-Device Emergency Coordination

This version keeps the mobile-app UI but changes the demo into a **real-time multi-device prototype** using one Node/Express + Socket.IO server.

## What changed

- User map shows **available ambulances within a 5 km radius**.
- Booking screen is compact: nearby ambulance map + **BOOK NOW**.
- If a government ambulance is available within 5 km, it is shown separately. Tapping it sends the request only to that government ambulance.
- Normal **BOOK NOW** broadcasts the request to eligible nearby ambulances. The **first eligible captain to accept wins the trip**.
- Captain dashboard has a captain selector so a laptop can represent a specific ambulance/captain.
- Hospital dashboard has a hospital selector so another phone can represent a specific hospital.
- Socket.IO broadcasts booking/acceptance/location/status changes to all connected devices.
- Captain map is shown before the details on mobile/laptop; trip details are below it.
- Road routes use OSRM when available and the ambulance marker moves along the returned road path during the demo.
- Hospital dashboard receives only arrivals for its selected hospital and keeps completed trips in **Ambulance Arrival History**.
- Completing an arrived trip releases the ambulance back to AVAILABLE so another booking can be accepted.
- Blood requests remain in the separate Blood interface.

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:3000` on the laptop and phones connected to the **same Wi-Fi** using the laptop's LAN IP, for example `http://192.168.1.10:3000`.

For a deployed test, deploy this Node app as a normal long-running web service (Render/Railway/Fly.io/etc.). Do not use a static-only host or a serverless-only deployment for this Socket.IO prototype.

## Important prototype limitation

The live state is currently kept in server memory. That is enough for a one-server demo and multi-device testing, but production needs a database (PostgreSQL/MongoDB/etc.), authentication, persistent trip records, Redis/socket scaling, and proper driver/hospital accounts.
