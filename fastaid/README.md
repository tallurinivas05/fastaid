# FastAid Demo v34

- Cheeriyal is the fixed demo center; no browser GPS is used.
- Hospital dashboard has exactly three main interfaces: Ambulance Arrivals, Blood Emergency Request, Blood Request Accepts.
- Only the selected hospital interface is visible at a time.
- Ambulance Arrivals shows the live ambulance route and Captain → Hospital distance/ETA.
- Captain/user/hospital trip maps stay fixed; only the ambulance marker moves smoothly along the route.
- Nearby fictional demo blood banks are listed with distance and available units.
- Blood Emergency creates only the request the user actually sends. No fake/seeded O+, B+, or other blood requests are inserted.
- The same sent request appears in Blood Request Accepts while pending. Accepting it changes that exact request to ACCEPTED in Sent Requests.
- User tracking automatically follows the active booking even when captain acceptance happens from another browser tab/device, and captain details appear after acceptance.
- No coordinates are displayed in the UI.
