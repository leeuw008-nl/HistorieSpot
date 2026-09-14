// HistorieSpot - FINAL versie vanmorgen: sticky header, fullscreen, fab, bouwjaar, B02/B03 fix, bottom slider, auto kadaster
const map = L.map("map", { zoomControl:false }).setView([52.516, 6.420], 15);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);

let currentMarker = null;
let accuracyCircle = null;
const objectLayer = L.layerGroup().addTo(map);
const yearLabelLayer = L.layerGroup().addTo(map);

const MINUUTPLAN_CORRECTIES = { "MIN04041B02": "MIN04041B03", "MIN04041B03": "MIN04041B02" };
function corrigeerMinuutplanCode(code){ return MINUUTPLAN_CORRECTIES[code] || code; }

async function loadMinuutplanAuto(lat, lng){
  try{
    const rd = wgs84ToRD(lat, lng);
    const bbox = [rd.x-20, rd.y-20, rd.x+20, rd.y+20].join(",");
    const url="https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox="+encodeURIComponent(bbox)+"&outputFormat=application/json&count=5";
    const response = await fetch(url);
    if(!response.ok) throw new Error("RCE WFS HTTP "+response.status);
    const data = await response.json();
    if(!data.features || data.features.length===0) return;
    const p = data.features[0].properties;
    const origineleCode = p.CODE;
    const minuutplanCode = corrigeerMinuutplanCode(origineleCode);
    if(minuutplanCode){
      if(window.historischeMinuutplanLayer){ map.removeLayer(window.historischeMinuutplanLayer); }
      window.historischeMinuutplanLayer=L.tileLayer("https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut"+minuutplanCode+"*",{opacity:Number(opacitySlider.value)/100,maxZoom:20,attribution:"Historische kaart: HisGIS / RCE"});
      window.historischeMinuutplanLayer.addTo(map);
      console.log(`Auto kadasterkaart geladen: ${origineleCode} -> ${minuutplanCode} op 55%`);
      updateOpacityBarVisibility();
    }
  }catch(e){ console.error("Auto kadaster laden mislukt", e); }
}

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
const opacityBar = document.getElementById("opacityBar");
const opacitySlider = document.getElementById("historischeOpacity");
const opacityValue = document.getElementById("historischeOpacityValue");

function openMenu(){ sideMenu.classList.add("open"); menuOverlay.classList.remove("hidden"); }
function closeMenu(){ sideMenu.classList.remove("open"); menuOverlay.classList.add("hidden"); }
function openInfo(){ infoModal.classList.remove("hidden"); infoOverlay.classList.remove("hidden"); }
function closeInfo(){ infoModal.classList.add("hidden"); infoOverlay.classList.add("hidden"); }

menuBtn.addEventListener("click", openMenu);
closeMenuBtn.addEventListener("click", closeMenu);
menuOverlay.addEventListener("click", closeMenu);
infoBtn.addEventListener("click", openInfo);
closeInfoBtn.addEventListener("click", closeInfo);
infoOverlay.addEventListener("click", closeInfo);

function setStatus(msg){
  statusBox.textContent = msg;
  statusBox.style.opacity = "1";
  clearTimeout(statusBox._hideTimer);
  if(!msg.startsWith("⚠️")){
    statusBox._hideTimer = setTimeout(()=>{ statusBox.style.opacity="0.85"; }, 6000);
  }
}

locateBtn.addEventListener("click", locateUser);
radiusSelect.addEventListener("change", ()=>{
  if(currentMarker){
    const latlng = currentMarker.getLatLng();
    loadBAG(latlng.lat, latlng.lng, Number(radiusSelect.value));
  }
});

function locateUser(){
  if(!navigator.geolocation){ setStatus("Deze browser ondersteunt geen locatiebepaling."); return; }
  setStatus("📍 Locatie wordt bepaald...");
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    function(position){
      locateBtn.disabled = false;
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = Math.round(position.coords.accuracy);
      const radius = Number(radiusSelect.value);
      map.setView([latitude, longitude], 18);
      if(currentMarker) map.removeLayer(currentMarker);
      if(accuracyCircle) map.removeLayer(accuracyCircle);
      currentMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("📍 Huidige positie").openPopup();
      accuracyCircle = L.circle([latitude, longitude], { radius: accuracy, color:"#0b5cab", fillOpacity:0.08 }).addTo(map);
      setStatus(`Gevonden (±${accuracy}m)`);
      loadBAG(latitude, longitude, radius);
      loadMinuutplanAuto(latitude, longitude);
      closeMenu();
    },
    function(error){
      locateBtn.disabled = false;
      if(error.code===1) setStatus("⚠️ Locatietoegang geweigerd.");
      else if(error.code===2) setStatus("⚠️ Locatie kon niet worden bepaald.");
      else if(error.code===3) setStatus("⚠️ Locatiebepaling duurde te lang.");
      else setStatus("⚠️ Onbekende locatiefout.");
    },
    { enableHighAccuracy:true, timeout:15000, maximumAge:30000 }
  );
}

function createBoundingBox(latitude, longitude, radiusMeters){
  const latitudeDelta = radiusMeters / 111320;
  const longitudeDelta = radiusMeters / (111320 * Math.cos(latitude * Math.PI / 180));
  return { minLatitude: latitude - latitudeDelta, maxLatitude: latitude + latitudeDelta, minLongitude: longitude - longitudeDelta, maxLongitude: longitude + longitudeDelta };
}

async function loadBAG(latitude, longitude, radius){
  objectLayer.clearLayers();
  yearLabelLayer.clearLayers();
  const box = createBoundingBox(latitude, longitude, radius * 1.5);
  const url = "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items" + "&limit=100&f=json";
  try{
    const response = await fetch(url);
    if(!response.ok) throw new Error(`PDOK HTTP-fout ${response.status}`);
    const data = await response.json();
    const features = data.features || [];
    const nearbyObjects = features.map(function(feature){
      const center = calculateFeatureCenter(feature);
      let distance = Infinity;
      if(center) distance = calculateDistance(latitude, longitude, center.latitude, center.longitude);
      return { feature, center, distance };
    }).filter(o=>o.distance <= radius).sort((a,b)=>a.distance-b.distance);
    displayResults(nearbyObjects);
  }catch(error){
    console.error("Fout bij ophalen BAG:", error);
    setStatus("⚠️ PDOK kon niet worden bereikt.");
  }
}

function calculateFeatureCenter(feature){
  if(!feature.geometry) return null;
  const points=[];
  function collectPoints(coordinates){
    if(typeof coordinates[0]==="number"){ points.push(coordinates); return; }
    coordinates.forEach(collectPoints);
  }
  collectPoints(feature.geometry.coordinates);
  if(!points.length) return null;
  let totalLongitude=0, totalLatitude=0;
  points.forEach(p=>{ totalLongitude+=p[0]; totalLatitude+=p[1]; });
  return { longitude: totalLongitude/points.length, latitude: totalLatitude/points.length };
}
function calculateDistance(lat1, lon1, lat2, lon2){
  const earthRadius=6371000;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  const c=2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return earthRadius*c;
}
function getYearClass(year){
  const y = parseInt(year,10);
  if(isNaN(y)) return "unknown";
  if(y < 1850) return "very-old";
  if(y < 1920) return "old";
  return "";
}
function displayResults(objects){
  objectLayer.clearLayers();
  yearLabelLayer.clearLayers();
  if(!objects.length){ setStatus("Geen BAG-gebouwen binnen radius."); return; }
  objects.forEach(function(object){
    const feature = object.feature;
    const properties = feature.properties || {};
    const identification = properties.identificatie || "Onbekend";
    const constructionYear = properties.bouwjaar ?? "Onbekend";
    const purpose = Array.isArray(properties.gebruiksdoel) ? properties.gebruiksdoel.join(", ") : (properties.gebruiksdoel || "Onbekend");
    const status = properties.status || "Onbekend";
    const yearStr = String(constructionYear);
    const yearClass = getYearClass(yearStr);
    L.geoJSON(feature, { style:{ weight:1.5, color:"#0b5cab", fillColor:"#0b5cab", fillOpacity:0.18 } })
      .bindPopup(`<strong>BAG-object</strong><br><span style="font-size:18px;font-weight:800">🕰 ${escapeHTML(yearStr)}</span><br>Gebruiksdoel: ${escapeHTML(String(purpose))}<br>Status: ${escapeHTML(String(status))}<br><small>BAG-ID: ${escapeHTML(String(identification))}<br>Afstand: ${Math.round(object.distance)}m</small>`)
      .addTo(objectLayer);
    if(object.center){
      const icon = L.divIcon({ className: "", html: `<div class="year-badge ${yearClass}">${escapeHTML(yearStr)}</div>`, iconSize: null });
      L.marker([object.center.latitude, object.center.longitude], { icon: icon }).addTo(yearLabelLayer);
    }
  });
  setStatus(`${objects.length} gebouwen`);
}
function escapeHTML(value){ return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

// HISTORISCHE KAART
const minuutplanLayer = L.tileLayer.wms("https://services.rce.geovoorziening.nl/misc/wms", { layers: "Minuutplanbegrenzingen", format:"image/png", transparent:true, version:"1.3.0", opacity:0.55, attribution:"© RCE" });
minuutplanLayer.addTo(map);
toggleMinuutplan.addEventListener("change", ()=>{
  if(toggleMinuutplan.checked) minuutplanLayer.addTo(map);
  else map.removeLayer(minuutplanLayer);
});

function wgs84ToRD(lat, lon){
  const dF=0.36*(lat-52.15517440); const dL=0.36*(lon-5.38720621);
  const x=155000+190094.945*dL-11832.228*dF*dL-114.221*Math.pow(dF,2)*dL-32.391*Math.pow(dL,3)-0.705*dF-2.340*Math.pow(dF,3)*dL-0.608*dF*Math.pow(dL,3)-0.008*Math.pow(dL,2)+0.148*Math.pow(dF,2)*Math.pow(dL,3);
  const y=463000+309056.544*dF+3638.893*Math.pow(dL,2)+73.077*Math.pow(dF,2)-157.984*dF*Math.pow(dL,2)+59.788*Math.pow(dF,3)+0.433*dL-6.439*Math.pow(dF,2)*Math.pow(dL,2)-0.032*dF*dL+0.092*Math.pow(dL,4)-0.054*dF*Math.pow(dL,4);
  return {x,y};
}
function updateOpacityBarVisibility(){
  // altijd zichtbaar, default 55%
}

map.on("click", async function(e){
  if(!map.hasLayer(minuutplanLayer)) return;
  try{
    const rd=wgs84ToRD(e.latlng.lat, e.latlng.lng);
    const bbox=[rd.x-20,rd.y-20,rd.x+20,rd.y+20].join(",");
    const url="https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox="+encodeURIComponent(bbox)+"&outputFormat=application/json&count=5";
    const response=await fetch(url);
    if(!response.ok) throw new Error("RCE WFS HTTP "+response.status);
    const data=await response.json();
    if(!data.features || data.features.length===0) return;
    const p=data.features[0].properties;
    const origineleCode = p.CODE;
    const minuutplanCode = corrigeerMinuutplanCode(origineleCode);
    const isGecorrigeerd = origineleCode !== minuutplanCode;
    if(minuutplanCode){
      if(window.historischeMinuutplanLayer){ map.removeLayer(window.historischeMinuutplanLayer); }
      window.historischeMinuutplanLayer=L.tileLayer("https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut"+minuutplanCode+"*",{opacity:Number(opacitySlider.value)/100,maxZoom:20,attribution:"Historische kaart: HisGIS / RCE"});
      window.historischeMinuutplanLayer.addTo(map);
    }
    let correctieNote = isGecorrigeerd ? `<div style='background:#fff3cd;padding:6px 8px;border-radius:6px;margin:8px 0;font-size:12px;border:1px solid #ffe69c'>⚠️ Correctie: ${origineleCode} → ${minuutplanCode} (Ommen B02↔B03)</div>` : "";
    let popupContent=`<div style="min-width:240px"><strong style="font-size:16px">🕰 Kadastraal minuutplan</strong><br><small>RCE</small>${correctieNote}<hr><strong>Periode:</strong> 1811–1832<br><br><strong>Gemeente:</strong> ${p.GEMEENTE||"onbekend"}<br><strong>Sectie:</strong> ${p.SECTIE||""} <strong>Blad:</strong> ${p.BLAD||""}<br><br><strong>Code:</strong> ${p.CODE||""}${isGecorrigeerd?` → <b>${minuutplanCode}</b>`:""}<br><br><a href="${p.URL}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:8px 12px;background:#1d5d8f;color:white;text-decoration:none;border-radius:5px">Bekijk originele minuutplan</a></div>`;
    L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(map);
  }catch(error){ console.error("Fout bij ophalen minuutplan:", error); }
});

opacitySlider.addEventListener("input", function(){
  const opacity=Number(this.value)/100;
  if(window.historischeMinuutplanLayer) window.historischeMinuutplanLayer.setOpacity(opacity);
  if(minuutplanLayer) minuutplanLayer.setOpacity(opacity);
  opacityValue.textContent=this.value+"%";
});
opacityValue.textContent=opacitySlider.value+"%";

// Default: auto inzoomen op huidige locatie + default kadasterkaart 55%
window.addEventListener("load", ()=>{
  setTimeout(()=>{
    if(navigator.geolocation){ locateUser(); }
  }, 800);
});
minuutplanLayer.setOpacity(0.55);

// BAG aan/uit toggle - alleen toegevoegd, rest ongewijzigd
const toggleBAGBtn = document.getElementById("toggleBAGBtn");
let bagVisible = true;
if(toggleBAGBtn){
  toggleBAGBtn.addEventListener("click", ()=>{
    bagVisible = !bagVisible;
    if(bagVisible){
      objectLayer.addTo(map);
      yearLabelLayer.addTo(map);
      toggleBAGBtn.classList.add("active");
      toggleBAGBtn.title = "BAG verbergen";
      const count = yearLabelLayer.getLayers().length;
      if(count>0) setStatus(`${count} gebouwen`);
    }else{
      map.removeLayer(objectLayer);
      map.removeLayer(yearLabelLayer);
      toggleBAGBtn.classList.remove("active");
      toggleBAGBtn.title = "BAG tonen";
      setStatus("BAG verborgen");
    }
  });
}
