const socket = io();
const CENTER = {lat:17.4065,lng:78.4772};
const RADIUS = 5;
const DEMO_USER = {...CENTER};
const MAX_VISIBLE = 5;

let state = {ambulances:[],bookings:[],nearby:[]};
let role = null;
let selectedAmb = null;
let bookingId = null;
let map = null;
let markers = [];
let userMarker = null;
let routeLine = null;
let userLocation = {...DEMO_USER};
let autoTripTimer = null;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dist = (a,b) => {
  const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
};

function toast(msg, red=false){
  const t=$('#toast'); t.textContent=msg; t.className='toast'+(red?' red':'');
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.className='toast hidden',2400);
}

async function api(url,opt={}){
  const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});
  const d=await r.json();
  if(!r.ok) throw Error(d.error||'Request failed');
  return d;
}

function showRole(r){
  role=r; selectedAmb=null; bookingId=null;
  $('#home').classList.add('hidden');
  $('#app').classList.remove('hidden');
  ['user','captain','hospital'].forEach(x=>$('#'+x+'View').classList.toggle('hidden',x!==r));
  if(r==='user') renderUser();
  if(r==='captain') renderCaptain();
  if(r==='hospital') renderHospital();
}

function goHome(){
  role=null; selectedAmb=null; bookingId=null;
  if(autoTripTimer){clearTimeout(autoTripTimer);autoTripTimer=null;}
  $('#app').classList.add('hidden'); $('#home').classList.remove('hidden');
  destroyMap();
}

function destroyMap(){
  if(map){map.remove();map=null;}
  markers=[]; userMarker=null; routeLine=null;
}

function makeMap(){
  destroyMap();
  const el=$('#userMap')||$('#captainMap')||$('#hospitalMap');
  if(!el) return null;
  map=L.map(el,{zoomControl:true,scrollWheelZoom:true}).setView([userLocation.lat,userLocation.lng],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap contributors',maxZoom:19
  }).addTo(map);
  return map;
}

function ambIcon(selected=false){
  return L.divIcon({
    className:'amb-marker'+(selected?' selected':''),
    html:'<span>🚑</span>',
    iconSize:[40,40],iconAnchor:[20,20]
  });
}

function userIcon(){
  return L.divIcon({className:'you-marker',html:'<span>●</span>',iconSize:[30,30],iconAnchor:[15,15]});
}

function renderMap(nearby, booking=null){
  const m=makeMap();
  if(!m) return;

  userMarker=L.marker([booking?.userLat||userLocation.lat,booking?.userLng||userLocation.lng],{icon:userIcon()})
    .bindPopup('<b>📍 YOU</b><br>Demo patient location').addTo(m);

  if(booking){
    const amb=state.ambulances.find(a=>a.id===booking.ambulanceId);
    if(amb){
      const mk=L.marker([booking.lat,booking.lng],{icon:ambIcon(true)})
        .bindPopup(`<b>${esc(booking.ambulanceNumber)}</b><br>${esc(booking.captain)}`).addTo(m);
      markers.push(mk);
    }
    const dest = booking.status==='GOING_TO_HOSPITAL'||booking.status==='ARRIVED_AT_HOSPITAL'
      ? {lat:17.4399,lng:78.4983} : {lat:booking.userLat,lng:booking.userLng};
    if(booking.status!=='PATIENT_PICKED_UP' && booking.status!=='ARRIVED_AT_HOSPITAL' && booking.status!=='COMPLETED'){
      routeLine=L.polyline([[booking.lat,booking.lng],[dest.lat,dest.lng]],{color:'#079447',weight:5}).addTo(m);
    }
    m.fitBounds(L.latLngBounds([[booking.lat,booking.lng],[dest.lat,dest.lng]]),{padding:[30,30],maxZoom:14});
    return;
  }

  // MOST IMPORTANT RULE: only the nearby available subset is rendered.
  nearby.slice(0,5).forEach(a=>{
    const mk=L.marker([a.lat,a.lng],{icon:ambIcon(a.id===selectedAmb)})
      .bindPopup(`<b>${esc(a.type)} Ambulance</b><br>${a.distance.toFixed(1)} km • ${a.eta} min<br>₹${a.fare} estimated`)
      .addTo(m);
    mk.on('click',()=>{selectedAmb=a.id; renderUser();});
    markers.push(mk);
  });

  const pts=[[userLocation.lat,userLocation.lng],...nearby.slice(0,5).map(a=>[a.lat,a.lng])];
  if(pts.length>1)m.fitBounds(L.latLngBounds(pts),{padding:[30,80],maxZoom:14});
}

function nearbyList(){
  // Demo-only: do not search real ambulances. Sort the 20 fictional records
  // by distance and always show the nearest 5 available ones. If none are
  // inside 5 km, the nearest outside 5 km are used as fallback.
  return state.ambulances
    .filter(a=>a.online&&a.status==='AVAILABLE')
    .map(a=>({...a,distance:dist(DEMO_USER,a)}))
    .sort((a,b)=>a.distance-b.distance)
    .slice(0,MAX_VISIBLE);
}

function booking(){
  return bookingId ? state.bookings.find(b=>b.id===bookingId) : null;
}

function renderUser(){
  const v=$('#userView'), b=booking(), near=nearbyList();
  if(b){
    v.innerHTML=`
      <div class="title-row"><div><small>USER DASHBOARD</small><h2>${b.status==='CAPTAIN_ACCEPTED'?'Ambulance accepted':'Emergency trip'}</h2></div><span class="live">● LIVE</span></div>
      <div class="map-card"><div class="map-title">LIVE AMBULANCE MAP <span>Real map + route</span></div><div id="userMap" class="map big"></div></div>
      <div class="card">
        <div class="status-line"><b>${esc(b.status.replaceAll('_',' '))}</b><span class="badge">${b.status}</span></div>
        <div class="trip-grid">
          <div><b>${esc(b.captain)}</b><small>CAPTAIN</small></div>
          <div><b>${esc(b.ambulanceNumber)}</b><small>AMBULANCE</small></div>
          <div><b>${esc(b.ambulanceType)}</b><small>TYPE</small></div>
          <div><b>${Math.max(1,b.eta)} min</b><small>ETA</small></div>
        </div>
        <div class="info">📍 Patient location<br>🚑 ${esc(b.ambulanceNumber)} • ${esc(b.captain)}<br>💰 ₹${b.fare} estimated demo fare</div>
      </div>`;
    renderMap([],b);
    return;
  }

  v.innerHTML=`
    <div class="title-row"><div><small>USER DASHBOARD</small><h2>Book an ambulance</h2></div><span class="live">● LIVE LOCATION</span></div>
    <div class="map-card">
      <div class="map-title">LIVE AMBULANCE MAP <button id="locateBtn" class="light-btn">My Location</button></div>
      <div id="userMap" class="map big"></div>
      <div class="map-note">Nearest 5 DEMO ambulances are shown. If none are within 5 km, the next nearest are shown.</div>
    </div>
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h3>AMBULANCES NEAR YOU</h3><span>${near.length} shown</span></div>
      <div class="sub">20 fictional demo ambulances exist • only the nearest 5 AVAILABLE ones are shown.</div>
      <div class="amb-list">
        ${near.map(a=>`
          <button class="amb-card ${selectedAmb===a.id?'chosen':''}" data-id="${a.id}">
            <span class="amb-small">🚑</span>
            <span class="grow"><b>${esc(a.type)} Ambulance</b><small>${a.distance.toFixed(1)} km • ${a.eta} min</small><small>₹${a.fare} estimated</small></span>
            <span class="select-tag">${selectedAmb===a.id?'SELECTED':'SELECT'}</span>
          </button>`).join('')}
      </div>
      <button id="bookBtn" class="book-btn">BOOK AMBULANCE</button>
    </div>`;

  renderMap(near);
  document.querySelectorAll('.amb-card').forEach(x=>x.onclick=()=>{
    selectedAmb=x.dataset.id; renderUser();
  });
  $('#bookBtn').onclick=bookSelected;
  $('#locateBtn').onclick=()=>{
    userLocation={...DEMO_USER};
    refresh();
    toast('Demo location restored');
  };
}

async function bookSelected(){
  try{
    // BOOK AMBULANCE always sends the request to the nearest fictional ambulance.
    // The server automatically moves to the next nearest captain if the first
    // demo captain does not respond. Selection is optional in Demo Mode.
    const b=await api('/api/bookings',{method:'POST',body:JSON.stringify({
      userLat:DEMO_USER.lat,userLng:DEMO_USER.lng,ambulanceId:selectedAmb||null
    })});
    bookingId=b.id;
    selectedAmb=null;
    renderUser();
    toast('Request sent to the nearest demo captain');
  }catch(e){toast(e.message,true);}
}

function renderCaptain(){
  const v=$('#captainView');
  const active=state.bookings.find(b=>b.status!=='COMPLETED');
  const myAmb=active ? state.ambulances.find(a=>a.id===active.ambulanceId) : state.ambulances[0];
  v.innerHTML=`
    <div class="title-row"><div><small>CAPTAIN / AMBULANCE DRIVER</small><h2>Captain dashboard</h2></div><span class="live">● LIVE NETWORK</span></div>
    ${active ? `
      <div class="map-card"><div class="map-title">LIVE CAPTAIN / AMBULANCE MAP <span>Real map + route</span></div><div id="captainMap" class="map big"></div></div>
      <div class="card">
        <div class="status-line"><b>${esc(active.ambulanceNumber)}</b><span class="badge">${esc(active.status.replaceAll('_',' '))}</span></div>
        <p><b>Captain:</b> ${esc(active.captain)}</p>
        <p><b>Type:</b> ${esc(active.ambulanceType)}</p>
        <p><b>Patient:</b> ${active.userLat.toFixed(4)}, ${active.userLng.toFixed(4)}</p>
        <div class="button-row">
          ${active.status==='CAPTAIN_ACCEPTED'?'<button id="startBtn" class="book-btn">START TRIP</button>':''}
          ${active.status==='ON_THE_WAY'?'<button id="arriveBtn" class="book-btn">ARRIVED AT PATIENT</button>':''}
          ${active.status==='ARRIVED'?'<button id="pickupBtn" class="book-btn">PATIENT PICKED UP</button>':''}
          ${active.status==='PATIENT_PICKED_UP'?'<button id="hospitalBtn" class="book-btn">GOING TO HOSPITAL</button>':''}
          ${active.status==='GOING_TO_HOSPITAL'?'<button id="hospitalArriveBtn" class="book-btn">ARRIVED AT HOSPITAL</button>':''}
          ${active.status==='ARRIVED_AT_HOSPITAL'?'<button id="closeBtn" class="book-btn">CLOSE TRIP</button>':''}
        </div>
      </div>` :
      `<div class="card empty-card"><div class="big-emoji">🚑</div><h3>Waiting for a demo booking</h3><p>Open the same FastAid link as a User on another phone and book one of the nearby ambulances.</p></div>`}`;
  if(active){
    renderCaptainMap(active);
    const set=s=>api(`/api/bookings/${active.id}/status`,{method:'POST',body:JSON.stringify({status:s,lat:active.lat,lng:active.lng})}).catch(e=>toast(e.message,true));
    $('#startBtn')?.addEventListener('click',()=>set('ON_THE_WAY'));
    $('#arriveBtn')?.addEventListener('click',()=>set('ARRIVED'));
    $('#pickupBtn')?.addEventListener('click',()=>set('PATIENT_PICKED_UP'));
    $('#hospitalBtn')?.addEventListener('click',()=>set('GOING_TO_HOSPITAL'));
    $('#hospitalArriveBtn')?.addEventListener('click',()=>set('ARRIVED_AT_HOSPITAL'));
    $('#closeBtn')?.addEventListener('click',()=>set('COMPLETED'));
  }
}

function renderCaptainMap(b){
  const m=makeMap();
  if(!m)return;
  L.marker([b.userLat,b.userLng],{icon:userIcon()}).addTo(m).bindPopup('<b>📍 PATIENT</b>');
  L.marker([b.lat,b.lng],{icon:ambIcon(true)}).addTo(m).bindPopup(`<b>${esc(b.ambulanceNumber)}</b>`);
  let dest=null;
  if(b.status==='GOING_TO_HOSPITAL')dest={lat:17.4399,lng:78.4983};
  else if(['CAPTAIN_ACCEPTED','ON_THE_WAY'].includes(b.status))dest={lat:b.userLat,lng:b.userLng};
  if(dest){
    routeLine=L.polyline([[b.lat,b.lng],[dest.lat,dest.lng]],{color:'#079447',weight:5}).addTo(m);
    m.fitBounds(L.latLngBounds([[b.lat,b.lng],[dest.lat,dest.lng]]),{padding:[30,30],maxZoom:14});
  } else m.setView([b.lat,b.lng],14);
}

function renderHospital(){
  const v=$('#hospitalView');
  const arrivals=state.bookings.filter(b=>b.status==='ARRIVED_AT_HOSPITAL'||b.status==='COMPLETED');
  v.innerHTML=`
    <div class="title-row"><div><small>AUTHORIZED STAFF ONLY</small><h2>Hospital dashboard</h2></div><span class="live">● OFFICIAL NETWORK</span></div>
    <div class="tabs"><button class="active">🚑 AMBULANCE ARRIVALS</button></div>
    <div class="card"><h3>LIVE / COMPLETED AMBULANCE HISTORY</h3>
      ${arrivals.length ? arrivals.map(b=>`<div class="history"><b>🚑 ${esc(b.ambulanceNumber)}</b><span>${esc(b.captain)}</span><span>${esc(b.status.replaceAll('_',' '))}</span></div>`).join('') : '<div class="empty">No ambulance arrivals yet.</div>'}
    </div>
    <div class="card"><h3>DEMO NOTE</h3><p>Blood coordination remains a separate interface. This screen is for ambulance arrivals/history only.</p></div>`;
}

function refresh(){
  userLocation={...DEMO_USER};
  api(`/api/state?lat=${DEMO_USER.lat}&lng=${DEMO_USER.lng}`).then(s=>{
    state=s;
    if(role==='user')renderUser();
    if(role==='captain')renderCaptain();
    if(role==='hospital')renderHospital();
  }).catch(e=>toast(e.message,true));
}

socket.on('state:update',s=>{
  state=s;
  if(role==='user')renderUser();
  if(role==='captain')renderCaptain();
  if(role==='hospital')renderHospital();
});

document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>showRole(b.dataset.role));
$('#backBtn').onclick=goHome;
$('#resetBtn').onclick=async()=>{
  await api('/api/reset',{method:'POST'});
  bookingId=null; selectedAmb=null;
  toast('Demo reset — 5 nearby ambulances restored');
  if(role==='user')renderUser();
  if(role==='captain')renderCaptain();
  if(role==='hospital')renderHospital();
};

refresh();
