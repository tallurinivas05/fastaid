/* FastAid mobile app shell */
(function(){
  try {
    if (!document.querySelector('meta[name="viewport"]')) {
      var m=document.createElement('meta'); m.name='viewport';
      m.content='width=device-width, initial-scale=1, viewport-fit=cover';
      document.head.appendChild(m);
    }
    if (!document.getElementById('fastaid-mobile-css')) {
      var l=document.createElement('link'); l.id='fastaid-mobile-css';
      l.rel='stylesheet'; l.href='/mobile-app.css';
      document.head.appendChild(l);
    }
  } catch(e) {}
})();
const socket=io();
const CENTER={lat:17.4065,lng:78.4772};
const GROUPS=['O+','O-','A+','A-','B+','B-','AB+','AB-'];
let state={ambulances:[],hospitals:[],bloodProviders:[],bookings:[],bloodRequests:[]};
let role=null,selectedBooking=null,userLocation={...CENTER},geoWatch=null,tripTimer=null,lastHospitalBloodKey='',lastHospitalBookingKey='',lastCaptainRenderKey='',lastUserRenderKey='',lastHospitalRenderKey='',selectedCaptainId=null,selectedHospitalId='HOS-01';
const maps={};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const dist=(a,b)=>{const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};
function toast(m,red=false){const t=$('#toast');t.textContent=m;t.className='toast'+(red?' red':'');clearTimeout(window.tt);window.tt=setTimeout(()=>t.className='toast hidden',2600);}
async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;}

function startLocationWatch(){
 if(!navigator.geolocation){toast('Live location is not supported; demo location used',true);return;}
 navigator.geolocation.getCurrentPosition(p=>{
   userLocation={lat:p.coords.latitude,lng:p.coords.longitude};
   toast('Your live location detected');
   if(role==='user' && document.getElementById('userMap')) refreshUserLiveMap();
   else render();
 },()=>toast('Location permission denied — demo location used',true),{enableHighAccuracy:true,timeout:10000,maximumAge:0});
 if(geoWatch)navigator.geolocation.clearWatch(geoWatch);
 geoWatch=navigator.geolocation.watchPosition(p=>{
   userLocation={lat:p.coords.latitude,lng:p.coords.longitude};
   if(selectedBooking){
     api(`/api/bookings/${selectedBooking}/user-location`,{method:'POST',body:JSON.stringify(userLocation)}).catch(()=>{});
   }
   if(role==='user' && document.getElementById('userMap')) refreshUserLiveMap();
 },()=>{}, {enableHighAccuracy:true,maximumAge:2000,timeout:10000});
}
function stopLocationWatch(){if(geoWatch){navigator.geolocation.clearWatch(geoWatch);geoWatch=null;}}

function openRole(r){
 stopTrip();role=r;selectedBooking=null;
 $('#home').classList.add('hidden');$('#app').classList.remove('hidden');
 ['user','captain','hospital'].forEach(x=>$('#'+x).classList.toggle('hidden',x!==r));
 if(r==='user')startLocationWatch();
 if(r==='captain'&&!selectedCaptainId)selectedCaptainId=state.ambulances[0]?.captainId||null;
 if(r==='hospital'&&!selectedHospitalId)selectedHospitalId=state.hospitals[0]?.id||'HOS-01';
 render();
}
function goHome(){
 stopTrip();stopLocationWatch();role=null;selectedBooking=null;
 $('#app').classList.add('hidden');$('#home').classList.remove('hidden');
 Object.values(maps).forEach(m=>{try{m.remove()}catch(e){}});Object.keys(maps).forEach(k=>delete maps[k]);
}
$('#back').onclick=goHome;
document.querySelectorAll('[data-role]').forEach(b=>b.addEventListener('click',()=>openRole(b.dataset.role)));
$('#resetBtn').onclick=()=>api('/api/reset',{method:'POST'}).then(()=>{selectedBooking=null;stopTrip();toast('Demo reset');if(role)render();});

function createMap(id,center=userLocation){
 const el=document.getElementById(id);if(!el)return null;
 const existing=maps[id];
 if(existing){
   try{
     if(existing.getContainer()===el){
       existing.invalidateSize({pan:false});
       return existing;
     }
     existing.remove();
   }catch(e){}
   delete maps[id];
 }
 const m=L.map(el,{zoomControl:true,scrollWheelZoom:true,preferCanvas:true,fadeAnimation:false,zoomAnimation:true}).setView([center.lat,center.lng],13);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
   attribution:'© OpenStreetMap contributors',
   maxZoom:19,
   updateWhenIdle:true,
   keepBuffer:3
 }).addTo(m);
 maps[id]=m;
 return m;
}
function icon(emoji,cls=''){return L.divIcon({className:'fa-marker '+cls,html:`<div>${emoji}</div>`,iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-22]});}
async function routeOnMap(m,from,to,layerKey){
 if(!m||!from||!to)return;
 const key=layerKey||'route';
 if(m[key]){m.removeLayer(m[key]);m[key]=null;}
 try{
   const url=`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
   const data=await fetch(url).then(x=>x.json());
   if(data.code==='Ok'&&data.routes?.[0]){
     m[key]=L.geoJSON(data.routes[0].geometry,{style:{color:'#079447',weight:6,opacity:.9}}).addTo(m);
     m.fitBounds(m[key].getBounds(),{padding:[35,35]});
     return;
   }
 }catch(e){}
 m[key]=L.polyline([[from.lat,from.lng],[to.lat,to.lng]],{color:'#079447',weight:6,dashArray:'10 8'}).addTo(m);
}
function renderUserMap(b=null){
 const m=createMap('userMap',b?{lat:b.lat,lng:b.lng}:userLocation);if(!m)return;
 if(m.dynamic)m.dynamic.clearLayers();else m.dynamic=L.layerGroup().addTo(m);
 if(m.route){try{m.removeLayer(m.route)}catch(e){}m.route=null;}
 const layer=m.dynamic;
 const u=b?{lat:b.userLat,lng:b.userLng}:userLocation;
 m.faUser=L.marker([u.lat,u.lng],{icon:icon('📍','user-marker')}).bindPopup(`<b>PATIENT</b><br>${esc(b?.patientLocationName||'Your location')}`).addTo(layer);
 if(b){
   m.faAmb=L.marker([b.lat,b.lng],{icon:icon('🚑')}).bindPopup(`<b>${esc(b.ambulanceNumber)}</b><br>${esc(b.ambulanceLocationName||'Current ambulance location')}`).addTo(layer);
   const destination=b.hospitalId&&b.hospitalLat!=null?{lat:b.hospitalLat,lng:b.hospitalLng}:{lat:b.userLat,lng:b.userLng};
   if(b.hospitalId){
     m.faHospital=L.marker([b.hospitalLat,b.hospitalLng],{icon:icon('🏥')}).bindPopup(`<b>${esc(b.hospitalName)}</b><br>Selected destination hospital`).addTo(layer);
   }
   routeOnMap(m,{lat:b.lat,lng:b.lng},destination,'route');
   m.fitBounds(L.latLngBounds([[b.lat,b.lng],[destination.lat,destination.lng]]),{padding:[45,45],maxZoom:14});
 }else{
   const ambs=state.ambulances.filter(a=>a.status==='AVAILABLE'&&dist(u,a)<=5).sort((a,b)=>dist(u,a)-dist(u,b)).slice(0,12);
   m.faAmbs=ambs.map(a=>L.marker([a.lat,a.lng],{icon:icon('🚑')}).bindPopup(`<b>${esc(a.number)}</b><br>Captain ${esc(a.captain||'Demo Captain')}`).addTo(layer));
   const pts=[u,...ambs];
   if(pts.length>1)m.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lng])),{padding:[45,45],maxZoom:14});
   else m.setView([u.lat,u.lng],14,{animate:false});
 }
 setTimeout(()=>m.invalidateSize({pan:false}),80);
}
function refreshUserLiveMap(){
 const m=maps.userMap;
 const el=document.getElementById('userMap');
 if(!m||!el||m.getContainer()!==el)return;
 const b=selectedBooking?state.bookings.find(x=>x.id===selectedBooking):null;
 if(!m.faUser)return renderUserMap(b);
 m.faUser.setLatLng([b?b.userLat:userLocation.lat,b?b.userLng:userLocation.lng]);
 if(b&&m.faAmb){
   m.faAmb.setLatLng([b.lat,b.lng]);
 }else if(!b&&m.faAmbs){
   const available=state.ambulances.filter(a=>a.status==='AVAILABLE'&&dist(userLocation,a)<=5).sort((a,b)=>dist(userLocation,a)-dist(userLocation,b)).slice(0,m.faAmbs.length);
   m.faAmbs.forEach((marker,i)=>{if(available[i])marker.setLatLng([available[i].lat,available[i].lng]);});
 }
 if(b && !m.route){const destination=b.hospitalId&&b.hospitalLat!=null?{lat:b.hospitalLat,lng:b.hospitalLng}:{lat:b.userLat,lng:b.userLng};routeOnMap(m,{lat:b.lat,lng:b.lng},destination,'route');}
 m.invalidateSize({pan:false});
}

function renderCaptainMap(b){
 const m=createMap('captainMap',b?{lat:b.lat,lng:b.lng}:CENTER);if(!m)return;
 if(m.dynamic)m.dynamic.clearLayers();else m.dynamic=L.layerGroup().addTo(m);
 if(m.route){try{m.removeLayer(m.route)}catch(e){}m.route=null;}
 const layer=m.dynamic;
 if(b){
   m.faUser=L.marker([b.userLat,b.userLng],{icon:icon('📍','user-marker')}).bindPopup(`<b>PATIENT</b><br>${esc(b.patientLocationName||'Patient pickup location')}`).addTo(layer);
   m.faAmb=L.marker([b.lat,b.lng],{icon:icon('🚑')}).bindPopup(`<b>${esc(b.ambulanceNumber)}</b><br>${esc(b.ambulanceLocationName||'Current ambulance location')}`).addTo(layer);
   let destination=null;
   if(b.status==='GOING_TO_HOSPITAL' && b.hospitalLat!=null) destination={lat:b.hospitalLat,lng:b.hospitalLng};
   else if(b.status!=='PATIENT_PICKED_UP' && b.status!=='GOING_TO_HOSPITAL' && b.status!=='ARRIVED_AT_HOSPITAL' && b.status!=='COMPLETED') destination={lat:b.userLat,lng:b.userLng};
   if(destination){
     const isHospitalDestination=b.status==='GOING_TO_HOSPITAL';
     m.faDest=L.marker([destination.lat,destination.lng],{icon:icon(isHospitalDestination?'🏥':'📍','user-marker')}).bindPopup(`<b>${esc(isHospitalDestination?b.hospitalName:'PATIENT')}</b>`).addTo(layer);
     routeOnMap(m,{lat:b.lat,lng:b.lng},destination,'route');
     m.fitBounds(L.latLngBounds([[b.lat,b.lng],[destination.lat,destination.lng]]),{padding:[35,35],maxZoom:14});
   }else{
     m.setView([b.lat,b.lng],14,{animate:false});
   }
 }else{
   state.ambulances.slice(0,20).forEach(a=>layer.addLayer(L.marker([a.lat,a.lng],{icon:icon('🚑')}).bindPopup(`<b>${esc(a.number)}</b><br>${esc(a.captain)}`).addTo(layer)));
   m.setView([CENTER.lat,CENTER.lng],12,{animate:false});
 }
 setTimeout(()=>m.invalidateSize({pan:false}),80);
}
function refreshCaptainLiveMap(){
 const m=maps.captainMap,el=document.getElementById('captainMap');
 if(!m||!el||m.getContainer()!==el)return;
 const b=state.bookings.find(x=>x.status!=='COMPLETED'&&x.status!=='REQUESTED');
 if(!b)return;
 renderCaptainMap(b);
}

function renderHospitalMap(showBlood=false){
 const m=createMap('hospitalMap',CENTER);if(!m)return;
 if(m.dynamic)m.dynamic.clearLayers();else m.dynamic=L.layerGroup().addTo(m);
 const layer=m.dynamic;
 if(showBlood){
   state.bloodProviders.forEach(p=>layer.addLayer(L.marker([p.lat,p.lng],{icon:icon(p.type==='BLOOD_BANK'?'🩸':'🏥')}).bindPopup(`<b>${esc(p.name)}</b><br>${p.type==='BLOOD_BANK'?'Blood Bank':'Hospital'}`)));
 }else{
   state.hospitals.forEach(h=>layer.addLayer(L.marker([h.lat,h.lng],{icon:icon('🏥')}).bindPopup(`<b>${esc(h.name)}</b><br>Verified hospital`)));
 }
 layer.addLayer(L.marker([CENTER.lat,CENTER.lng],{icon:icon('📍','user-marker')}).bindPopup('<b>FastAid Network Center</b>'));
 m.setView([CENTER.lat,CENTER.lng],12,{animate:false});
 setTimeout(()=>m.invalidateSize({pan:false}),80);
}

function render(){
 if(role==='user')renderUser();
 if(role==='captain')renderCaptain();
 if(role==='hospital')renderHospital();
 setTimeout(()=>Object.values(maps).forEach(m=>{try{m.invalidateSize({pan:false})}catch(e){}}),120);
}

function renderUser(){
 const v=$('#user'),b=selectedBooking?state.bookings.find(x=>x.id===selectedBooking):null;
 const nearby=state.ambulances.filter(a=>a.status==='AVAILABLE'&&dist(userLocation,a)<=5).map(a=>({...a,distance:dist(userLocation,a)})).sort((a,b)=>a.distance-b.distance);
 const govt=nearby.find(a=>a.government);
 v.innerHTML=b?`
 <div class="section-title"><div><span class="eyebrow">USER DASHBOARD</span><h2>${b.status==='REQUESTED'?'Finding an ambulance':'Your ambulance is on the way'}</h2></div><span class="live-pill">● LIVE</span></div>
 <div class="two-col user-live-layout">
   <div class="card map-card"><div class="card-head"><h3>LIVE AMBULANCE MAP</h3><button id="locate" class="btn light">Use my location</button></div><div id="userMap" class="real-map"></div><div class="map-note">5 km nearby zone • live connection</div></div>
   <div class="card"><h3>${b.status==='REQUESTED'?'REQUEST SENT':'YOUR AMBULANCE'}</h3>${bookingHtml(b)}</div>
 </div>`:
 `<div class="section-title"><div><span class="eyebrow">USER DASHBOARD</span><h2>Book an ambulance</h2></div><span class="live-pill">● LIVE LOCATION</span></div>
 <div class="card user-book-card"><div class="card-head"><h3>NEARBY AMBULANCES</h3><button id="locate" class="btn light">Use my location</button></div><div id="userMap" class="real-map user-small-map"></div><div class="map-note">Showing available ambulances within 5 km of your location.</div>
 <div class="booking-actions"><button id="bookNow" class="btn green">BOOK NOW</button>${govt?`<button id="bookGovt" class="btn light">🚑 GOVERNMENT AMBULANCE • ${govt.distance.toFixed(1)} km</button>`:`<div class="notice compact-notice">No government ambulance is available within 5 km right now.</div>`}</div>
 <div class="nearby-mini-list">${nearby.slice(0,5).map(a=>`<div class="mini-amb"><span>🚑</span><div class="grow"><b>${esc(a.government?'Government Ambulance':a.number)}</b><small>${a.distance.toFixed(1)} km • ${Math.max(2,Math.round(a.distance*2+3))} min</small></div><span class="badge">AVAILABLE</span></div>`).join('')||'<div class="empty">No ambulance within 5 km. Try again in a moment.</div>'}</div></div>`;
 $('#locate').onclick=startLocationWatch;
 if(b)renderUserMap(b);else renderUserMap();
 if(!b){
   $('#bookNow').onclick=()=>book(null,false);
   if(govt)$('#bookGovt').onclick=()=>book(govt.id,true);
 }
}
function bookingHtml(b){
 const status=b.status.replaceAll('_',' ');
 const d=b.ambulanceId?dist({lat:b.userLat,lng:b.userLng},{lat:b.lat,lng:b.lng}):null;
 const accepted=b.status!=='REQUESTED'&&b.ambulanceId;
 return `<div class="status-box"><b>✓ ${esc(status)}</b><br>${accepted?`Captain ${esc(b.captain)} accepted your request.`:'Searching nearby captains — the first available captain to accept will be connected to you.'}</div>
 ${accepted?`<div class="stats"><div class="stat"><strong>${esc(b.captain)}</strong><small>CAPTAIN</small></div><div class="stat"><strong>${esc(b.ambulanceNumber)}</strong><small>AMBULANCE</small></div><div class="stat"><strong>${d.toFixed(1)} km</strong><small>CAPTAIN → YOU</small></div></div>
 <div class="coord-box"><div><b>📍 PATIENT LOCATION</b><span>${esc(b.patientLocationName||'Pickup location')}</span></div><div><b>🚑 AMBULANCE LOCATION</b><span>${esc(b.ambulanceLocationName||'Current ambulance location')}</span></div>${b.hospitalId?`<div><b>🏥 DESTINATION HOSPITAL</b><span>${esc(b.hospitalName)}</span></div>`:''}</div>
 <div class="trip-actions"><button class="btn green" onclick="alert('Demo call: '+${JSON.stringify(b.phone||'Captain connected')})">📞 CALL CAPTAIN</button><a class="btn light" target="_blank" href="https://www.google.com/maps/dir/?api=1&origin=${b.lat},${b.lng}&destination=${b.hospitalId?b.hospitalLat:b.userLat},${b.hospitalId?b.hospitalLng:b.userLng}">OPEN DIRECTIONS</a></div>`:''}`;
}
async function book(ambulanceId,governmentOnly=false){
 try{const b=await api('/api/bookings',{method:'POST',body:JSON.stringify({userLat:userLocation.lat,userLng:userLocation.lng,ambulanceId,governmentOnly})});selectedBooking=b.id;toast(governmentOnly?'Government ambulance request sent':'Request sent to nearby ambulances');render();}
 catch(e){toast(e.message,true);}
}

function renderCaptain(){
 const myAmb=state.ambulances.find(a=>a.captainId===selectedCaptainId)||state.ambulances[0];
 if(myAmb)selectedCaptainId=myAmb.captainId;
 const pending=state.bookings.find(b=>b.status==='REQUESTED' && (!b.requestPool?.length || b.requestPool.includes(myAmb?.id)) && (!b.requestedGovernment || myAmb?.government));
 const active=state.bookings.find(b=>b.status!=='COMPLETED'&&b.status!=='REQUESTED'&&b.captainId===selectedCaptainId);
 const b=active||pending;
 const livePatientDistance=active?dist({lat:active.userLat,lng:active.userLng},{lat:active.lat,lng:active.lng}):null;
 const showPatientDistance=!!active && ['CAPTAIN_ACCEPTED','ON_THE_WAY','ARRIVED'].includes(active.status);
 const canStart=active?.status==='CAPTAIN_ACCEPTED';
 const canPickup=active?.status==='ARRIVED';
 const canChooseHospital=active?.status==='PATIENT_PICKED_UP';
 const canArriveHospital=active?.status==='GOING_TO_HOSPITAL';
 const canCloseTrip=active?.status==='ARRIVED_AT_HOSPITAL';
 const captainOptions=state.ambulances.map(a=>`<option value="${a.captainId}" ${a.captainId===selectedCaptainId?'selected':''}>${esc(a.captain)} • ${esc(a.number)}${a.government?' • GOVT':''}</option>`).join('');
 $('#captain').innerHTML=`<div class="section-title"><div><span class="eyebrow">CAPTAIN / AMBULANCE DRIVER</span><h2>Captain dashboard</h2></div><span class="live-pill">● LIVE NETWORK</span></div>
 <div class="card captain-login-card"><div class="field"><label>CAPTAIN LOGIN / DEMO ID</label><select id="captainSelect">${captainOptions}</select></div><div class="meta">Use a different captain on another device to test real-time request racing. The first eligible captain to accept gets the trip.</div></div>
 <div class="two-col captain-layout">
  <div class="card map-card"><div class="card-head"><h3>LIVE CAPTAIN / AMBULANCE MAP</h3><span class="map-note-inline">Real map + route</span></div><div id="captainMap" class="real-map"></div></div>
  <div class="card">${pending?`<h3>NEW EMERGENCY REQUEST</h3><div class="request-box"><b>🚨 EMERGENCY REQUEST</b><p><b>Patient location:</b> ${esc(pending.patientLocationName||'Pickup location')}</p><p><b>Distance to patient:</b> ${dist({lat:pending.userLat,lng:pending.userLng},{lat:myAmb.lat,lng:myAmb.lng}).toFixed(1)} km</p><p><b>Request:</b> ${pending.requestedGovernment?'GOVERNMENT AMBULANCE':'NEARBY CAPTAIN NETWORK'}</p><button id="accept" class="btn green">ACCEPT REQUEST</button> <button id="reject" class="btn light">REJECT</button></div>`:
 active?`<h3>ACTIVE EMERGENCY</h3><div class="status-box"><b>🚑 ${esc(active.ambulanceNumber)}</b><p><b>Patient location:</b> ${esc(active.patientLocationName||'Patient pickup location')}</p><p><b>Current ambulance:</b> ${esc(active.ambulanceLocationName||'Current ambulance location')}</p>${showPatientDistance?`<p class="patient-distance-live"><b>Distance to patient:</b> <strong>${livePatientDistance.toFixed(1)} km</strong></p>`:''}${active.hospitalId?`<p><b>Destination hospital:</b> ${esc(active.hospitalName)}</p><p class="hospital-distance-live"><b>Distance to hospital:</b> <strong>${dist({lat:active.lat,lng:active.lng},{lat:active.hospitalLat,lng:active.hospitalLng}).toFixed(1)} km</strong></p>`:''}<p><b>Status:</b> <strong>${esc(active.status.replaceAll('_',' '))}</strong></p>${canChooseHospital?`<div class="hospital-picker"><h3>SELECT DESTINATION HOSPITAL</h3><div class="hospital-choice-list">${state.hospitals.map(h=>`<div class="hospital-choice"><div><b>${esc(h.name)}</b><small>${dist({lat:active.lat,lng:active.lng},h).toFixed(1)} km</small></div><button class="btn green choose-hospital" data-id="${h.id}">SELECT</button></div>`).join('')}</div></div>`:''}<div class="button-row">${canStart?`<button id="start" class="btn green">START TRIP</button>`:''}${canPickup?`<button id="pickup" class="btn green">PATIENT PICKED UP</button>`:''}${canArriveHospital?`<button id="hospital" class="btn green">ARRIVED AT HOSPITAL</button>`:''}${canCloseTrip?`<button id="closeTrip" class="btn green">ARRIVAL CONFIRMED / CLOSE TRIP</button>`:''}</div></div>`:
 `<div class="empty">No request for ${esc(myAmb?.captain||'this captain')}. Keep this screen open — nearby requests appear live.</div>`}
  </div>
 </div>`;
 $('#captainSelect').onchange=e=>{selectedCaptainId=e.target.value;stopTrip();renderCaptain();};
 renderCaptainMap(b);
 if(pending){
   $('#accept').onclick=()=>api(`/api/bookings/${pending.id}/accept`,{method:'POST',body:JSON.stringify({captainId:selectedCaptainId})}).then(x=>{state.bookings=state.bookings.map(v=>v.id===x.id?x:v);toast('You accepted the emergency request');renderCaptain();}).catch(e=>toast(e.message,true));
   $('#reject').onclick=()=>toast('Request ignored — another captain can accept it');
 }
 if(active){
   if($('#start'))$('#start').onclick=()=>startTrip(active);
   if($('#pickup'))$('#pickup').onclick=()=>setStatus(active,'PATIENT_PICKED_UP',true);
   if($('#hospital'))$('#hospital').onclick=()=>completeTrip(active);
   if($('#closeTrip'))$('#closeTrip').onclick=()=>completeTrip(active);
   document.querySelectorAll('.choose-hospital').forEach(x=>x.onclick=()=>chooseHospital(active,x.dataset.id));
 }
}
async function setStatus(b,status,rerender=false){
 try{const x=await api(`/api/bookings/${b.id}/status`,{method:'POST',body:JSON.stringify({status,lat:b.lat,lng:b.lng})});toast(status.replaceAll('_',' '));if(rerender){state.bookings=state.bookings.map(v=>v.id===x.id?x:v);renderCaptain();}}catch(e){toast(e.message,true);}
}
async function chooseHospital(b,hospitalId){
 try{const x=await api(`/api/bookings/${b.id}/destination`,{method:'POST',body:JSON.stringify({hospitalId})});state.bookings=state.bookings.map(v=>v.id===x.id?x:v);toast(`Route selected to ${x.hospitalName}`);renderCaptain();}
 catch(e){toast(e.message,true);}
}
async function getRoadPath(from,to){
 try{
   const url=`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;
   const data=await fetch(url).then(r=>r.json());
   const coords=data.routes?.[0]?.geometry?.coordinates;
   if(data.code==='Ok'&&coords?.length>1)return coords.map(([lng,lat])=>({lat,lng}));
 }catch(e){}
 return [from,to];
}
function samplePath(points,count=90){
 if(points.length<=2)return points;
 const out=[];
 for(let i=0;i<count;i++){
   const t=i/(count-1),idx=t*(points.length-1),lo=Math.floor(idx),hi=Math.min(points.length-1,lo+1),f=idx-lo;
   const a=points[lo],b=points[hi];out.push({lat:a.lat+(b.lat-a.lat)*f,lng:a.lng+(b.lng-a.lng)*f});
 }
 return out;
}
async function animateRoadTrip(b,end,statusAtStart,finalStatus,finalMessage){
 if(tripTimer)return;
 const start={lat:b.lat,lng:b.lng};
 const path=samplePath(await getRoadPath(start,end),100);
 if(statusAtStart) await setStatus(b,statusAtStart,false);
 let step=0;
 const tick=async()=>{
   const point=path[Math.min(step,path.length-1)];
   try{await api(`/api/bookings/${b.id}/location`,{method:'POST',body:JSON.stringify(point)});}catch(e){}
   step++;
   if(step>=path.length){tripTimer=null;const latest=state.bookings.find(x=>x.id===b.id)||b;latest.lat=point.lat;latest.lng=point.lng;
     if(finalStatus){
       const x=await api(`/api/bookings/${b.id}/status`,{method:'POST',body:JSON.stringify({status:finalStatus,lat:point.lat,lng:point.lng})}).catch(()=>null);
       if(x)state.bookings=state.bookings.map(v=>v.id===x.id?x:v);
     }
     toast(finalMessage);renderCaptain();
     return;
   }
   tripTimer=setTimeout(tick,550);
 };
 tick();
}
function startTrip(b){animateRoadTrip(b,{lat:b.userLat,lng:b.userLng},'ON_THE_WAY','ARRIVED','Captain reached the patient');}
function startHospitalTrip(b){if(!b.hospitalId)return;animateRoadTrip(b,{lat:b.hospitalLat,lng:b.hospitalLng},null,'ARRIVED_AT_HOSPITAL','Ambulance reached the hospital');}
async function completeTrip(b){
 if(!b||b.status!=='ARRIVED_AT_HOSPITAL')return;
 try{const x=await api(`/api/bookings/${b.id}/status`,{method:'POST',body:JSON.stringify({status:'COMPLETED',lat:b.lat,lng:b.lng})});state.bookings=state.bookings.map(v=>v.id===x.id?x:v);toast('Trip completed — ambulance is available again');renderCaptain();}catch(e){toast(e.message,true);}
}
let hospitalView='ambulances';
function renderHospitalArrivalMap(incoming){
 const el=document.getElementById('hospitalArrivalMap');
 if(!el)return;
 const b=incoming.find(x=>x.hospitalId && ['PATIENT_PICKED_UP','GOING_TO_HOSPITAL','ARRIVED_AT_HOSPITAL'].includes(x.status));
 const m=createMap('hospitalArrivalMap',b?{lat:b.lat,lng:b.lng}:CENTER);
 if(!m)return;
 if(m.dynamic)m.dynamic.clearLayers();else m.dynamic=L.layerGroup().addTo(m);
 if(m.route){try{m.removeLayer(m.route)}catch(e){}m.route=null;}
 if(!b){m.setView([CENTER.lat,CENTER.lng],12,{animate:false});setTimeout(()=>m.invalidateSize({pan:false}),80);return;}
 m.faAmb=L.marker([b.lat,b.lng],{icon:icon('🚑')}).bindPopup(`<b>${esc(b.ambulanceNumber)}</b><br>${esc(b.ambulanceLocationName||'Current ambulance')}`).addTo(m.dynamic);
 m.dynamic.addLayer(L.marker([b.hospitalLat,b.hospitalLng],{icon:icon('🏥')}).bindPopup(`<b>${esc(b.hospitalName)}</b><br>Destination hospital`));
 routeOnMap(m,{lat:b.lat,lng:b.lng},{lat:b.hospitalLat,lng:b.hospitalLng},'route');
 m.fitBounds(L.latLngBounds([[b.lat,b.lng],[b.hospitalLat,b.hospitalLng]]),{padding:[35,35],maxZoom:14});
 setTimeout(()=>m.invalidateSize({pan:false}),80);
}
function refreshHospitalArrivalLive(){
 const el=document.getElementById('hospitalArrivalMap'); if(!el)return;
 const b=state.bookings.find(x=>x.hospitalId && ['PATIENT_PICKED_UP','GOING_TO_HOSPITAL','ARRIVED_AT_HOSPITAL'].includes(x.status));
 const m=maps.hospitalArrivalMap; if(!m)return;
 if(!b){m.dynamic?.clearLayers();m.setView([CENTER.lat,CENTER.lng],12,{animate:false});m.invalidateSize({pan:false});return;}
 if(m.faAmb)m.faAmb.setLatLng([b.lat,b.lng]);
 else if(m.dynamic)m.faAmb=L.marker([b.lat,b.lng],{icon:icon('🚑')}).bindPopup(`<b>${esc(b.ambulanceNumber)}</b><br>${esc(b.ambulanceLocationName||'Current ambulance')}`).addTo(m.dynamic);
 const d=dist({lat:b.lat,lng:b.lng},{lat:b.hospitalLat,lng:b.hospitalLng});
 const row=document.querySelector(`.arrival-distance-live[data-booking="${b.id}"]`);
 if(row)row.innerHTML=`<strong>${d.toFixed(1)} km</strong><small>${b.status==='ARRIVED_AT_HOSPITAL'?'ARRIVED':Math.max(1,Math.round(d*2.1))+' min'}</small>`;
 const note=document.querySelector('.map-overlay-note');
 if(note)note.innerHTML=`<b>LIVE AMBULANCE ARRIVAL</b><br>${esc(b.ambulanceNumber)} → ${esc(b.hospitalName)} • ${d.toFixed(1)} km remaining`;
 m.invalidateSize({pan:false});
}
function hospitalArrivalCard(live){
 if(!live.length) return '<div class="empty">No ambulance is currently heading to this hospital.</div>';
 return '<div class="list compact">'+live.map(b=>{
   const d=dist({lat:b.lat,lng:b.lng},{lat:b.hospitalLat,lng:b.hospitalLng});
   const eta=b.status==='ARRIVED_AT_HOSPITAL'?'ARRIVED':Math.max(1,Math.round(d*2.1))+' min';
   return `<div class="item arrival-item"><div class="grow"><b>🚑 ${esc(b.ambulanceNumber)}</b><div class="meta">Captain ${esc(b.captain)} • ${esc(b.status.replaceAll('_',' '))}</div><div class="arrival-route"><span>📍 ${esc(b.ambulanceLocationName||'Current location')}</span><span>🏥 ${esc(b.hospitalName)}</span></div></div><div class="arrival-distance arrival-distance-live" data-booking="${b.id}"><strong>${d.toFixed(1)} km</strong><small>${eta}</small></div></div>`;
 }).join('')+'</div>';
}
function hospitalArrivalMap(live){
 return `<div class="hospital-live-map-wrap"><div id="hospitalArrivalMap" class="real-map tall"></div><div class="map-overlay-note"><b>LIVE AMBULANCE ARRIVAL</b><br>${live.length?'Tracking the incoming ambulance on its road route.':'No active ambulance arrival.'}</div></div>`;
}
function hospitalHistoryCard(history){
 if(!history.length) return '<div class="empty">No completed ambulance arrivals yet.</div>';
 const sorted=[...history].sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
 return '<div class="list history-list">'+sorted.map(b=>`<div class="item history-item"><div class="grow"><b>🚑 ${esc(b.ambulanceNumber)}</b><div class="meta">Captain ${esc(b.captain)} • ${esc(b.ambulanceType||'Ambulance')} • ${esc(b.hospitalName)}</div><div class="meta">Final location: ${esc(b.ambulanceLocationName||'Hospital')} </div></div><div class="history-time"><strong>COMPLETED</strong><small>${b.completedAt?new Date(b.completedAt).toLocaleString():'—'}</small></div></div>`).join('')+'</div>';
}
function ambulanceInterface(incoming){
 const live=incoming.filter(b=>b.hospitalId && ['PATIENT_PICKED_UP','GOING_TO_HOSPITAL','ARRIVED_AT_HOSPITAL'].includes(b.status));
 const history=state.bookings.filter(b=>b.hospitalId && b.status==='COMPLETED');
 return `<div class="card"><div class="card-head"><h3>🚑 AMBULANCE ARRIVALS</h3><span class="count">${live.length}</span></div><div class="notice"><b>Live ambulance arrivals</b><br>Only ambulance information is shown here: current location, destination, distance and ETA.</div>${hospitalArrivalCard(live)}</div>
 <div class="card map-card hospital-map-card"><div class="card-head"><h3>🚑 LIVE AMBULANCE ARRIVAL MAP</h3><span class="map-note-inline">Real road route • live position</span></div>${hospitalArrivalMap(live)}</div>
 <div class="card"><div class="card-head"><h3>🚑 AMBULANCE ARRIVAL HISTORY</h3><span class="count">${history.length}</span></div><div class="notice"><b>Completed ambulance trips</b><br>After the captain confirms arrival, the live trip closes and the ambulance is saved here as history.</div>${hospitalHistoryCard(history)}</div>`;
}
function bloodInterface(requests){
 const group='O+';
 const nearby=[...state.bloodProviders].map(p=>({...p,distance:dist(CENTER,p),units:(p.inventory&&p.inventory[group])||0})).sort((a,b)=>a.distance-b.distance);
 const providerRows=nearby.map(p=>`<div class="item blood-provider-row"><div class="grow"><b>${p.type==='BLOOD_BANK'?'🩸':'🏥'} ${esc(p.name)}</b><div class="meta">${p.distance.toFixed(1)} km • ${p.units} units available • ${p.type.replace('_',' ')}</div></div>${p.units?`<button class="btn red req" data-id="${p.id}" data-group="${group}" data-units="2">REQUEST</button>`:'<span class="badge red">NOT AVAILABLE</span>'}</div>`).join('');
 return `<div class="card"><div class="card-head"><h3>🩸 BLOOD EMERGENCY</h3><span class="badge red">OFFICIAL</span></div><div class="blood"><b>REQUEST BLOOD</b><div class="meta">Select your blood group, required units and urgency. Nearby registered hospitals / blood banks are shown below.</div></div><div class="form" style="margin-top:12px"><div class="field"><label>BLOOD GROUP</label><select id="bg">${GROUPS.map(g=>`<option>${g}</option>`).join('')}</select></div><div class="field"><label>UNITS</label><input id="bu" type="number" min="1" value="2"></div><div class="field"><label>URGENCY</label><select id="urg"><option>CRITICAL</option><option>URGENT</option><option>NORMAL</option></select></div><div class="full"><button id="find" class="btn red">FIND NEARBY BLOOD</button></div></div><div id="bloodResults" class="blood-results"><div class="notice"><b>🩸 NEARBY BLOOD PROVIDERS</b><br>Choose a facility and press REQUEST. You do not need to wait for another screen.</div><div class="list">${providerRows}</div></div></div>
 <div class="card"><div class="card-head"><h3>🩸 MY BLOOD REQUESTS</h3><span class="count">${requests.length}</span></div><div class="list">${requests.length?requests.map(r=>`<div class="item"><div class="grow"><b>🩸 ${esc(r.bloodGroup)} • ${r.unitsRequired} units</b><div class="meta">${esc(r.providerName)} • ${esc(r.urgency)} • ${esc(r.status.replaceAll('_',' '))}</div></div><span class="badge ${r.status==='REQUEST_SENT'?'amber':''}">${esc(r.status.replaceAll('_',' '))}</span></div>`).join(''):'<div class="empty">No blood request created yet.</div>'}</div></div>`;
}
function requesterView(incoming,requests,hs){ return ambulanceInterface(incoming); }
function renderHospital(){
 lastHospitalRenderKey=JSON.stringify(state.bookings.map(x=>[x.id,x.status,x.hospitalId,x.completedAt]).concat(state.bloodRequests.map(x=>[x.id,x.status,x.respondedAt,x.unitsOffered])));
 lastHospitalBloodKey=JSON.stringify(state.bloodRequests.map(x=>[x.id,x.status,x.respondedAt,x.unitsOffered]));
 lastHospitalBookingKey=JSON.stringify(state.bookings.map(x=>[x.id,x.status,x.hospitalId,x.completedAt]));
 const v=$('#hospital');
 const selectedHospital=state.hospitals.find(h=>h.id===selectedHospitalId)||state.hospitals[0];
 const incoming=state.bookings.filter(b=>b.hospitalId===selectedHospital?.id&&b.status!=='COMPLETED');
 const ownRequests=state.bloodRequests.filter(r=>r.requestingHospitalId===selectedHospital?.id);
 const incomingBlood=state.bloodRequests.filter(r=>r.providerType==='HOSPITAL'||r.providerType==='BLOOD_BANK');
 const hs=[...state.hospitals].sort((a,b)=>dist(CENTER,a)-dist(CENTER,b));
 v.innerHTML=`<div class="section-title"><div><span class="eyebrow">AUTHORIZED STAFF ONLY</span><h2>Hospital dashboard</h2></div><span class="live-pill">● OFFICIAL NETWORK</span></div><div class="card hospital-login-card"><div class="field"><label>HOSPITAL LOGIN / DEMO ID</label><select id="hospitalSelect">${state.hospitals.map(h=>`<option value="${h.id}" ${h.id===selectedHospitalId?'selected':''}>${esc(h.name)}</option>`).join('')}</select></div><div class="meta">This device receives live ambulance arrivals and blood requests for the selected hospital.</div></div>
 <div class="hospital-tabs"><button class="${hospitalView==='ambulances'?'active':''}" data-hview="ambulances">🚑 AMBULANCE ARRIVALS <span>${incoming.length}</span></button><button class="${hospitalView==='blood'?'active':''}" data-hview="blood">🩸 BLOOD EMERGENCY</button><button class="${hospitalView==='receiver'?'active':''}" data-hview="receiver">🩸 RECEIVE BLOOD REQUESTS <span>${incomingBlood.filter(r=>r.status==='REQUEST_SENT').length}</span></button><button class="${hospitalView==='network'?'active':''}" data-hview="network">HOSPITAL NETWORK</button></div>
 ${hospitalView==='ambulances'?ambulanceInterface(incoming):hospitalView==='blood'?bloodInterface(ownRequests):hospitalView==='receiver'?receiverView(incomingBlood):networkView(hs)}`;
 document.querySelectorAll('[data-hview]').forEach(x=>x.onclick=()=>{hospitalView=x.dataset.hview;renderHospital();});
 const hsEl=$('#hospitalSelect'); if(hsEl) hsEl.onchange=e=>{selectedHospitalId=e.target.value;renderHospital();};
 if(hospitalView==='ambulances') renderHospitalArrivalMap(incoming);
 if(hospitalView==='network') renderHospitalMap(false);
 if(hospitalView==='receiver') renderHospitalMap(true);
 const find=$('#find');if(find)find.onclick=findBlood;
 document.querySelectorAll('.req').forEach(x=>x.onclick=()=>requestBlood(x.dataset.id,x.dataset.group,x.dataset.units));
 document.querySelectorAll('.respond').forEach(x=>x.onclick=()=>respondBlood(x.dataset.id,x.dataset.accept==='true'));
 document.querySelectorAll('.complete').forEach(x=>x.onclick=()=>completeBlood(x.dataset.id));
}
function receiverView(reqs){
 const pending=reqs.filter(r=>r.status==='REQUEST_SENT');
 return `<div class="receiver-layout"><div class="card"><h3>🩸 INCOMING BLOOD REQUESTS</h3><div class="notice"><b>Official hospital-to-hospital coordination</b><br>These requests are visible to registered provider accounts. Accept or mark not available.</div><div class="request-feed">${pending.length?pending.map(r=>`<div class="blood-request-card"><div class="request-top"><span class="critical">● ${esc(r.urgency)}</span><span>${new Date(r.createdAt).toLocaleTimeString()}</span></div><h3>🩸 ${esc(r.bloodGroup)} • ${r.unitsRequired} UNITS</h3><p><b>From:</b> ${esc(r.requestingHospitalName)}</p><p><b>Required:</b> ASAP</p><p><b>Available at your facility:</b> ${r.unitsOffered} units</p><div class="button-row"><button class="btn green respond" data-id="${r.id}" data-accept="true">ACCEPT</button><button class="btn light respond" data-id="${r.id}" data-accept="false">NOT AVAILABLE</button></div></div>`).join(''):'<div class="empty">No pending blood requests. Open the User/Hospital requester view in another tab and send one.</div>'}</div></div><div class="card"><h3>HOW IT CONNECTS</h3><div class="flow"><span>Hospital A</span><b>→</b><span>FastAid Network</span><b>→</b><span>Your Hospital</span><b>→</b><span>ACCEPT</span></div><div id="hospitalMap" class="real-map tall"></div></div></div>`;
}
function networkView(hs){
 return `<div class="two-col"><div class="card"><h3>20 REGISTERED HOSPITALS</h3><div id="hospitalMap" class="real-map tall"></div></div><div class="card"><h3>HOSPITAL NETWORK</h3><div class="network-list">${hs.map((h,i)=>`<div class="network-item"><span class="num">${i+1}</span><div class="grow"><b>${esc(h.name)}</b><small>${dist(CENTER,h).toFixed(1)} km • VERIFIED • ${esc(h.phone)}</small></div><span class="badge">READY</span></div>`).join('')}</div></div></div>`;
}
async function findBlood(){
 const group=$('#bg').value,units=+$('#bu').value||2;
 try{const ps=await api(`/api/blood/providers?group=${encodeURIComponent(group)}&lat=${CENTER.lat}&lng=${CENTER.lng}`);
 $('#bloodResults').innerHTML=`<div class="notice"><b>🩸 ${group} • ${units} UNITS</b><br>Nearby registered facilities</div><div class="list">${ps.map(p=>`<div class="item"><div class="grow"><b>${p.type==='BLOOD_BANK'?'🩸':'🏥'} ${esc(p.name)}</b><div class="meta">${p.distance.toFixed(1)} km • ${p.units} units available • ${p.type.replace('_',' ')}</div></div>${p.units?`<button class="btn red req" data-id="${p.id}" data-group="${esc(group)}" data-units="${units}">REQUEST</button>`:'<span class="badge red">NOT AVAILABLE</span>'}</div>`).join('')}</div>`;
 document.querySelectorAll('.req').forEach(x=>x.onclick=()=>requestBlood(x.dataset.id,x.dataset.group,x.dataset.units));
 }catch(e){toast(e.message,true);}
}
async function requestBlood(providerId,group,units){
 try{await api('/api/blood-requests',{method:'POST',body:JSON.stringify({hospitalId:selectedHospitalId,bloodGroup:group,units:+units,urgency:$('#urg').value,providerId})});toast('Blood request sent — receiving hospital can accept it');hospitalView='blood';renderHospital();}
 catch(e){toast(e.message,true);}
}
async function respondBlood(id,accept){
 try{await api(`/api/blood-requests/${id}/respond`,{method:'POST',body:JSON.stringify({accept})});toast(accept?'Blood request accepted':'Marked not available');renderHospital();}
 catch(e){toast(e.message,true);}
}
async function completeBlood(id){try{await api(`/api/blood-requests/${id}/complete`,{method:'POST'});toast('Blood received / request completed');renderHospital();}catch(e){toast(e.message,true);}}

socket.on('state:update',s=>{
 const previous=state; state=s;
 if(!role)return;
 if(role==='captain'){
   const myAmb=state.ambulances.find(a=>a.captainId===selectedCaptainId);
   const active=state.bookings.find(b=>b.status!=='COMPLETED'&&b.status!=='REQUESTED'&&b.captainId===selectedCaptainId);
   const pending=state.bookings.find(b=>b.status==='REQUESTED' && (!b.requestPool?.length || b.requestPool.includes(myAmb?.id)) && (!b.requestedGovernment || myAmb?.government));
   const current=active||pending;
   const key=current?`${current.id}:${current.status}:${current.hospitalId||''}`:'none';
   if(active && active.status==='GOING_TO_HOSPITAL' && !tripTimer) startHospitalTrip(active);
   if(key!==lastCaptainRenderKey){lastCaptainRenderKey=key;renderCaptain();}
   else if(active && maps.captainMap){
     const m=maps.captainMap;
     if(m.faAmb)m.faAmb.setLatLng([active.lat,active.lng]);
     if(m.faUser)m.faUser.setLatLng([active.userLat,active.userLng]);
     if(m.dynamic){
       // Keep the existing real map stable while only the ambulance marker moves.
     }
     const ps=document.querySelectorAll('#captain .status-box p');
     if(ps.length>=2){
       ps[0].innerHTML=`<b>Patient location:</b> ${esc(active.patientLocationName||'Patient pickup location')}`;
       ps[1].innerHTML=`<b>Current ambulance:</b> ${esc(active.ambulanceLocationName||'Current ambulance location')}`;
       const pd=document.querySelector('#captain .patient-distance-live'); if(pd && ['CAPTAIN_ACCEPTED','ON_THE_WAY','ARRIVED'].includes(active.status)) pd.innerHTML=`<b>Distance to patient:</b> <strong>${dist({lat:active.userLat,lng:active.userLng},{lat:active.lat,lng:active.lng}).toFixed(1)} km</strong>`;
       const hd=document.querySelector('#captain .hospital-distance-live'); if(hd&&active.hospitalId) hd.innerHTML=`<b>Distance to hospital:</b> <strong>${dist({lat:active.lat,lng:active.lng},{lat:active.hospitalLat,lng:active.hospitalLng}).toFixed(1)} km</strong>`;
     }
   }
 }else if(role==='user'){
   const selected=selectedBooking?state.bookings.find(x=>x.id===selectedBooking):null;
   if(selected && selected.status==='COMPLETED'){ selectedBooking=null; toast('Trip completed — you can book another ambulance'); }
   const b=selectedBooking?state.bookings.find(x=>x.id===selectedBooking):null;
   const key=b?`${b.id}:${b.status}:${b.hospitalId||''}`:'none';
   if(key!==lastUserRenderKey){lastUserRenderKey=key;renderUser();}
   else if(b && maps.userMap){
     const m=maps.userMap;if(m.faAmb)m.faAmb.setLatLng([b.lat,b.lng]);if(m.faUser)m.faUser.setLatLng([b.userLat,b.userLng]);
     const box=document.querySelector('#user .status-box');if(box)box.innerHTML=`<b>✓ ${esc(b.status.replaceAll('_',' '))}</b><br>Captain ${esc(b.captain)} is connected to your request.`;const ud=document.querySelector('#user .stats .stat:nth-child(3) strong');if(ud)ud.textContent=dist({lat:b.userLat,lng:b.userLng},{lat:b.lat,lng:b.lng}).toFixed(1)+' km';
   }
 }else if(role==='hospital'){
   const hkey=JSON.stringify(state.bookings.map(x=>[x.id,x.status,x.hospitalId]).concat(state.bloodRequests.map(x=>[x.id,x.status,x.respondedAt,x.unitsOffered])));
   if(hkey!==lastHospitalRenderKey){lastHospitalRenderKey=hkey;renderHospital();}
   else refreshHospitalArrivalLive();
 }
});

api('/api/state').then(s=>{state=s;if(role)render();}).catch(e=>toast(e.message,true));
function stopTrip(){if(tripTimer){clearInterval(tripTimer);tripTimer=null;}}
window.addEventListener('beforeunload',()=>{stopTrip();stopLocationWatch();});
