// HistorieSpot - DEBUG GetCapabilities om echte MIP typename te vinden
const map = L.map("map", { zoomControl:false }).setView([52.516, 6.420], 15);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
let currentMarker = null;
let accuracyCircle = null;
const objectLayer = L.layerGroup().addTo(map);
const yearLabelLayer = L.layerGroup().addTo(map);
const mipLayer = L.layerGroup().addTo(map);
let mipVisible = true;
let currentGemeente = "Ommen";
const locateBtn = document.getElementById("locateBtn");
const radiusSelect = document.getElementById("radius");
const statusBox = document.getElementById("status");
const menuBtn = document.getElementById("menuBtn");
const closeMenuBtn = document.getElementById("closeMenuBtn");
const sideMenu = document.getElementById("sideMenu");
const menuOverlay = document.getElementById("menuOverlay");
const infoBtn = document.getElementById("infoBtn");
const closeInfoBtn = document.getElementById("closeInfoBtn");
const infoModal = document.getElementById("infoModal");
const infoOverlay = document.getElementById("infoOverlay");
const toggleMinuutplan = document.getElementById("toggleMinuutplan");
const opacitySlider = document.getElementById("historischeOpacity");
const opacityValue = document.getElementById("historischeOpacityValue");
const toggleMIP = document.getElementById("toggleMIP");
const toggleMIPBtn = document.getElementById("toggleMIPBtn");
const toggleBAGBtn = document.getElementById("toggleBAGBtn");
const openMIPBeschrijvingBtn = document.getElementById("openMIPBeschrijvingBtn");
const mipModal = document.getElementById("mipModal");
const mipOverlay = document.getElementById("mipOverlay");
const closeMipBtn = document.getElementById("closeMipBtn");
const mipModalTitle = document.getElementById("mipModalTitle");
const mipBeschrijvingText = document.getElementById("mipBeschrijvingText");
const mipPdfLink = document.getElementById("mipPdfLink");
const mipRceLink = document.getElementById("mipRceLink");
function openMenu(){ sideMenu.classList.add("open"); menuOverlay.classList.remove("hidden"); }
function closeMenu(){ sideMenu.classList.remove("open"); menuOverlay.classList.add("hidden"); }
function openInfo(){ infoModal.classList.remove("hidden"); infoOverlay.classList.remove("hidden"); }
function closeInfo(){ infoModal.classList.add("hidden"); infoOverlay.classList.add("hidden"); }
function openMipModal(){ mipModal.classList.remove("hidden"); mipOverlay.classList.remove("hidden"); }
function closeMipModal(){ mipModal.classList.add("hidden"); mipOverlay.classList.add("hidden"); }
menuBtn.addEventListener("click", openMenu);
closeMenuBtn.addEventListener("click", closeMenu);
menuOverlay.addEventListener("click", closeMenu);
infoBtn.addEventListener("click", openInfo);
closeInfoBtn.addEventListener("click", closeInfo);
infoOverlay.addEventListener("click", closeInfo);
closeMipBtn.addEventListener("click", closeMipModal);
mipOverlay.addEventListener("click", closeMipModal);
function setStatus(msg){ statusBox.textContent = msg; statusBox.style.opacity = "1"; }
locateBtn.addEventListener("click", locateUser);
function locateUser(){
  if(!navigator.geolocation){ setStatus("Geen geolocatie"); return; }
  navigator.geolocation.getCurrentPosition(function(pos){
    map.setView([pos.coords.latitude, pos.coords.longitude], 16);
    if(currentMarker) map.removeLayer(currentMarker);
    currentMarker = L.marker([pos.coords.latitude, pos.coords.longitude]).addTo(map).bindPopup("Huidige positie").openPopup();
    loadBAG(pos.coords.latitude, pos.coords.longitude, Number(radiusSelect.value));
    loadMIPReal();
  });
}
function createBoundingBox(lat, lng, radius){
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos(lat * Math.PI / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
async function loadBAG(lat, lng, radius){
  objectLayer.clearLayers(); yearLabelLayer.clearLayers();
  const box = createBoundingBox(lat, lng, radius);
  const url = `https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?bbox=${box.minLng},${box.minLat},${box.maxLng},${box.maxLat}&limit=100&f=json`;
  try{
    const res = await fetch(url);
    const data = await res.json();
    const results = data.features.map(f=>{
      const center = calculateCenter(f);
      if(!center) return null;
      const dist = calculateDistance(lat, lng, center.lat, center.lng);
      if(dist > radius) return null;
      return { feature:f, center, distance:dist };
    }).filter(Boolean).sort((a,b)=>a.distance-b.distance);
    displayBAG(results);
  }catch(e){ console.error(e); }
}
function calculateCenter(feature){
  if(!feature.geometry) return null;
  const pts=[]; function collect(c){ if(typeof c[0]==="number"){ pts.push(c); return; } c.forEach(collect); } collect(feature.geometry.coordinates);
  if(!pts.length) return null;
  let slng=0, slat=0; pts.forEach(p=>{ slng+=p[0]; slat+=p[1]; }); return { lng: slng/pts.length, lat: slat/pts.length };
}
function calculateDistance(lat1, lon1, lat2, lon2){
  const R=6371000; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function displayBAG(objects){
  objectLayer.clearLayers(); yearLabelLayer.clearLayers();
  objects.forEach(o=>{
    const year = String(o.feature.properties.bouwjaar||"Onbekend");
    L.geoJSON(o.feature, { style:{ weight:1.5, color:"#0b5cab", fillOpacity:0.18 } }).addTo(objectLayer);
    const icon = L.divIcon({ className:"", html:`<div class="year-badge">${year}</div>`, iconSize:null });
    L.marker([o.center.lat, o.center.lng], {icon}).addTo(yearLabelLayer);
  });
}
function escapeHTML(v){ return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }

// ===== DEBUG MIP GetCapabilities =====
async function debugMIPCapabilities(){
  setStatus("MIP GetCapabilities ophalen...");
  const urls = [
    "https://services.rce.geovoorziening.nl/mip/wfs?request=GetCapabilities&service=WFS",
    "https://services.rce.geovoorziening.nl/mip/wms?request=GetCapabilities&service=WMS"
  ];
  for(let url of urls){
    try{
      console.log("Fetching GetCapabilities:", url);
      const res = await fetch(url);
      const text = await res.text();
      console.log("GetCapabilities response (first 2000 chars):", text.substring(0,2000));
      // Toon in popup
      L.popup().setLatLng(map.getCenter()).setContent(`<div style="max-width:400px;max-height:300px;overflow:auto"><strong>GetCapabilities</strong><br><small>${escapeHTML(url)}</small><hr><pre style="white-space:pre-wrap;font-size:10px">${escapeHTML(text.substring(0,3000))}</pre></div>`).openOn(map);
      // Parse feature types
      const matches = [...text.matchAll(/<Name>(mip:[^<]+)<\/Name>/g)];
      if(matches.length>0){
        console.log("Gevonden MIP FeatureTypes:", matches.map(m=>m[1]));
        setStatus(`MIP types gevonden: ${matches.map(m=>m[1]).join(", ")}`);
        // Probeer eerste type direct
        await tryMIPType(matches[0][1]);
        return;
      }
      const matches2 = [...text.matchAll(/<Layer[^>]*>.*?<Name>([^<]+)<\/Name>/gs)];
      console.log("WMS Layers:", matches2.map(m=>m[1]).slice(0,20));
    }catch(e){ console.error("GetCapabilities fetch error", url, e); }
  }
  // Fallback: probeer bekende RCE MIP typenames
  const knownTypes = ["mip:bouwvlak","mip:bouwwerk","mip:mip","mip:object","mip:objecten","mip:monument","rce:mip","mip:MIP_Object","mip:MIP"];
  for(let t of knownTypes){
    await tryMIPType(t);
  }
}

async function tryMIPType(typeName){
  const bounds = map.getBounds();
  const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
  const bboxURN = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  const attempts = [
    `https://services.rce.geovoorziening.nl/mip/wfs?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=${encodeURIComponent(typeName)}&SRSNAME=EPSG:4326&BBOX=${bbox},EPSG:4326&OUTPUTFORMAT=application/json&MAXFEATURES=50`,
    `https://services.rce.geovoorziening.nl/mip/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=${encodeURIComponent(typeName)}&SRSNAME=EPSG:4326&BBOX=${bbox}&OUTPUTFORMAT=application/json&COUNT=50`,
    `https://services.rce.geovoorziening.nl/mip/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=${encodeURIComponent(typeName)}&SRSNAME=urn:ogc:def:crs:EPSG::4326&BBOX=${bboxURN},urn:ogc:def:crs:EPSG::4326&OUTPUTFORMAT=application/json&COUNT=50`,
    `https://services.rce.geovoorziening.nl/mip/wfs?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&TYPENAME=${encodeURIComponent(typeName)}&SRSNAME=EPSG:4326&BBOX=${bbox}&OUTPUTFORMAT=application/json&MAXFEATURES=50`
  ];
  for(let url of attempts){
    try{
      console.log(`Probeer MIP type ${typeName}: ${url}`);
      const res = await fetch(url);
      const text = await res.text();
      if(text.startsWith("{")){
        const geojson = JSON.parse(text);
        if(geojson.features && geojson.features.length>0){
          console.log(`SUCCES ${typeName}: ${geojson.features.length} objecten`, geojson.features[0]);
          setStatus(`MIP SUCCES ${typeName}: ${geojson.features.length} objecten`);
          renderMIPReal(geojson.features);
          return true;
        }
      } else {
        console.log(`MIP ${typeName} gaf XML (geen JSON):`, text.substring(0,500));
      }
    }catch(e){ console.log(`MIP ${typeName} error`, e); }
  }
  return false;
}

function renderMIPReal(features){
  mipLayer.clearLayers();
  features.forEach(f=>{
    const props = f.properties || {};
    const naam = props.objectnaam || props.OBJECTNAAM || props.naam || "MIP Object";
    const jaar = props.bouwjaar || props.BOUWJAAR || props.jaar || "";
    let lat,lng;
    if(f.geometry && f.geometry.type==="Point"){ lng=f.geometry.coordinates[0]; lat=f.geometry.coordinates[1]; }
    else if(f.geometry && f.geometry.coordinates){ const c=f.geometry.coordinates[0]; if(Array.isArray(c)){ lng=c[0]; lat=c[1]; } }
    if(!lat||!lng) return;
    const icon = L.divIcon({ className:"", html:`<div class="mip-marker"><div class="mip-marker-inner">🏛</div></div>`, iconSize:[28,28], iconAnchor:[14,28] });
    const marker = L.marker([lat,lng], {icon}).on("click", ()=>{
      L.popup().setLatLng([lat,lng]).setContent(`<strong>${escapeHTML(naam)}</strong><br>Jaar: ${escapeHTML(jaar)}<br><pre style="font-size:10px">${escapeHTML(JSON.stringify(props,null,2).substring(0,500))}</pre>`).openOn(map);
    });
    mipLayer.addLayer(marker);
    const label = L.divIcon({ className:"", html:`<div class="mip-badge">${escapeHTML(String(jaar||"MIP").substring(0,4))}</div>`, iconSize:[60,20], iconAnchor:[30,-6] });
    L.marker([lat,lng], {icon:label, interactive:false}).addTo(mipLayer);
  });
}

async function loadMIPReal(){
  await debugMIPCapabilities();
}

const minuutplanLayer = L.tileLayer.wms("https://services.rce.geovoorziening.nl/misc/wms", { layers: "Minuutplanbegrenzingen", format:"image/png", transparent:true, version:"1.3.0", opacity:0.55, attribution:"© RCE" });
minuutplanLayer.addTo(map);
document.getElementById("toggleMinuutplan")?.addEventListener("change", (e)=>{ if(e.target.checked) minuutplanLayer.addTo(map); else map.removeLayer(minuutplanLayer); });
function wgs84ToRD(lat, lon){
  const dF=0.36*(lat-52.15517440); const dL=0.36*(lon-5.38720621);
  const x=155000+190094.945*dL-11832.228*dF*dL-114.221*Math.pow(dF,2)*dL-32.391*Math.pow(dL,3)-0.705*dF-2.340*Math.pow(dF,3)*dL-0.608*dF*Math.pow(dL,3)-0.008*Math.pow(dL,2)+0.148*Math.pow(dF,2)*Math.pow(dL,3);
  const y=463000+309056.544*dF+3638.893*Math.pow(dL,2)+73.077*Math.pow(dF,2)-157.984*dF*Math.pow(dL,2)+59.788*Math.pow(dF,3)+0.433*dL-6.439*Math.pow(dF,2)*Math.pow(dL,2)-0.032*dF*dL+0.092*Math.pow(dL,4)-0.054*dF*Math.pow(dL,4);
  return {x,y};
}
async function loadMinuutplanAuto(lat, lng){
  try{
    const rd = wgs84ToRD(lat, lng);
    const bbox = [rd.x-20, rd.y-20, rd.x+20, rd.y+20].join(",");
    const url="https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox="+encodeURIComponent(bbox)+"&outputFormat=application/json&count=5";
    const res = await fetch(url);
    const data = await res.json();
    if(!data.features || data.features.length===0) return;
    const code = data.features[0].properties.CODE;
    if(window.historischeMinuutplanLayer){ map.removeLayer(window.historischeMinuutplanLayer); }
    window.historischeMinuutplanLayer=L.tileLayer("https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut"+code+"*",{opacity:Number(document.getElementById("historischeOpacity").value)/100,maxZoom:20,attribution:"Historische kaart: HisGIS / RCE"}).addTo(map);
  }catch(e){ console.error(e); }
}
map.on("click", async function(e){
  if(!map.hasLayer(minuutplanLayer)) return;
  try{
    const rd=wgs84ToRD(e.latlng.lat, e.latlng.lng);
    const bbox=[rd.x-20,rd.y-20,rd.x+20,rd.y+20].join(",");
    const url="https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox="+encodeURIComponent(bbox)+"&outputFormat=application/json&count=5";
    const res=await fetch(url);
    const data=await res.json();
    if(!data.features || data.features.length===0) return;
    const p=data.features[0].properties;
    L.popup().setLatLng(e.latlng).setContent(`<strong>Minuutplan</strong><br>${p.GEMEENTE} ${p.SECTIE} ${p.BLAD}<br><a href="${p.URL}" target="_blank">Bekijk origineel</a>`).openOn(map);
  }catch(e){ console.error(e); }
});
document.getElementById("historischeOpacity")?.addEventListener("input", function(){
  const o=Number(this.value)/100;
  if(window.historischeMinuutplanLayer) window.historischeMinuutplanLayer.setOpacity(o);
  if(minuutplanLayer) minuutplanLayer.setOpacity(o);
  document.getElementById("historischeOpacityValue").textContent=this.value+"%";
});
window.addEventListener("load", ()=>{
  setTimeout(()=>{ if(navigator.geolocation){ locateUser(); } setTimeout(()=>{ loadMIPReal(); }, 1500); }, 800);
});
minuutplanLayer.setOpacity(0.55);
