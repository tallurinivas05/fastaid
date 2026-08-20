const express=require('express');
const http=require('http');
const path=require('path');
const {Server}=require('socket.io');
const app=express();
const server=http.createServer(app);
const io=new Server(server);
const PORT=process.env.PORT||3000;

// DEMO ONLY: every ambulance is fictional. No real ambulance search/API is used.
const FALLBACK_USER={lat:17.5065,lng:78.6172}; // Cheeryal-area demo fallback
const BAND_DISTANCES=[1.4,2.3,3.4,4.6,6.3,7.5,8.7,9.6,11.4,12.6,13.8,14.7,16.4,17.6,18.5,19.6,2.0,5.0,10.0,15.0];
const ANGLES=[15,95,165,235,305,40,120,200,280,330];
const captains=['Aarav Demo','Vihaan Demo','Reyansh Demo','Advik Demo','Kabir Demo','Arjun Demo','Ishaan Demo','Rohan Demo','Neil Demo','Ayaan Demo','Dev Demo','Kian Demo','Ritvik Demo','Yuvan Demo','Dhruv Demo','Aadi Demo','Veer Demo','Samir Demo','Rudra Demo','Aarush Demo'];
const types=['BLS','ALS','ICU','Neonatal','Cardiac'];
function offset(center,km,deg){const a=deg*Math.PI/180;return {lat:center.lat+(km*Math.cos(a))/111,lng:center.lng+(km*Math.sin(a))/(111*Math.cos(center.lat*Math.PI/180))};}
function makeAmbulances(center){return BAND_DISTANCES.map((km,i)=>{const p=offset(center,km,ANGLES[i%ANGLES.length]);return {id:`AMB-${String(i+1).padStart(3,'0')}`,number:`FA-DEMO-${String(i+1).padStart(2,'0')}`,captainId:`CAP-${String(i+1).padStart(2,'0')}`,captain:captains[i],type:types[i%types.length],lat:p.lat,lng:p.lng,homeLat:p.lat,homeLng:p.lng,distanceBand:km<=5?'0–5 km':km<=10?'5–10 km':km<=15?'10–15 km':'15–20 km',online:true,status:'AVAILABLE',government:i===0,eta:Math.max(4,Math.round(km*1.7)),fare:800+i*120};});}
const state={demoMode:true,demoUser:{...FALLBACK_USER},ambulances:makeAmbulances(FALLBACK_USER),bookings:[]};
let seq=1000;
app.use(express.json());app.use(express.static(path.join(__dirname,'public')));
const clone=()=>JSON.parse(JSON.stringify(state));
const broadcast=()=>io.emit('state:update',clone());
function distanceKm(a,b){const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function validCoord(lat,lng){return Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lng))<=180;}
function setDemoUser(lat,lng){state.demoUser={lat:Number(lat),lng:Number(lng)};state.ambulances=makeAmbulances(state.demoUser);}
function rankedAvailable(){return state.ambulances.filter(a=>a.online&&a.status==='AVAILABLE').map(a=>({...a,distance:distanceKm(state.demoUser,a)})).sort((a,b)=>a.distance-b.distance);}
function visibleAmbulances(){
  const all=rankedAvailable();
  // Map deliberately shows a few from each distance band, not all 20.
  const picks=[]; const wanted=['0–5 km','5–10 km','10–15 km','15–20 km'];
  wanted.forEach(b=>{const band=all.filter(a=>a.distanceBand===b);picks.push(...band.slice(0,2));});
  return picks.slice(0,8);
}
function resetDemo(){state.ambulances=makeAmbulances(state.demoUser);state.bookings=[];}

app.get('/api/state',(req,res)=>{
  if(validCoord(req.query.lat,req.query.lng)&&state.bookings.length===0){setDemoUser(req.query.lat,req.query.lng);}
  const snap=clone();snap.nearby=rankedAvailable().slice(0,5);snap.mapAmbulances=visibleAmbulances();snap.radiusKm=5;snap.fallbackEnabled=true;snap.note='Demo only: 20 fictional ambulances are arranged in 0–5, 5–10, 10–15 and 15–20 km bands. The map shows a small sample from every band; booking always dispatches to the nearest available captain.';res.json(snap);
});
app.post('/api/demo-location',(req,res)=>{if(!validCoord(req.body.lat,req.body.lng))return res.status(400).json({error:'Invalid location'});if(state.bookings.length===0){setDemoUser(req.body.lat,req.body.lng);broadcast();}res.json({ok:true,location:state.demoUser});});
app.post('/api/reset',(req,res)=>{resetDemo();broadcast();res.json({ok:true});});

function requestCandidate(booking){
  if(!booking||booking.status!=='REQUESTED')return;
  const candidate=state.ambulances.find(a=>a.id===booking.candidateIds[booking.candidateIndex]);
  if(!candidate){booking.candidateIndex=0;return requestCandidate(booking);}
  booking.ambulanceId=candidate.id;booking.captainId=candidate.captainId;booking.captain=candidate.captain;booking.ambulanceNumber=candidate.number;booking.ambulanceType=candidate.type;booking.government=candidate.government;booking.lat=candidate.lat;booking.lng=candidate.lng;booking.eta=candidate.eta;booking.fare=candidate.fare;booking.requestedAt=Date.now();candidate.status='REQUESTED';booking.requestedCaptain=candidate.captain;
  broadcast();
  clearTimeout(booking._timer);
  booking._timer=setTimeout(()=>{
    const b=state.bookings.find(x=>x.id===booking.id);const a=state.ambulances.find(x=>x.id===candidate.id);
    if(!b||!a||b.status!=='REQUESTED'||b.ambulanceId!==candidate.id)return;
    a.status='AVAILABLE';b.candidateIndex+=1;
    if(b.candidateIndex<b.candidateIds.length){requestCandidate(b);return;}
    // Safety for demo: never end in "not available". Restart the nearest candidate.
    b.candidateIndex=0;requestCandidate(b);
  },8000);
}
app.post('/api/bookings',(req,res)=>{
  const candidates=rankedAvailable().map(a=>a.id);
  if(!candidates.length){resetDemo();}
  const ids=rankedAvailable().map(a=>a.id);
  const b={id:`FA-${++seq}`,userLat:state.demoUser.lat,userLng:state.demoUser.lng,ambulanceId:null,captainId:null,captain:'Finding nearest demo captain…',ambulanceNumber:'SEARCHING',ambulanceType:'DEMO',government:false,lat:state.demoUser.lat,lng:state.demoUser.lng,eta:0,fare:0,status:'REQUESTED',candidateIds:ids,candidateIndex:0,createdAt:Date.now()};
  state.bookings.push(b);requestCandidate(b);res.json(b);
});
app.post('/api/bookings/:id/accept',(req,res)=>{const b=state.bookings.find(x=>x.id===req.params.id);if(!b)return res.status(404).json({error:'Booking not found'});if(b.status!=='REQUESTED')return res.status(400).json({error:'Request is no longer waiting'});const a=state.ambulances.find(x=>x.id===b.ambulanceId);if(!a)return res.status(400).json({error:'Captain not found'});clearTimeout(b._timer);b.status='CAPTAIN_ACCEPTED';b.acceptedAt=Date.now();a.status='BUSY';broadcast();res.json(b);});
app.post('/api/bookings/:id/status',(req,res)=>{const b=state.bookings.find(x=>x.id===req.params.id);if(!b)return res.status(404).json({error:'Booking not found'});const allowed=['REQUESTED','CAPTAIN_ACCEPTED','ON_THE_WAY','ARRIVED','PATIENT_PICKED_UP','GOING_TO_HOSPITAL','ARRIVED_AT_HOSPITAL','COMPLETED'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid status'});b.status=req.body.status;if(validCoord(req.body.lat,req.body.lng)){b.lat=Number(req.body.lat);b.lng=Number(req.body.lng);}const a=state.ambulances.find(x=>x.id===b.ambulanceId);if(a){a.lat=b.lat;a.lng=b.lng;if(b.status==='COMPLETED'){a.status='AVAILABLE';a.lat=a.homeLat;a.lng=a.homeLng;}}broadcast();res.json(b);});
io.on('connection',s=>s.emit('state:update',clone()));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
server.listen(PORT,'0.0.0.0',()=>console.log(`FastAid Demo running on port ${PORT}`));
