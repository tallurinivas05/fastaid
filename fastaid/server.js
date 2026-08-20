const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// DEMO ONLY: no real ambulance search/API is used.
const DEMO_CENTER = { lat: 17.4065, lng: 78.4772 };
const DISPLAY_COUNT = 5;
const DISPLAY_RADIUS_KM = 5;

const demoCaptains = [
  "Aarav Demo", "Vihaan Demo", "Reyansh Demo", "Advik Demo", "Kabir Demo",
  "Arjun Demo", "Ishaan Demo", "Rohan Demo", "Neil Demo", "Ayaan Demo",
  "Dev Demo", "Kian Demo", "Ritvik Demo", "Yuvan Demo", "Dhruv Demo",
  "Aadi Demo", "Veer Demo", "Samir Demo", "Rudra Demo", "Aarush Demo"
];
const types = ["BLS", "ALS", "ICU", "Neonatal", "Cardiac"];

// Exactly 20 fictional ambulances, arranged in four distance bands:
// 5 around 1–5 km, 5 around 6–10 km, 5 around 11–15 km, 5 around 16–20 km.
const distanceBandsKm = [
  [1.4, 2.2, 3.1, 4.0, 4.7],
  [6.2, 7.1, 8.0, 9.0, 9.7],
  [11.3, 12.1, 13.0, 14.1, 14.8],
  [16.2, 17.1, 18.0, 19.0, 19.6]
];
const anglesDeg = [15, 95, 165, 235, 305];

function offsetForKm(distanceKm, angleDeg) {
  const angle = angleDeg * Math.PI / 180;
  const latKm = distanceKm * Math.cos(angle);
  const lngKm = distanceKm * Math.sin(angle);
  return {
    lat: DEMO_CENTER.lat + latKm / 111,
    lng: DEMO_CENTER.lng + lngKm / (111 * Math.cos(DEMO_CENTER.lat * Math.PI / 180))
  };
}

function makeAmbulances() {
  const distances = distanceBandsKm.flat();
  return Array.from({ length: 20 }, (_, i) => {
    const home = offsetForKm(distances[i], anglesDeg[i % 5]);
    return {
      id: `AMB-${String(i + 1).padStart(3, "0")}`,
      number: `FA-DEMO-${String(i + 1).padStart(2, "0")}`,
      captainId: `CAP-${String(i + 1).padStart(2, "0")}`,
      captain: demoCaptains[i],
      type: types[i % types.length],
      lat: home.lat,
      lng: home.lng,
      homeLat: home.lat,
      homeLng: home.lng,
      online: true,
      status: "AVAILABLE",
      government: i === 0,
      eta: Math.max(4, Math.round(distances[i] * 1.7)),
      fare: 800 + i * 120,
      demoDistanceBand: `${Math.round(distances[i])} km`
    };
  });
}

const state = {
  demoMode: true,
  demoUser: { ...DEMO_CENTER },
  ambulances: makeAmbulances(),
  bookings: []
};
let bookingSeq = 1000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function cloneState() { return JSON.parse(JSON.stringify(state)); }
function broadcast() { io.emit("state:update", cloneState()); }

function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// IMPORTANT: never searches the real world. It sorts our 20 fictional records
// and returns the nearest 5 AVAILABLE/ONLINE records. If none are inside 5 km,
// the nearest available records outside 5 km are used as a fallback.
function nearestAvailable(userLat = DEMO_CENTER.lat, userLng = DEMO_CENTER.lng) {
  return state.ambulances
    .filter(a => a.online && a.status === "AVAILABLE")
    .map(a => ({ ...a, distance: distanceKm({ lat: userLat, lng: userLng }, a) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, DISPLAY_COUNT);
}

function resetDemo() {
  state.demoMode = true;
  state.demoUser = { ...DEMO_CENTER };
  state.ambulances = makeAmbulances();
  state.bookings = [];
}

app.get("/api/state", (req, res) => {
  // Demo mode intentionally uses a fixed fictional patient location.
  const lat = DEMO_CENTER.lat;
  const lng = DEMO_CENTER.lng;
  const snapshot = cloneState();
  snapshot.nearby = nearestAvailable(lat, lng);
  snapshot.radiusKm = DISPLAY_RADIUS_KM;
  snapshot.fallbackEnabled = true;
  snapshot.note = "Demo only: nearest 5 fictional ambulances are shown; if none are within 5 km, the next nearest are shown.";
  res.json(snapshot);
});

app.post("/api/reset", (req, res) => {
  resetDemo();
  broadcast();
  res.json({ ok: true });
});

function dispatchNextCandidate(bookingId) {
  const b = state.bookings.find(x => x.id === bookingId);
  if (!b || b.status !== "REQUESTED") return;

  const candidate = state.ambulances.find(a => a.id === b.candidateIds[b.candidateIndex]);
  if (!candidate) {
    // With 20 demo ambulances this should not happen during a normal single-user demo.
    b.status = "REQUESTED";
    broadcast();
    return;
  }

  b.ambulanceId = candidate.id;
  b.captainId = candidate.captainId;
  b.captain = candidate.captain;
  b.ambulanceNumber = candidate.number;
  b.ambulanceType = candidate.type;
  b.government = candidate.government;
  b.lat = candidate.lat;
  b.lng = candidate.lng;
  b.eta = candidate.eta;
  b.fare = candidate.fare;
  b.requestedAt = Date.now();

  candidate.status = "REQUESTED";
  broadcast();

  // Demo response simulation: every candidate has a fictional response delay.
  // The first candidate deliberately times out once to demonstrate automatic
  // fallback to the next nearest captain; the second candidate accepts quickly.
  const isFirstCandidate = b.candidateIndex === 0;
  const delay = isFirstCandidate ? 2800 : 1400;

  setTimeout(() => {
    const current = state.bookings.find(x => x.id === bookingId);
    const amb = state.ambulances.find(x => x.id === candidate.id);
    if (!current || !amb || current.status !== "REQUESTED" || current.ambulanceId !== candidate.id) return;

    if (isFirstCandidate) {
      amb.status = "AVAILABLE";
      current.candidateIndex += 1;
      broadcast();
      dispatchNextCandidate(bookingId);
      return;
    }

    current.status = "CAPTAIN_ACCEPTED";
    amb.status = "BUSY";
    current.acceptedAt = Date.now();
    broadcast();
  }, delay);
}

app.post("/api/bookings", (req, res) => {
  // Demo mode ignores any real GPS and always uses the fictional demo patient location.
  const userLat = DEMO_CENTER.lat;
  const userLng = DEMO_CENTER.lng;
  const candidates = state.ambulances
    .filter(a => a.online && a.status === "AVAILABLE")
    .map(a => ({ id: a.id, distance: distanceKm({ lat: userLat, lng: userLng }, a) }))
    .sort((a, b) => a.distance - b.distance);

  if (!candidates.length) {
    // Never expose "not available" in the normal demo: reset the demo pool.
    resetDemo();
  }

  const freshCandidates = state.ambulances
    .filter(a => a.online && a.status === "AVAILABLE")
    .map(a => ({ id: a.id, distance: distanceKm({ lat: userLat, lng: userLng }, a) }))
    .sort((a, b) => a.distance - b.distance)
    .map(x => x.id);

  const booking = {
    id: `FA-${++bookingSeq}`,
    userLat,
    userLng,
    ambulanceId: freshCandidates[0],
    captainId: null,
    captain: "Finding nearest demo captain…",
    ambulanceNumber: "SEARCHING",
    ambulanceType: "DEMO",
    government: false,
    lat: DEMO_CENTER.lat,
    lng: DEMO_CENTER.lng,
    eta: 0,
    fare: 0,
    status: "REQUESTED",
    candidateIds: freshCandidates,
    candidateIndex: 0,
    createdAt: Date.now()
  };

  state.bookings.push(booking);
  dispatchNextCandidate(booking.id);
  res.json(booking);
});

app.post("/api/bookings/:id/status", (req, res) => {
  const b = state.bookings.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: "Booking not found" });

  const allowed = [
    "REQUESTED", "CAPTAIN_ACCEPTED", "ON_THE_WAY", "ARRIVED",
    "PATIENT_PICKED_UP", "GOING_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL", "COMPLETED"
  ];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });

  b.status = req.body.status;
  if (Number.isFinite(Number(req.body.lat))) b.lat = Number(req.body.lat);
  if (Number.isFinite(Number(req.body.lng))) b.lng = Number(req.body.lng);

  const a = state.ambulances.find(x => x.id === b.ambulanceId);
  if (a) {
    a.lat = b.lat;
    a.lng = b.lng;
    if (b.status === "COMPLETED") {
      a.status = "AVAILABLE";
      a.lat = a.homeLat;
      a.lng = a.homeLng;
    }
  }

  broadcast();
  res.json(b);
});

io.on("connection", socket => socket.emit("state:update", cloneState()));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FastAid Demo running on port ${PORT}`);
});
