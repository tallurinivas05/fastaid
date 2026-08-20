# FastAid Smart Map Demo

Demo-only FastAid mobile-style prototype.

## What changed
- 20 fictional/demo ambulances exist in the backend.
- Only the nearby AVAILABLE ambulances within 5 km are shown to the user.
- Exactly 5 suitable demo ambulances are restored on every reset/refresh.
- BUSY/OFFLINE/far ambulances are not shown on the user map.
- User can select one nearby ambulance from the bottom sheet.
- Booking changes AVAILABLE -> REQUESTED -> CAPTAIN_ACCEPTED automatically in demo mode.
- The selected ambulance immediately leaves the AVAILABLE list.
- DEMO MODE is clearly indicated.
- Responsive mobile app shell; on a laptop it remains phone-sized.
- Captain and Hospital views are included for multi-device presentation testing.

## Run
npm install
npm start

Then open http://localhost:3000

For Render: use a Web Service, Root Directory if applicable, Build Command `npm install`, Start Command `npm start`.
