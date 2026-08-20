const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const CENTER = { lat: 17.4065, lng: 78.4772 };
const RADIUS_KM = 5;

// Fictional demo data only.
const demoCaptains = [
  "Aarav Demo", "Vihaan Demo", "Reyansh Demo", "Advik Demo", "Kabir Demo",
  "Arjun Demo", "Ishaan Demo", "Rohan Demo", "Neil Demo", "Ayaan Demo",
  "Dev Demo", "Kian Demo", "Ritvik Demo", "Yuvan Demo", "Dhruv Demo",
  "Aadi Demo", "Veer Demo", "Samir Demo", "Rudra Demo", "Aarush Demo"
];

const types = ["BLS", "ALS", "ICU", "Neonatal", "Cardiac"];

// First 5 are deliberately near the demo user; remaining 15 are outside
// the 5 km demo search radius or unavailable.
const nearbyOffsets = [
  [0.006, 0.004],
  [-0.009, 0.010],
  [0.014, -0.006],
  [-0.018, -0.009],
  [0.022, 0.004]
];

const farOffsets = [
  [0.070, 0.020], [-0.065, 0.040], [0.085, -0.055], [-0.075, -0.045],
  [0.100, 0.060], [-0.110, 0.020], [0.090, 0.095], [-0.095, 0.085],
  [0.120, -0.080], [-0.130, -0.060], [0.140, 0.030], [-0.120, 0.110],
  [0.150, -0.020], [-0.145, -0.100], [0.160, 0.090]
];

function makeAmbulances() {
  return Array.from({ length: 20 }, (_, i) => {
    const [dLat, dLng] = i < 5 ? nearbyOffsets[i] : farOffsets[i - 5];
    return {
      id: `AMB-${String(i + 1).padStart(3, "0")}`,
      number: `FA-DEMO-${String(i + 1).padStart(2, "0")}`,
      captainId: `CAP-${String(i + 1).padStart(2, "0")}`,
      captain: demoCaptains[i],
      type: types[i % types.length],
      lat: CENTER.lat + dLat,
      lng: CENTER.lng + dLng,
      homeLat: CENTER.lat + dLat,
      homeLng: CENTER.lng + dLng,
      online: true,
      status: i < 5 ? "AVAILABLE" : (i < 8 ? "BUSY" : "OFFLINE"),
      government: i === 0,
      eta: 4 + i * 2,
      fare: 800 + i * 150
    };
  });
}

const state = {
  demoMode: true,
  ambulances: makeAmbulances(),
  bookings: []
};

let bookingSeq = 1000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function cloneState() {
  return JSON.parse(JSON.stringify(state));
}

function broadcast() {
  io.emit("state:update", cloneState());
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function nearbyAvailable(userLat = CENTER.lat, userLng = CENTER.lng) {
  return state.ambulances
    .filter(a => a.online && a.status === "AVAILABLE")
    .map(a => ({ ...a, distance: distanceKm({ lat: userLat, lng: userLng }, a) }))
    .filter(a => a.distance <= RADIUS_KM)
    .sort((a, b) => a.distance - b.distance);
}

function resetDemo() {
  state.ambulances = makeAmbulances();
  state.bookings = [];
}

app.get("/api/state", (req, res) => {
  const lat = Number(req.query.lat) || CENTER.lat;
  const lng = Number(req.query.lng) || CENTER.lng;
  const snapshot = cloneState();
  snapshot.nearby = nearbyAvailable(lat, lng);
  snapshot.radiusKm = RADIUS_KM;
  res.json(snapshot);
});

app.post("/api/reset", (req, res) => {
  resetDemo();
  broadcast();
  res.json({ ok: true });
});

app.post("/api/bookings", (req, res) => {
  const userLat = Number(req.body.userLat) || CENTER.lat;
  const userLng = Number(req.body.userLng) || CENTER.lng;
  const ambulanceId = req.body.ambulanceId;

  const nearby = nearbyAvailable(userLat, userLng);
  const selected = nearby.find(a => a.id === ambulanceId);

  if (!selected) {
    return res.status(409).json({ error: "Please select a nearby available demo ambulance." });
  }

  const booking = {
    id: `FA-${++bookingSeq}`,
    userLat,
    userLng,
    ambulanceId: selected.id,
    captainId: selected.captainId,
    captain: selected.captain,
    ambulanceNumber: selected.number,
    ambulanceType: selected.type,
    government: selected.government,
    lat: selected.lat,
    lng: selected.lng,
    eta: selected.eta,
    fare: selected.fare,
    status: "REQUESTED",
    createdAt: Date.now()
  };

  selected.status = "BUSY";
  state.bookings.push(booking);
  broadcast();

  // Demo-only: automatically simulate first captain acceptance.
  setTimeout(() => {
    const b = state.bookings.find(x => x.id === booking.id);
    const a = state.ambulances.find(x => x.id === selected.id);
    if (!b || !a || b.status !== "REQUESTED") return;
    b.status = "CAPTAIN_ACCEPTED";
    a.status = "BUSY";
    broadcast();
  }, 1500);

  res.json(booking);
});

app.post("/api/bookings/:id/status", (req, res) => {
  const b = state.bookings.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: "Booking not found" });

  const allowed = [
    "REQUESTED", "CAPTAIN_ACCEPTED", "ON_THE_WAY", "ARRIVED",
    "PATIENT_PICKED_UP", "GOING_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL", "COMPLETED"
  ];
  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

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

io.on("connection", socket => {
  socket.emit("state:update", cloneState());
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FastAid Demo running on port ${PORT}`);
});
