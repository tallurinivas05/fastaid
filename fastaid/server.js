const express=require('express');
const http=require('http');
const path=require('path');
const {Server}=require('socket.io');

const app=express();
const server=http.createServer(app);
const io=new Server(server);
const PORT=process.env.PORT||3000;
const CENTER={lat:17.4065,lng:78.4772};
const groups=['O+','O-','A+','A-','B+','B-','AB+','AB-'];

const captainNames=['Rahul Kumar','Arjun Reddy','Sandeep Rao','Mahesh Kumar','Naresh Babu','Vikram Singh','Kiran Reddy','Ravi Teja','Anil Kumar','Prakash Rao','Suresh Babu','Manoj Kumar','Ramesh Yadav','Ajay Reddy','Vamsi Krishna','Naveen Rao','Tarun Kumar','Rohit Singh','Sai Kiran','Harish Kumar'];
const hospitalNames=['City Care Hospital','Metro Emergency Hospital','GreenLife Hospital','Apollo Demo Hospital','Sunrise Medical Center','Aarogyam Emergency Hospital','LifeSpring Hospital','CarePoint Medical Center','MedStar Hospital','Prime Health Hospital','Hope Emergency Center','Vijaya Care Hospital','BlueCross Medical Center','UrbanCare Hospital','Sanjeevani Hospital','Sri Sai Emergency Hospital','Wellness City Hospital','NovaCare Hospital','Rainbow Emergency Center','Guardian Hospital'];
const bloodNames=['City Blood Bank','Central Life Blood Bank','Red Cross Demo Blood Bank','Life Care Blood Bank','Seva Blood Center','Hope Blood Bank','Metro Blood Services','Aarogyam Blood Bank','Sanjeevani Blood Bank','Prime Blood Center','GreenLife Blood Bank','CarePlus Blood Bank','Unity Blood Bank','VitalDrop Blood Bank','HealthFirst Blood Bank','SafeLife Blood Center','Sunrise Blood Bank','MedServe Blood Bank','Emergency Blood Hub','LifeLine Blood Bank'];

function offset(i,scale=.04){const a=i*2.3999632297,r=.35+(i%7)/8;return{lat:CENTER.lat+Math.sin(a)*scale*r,lng:CENTER.lng+Math.cos(a)*scale*r};}
function inventory(i){const x={};groups.forEach((g,j)=>x[g]=(i*7+j*3)%8);return x;}
const ambulances=Array.from({length:20},(_,i)=>{const p=offset(i);return{id:`AMB-${String(i+1).padStart(3,'0')}`,number:`TS09${String.fromCharCode(65+i%26)}${1000+i}`,captainId:`CAP-${String(i+1).padStart(2,'0')}`,captain:captainNames[i],phone:`+91 90000 ${String(10101+i*101).padStart(5,'0')}`,type:i%3===0?'Advanced Life Support':i%3===1?'Basic Life Support':'Patient Transport',lat:p.lat,lng:p.lng,homeLat:p.lat,homeLng:p.lng,online:true,status:'AVAILABLE',government:i<3};});
const hospitals=Array.from({length:20},(_,i)=>{const p=offset(i+20,.045);return{id:`HOS-${String(i+1).padStart(2,'0')}`,name:hospitalNames[i],lat:p.lat,lng:p.lng,phone:`+91 90000 ${String(20101+i*113).padStart(5,'0')}`,verified:true};});
const bloodProviders=Array.from({length:20},(_,i)=>{const p=offset(i+40,.05);return{id:`BP-${String(i+1).padStart(2,'0')}`,type:i%2?'HOSPITAL':'BLOOD_BANK',name:bloodNames[i],lat:p.lat,lng:p.lng,phone:`+91 90000 ${String(30101+i*127).padStart(5,'0')}`,inventory:inventory(i+1)};});
const state={ambulances,hospitals,bloodProviders,bookings:[],bloodRequests:[]};
let bookingSeq=1000,bloodSeq=5000;

app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));
const snap=()=>JSON.parse(JSON.stringify(state));
const broadcast=()=>io.emit('state:update',snap());
function distanceKm(a,b){const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
const localities=[['Secunderabad',17.4399,78.4983],['Alwal',17.5000,78.5167],['Malkajgiri',17.4510,78.5360],['Nacharam',17.4280,78.5600],['Uppal',17.4058,78.5591],['Neredmet',17.4750,78.5150],['Sainikpuri',17.4920,78.5520],['Kapra',17.4849,78.5598],['Tarnaka',17.4280,78.5390],['Habsiguda',17.4139,78.5450],['Kompally',17.5449,78.4860],['Begumpet',17.4435,78.4620],['Banjara Hills',17.4156,78.4347],['Himayatnagar',17.4009,78.4860],['Musheerabad',17.4200,78.4980]];
function locationName(lat,lng){let best=localities[0],bd=Infinity;for(const [name,la,lo] of localities){const d=distanceKm({lat,lng},{lat:la,lng:lo});if(d<bd){bd=d;best=[name,la,lo]}}return `${best[0]}, Hyderabad`;}
function booking(id){return state.bookings.find(b=>b.id===id);}

app.get('/api/state',(q,r)=>r.json(snap()));
app.post('/api/reset',(q,r)=>{state.bookings.length=0;state.bloodRequests.length=0;state.ambulances.forEach(a=>{a.status='AVAILABLE';a.online=true;a.lat=a.homeLat;a.lng=a.homeLng});broadcast();r.json({ok:true});});

app.post('/api/bookings',(q,r)=>{
 const lat=Number(q.body.userLat)||CENTER.lat,lng=Number(q.body.userLng)||CENTER.lng;
 const requestedAmbId=q.body.ambulanceId||null;
 const govRequested=!!q.body.governmentOnly;
 const available=state.ambulances.filter(a=>a.online&&a.status==='AVAILABLE');
 const near=available.map(a=>({...a,distance:distanceKm({lat,lng},a)})).filter(a=>a.distance<=5).sort((a,b)=>a.distance-b.distance);
 if(!near.length)return r.status(409).json({error:'No available ambulance within 5 km right now'});
 let target=null,requestPool=near.map(a=>a.id);
 if(requestedAmbId){
   target=near.find(a=>a.id===requestedAmbId);
   if(!target)return r.status(409).json({error:'Selected ambulance is no longer available or is outside 5 km'});
   if(govRequested&&!target.government)return r.status(409).json({error:'Selected ambulance is not a government ambulance'});
 }
 if(govRequested && !requestedAmbId){
   target=near.find(a=>a.government);
   if(!target)return r.status(409).json({error:'No government ambulance is available within 5 km'});
   requestPool=[target.id];
 }
 const b={
   id:`FA-${++bookingSeq}`,userLat:lat,userLng:lng,lat:target?target.lat:near[0].lat,lng:target?target.lng:near[0].lng,
   patientLocationName:locationName(lat,lng),ambulanceLocationName:target?locationName(target.lat,target.lng):'Waiting for nearby captain',
   ambulanceId:target?target.id:null,captainId:target?target.captainId:null,captain:target?target.captain:null,phone:target?target.phone:null,
   ambulanceNumber:target?target.number:null,ambulanceType:target?target.type:null,government:target?!!target.government:false,
   hospitalId:null,hospitalName:'Select after patient pickup',hospitalLat:null,hospitalLng:null,distanceToPatientAtPickupKm:null,
   status:'REQUESTED',createdAt:Date.now(),requestPool,requestedGovernment:govRequested,targetAmbulanceId:target?target.id:null
 };
 state.bookings.push(b);
 if(target){
   target.status='BUSY';
 }
 broadcast();r.json(b);
});
app.post('/api/bookings/:id/accept',(q,r)=>{
 const b=booking(q.params.id);if(!b)return r.status(404).json({error:'Booking not found'});
 if(b.status!=='REQUESTED')return r.status(409).json({error:'Request is no longer pending'});
 const captainId=q.body.captainId;
 const a=state.ambulances.find(x=>x.captainId===captainId && x.online && x.status==='AVAILABLE');
 if(!a)return r.status(409).json({error:'Your ambulance is not available'});
 if(b.requestedGovernment && !a.government)return r.status(409).json({error:'This request is reserved for a government ambulance'});
 if(b.requestPool?.length && !b.requestPool.includes(a.id))return r.status(409).json({error:'Your ambulance is not within the 5 km request radius'});
 b.ambulanceId=a.id;b.targetAmbulanceId=a.id;b.captainId=a.captainId;b.captain=a.captain;b.phone=a.phone;b.ambulanceNumber=a.number;b.ambulanceType=a.type;b.government=!!a.government;b.lat=a.lat;b.lng=a.lng;b.ambulanceLocationName=locationName(a.lat,a.lng);b.status='CAPTAIN_ACCEPTED';
 a.status='BUSY';broadcast();r.json(b);
});
app.post('/api/bookings/:id/destination',(q,r)=>{
 const b=booking(q.params.id);if(!b)return r.status(404).json({error:'Booking not found'});
 if(b.status!=='PATIENT_PICKED_UP')return r.status(409).json({error:'Hospital can be selected only after patient pickup'});
 const h=state.hospitals.find(x=>x.id===q.body.hospitalId);if(!h)return r.status(404).json({error:'Hospital not found'});
 b.hospitalId=h.id;b.hospitalName=h.name;b.hospitalLat=h.lat;b.hospitalLng=h.lng;b.status='GOING_TO_HOSPITAL';
 broadcast();r.json(b);
});

app.post('/api/bookings/:id/status',(q,r)=>{
 const b=booking(q.params.id);if(!b)return r.status(404).json({error:'Booking not found'});
 const nextStatus=q.body.status||b.status;
 if(nextStatus==='PATIENT_PICKED_UP' && b.distanceToPatientAtPickupKm==null){
   b.distanceToPatientAtPickupKm=distanceKm({lat:b.userLat,lng:b.userLng},{lat:b.lat,lng:b.lng});
 }
 b.status=nextStatus;
 if(nextStatus==='COMPLETED') b.completedAt=Date.now();
 if(nextStatus==='ARRIVED_AT_HOSPITAL') b.arrivedAt=Date.now();
 if(Number.isFinite(+q.body.lat))b.lat=+q.body.lat;
 if(Number.isFinite(+q.body.lng))b.lng=+q.body.lng;
 b.ambulanceLocationName=locationName(b.lat,b.lng);
 const a=state.ambulances.find(x=>x.id===b.ambulanceId);
 if(a){a.lat=b.lat;a.lng=b.lng;}
 if(b.status==='COMPLETED'&&a){a.status='AVAILABLE';a.online=true;a.lat=a.homeLat;a.lng=a.homeLng;}
 broadcast();r.json(b);
});
app.post('/api/bookings/:id/location',(q,r)=>{const b=booking(q.params.id);if(!b)return r.status(404).json({error:'Booking not found'});b.lat=+q.body.lat;b.lng=+q.body.lng;b.ambulanceLocationName=locationName(b.lat,b.lng);const a=state.ambulances.find(x=>x.id===b.ambulanceId);if(a){a.lat=b.lat;a.lng=b.lng;}broadcast();r.json({ok:true});});
app.post('/api/bookings/:id/user-location',(q,r)=>{const b=booking(q.params.id);if(!b)return r.status(404).json({error:'Booking not found'});b.userLat=+q.body.lat;b.userLng=+q.body.lng;broadcast();r.json({ok:true});});

app.get('/api/blood/providers',(q,r)=>{
 const group=q.query.group||'O+',lat=+q.query.lat||CENTER.lat,lng=+q.query.lng||CENTER.lng;
 const out=state.bloodProviders.map(p=>({...p,distance:distanceKm({lat,lng},p),units:p.inventory[group]||0})).sort((a,b)=>a.distance-b.distance);
 r.json(out);
});
app.post('/api/blood-requests',(q,r)=>{
 const h=state.hospitals.find(x=>x.id===(q.body.hospitalId||'HOS-01'))||state.hospitals[0];
 const p=state.bloodProviders.find(x=>x.id===q.body.providerId);
 if(!p)return r.status(404).json({error:'Provider not found'});
 const group=q.body.bloodGroup||'O+',units=+q.body.units||2,available=p.inventory[group]||0;
 if(!available)return r.status(409).json({error:'Blood unavailable'});
 const item={id:`BR-${++bloodSeq}`,requestingHospitalId:h.id,requestingHospitalName:h.name,requestingHospitalLat:h.lat,requestingHospitalLng:h.lng,providerId:p.id,providerName:p.name,providerType:p.type,providerLat:p.lat,providerLng:p.lng,bloodGroup:group,unitsRequired:units,unitsOffered:Math.min(units,available),urgency:q.body.urgency||'CRITICAL',status:'REQUEST_SENT',createdAt:Date.now(),respondedAt:null};
 state.bloodRequests.push(item);broadcast();r.json(item);
});
app.post('/api/blood-requests/:id/respond',(q,r)=>{
 const x=state.bloodRequests.find(v=>v.id===q.params.id);if(!x)return r.status(404).json({error:'Request not found'});
 x.respondedAt=Date.now();x.status=q.body.accept?(x.unitsOffered>=x.unitsRequired?'ACCEPTED':'PARTIALLY_ACCEPTED'):'NOT_AVAILABLE';broadcast();r.json(x);
});
app.post('/api/blood-requests/:id/complete',(q,r)=>{
 const x=state.bloodRequests.find(v=>v.id===q.params.id);if(!x)return r.status(404).json({error:'Request not found'});
 x.status='COMPLETED';const p=state.bloodProviders.find(v=>v.id===x.providerId);if(p)p.inventory[x.bloodGroup]=Math.max(0,(p.inventory[x.bloodGroup]||0)-x.unitsOffered);broadcast();r.json(x);
});

io.on('connection',s=>s.emit('state:update',snap()));
app.get('*',(q,r)=>r.sendFile(path.join(__dirname,'public','index.html')));
server.listen(PORT,()=>console.log(`FastAid demo running on http://localhost:${PORT}`));
