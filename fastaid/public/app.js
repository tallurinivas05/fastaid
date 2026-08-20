const socket=io();
const FALLBACK_USER={lat:17.5065,lng:78.6172};
const MAX_MAP=6;
let state={ambulances:[],bookings:[],nearby:[],mapAmbulances:[]};
let role=null,bookingId=null,map=null,markers=[],routeLine=null,userMarker=null,userLocation={...FALLBACK_USER};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dist=(a,b)=>{const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};
function toast(msg,red=false){const t=$('#toast');t.textContent=msg;t.className='toast'+(red?' red':'');clearTimeout(window.__t);window.__t=setTimeout(()=>t.className='toast hidden',3000);}
async function api(url,opt={}){
  const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});
  const text=await r.text();
  let data;
  try{data=JSON.parse(text);}catch{throw Error(r.ok?'Server returned invalid data. Please redeploy the latest FastAid ZIP.':`Server error (${r.status}). Please redeploy the latest FastAid ZIP.`);}
  if(!r.ok)throw Error(data.error||'Request failed');
  return data;
}
function showRole(r){role=r;bookingId=null;$('#home').classList.add('hidden');$('#app').classList.remove('hidden');['user','captain','hospital'].forEach(x=>$('#'+x+'View').classList.toggle('hidden',x!==r));if(r==='user')renderUser();if(r==='captain')renderCaptain();if(r==='hospital')renderHospital();}
function goHome(){role=null;bookingId=null;$('#app').classList.add('hidden');$('#home').classList.remove('hidden');destroyMap();}
function destroyMap(){if(map){map.remove();map=null;}markers=[];userMarker=null;routeLine=null;}
function makeMap(id='userMap'){destroyMap();const el=$('#'+id);if(!el)return null;map=L.map(el,{zoomControl:true,scrollWheelZoom:true}).setView([userLocation.lat,userLocation.lng],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);return map;}
function ambIcon(selected=false){return L.divIcon({className:'amb-marker'+(selected?' selected':''),html:'<span>🚑</span>',iconSize:[40,40],iconAnchor:[20,20]});}
function userIcon(){return L.divIcon({className:'you-marker',html:'<span>●</span>',iconSize:[30,30],iconAnchor:[15,15]});}
function ringCircle(m,km){L.circle([userLocation.lat,userLocation.lng],{radius:km*1000,color:'#0a9a4c',weight:1,dashArray:'5 6',fill:false,opacity:.45}).addTo(m);}
function renderMap(mapList,booking=null){
  const m=makeMap('userMap');if(!m)return;
  const uLat=booking?.userLat??userLocation.lat,uLng=booking?.userLng??userLocation.lng;
  userMarker=L.marker([uLat,uLng],{icon:userIcon()}).bindPopup('<b>📍 YOU</b><br>Demo patient location').addTo(m);
  if(booking){
    const mk=L.marker([booking.lat,booking.lng],{icon:ambIcon(true)}).bindPopup(`<b>${esc(booking.ambulanceNumber)}</b><br>${esc(booking.captain)}`).addTo(m);markers.push(mk);
    let dest=['GOING_TO_HOSPITAL','ARRIVED_AT_HOSPITAL'].includes(booking.status)?{lat:booking.hospitalLat||uLat+0.03,lng:booking.hospitalLng||uLng+0.02}:{lat:uLat,lng:uLng};
    if(!['ARRIVED_AT_HOSPITAL','COMPLETED'].includes(booking.status))routeLine=L.polyline([[booking.lat,booking.lng],[dest.lat,dest.lng]],{color:'#079447',weight:5}).addTo(m);
    m.fitBounds(L.latLngBounds([[booking.lat,booking.lng],[dest.lat,dest.lng]]),{padding:[30,30],maxZoom:14});return;
  }
  [5,10,15,20].forEach(k=>ringCircle(m,k));
  mapList.slice(0,MAX_MAP).forEach(a=>{const mk=L.marker([a.lat,a.lng],{icon:ambIcon(false)}).bindPopup(`<b>${esc(a.type)} Ambulance</b><br>${a.distance.toFixed(1)} km • ${a.distanceBand}`).addTo(m);markers.push(mk);});
  const pts=[[userLocation.lat,userLocation.lng],...mapList.slice(0,MAX_MAP).map(a=>[a.lat,a.lng])];
  if(pts.length>1)m.fitBounds(L.latLngBounds(pts),{padding:[25,35],maxZoom:12});
}
function currentBooking(){return bookingId?state.bookings.find(b=>b.id===bookingId):null;}
function renderUser(){
  const v=$('#userView'),b=currentBooking(),mList=(state.mapAmbulances||[]).map(a=>({...a,distance:dist(userLocation,a)}));
  if(b){
    const waiting=b.status==='REQUESTED';
    v.innerHTML=`<div class="title-row"><div><small>USER DASHBOARD</small><h2>${waiting?'Finding your ambulance':'Ambulance booked'}</h2></div><span class="live">● DEMO LIVE</span></div>
      <div class="map-card"><div class="map-title">LIVE AMBULANCE MAP <span>${waiting?'Dispatching nearby captain':'Captain route'}</span></div><div id="userMap" class="map big"></div></div>
      <div class="card booking-status-card"><div class="status-line"><b>${waiting?'REQUEST SENT':'AMBULANCE BOOKED'}</b><span class="badge">${esc(b.status.replaceAll('_',' '))}</span></div>
      <div class="request-box"><div class="request-icon">🚑</div><div><b>${esc(b.captain)}</b><small>${waiting?'Request sent to the nearest available captain':'Captain accepted your request'}</small></div></div>
      <div class="trip-grid"><div><b>${esc(b.ambulanceNumber)}</b><small>AMBULANCE</small></div><div><b>${esc(b.ambulanceType)}</b><small>TYPE</small></div><div><b>${Math.max(1,b.eta)} min</b><small>ETA</small></div><div><b>₹${b.fare||0}</b><small>DEMO FARE</small></div></div>
      ${waiting?'<p class="dispatch-note">If this captain does not accept, FastAid automatically sends the request to the next nearest demo captain.</p>':'<p class="dispatch-note">Captain accepted. Continue the trip from the Captain dashboard.</p>'}</div>`;
    renderMap([],b);return;
  }
  v.innerHTML=`<div class="title-row"><div><small>USER DASHBOARD</small><h2>Book an ambulance</h2></div><span class="live">● DEMO MODE</span></div>
    <div class="map-card"><div class="map-title">LIVE AMBULANCE MAP <button id="locateBtn" class="light-btn">My Location</button></div><div id="userMap" class="map big"></div><div class="map-note">20 fictional demo ambulances are placed across 0–5 km, 5–10 km, 10–15 km and 15–20 km. Only a few clean markers are shown on the map.</div></div>
    <div class="sheet book-only"><div class="sheet-handle"></div><div class="book-only-copy"><h3>AMBULANCE BOOKING</h3><p>Tap below. FastAid sends the request to the nearest available demo captain. If they do not accept, the next nearest captain gets the request automatically.</p></div><button id="bookBtn" class="book-btn">BOOK NOW</button></div>`;
  renderMap(mList);$('#bookBtn').onclick=bookNow;$('#locateBtn').onclick=locateUser;
}
async function bookNow(){
  const btn=$('#bookBtn');if(!btn)return;btn.disabled=true;btn.textContent='SENDING REQUEST…';
  try{const b=await api('/api/bookings',{method:'POST',body:'{}'});bookingId=b.id;renderUser();toast('Request sent to the nearest captain');}
  catch(e){btn.disabled=false;btn.textContent='BOOK NOW';toast(e.message,true);}
}
async function locateUser(){if(!navigator.geolocation){toast('GPS unavailable; using demo location');return;}navigator.geolocation.getCurrentPosition(async p=>{try{userLocation={lat:p.coords.latitude,lng:p.coords.longitude};await api('/api/demo-location',{method:'POST',body:JSON.stringify(userLocation)});await refresh();toast('Your current location loaded');}catch(e){toast(e.message,true);}},()=>toast('Location permission denied; using demo location'),{enableHighAccuracy:true,timeout:8000,maximumAge:30000});}
function renderCaptain(){
  const v=$('#captainView'),active=state.bookings.find(b=>b.status!=='COMPLETED');
  v.innerHTML=`<div class="title-row"><div><small>CAPTAIN / AMBULANCE DRIVER</small><h2>Captain dashboard</h2></div><span class="live">● LIVE NETWORK</span></div>${active?`<div class="map-card"><div class="map-title">LIVE CAPTAIN / AMBULANCE MAP <span>Request + route</span></div><div id="captainMap" class="map big"></div></div><div class="card"><div class="status-line"><b>${esc(active.ambulanceNumber)}</b><span class="badge">${esc(active.status.replaceAll('_',' '))}</span></div><p><b>Captain:</b> ${esc(active.captain)}</p><p><b>Type:</b> ${esc(active.ambulanceType)} • <b>ETA:</b> ${active.eta} min</p><p><b>Patient:</b> ${active.userLat.toFixed(4)}, ${active.userLng.toFixed(4)}</p>${active.status==='REQUESTED'?'<div class="button-row"><button id="acceptBtn" class="book-btn">ACCEPT REQUEST</button><button id="declineBtn" class="secondary-btn">DECLINE / NEXT CAPTAIN</button></div>':''}<div class="button-row">${active.status==='CAPTAIN_ACCEPTED'?'<button id="startBtn" class="book-btn">START TRIP</button>':''}${active.status==='ON_THE_WAY'?'<button id="arriveBtn" class="book-btn">ARRIVED AT PATIENT</button>':''}${active.status==='ARRIVED'?'<button id="pickupBtn" class="book-btn">PATIENT PICKED UP</button>':''}${active.status==='PATIENT_PICKED_UP'?'<button id="hospitalBtn" class="book-btn">GOING TO HOSPITAL</button>':''}${active.status==='GOING_TO_HOSPITAL'?'<button id="hospitalArriveBtn" class="book-btn">ARRIVED AT HOSPITAL</button>':''}${active.status==='ARRIVED_AT_HOSPITAL'?'<button id="closeBtn" class="book-btn">CLOSE TRIP</button>':''}</div></div>`:'<div class="card empty-card"><div class="big-emoji">🚑</div><h3>Waiting for a demo request</h3><p>Book from the User device. The nearest captain request appears here.</p></div>'}`;
  if(active){renderCaptainMap(active);$('#acceptBtn')?.addEventListener('click',async()=>{try{await api(`/api/bookings/${active.id}/accept`,{method:'POST'});toast('Request accepted');}catch(e){toast(e.message,true);}});$('#declineBtn')?.addEventListener('click',async()=>{try{await api(`/api/bookings/${active.id}/decline`,{method:'POST'});toast('Moving request to next nearest captain');}catch(e){toast(e.message,true);}});const set=s=>api(`/api/bookings/${active.id}/status`,{method:'POST',body:JSON.stringify({status:s,lat:active.lat,lng:active.lng})}).catch(e=>toast(e.message,true));$('#startBtn')?.addEventListener('click',()=>set('ON_THE_WAY'));$('#arriveBtn')?.addEventListener('click',()=>set('ARRIVED'));$('#pickupBtn')?.addEventListener('click',()=>set('PATIENT_PICKED_UP'));$('#hospitalBtn')?.addEventListener('click',()=>set('GOING_TO_HOSPITAL'));$('#hospitalArriveBtn')?.addEventListener('click',()=>set('ARRIVED_AT_HOSPITAL'));$('#closeBtn')?.addEventListener('click',()=>set('COMPLETED'));}
}
function renderCaptainMap(b){const m=makeMap('captainMap');if(!m)return;L.marker([b.userLat,b.userLng],{icon:userIcon()}).addTo(m).bindPopup('<b>📍 PATIENT</b>');L.marker([b.lat,b.lng],{icon:ambIcon(true)}).addTo(m).bindPopup(`<b>${esc(b.ambulanceNumber)}</b>`);let dest=null;if(b.status==='GOING_TO_HOSPITAL')dest={lat:b.userLat+0.03,lng:b.userLng+0.02};else if(['CAPTAIN_ACCEPTED','ON_THE_WAY','ARRIVED'].includes(b.status))dest={lat:b.userLat,lng:b.userLng};if(dest){routeLine=L.polyline([[b.lat,b.lng],[dest.lat,dest.lng]],{color:'#079447',weight:5}).addTo(m);m.fitBounds(L.latLngBounds([[b.lat,b.lng],[dest.lat,dest.lng]]),{padding:[30,30],maxZoom:14});}else m.setView([b.lat,b.lng],13);}
function renderHospital(){const v=$('#hospitalView'),arr=state.bookings.filter(b=>b.status==='ARRIVED_AT_HOSPITAL'||b.status==='COMPLETED');v.innerHTML=`<div class="title-row"><div><small>AUTHORIZED STAFF ONLY</small><h2>Hospital dashboard</h2></div><span class="live">● LIVE NETWORK</span></div><div class="card"><h3>AMBULANCE ARRIVALS</h3>${arr.length?arr.map(b=>`<div class="history"><b>🚑 ${esc(b.ambulanceNumber)}</b><span>${esc(b.captain)}</span><span>${esc(b.status.replaceAll('_',' '))}</span></div>`).join(''):'<div class="empty">No ambulance arrivals yet.</div>'}</div>`;}
async function refresh(){try{const s=await api(`/api/state?lat=${encodeURIComponent(userLocation.lat)}&lng=${encodeURIComponent(userLocation.lng)}`);state=s;if(role==='user')renderUser();if(role==='captain')renderCaptain();if(role==='hospital')renderHospital();}catch(e){toast(e.message,true);}}
function initialLocation(){if(navigator.geolocation){navigator.geolocation.getCurrentPosition(async p=>{try{userLocation={lat:p.coords.latitude,lng:p.coords.longitude};await api('/api/demo-location',{method:'POST',body:JSON.stringify(userLocation)});}catch{}finally{refresh();}},()=>refresh(),{enableHighAccuracy:true,timeout:7000,maximumAge:30000});}else refresh();}
socket.on('state:update',s=>{state=s;if(role==='user')renderUser();if(role==='captain')renderCaptain();if(role==='hospital')renderHospital();});
document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>showRole(b.dataset.role));$('#backBtn').onclick=goHome;$('#resetBtn').onclick=async()=>{try{await api('/api/reset',{method:'POST'});bookingId=null;toast('Demo reset');refresh();}catch(e){toast(e.message,true);}};initialLocation();
