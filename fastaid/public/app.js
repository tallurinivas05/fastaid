const socket=io();
const FALLBACK_USER={lat:17.5192,lng:78.6298}; // Cheeriyal demo center — fixed for the entire demo
let state={ambulances:[],bookings:[],mapAmbulances:[],hospitals:[],bloodRequests:[],bloodProviders:[]};
let role=null,bookingId=null,map=null,markers=[],routeLine=null,userLocation={...FALLBACK_USER};
let hospitalBookingId=null,hospitalAmbMarker=null,hospitalMap=null,selectedBloodProviderId=null;
const MAP_CENTER={lat:17.5192,lng:78.6298};
const MAP_ZOOM=12;
const $=s=>document.querySelector(s); const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg,red=false){const t=$('#toast');t.textContent=msg;t.className='toast'+(red?' red':'');clearTimeout(window.__t);window.__t=setTimeout(()=>t.className='toast hidden',3200);}
async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const text=await r.text();let data;try{data=JSON.parse(text)}catch{throw Error(`Server error (${r.status})`)}if(!r.ok)throw Error(data.error||'Request failed');return data;}
function destroyMap(){if(map){map.remove();map=null}if(hospitalMap){hospitalMap.remove();hospitalMap=null}markers=[];userMarker=null;routeLine=null;mapMode=null;mapBookingId=null;mapAmbMarker=null;mapPatientMarker=null;mapHospitalMarker=null;hospitalAmbMarker=null}
function makeMap(id){destroyMap();const el=$('#'+id);if(!el)return null;map=L.map(el,{zoomControl:true,scrollWheelZoom:false,dragging:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false,zoomSnap:0.5}).setView([MAP_CENTER.lat,MAP_CENTER.lng],MAP_ZOOM);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);mapMode=id;return map}
function ambIcon(sel=false){return L.divIcon({className:'amb-marker'+(sel?' selected':''),html:'<span>🚑</span>',iconSize:[40,40],iconAnchor:[20,20]})}
function userIcon(){return L.divIcon({className:'you-marker',html:'<span>●</span>',iconSize:[30,30],iconAnchor:[15,15]})}
function hospitalIcon(){return L.divIcon({className:'hospital-marker',html:'<span>🏥</span>',iconSize:[40,40],iconAnchor:[20,20]})}
function kmBetween(a,b){if(!a||!b)return 0;const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function updateTrackingDistance(b){const d=kmBetween({lat:b.lat,lng:b.lng},{lat:b.userLat,lng:b.userLng});document.querySelectorAll('[data-track-distance]').forEach(x=>x.textContent=`${d.toFixed(1)} km`);document.querySelectorAll('[data-track-eta]').forEach(x=>x.textContent=`${Math.max(0,Math.ceil(d*2.1))} min`);}
function drawTripMap(b,host){const id=host?'captainMap':'userMap',m=makeMap(id);if(!m)return;const patient={lat:b.userLat,lng:b.userLng},amb={lat:b.lat,lng:b.lng};
  const pm=L.marker([patient.lat,patient.lng],{icon:userIcon(),interactive:false}).bindPopup('<b>📍 PATIENT</b>').addTo(m);userMarker=pm;
  const am=L.marker([amb.lat,amb.lng],{icon:ambIcon(true),interactive:false}).bindPopup(`<b>${esc(b.ambulanceNumber)}</b><br>${esc(b.captain)}`).addTo(m);mapAmbMarker=am;markers.push(am);
  let dest=null;if(['REQUESTED','CAPTAIN_ACCEPTED','ON_THE_WAY','ARRIVED'].includes(b.status))dest=patient;if(b.status==='GOING_TO_HOSPITAL'&&b.hospitalLat!=null)dest={lat:b.hospitalLat,lng:b.hospitalLng};
  if(dest){const pts=(b.routePath&&b.routePath.length)?b.routePath:[[b.lat,b.lng],[dest.lat,dest.lng]];routeLine=L.polyline(pts,{color:'#079447',weight:5,opacity:.9}).addTo(m);}
  if(b.hospitalLat!=null&&b.status==='GOING_TO_HOSPITAL'){mapHospitalMarker=L.marker([b.hospitalLat,b.hospitalLng],{icon:hospitalIcon(),interactive:false}).bindPopup(`<b>${esc(b.hospitalName||'DEMO HOSPITAL')}</b>`).addTo(m);}
  // IMPORTANT: never fit/re-center the map during a trip. The map stays fixed on Cheeriyal; only the ambulance marker moves.
  updateTrackingDistance(b);
}
function renderMap(list,b=null,host=false){const id=host?'captainMap':'userMap';if(b){drawTripMap(b,host);return}const m=makeMap(id);if(!m)return;L.marker([MAP_CENTER.lat,MAP_CENTER.lng],{icon:userIcon(),interactive:false}).bindPopup('<b>📍 CHEERIYAL</b>').addTo(m);list.slice(0,6).forEach(a=>{const mk=L.marker([a.lat,a.lng],{icon:ambIcon(),interactive:false}).addTo(m);markers.push(mk)});}
function animateMarkerTo(marker,lat,lng,duration=360){if(!marker)return;marker.__animToken=(marker.__animToken||0)+1;const token=marker.__animToken;const from=marker.getLatLng(),to=L.latLng(lat,lng);const start=performance.now();const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;function frame(now){if(token!==marker.__animToken)return;const p=Math.min(1,(now-start)/duration),e=ease(p);marker.setLatLng([from.lat+(to.lat-from.lat)*e,from.lng+(to.lng-from.lng)*e]);if(p<1)requestAnimationFrame(frame)}requestAnimationFrame(frame)}
function updateTripMap(b,host=false){if(!b||!map||!mapAmbMarker)return;animateMarkerTo(mapAmbMarker,b.lat,b.lng,230);if(mapHospitalMarker&&b.hospitalLat!=null)mapHospitalMarker.setLatLng([b.hospitalLat,b.hospitalLng]);updateTrackingDistance(b);}
function currentBooking(){return bookingId?state.bookings.find(b=>b.id===bookingId):null}
function showRole(r){role=r;bookingId=null;$('#home').classList.add('hidden');$('#app').classList.remove('hidden');['user','captain','hospital'].forEach(x=>$('#'+x+'View').classList.toggle('hidden',x!==r));refresh()}
function goHome(){role=null;bookingId=null;$('#app').classList.add('hidden');$('#home').classList.remove('hidden');destroyMap()}
function renderUser(){const v=$('#userView'),b=currentBooking();if(b){const waiting=b.status==='REQUESTED'||b.status==='CAPTAIN_ACCEPTED'||b.status==='ON_THE_WAY'||b.status==='ARRIVED';v.innerHTML=`<div class="title-row"><div><small>USER DASHBOARD</small><h2>${waiting?'Ambulance dispatch':'Trip in progress'}</h2></div><span class="live">● DEMO</span></div><div class="map-card"><div class="map-title">LIVE AMBULANCE MAP <span>${esc(b.status.replaceAll('_',' '))}</span></div><div id="userMap" class="map big"></div></div><div class="card booking-status-card"><div class="status-line"><b>${esc(b.status==='REQUESTED'?'REQUEST SENT':'AMBULANCE')}</b><span class="badge">${esc(b.status.replaceAll('_',' '))}</span></div><div class="request-box"><div class="request-icon">🚑</div><div>${b.status==='REQUESTED'?'<b>Captain request sent</b><small>Waiting for nearby captain acceptance</small>':`<b>${esc(b.captain)}</b><small>${b.status==='CAPTAIN_ACCEPTED'?'Captain accepted — ambulance is ready': 'Captain is on the way'}</small>`}</div></div></div>${b.status!=='REQUESTED'?`<div class="card captain-details-card"><div class="status-line"><b>CAPTAIN DETAILS</b><span class="badge">${esc(b.status.replaceAll('_',' '))}</span></div><p><b>Captain:</b> ${esc(b.captain)}</p><p><b>Ambulance:</b> ${esc(b.ambulanceNumber)}</p><p><b>Distance:</b> <span data-track-distance>-- km</span></p><p><b>ETA:</b> <span data-track-eta>-- min</span></p></div>`:''}<div class="card tracking-card"><div class="status-line"><b>LIVE TRACKING</b><span class="badge" data-track-eta>-- min</span></div><p><b>Captain distance to patient:</b> <span data-track-distance>-- km</span></p></div>`;renderMap([],b);return}
v.innerHTML=`<div class="title-row"><div><small>USER DASHBOARD</small><h2>Book an ambulance</h2></div><span class="live">● DEMO MODE</span></div><div class="map-card"><div class="map-title">LIVE AMBULANCE MAP <button id="locateBtn" class="light-btn">My Location</button></div><div id="userMap" class="map big"></div><div class="map-note">Fictional demo ambulances are arranged across 0–5, 5–10, 10–15 and 15–20 km. Only a few are shown.</div></div><div class="sheet book-only"><div class="sheet-handle"></div><h3>AMBULANCE BOOKING</h3><p>BOOK NOW sends the request to the nearest demo captain. If declined or not accepted, the next nearest captain receives it.</p><button id="bookBtn" class="book-btn">BOOK NOW</button></div>`;renderMap(state.mapAmbulances||[]);$('#bookBtn').onclick=bookNow;$('#locateBtn').onclick=locateUser}
async function bookNow(){const btn=$('#bookBtn');btn.disabled=true;btn.textContent='SENDING REQUEST…';try{const b=await api('/api/bookings',{method:'POST',body:'{}'});bookingId=b.id;toast('Request sent to nearest captain')}catch(e){btn.disabled=false;btn.textContent='BOOK NOW';toast(e.message,true)}}
async function locateUser(){userLocation={...MAP_CENTER};map?.setView([MAP_CENTER.lat,MAP_CENTER.lng],MAP_ZOOM,{animate:false});toast('Demo location: Cheeriyal')}
function renderCaptain(){const v=$('#captainView'),active=state.bookings.find(b=>b.status!=='COMPLETED');if(!active){v.innerHTML=`<div class="title-row"><div><small>CAPTAIN / AMBULANCE DRIVER</small><h2>Captain dashboard</h2></div><span class="live">● LIVE NETWORK</span></div><div class="card empty-card"><div class="big-emoji">🚑</div><h3>Waiting for a demo request</h3><p>Book from the User device.</p></div>`;return}let action='';if(active.status==='REQUESTED')action='<div class="button-row"><button id="acceptBtn" class="book-btn">ACCEPT REQUEST</button><button id="declineBtn" class="secondary-btn">DECLINE / NEXT CAPTAIN</button></div>';if(active.status==='CAPTAIN_ACCEPTED')action='<button id="startBtn" class="book-btn">START TRIP</button>';if(active.status==='ARRIVED')action='<button id="pickupBtn" class="book-btn">PICK UP PATIENT</button>';if(active.status==='PATIENT_PICKED_UP')action='<div class="hospital-pick"><h3>SELECT NEARBY HOSPITAL</h3><p>Choose a demo hospital. The ambulance will move there automatically.</p><div id="hospitalList"></div></div>';if(active.status==='ARRIVED_AT_HOSPITAL')action='<button id="closeBtn" class="book-btn">COMPLETE TRIP</button>';v.innerHTML=`<div class="title-row"><div><small>CAPTAIN / AMBULANCE DRIVER</small><h2>Captain dashboard</h2></div><span class="live">● LIVE NETWORK</span></div><div class="map-card"><div class="map-title">LIVE CAPTAIN / AMBULANCE MAP <span>${esc(active.status.replaceAll('_',' '))}</span></div><div id="captainMap" class="map big"></div></div><div class="card"><div class="status-line"><b>${esc(active.ambulanceNumber)}</b><span class="badge">${esc(active.status.replaceAll('_',' '))}</span></div><p><b>Captain:</b> ${esc(active.captain)}</p><p><b>Patient:</b> Cheeriyal</p>${active.hospitalName?`<p><b>Hospital:</b> ${esc(active.hospitalName)}</p>`:''}${action}</div><div class="card tracking-card"><div class="status-line"><b>LIVE TRACKING</b><span class="badge" data-track-eta>-- min</span></div><p><b>Distance to patient:</b> <span data-track-distance>-- km</span></p></div>`;renderMap([],active,true);if(active.status==='REQUESTED'){$('#acceptBtn').onclick=()=>api(`/api/bookings/${active.id}/accept`,{method:'POST'});$('#declineBtn').onclick=()=>api(`/api/bookings/${active.id}/decline`,{method:'POST'})}if(active.status==='CAPTAIN_ACCEPTED')$('#startBtn').onclick=()=>api(`/api/bookings/${active.id}/start`,{method:'POST'});if(active.status==='ARRIVED')$('#pickupBtn').onclick=()=>api(`/api/bookings/${active.id}/status`,{method:'POST',body:JSON.stringify({status:'PATIENT_PICKED_UP'})});if(active.status==='PATIENT_PICKED_UP')loadHospitals(active);if(active.status==='ARRIVED_AT_HOSPITAL')$('#closeBtn').onclick=()=>api(`/api/bookings/${active.id}/status`,{method:'POST',body:JSON.stringify({status:'COMPLETED'})})}
async function loadHospitals(b){try{const hs=await api(`/api/hospitals?bookingId=${encodeURIComponent(b.id)}`);$('#hospitalList').innerHTML=hs.map(h=>`<button class="hospital-option" data-h="${h.id}"><span>🏥</span><span><b>${esc(h.name)}</b><small>${h.distance.toFixed(1)} km • ${h.eta} min</small></span><strong>SELECT</strong></button>`).join('');document.querySelectorAll('.hospital-option').forEach(x=>x.onclick=async()=>{x.disabled=true;try{await api(`/api/bookings/${b.id}/select-hospital`,{method:'POST',body:JSON.stringify({hospitalId:x.dataset.h})});toast('Hospital selected — ambulance is moving')}catch(e){toast(e.message,true)}})}catch(e){toast(e.message,true)}}
let hospitalTab='arrivals';
function renderHospital(){
  const v=$('#hospitalView');
  const active=state.bookings.find(b=>['GOING_TO_HOSPITAL','ARRIVED_AT_HOSPITAL'].includes(b.status));
  const completed=state.bookings.filter(b=>b.status==='COMPLETED');
  const requests=state.bloodRequests||[];
  const outgoing=requests.filter(r=>r.direction==='OUTGOING');
  const incoming=requests.filter(r=>(r.direction==='INCOMING'||r.direction==='OUTGOING')&&r.status==='REQUEST_SENT');
  const acceptedIncoming=requests.filter(r=>r.direction==='INCOMING'&&r.status==='ACCEPTED');

  v.innerHTML=`
  <div class="title-row"><div><small>AUTHORIZED STAFF ONLY</small><h2>Hospital dashboard</h2></div><span class="live">● LIVE NETWORK</span></div>

  <div class="hospital-tabs" role="tablist" aria-label="Hospital interfaces">
    <button class="hospital-tab ${hospitalTab==='arrivals'?'active':''}" data-hospital-tab="arrivals" role="tab">🚑<span>AMBULANCE<br>ARRIVALS</span></button>
    <button class="hospital-tab ${hospitalTab==='request'?'active':''}" data-hospital-tab="request" role="tab">🩸<span>BLOOD<br>EMERGENCY</span></button>
    <button class="hospital-tab ${hospitalTab==='accepts'?'active':''}" data-hospital-tab="accepts" role="tab">🩸<span>BLOOD REQUEST<br>ACCEPTS</span></button>
  </div>

  <div class="hospital-interface ${hospitalTab==='arrivals'?'':'hidden'}" data-hospital-panel="arrivals">
    <div class="card hospital-arrivals-card">
      <div class="status-line"><h3 style="margin:0">🚑 AMBULANCE ARRIVALS</h3><span class="badge">${active?'LIVE ARRIVAL':'READY'}</span></div>
      ${active?`<div class="arrival-map-wrap"><div id="hospitalMap" class="map big"></div></div>
        <div class="arrival-info"><div class="status-line"><b>${esc(active.ambulanceNumber)}</b><span class="badge">${esc(active.status.replaceAll('_',' '))}</span></div>
        <p><b>Captain:</b> ${esc(active.captain)}</p><p><b>Patient:</b> Cheeriyal</p><p><b>Hospital:</b> ${esc(active.hospitalName||'Selected hospital')}</p><p><b>Captain → Hospital:</b> <span data-hospital-distance>-- km</span></p><p><b>ETA:</b> <span data-hospital-eta>-- min</span></p></div>`:
        '<div class="empty">No ambulance is currently on the way to the hospital. Arrivals appear here after the captain accepts the trip and a hospital is selected.</div>'}
      ${completed.length?`<div class="arrival-history"><h4>ARRIVAL HISTORY</h4>${completed.map(b=>`<div class="history"><b>🚑 ${esc(b.ambulanceNumber)}</b><span>${esc(b.captain)}</span><span>COMPLETED</span></div>`).join('')}</div>`:''}
    </div>
  </div>

  <div class="hospital-interface ${hospitalTab==='request'?'':'hidden'}" data-hospital-panel="request">
    <div class="card blood-dashboard blood-request-interface">
      <div class="status-line"><h3 style="margin:0">🩸 BLOOD EMERGENCY REQUEST</h3><span class="badge">1 / 3</span></div>
      <p class="sub">Choose a nearby demo blood bank, select the required blood group and send an emergency request.</p>
      <div class="blood-form"><label>GROUP<select id="bloodGroup"><option>O+</option><option>O-</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option></select></label><label>UNITS<input id="bloodUnits" type="number" min="1" value="2"></label><label>URGENCY<select id="bloodUrgency"><option>CRITICAL</option><option>URGENT</option><option>NORMAL</option></select></label></div>
      <h4 class="blood-subhead">NEARBY AVAILABLE BLOOD BANKS</h4>
      <div id="bloodProvidersList" class="blood-provider-list"><div class="empty">Loading nearby demo blood banks…</div></div>
      <button id="bloodRequestBtn" class="book-btn blood-btn">SEND BLOOD REQUEST</button>
      ${outgoing.length?`<div class="sent-blood-list"><h4>SENT REQUESTS</h4>${outgoing.slice(-4).reverse().map(r=>`<div class="blood-request"><div><b>🩸 ${esc(r.bloodGroup)} • ${r.unitsRequired} UNITS</b><small>${esc(r.providerName)} • ${esc(r.urgency)}</small></div><span class="badge">${esc(r.status.replaceAll('_',' '))}</span></div>`).join('')}</div>`:''}
    </div>
  </div>

  <div class="hospital-interface ${hospitalTab==='accepts'?'':'hidden'}" data-hospital-panel="accepts">
    <div class="card blood-dashboard blood-accept-interface">
      <div class="status-line"><h3 style="margin:0">🩸 BLOOD REQUEST ACCEPTS</h3><span class="badge">2 / 3</span></div>
      <p class="sub">Incoming demo hospital blood requests. Accept or mark unavailable here.</p>
      ${incoming.length?incoming.map(r=>`<div class="blood-request incoming-blood"><div><b>🩸 ${esc(r.bloodGroup)} • ${r.unitsRequired} UNITS</b><small>${esc(r.requestingHospitalName||'Cheeriyal Care Hospital')} • ${esc(r.urgency)}</small></div><div class="button-row"><button class="book-btn blood-accept" data-blood-id="${r.id}">ACCEPT BLOOD</button><button class="secondary-btn blood-reject" data-blood-id="${r.id}">NOT AVAILABLE</button></div></div>`).join(''):'<div class="empty">No pending incoming blood requests.</div>'}
      ${acceptedIncoming.length?`<div class="accepted-blood"><h4>ACCEPTED BLOOD REQUESTS</h4>${acceptedIncoming.map(r=>`<div class="blood-history-row"><b>✓ ${esc(r.bloodGroup)} • ${r.unitsRequired} units</b><span>${esc(r.requestingHospitalName)}</span><span>ACCEPTED</span></div>`).join('')}</div>`:''}
    </div>
  </div>`;

  document.querySelectorAll('[data-hospital-tab]').forEach(btn=>btn.onclick=()=>{
    hospitalTab=btn.dataset.hospitalTab;
    renderHospital();
  });

  if(hospitalTab==='arrivals'){
    if(active){hospitalBookingId=active.id;renderHospitalMap(active);updateHospitalTracking(active)}
    else {hospitalBookingId=null;if(hospitalMap){hospitalMap.remove();hospitalMap=null}hospitalAmbMarker=null;}
  } else {
    if(hospitalMap){hospitalMap.remove();hospitalMap=null}
    hospitalAmbMarker=null;
  }

  if(hospitalTab==='request'){
    loadBloodProviders($('#bloodGroup')?.value||'O+');
    $('#bloodGroup').onchange=()=>loadBloodProviders($('#bloodGroup').value);
    $('#bloodRequestBtn').onclick=sendBloodRequest;
  }
  if(hospitalTab==='accepts'){
    document.querySelectorAll('.blood-accept').forEach(x=>x.onclick=()=>respondBlood(x.dataset.bloodId,true));
    document.querySelectorAll('.blood-reject').forEach(x=>x.onclick=()=>respondBlood(x.dataset.bloodId,false));
  }
}
async function loadBloodProviders(group){
  const box=$('#bloodProvidersList'); if(!box)return;
  try{
    const providers=await api(`/api/blood/providers?group=${encodeURIComponent(group)}`);
    const available=providers.filter(p=>p.units>0);
    if(!available.length){box.innerHTML='<div class="empty">No demo blood bank has this group right now.</div>';selectedBloodProviderId=null;return;}
    if(!selectedBloodProviderId||!available.some(p=>p.id===selectedBloodProviderId))selectedBloodProviderId=available[0].id;
    box.innerHTML=available.map(p=>`<button class="blood-provider ${p.id===selectedBloodProviderId?'chosen':''}" data-provider-id="${p.id}"><span class="blood-drop">🩸</span><span class="grow"><b>${esc(p.name)}</b><small>${p.distance.toFixed(1)} km • ${p.units} units available</small></span><strong>${p.id===selectedBloodProviderId?'SELECTED':'SELECT'}</strong></button>`).join('');
    document.querySelectorAll('.blood-provider').forEach(x=>x.onclick=()=>{selectedBloodProviderId=x.dataset.providerId;loadBloodProviders($('#bloodGroup').value)});
  }catch(e){box.innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
}
function renderHospitalMap(b){
  const el=$('#hospitalMap'); if(!el)return;
  if(hospitalMap){hospitalMap.remove();hospitalMap=null;}
  hospitalMap=L.map(el,{zoomControl:true,scrollWheelZoom:false,dragging:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false,zoomSnap:0.5}).setView([MAP_CENTER.lat,MAP_CENTER.lng],MAP_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(hospitalMap);
  L.marker([b.userLat,b.userLng],{icon:userIcon(),interactive:false}).addTo(hospitalMap);
  hospitalAmbMarker=L.marker([b.lat,b.lng],{icon:ambIcon(true),interactive:false}).addTo(hospitalMap);
  if(b.hospitalLat!=null){
    L.marker([b.hospitalLat,b.hospitalLng],{icon:hospitalIcon(),interactive:false}).addTo(hospitalMap);
  }
  const pts=(b.routePath&&b.routePath.length)?b.routePath:[[b.lat,b.lng],[b.hospitalLat??b.userLat,b.hospitalLng??b.userLng]];
  L.polyline(pts,{color:'#079447',weight:5,opacity:.9}).addTo(hospitalMap);
}
function updateHospitalTracking(b){
  if(!b)return;
  // Keep the Leaflet map instance and viewport completely static. Only the ambulance marker changes position.
  if(hospitalAmbMarker)animateMarkerTo(hospitalAmbMarker,b.lat,b.lng,360);
  const dest={lat:b.hospitalLat??b.userLat,lng:b.hospitalLng??b.userLng};
  const d=kmBetween({lat:b.lat,lng:b.lng},dest);
  document.querySelectorAll('[data-hospital-distance]').forEach(x=>x.textContent=`${d.toFixed(1)} km`);
  document.querySelectorAll('[data-hospital-eta]').forEach(x=>x.textContent=`${Math.max(0,Math.ceil(d*2.1))} min`);
}
async function sendBloodRequest(){
  const group=$('#bloodGroup')?.value||'O+',units=Number($('#bloodUnits')?.value||2),urgency=$('#bloodUrgency')?.value||'CRITICAL';
  try{
    const r=await api('/api/blood-requests',{method:'POST',body:JSON.stringify({bloodGroup:group,units,urgency,providerId:selectedBloodProviderId})});
    toast(`Blood request sent to ${r.providerName}`);selectedBloodProviderId=r.providerId;refresh();
  }catch(e){toast(e.message,true)}
}
async function respondBlood(id,accept){try{await api(`/api/blood-requests/${encodeURIComponent(id)}/respond`,{method:'POST',body:JSON.stringify({accept})});toast(accept?'Blood request accepted':'Blood request marked not available')}catch(e){toast(e.message,true)}}
async function refresh(){try{state=await api(`/api/state?lat=${encodeURIComponent(userLocation.lat)}&lng=${encodeURIComponent(userLocation.lng)}`);if(role==='user')renderUser();if(role==='captain')renderCaptain();if(role==='hospital')renderHospital()}catch(e){toast(e.message,true)}}
socket.on('state:update',s=>{
  const prevUser=currentBooking();
  const prevCaptain=state.bookings.find(b=>b.status!=='COMPLETED')||null;
  const prevHospital=hospitalBookingId?state.bookings.find(b=>b.id===hospitalBookingId):null;
  state=s;
  const nextUser=currentBooking();
  const nextCaptain=state.bookings.find(b=>b.status!=='COMPLETED')||null;
  const nextHospital=hospitalBookingId?state.bookings.find(b=>b.id===hospitalBookingId):null;

  // During movement, NEVER rebuild the captain map. Keep the same Leaflet map and move only the ambulance marker.
  if(role==='user'&&nextUser&&prevUser&&nextUser.id===prevUser.id&&nextUser.status===prevUser.status){
    updateTripMap(nextUser,false);updateTrackingDistance(nextUser);
    const badge=document.querySelector('.map-title span');if(badge)badge.textContent=nextUser.status.replaceAll('_',' ');return;
  }
  if(role==='captain'&&nextCaptain&&prevCaptain&&nextCaptain.id===prevCaptain.id&&nextCaptain.status===prevCaptain.status){
    updateTripMap(nextCaptain,true);updateTrackingDistance(nextCaptain);
    const badge=document.querySelector('.map-title span');if(badge)badge.textContent=nextCaptain.status.replaceAll('_',' ');return;
  }
  // Hospital tracking follows the same rule: map instance stays fixed; only ambulance marker moves.
  if(role==='hospital'&&nextHospital&&prevHospital&&nextHospital.id===prevHospital.id&&nextHospital.status===prevHospital.status){
    updateHospitalTracking(nextHospital);return;
  }
  if(role==='user')renderUser();
  if(role==='captain')renderCaptain();
  if(role==='hospital')renderHospital();
});
document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>showRole(b.dataset.role));$('#backBtn').onclick=goHome;$('#resetBtn').onclick=async()=>{userLocation={...MAP_CENTER};await api('/api/reset',{method:'POST'});bookingId=null;refresh();toast('Demo reset — Cheeriyal restored')};
// DEMO MODE intentionally does NOT use browser GPS. Cheeriyal is the fixed patient/demo center.
userLocation={...MAP_CENTER};
refresh();
