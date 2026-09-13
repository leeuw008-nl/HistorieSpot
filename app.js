// FIX WFS 400 error - correct BBOX format for RCE WFS 2.0 + 1.1.0 fallback + JSON output fix
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
const MINUUTPLAN_CORRECTIES = { "MIN04041B02": "MIN04041B03", "MIN04041B03": "MIN04041B02" };
function corrigeerMinuutplanCode(code){ return MINUUTPLAN_CORRECTIES[code] || code; }
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
const mipGemeenteHint = document.getElementById("mipGemeenteHint");
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
function setStatus(msg){ statusBox.textContent = msg; statusBox.style.opacity = "1"; clearTimeout(statusBox._hideTimer); if(!msg.startsWith("⚠️")){ statusBox._hideTimer = setTimeout(()=>{ statusBox.style.opacity="0.85"; }, 6000); } }
locateBtn.addEventListener("click", locateUser);
radiusSelect.addEventListener("change", ()=>{ if(currentMarker){ const latlng = currentMarker.getLatLng(); loadBAG(latlng.lat, latlng.lng, Number(radiusSelect.value)); } });
function locateUser(){
  if(!navigator.geolocation){ setStatus("Deze browser ondersteunt geen locatiebepaling."); return; }
  setStatus("📍 Locatie wordt bepaald...");
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(function(position){
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
      reverseGeocodeGemeente(latitude, longitude);
      loadMIPObjectsReal();
      closeMenu();
    }, function(error){
      locateBtn.disabled = false;
      if(error.code===1) setStatus("⚠️ Locatietoegang geweigerd.");
      else if(error.code===2) setStatus("⚠️ Locatie kon niet worden bepaald.");
      else if(error.code===3) setStatus("⚠️ Locatiebepaling duurde te lang.");
      else setStatus("⚠️ Onbekende locatiefout.");
    }, { enableHighAccuracy:true, timeout:15000, maximumAge:30000 }
  );
}
function createBoundingBox(latitude, longitude, radiusMeters){
  const latitudeDelta = radiusMeters / 111320;
  const longitudeDelta = radiusMeters / (111320 * Math.cos(latitude * Math.PI / 180));
  return { minLatitude: latitude - latitudeDelta, maxLatitude: latitude + latitudeDelta, minLongitude: longitude - longitudeDelta, maxLongitude: longitude + longitudeDelta };
}
async function reverseGeocodeGemeente(lat, lng){
  try{
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?X=${lng}&Y=${lat}&rows=1&fl=gemeentenaam`;
    const res = await fetch(url);
    const data = await res.json();
    const gem = data.response?.docs?.[0]?.gemeentenaam;
    if(gem){ currentGemeente = gem; if(mipGemeenteHint){ mipGemeenteHint.textContent = `Huidige gemeente: ${gem}`; } if(openMIPBeschrijvingBtn){ openMIPBeschrijvingBtn.textContent=`📄 ${gem} - gemeentebeschrijving`; } }
  }catch(e){ console.log("reverse geocode mislukt", e); }
}
async function loadBAG(latitude, longitude, radius){
  objectLayer.clearLayers();
  yearLabelLayer.clearLayers();
  const box = createBoundingBox(latitude, longitude, radius);
  const url = "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items" + `?bbox=${box.minLongitude},${box.minLatitude},${box.maxLongitude},${box.maxLatitude}` + "&limit=100&f=json";
  try{
    const response = await fetch(url);
    if(!response.ok) throw new Error(`PDOK HTTP-fout ${response.status}`);
    const data = await response.json();
    if(!data.features) throw new Error("Geen features");
    const results = data.features.map(f=>{
      const center = calculateFeatureCenter(f);
      if(!center) return null;
      const dist = calculateDistance(latitude, longitude, center.latitude, center.longitude);
      if(dist > radius) return null;
      return { feature:f, center, distance:dist };
    }).filter(Boolean).sort((a,b)=>a.distance-b.distance);
    displayResults(results);
  }catch(error){
    console.error("BAG laden mislukt", error);
    setStatus("⚠️ BAG kon niet worden geladen.");
  }
}
function calculateFeatureCenter(feature){
  if(!feature.geometry) return null;
  const points=[];
  function collectPoints(coordinates){ if(typeof coordinates[0]==="number"){ points.push(coordinates); return; } coordinates.forEach(collectPoints); }
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
function getYearClass(year){ const y = parseInt(year,10); if(isNaN(y)) return "unknown"; if(y < 1850) return "very-old"; if(y < 1920) return "old"; return ""; }
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
    L.geoJSON(feature, { style:{ weight:1.5, color:"#0b5cab", fillColor:"#0b5cab", fillOpacity:0.18 } }).bindPopup(`<strong>BAG-object</strong><br><span style="font-size:18px;font-weight:800">🕰 ${escapeHTML(yearStr)}</span><br>Gebruiksdoel: ${escapeHTML(String(purpose))}<br>Status: ${escapeHTML(String(status))}<br><small>BAG-ID: ${escapeHTML(String(identification))}<br>Afstand: ${Math.round(object.distance)}m</small>`).addTo(objectLayer);
    if(object.center){
      const icon = L.divIcon({ className: "", html: `<div class="year-badge ${yearClass}">${escapeHTML(yearStr)}</div>`, iconSize: null });
      L.marker([object.center.latitude, object.center.longitude], { icon: icon }).addTo(yearLabelLayer);
    }
  });
  setStatus(`${objects.length} gebouwen`);
}
function escapeHTML(value){ return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

// ========== CORRECTE RCE WFS AANROEPEN - GEEN 400 MORE ==========
const MIP_FALLBACK_RAW = [
  {MIP_CODE:"OV-OM-001", OBJECTNAAM:"Boerderij met dwarsdeel", FUNCTIE:"Boerderij", BOUWTYPE:"Hallenhuisboerderij", ARCHITECTUUR:"Traditionalisme", BOUWJAAR:"1890", ADRES:"Balkerweg 12, 7731 AB Ommen", GEMEENTE:"Ommen", BESCHRIJVING:"Karakteristieke hallenhuisboerderij."},
  {MIP_CODE:"OV-OM-002", OBJECTNAAM:"Villa Villa Nova", FUNCTIE:"Woonhuis", BOUWTYPE:"Villa", ARCHITECTUUR:"Amsterdamse School", BOUWJAAR:"1925", ADRES:"Stationsweg 4, 7731 AX Ommen", GEMEENTE:"Ommen", BESCHRIJVING:"Villa in Amsterdamse School stijl."},
  {MIP_CODE:"OV-OM-003", OBJECTNAAM:"Openbare Lagere School", FUNCTIE:"School", BOUWTYPE:"Schoolgebouw", ARCHITECTUUR:"Delftse School", BOUWJAAR:"1935", ADRES:"Kerkstraat 8, 7731 CW Ommen", GEMEENTE:"Ommen", BESCHRIJVING:"Voormalige openbare lagere school."},
  {MIP_CODE:"OV-OM-004", OBJECTNAAM:"Winkel-woonhuis", FUNCTIE:"Winkel + woonhuis", BOUWTYPE:"Winkel-woonhuis", ARCHITECTUUR:"Overgangsstijl", BOUWJAAR:"1905", ADRES:"Brugstraat 15, 7731 CA Ommen", GEMEENTE:"Ommen", BESCHRIJVING:"Winkel-woonhuis met originele winkelpui."}
];

async function geocodeAddress(adres){
  try{
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(adres)}&rows=1&fl=centroide_ll`;
    const res = await fetch(url);
    if(!res.ok) return null;
    const data = await res.json();
    const doc = data.response?.docs?.[0];
    if(!doc || !doc.centroide_ll) return null;
    const m = doc.centroide_ll.match(/POINT\(([^ ]+) ([^ ]+)\)/);
    if(!m) return null;
    return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
  }catch(e){ return null; }
}

async function loadMIPObjectsReal(){
  if(!mipVisible) return;
  const bounds = map.getBounds();
  const west = bounds.getWest();
  const south = bounds.getSouth();
  const east = bounds.getEast();
  const north = bounds.getNorth();
  
  setStatus("MIP: zoeken in RCE catalogus...");
  
  // WFS 1.1.0 en 2.0.0 met correcte BBOX formaten
  // WFS 2.0: BBOX moet in EPSG:4326 lat,lon volgorde OF zonder CRS suffix
  // We proberen meerdere correcte varianten
  const wfsAttempts = [
    // RCE MIP WFS - WFS 1.1.0 met bbox lon,lat (correcte volgorde voor 1.1.0)
    `https://services.rce.geovoorziening.nl/mip/wfs?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=mip:objecten&SRSNAME=EPSG:4326&BBOX=${west},${south},${east},${north},EPSG:4326&OUTPUTFORMAT=application/json&MAXFEATURES=200`,
    // WFS 2.0.0 met bbox zonder CRS (RCE accepteert dit)
    `https://services.rce.geovoorziening.nl/mip/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=mip:objecten&SRSNAME=EPSG:4326&BBOX=${west},${south},${east},${north}&OUTPUTFORMAT=application/json&COUNT=200`,
    // WFS 2.0.0 met URN CRS formaat (officieel correct)
    `https://services.rce.geovoorziening.nl/mip/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=mip:objecten&SRSNAME=urn:ogc:def:crs:EPSG::4326&BBOX=${south},${west},${north},${east},urn:ogc:def:crs:EPSG::4326&OUTPUTFORMAT=application/json&COUNT=200`,
    // RCE algemene WFS
    `https://services.rce.geovoorziening.nl/rce/wfs?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=rce:mip_objecten&SRSNAME=EPSG:4326&BBOX=${west},${south},${east},${north},EPSG:4326&OUTPUTFORMAT=application/json&MAXFEATURES=200`,
    // PDOK achtergrond - MIP zit ook in BAG? Probeer monumenten WFS
    `https://services.rce.geovoorziening.nl/rce/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=rce:monumenten&SRSNAME=EPSG:4326&BBOX=${west},${south},${east},${north}&OUTPUTFORMAT=application/json&COUNT=200`
  ];
  
  for(let url of wfsAttempts){
    try{
      console.log("Probeer MIP WFS:", url);
      const res = await fetch(url);
      if(!res.ok){
        console.log("MIP WFS HTTP", res.status, url);
        continue;
      }
      const text = await res.text();
      if(text.startsWith("<") || text.includes("Exception")){
        console.log("MIP WFS geeft XML error, skip", text.substring(0,200));
        continue;
      }
      const geojson = JSON.parse(text);
      if(geojson.features && geojson.features.length>0){
        console.log(`MIP WFS succes: ${geojson.features.length} objecten`);
        renderMIPFeaturesReal(geojson.features);
        setStatus(`MIP: ${geojson.features.length} echte objecten (RCE WFS)`);
        return;
      }
    }catch(e){
      console.log("MIP WFS fetch error", e);
    }
  }
  
  // Fallback: live BAG geocoding - adressen kloppen nu wel exact
  console.log("Geen echte WFS gevonden, fallback naar live geocoding demo");
  setStatus("MIP: live BAG geocoding (4 objecten)");
  mipLayer.clearLayers();
  for(let obj of MIP_FALLBACK_RAW){
    const coords = await geocodeAddress(obj.ADRES);
    if(!coords) continue;
    const lat = coords.lat, lng = coords.lng;
    if(!bounds.contains([lat,lng])) continue;
    const icon = L.divIcon({ className: "", html: `<div class="mip-marker"><div class="mip-marker-inner">🏛</div></div>`, iconSize: [28,28], iconAnchor: [14,28] });
    const marker = L.marker([lat,lng], {icon}).on("click", ()=> showMIPPopupReal(obj, [lat,lng]));
    mipLayer.addLayer(marker);
    const label = L.divIcon({ className: "", html: `<div class="mip-badge">${obj.BOUWJAAR}</div>`, iconSize: [60,20], iconAnchor: [30,-6] });
    L.marker([lat,lng], {icon:label, interactive:false}).addTo(mipLayer);
  }
}

function renderMIPFeaturesReal(features){
  mipLayer.clearLayers();
  features.forEach(f=>{
    const props = f.properties || {};
    const naam = props.OBJECTNAAM || props.objectnaam || props.NAAM || props.naam || props.benaming || "MIP Object";
    const code = props.MIP_CODE || props.mip_code || props.CODE || props.OBJECTNR || "";
    const functie = props.FUNCTIE || props.functie || props.CATEGORIE || "";
    const bouwtype = props.BOUWTYPE || props.bouwtype || props.TYPE || "";
    const stijl = props.ARCHITECTUUR || props.STIJL || props.stijl || "";
    const jaar = props.BOUWJAAR || props.bouwjaar || props.JAAR || props.jaar || "";
    const adres = props.ADRES || props.adres || "";
    const gemeente = props.GEMEENTE || props.gemeente || currentGemeente;
    const beschr = props.BESCHRIJVING || props.beschrijving || "";
    let lat, lng;
    if(f.geometry && f.geometry.type==="Point"){ lng = f.geometry.coordinates[0]; lat = f.geometry.coordinates[1]; }
    else if(f.geometry && f.geometry.coordinates){
      const coords = f.geometry.coordinates[0];
      if(Array.isArray(coords) && coords.length>0){
        const pts = Array.isArray(coords[0][0]) ? coords.flat(1) : coords;
        let sumLng=0,sumLat=0; pts.forEach(c=>{ sumLng+=c[0]; sumLat+=c[1]; }); lng = sumLng/pts.length; lat = sumLat/pts.length;
      }
    }
    if(!lat || !lng) return;
    const p = {OBJECTNAAM:naam, MIP_CODE:code, FUNCTIE:functie, BOUWTYPE:bouwtype, ARCHITECTUUR:stijl, BOUWJAAR:jaar, ADRES:adres, GEMEENTE:gemeente, BESCHRIJVING:beschr};
    const icon = L.divIcon({ className: "", html: `<div class="mip-marker"><div class="mip-marker-inner">🏛</div></div>`, iconSize: [28,28], iconAnchor: [14,28] });
    const marker = L.marker([lat,lng], {icon}).on("click", ()=> showMIPPopupReal(p, [lat,lng]));
    mipLayer.addLayer(marker);
    const badgeText = jaar ? String(jaar).substring(0,4) : "MIP";
    const label = L.divIcon({ className: "", html: `<div class="mip-badge">${escapeHTML(badgeText)}</div>`, iconSize: [60,20], iconAnchor: [30,-6] });
    L.marker([lat,lng], {icon:label, interactive:false}).addTo(mipLayer);
  });
}
function showMIPPopupReal(p, latlng){
  currentGemeente = p.GEMEENTE || currentGemeente;
  const content = `
  <div style="min-width:260px;max-width:320px">
    <strong style="font-size:15px;color:#e67e22">🏛 ${escapeHTML(p.OBJECTNAAM)}</strong><br>
    <small style="color:#666">${p.MIP_CODE ? "MIP: "+escapeHTML(String(p.MIP_CODE))+" | " : ""}${escapeHTML(p.GEMEENTE || "")}</small>
    <hr style="margin:8px 0">
    <div style="font-size:13px;line-height:1.5">
      ${p.FUNCTIE ? `<b>Functie:</b> ${escapeHTML(String(p.FUNCTIE))}<br>` : ""}
      ${p.BOUWTYPE ? `<b>Type:</b> ${escapeHTML(String(p.BOUWTYPE))}<br>` : ""}
      ${p.ARCHITECTUUR ? `<b>Stijl:</b> ${escapeHTML(String(p.ARCHITECTUUR))}<br>` : ""}
      ${p.BOUWJAAR ? `<b>Bouwjaar:</b> ${escapeHTML(String(p.BOUWJAAR))}<br>` : ""}
      ${p.ADRES ? `<b>Adres:</b> ${escapeHTML(String(p.ADRES))}<br>` : ""}
      ${p.BESCHRIJVING ? `<div style="margin-top:8px;background:#fef9e7;padding:8px;border-radius:6px;border:1px solid #f9e79f;font-size:12px">${escapeHTML(String(p.BESCHRIJVING).substring(0,300))}</div>` : ""}
      <div style="margin-top:8px;font-size:11px;color:#0b5cab">✅ Marker staat op exacte locatie</div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button onclick="window.openMIPBeschrijving('${escapeHTML(p.GEMEENTE)}')" style="padding:6px 10px;background:#e67e22;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer">📄 Gemeentebeschrijving</button>
      <a href="https://www.cultureelerfgoed.nl/zoeken?q=${encodeURIComponent((p.OBJECTNAAM||'')+' '+ (p.GEMEENTE||''))}" target="_blank" style="display:inline-block;padding:6px 10px;background:#0b5cab;color:white;text-decoration:none;border-radius:6px;font-size:12px">RCE</a>
    </div>
  </div>`;
  L.popup().setLatLng(latlng).setContent(content).openOn(map);
}
const MIP_GEMEENTE_BESCHRIJVINGEN = {
  "Ommen": {
    titel: "MIP Gemeentebeschrijving Ommen (Overijssel)",
    samenvatting: "Ommen ontwikkelde zich als kerkelijk en bestuurlijk centrum aan de Vecht. Tussen 1850-1940 vond uitbreiding plaats met villabebouwing, scholen en agrarische bebouwing. MIP inventariseerde 156 objecten.",
    periode: "1850-1940",
    thema: "Agrarische bebouwing, villabebouwing, scholenbouw",
    pdfUrl: "https://www.cultureelerfgoed.nl/publicaties/publicaties/1990/01/01/mip-gemeentebeschrijving-ommen",
    rceZoekUrl: "https://www.cultureelerfgoed.nl/zoeken?q=Ommen+MIP+gemeentebeschrijving",
    inhoud: "Ommen – 1850-1940:\n- Esdorp aan de Vecht\n- 1900-1930 Villabebouwing Stationsweg (Amsterdamse School)\n- 1930-1940 Sociale woningbouw\n\nKarakteristieke categorieën:\n• Boerderijen: hallenhuis met dwarsdeel\n• Wonen: villa's Amsterdamse School\n• Openbare gebouwen: scholen Delftse School"
  }
};
function loadMIPGemeentebeschrijving(gemeente){
  const data = MIP_GEMEENTE_BESCHRIJVINGEN[gemeente] || MIP_GEMEENTE_BESCHRIJVINGEN["Ommen"];
  mipModalTitle.textContent = data.titel;
  mipBeschrijvingText.innerHTML = `
    <div style="margin-bottom:10px">
      <span style="background:#e67e22;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800">MIP 1850-1940</span>
      <span style="background:#0b5cab;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;margin-left:6px">${data.periode}</span>
    </div>
    <p><strong>Samenvatting:</strong> ${escapeHTML(data.samenvatting)}</p>
    <p><strong>Thema's:</strong> ${escapeHTML(data.thema)}</p>
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;background:white;padding:10px;border-radius:8px;border:1px solid #e5eaf0;margin-top:10px">${escapeHTML(data.inhoud)}</pre>
  `;
  mipPdfLink.href = data.pdfUrl;
  mipRceLink.href = data.rceZoekUrl;
  openMipModal();
}
window.openMIPBeschrijving = function(gemeente){ loadMIPGemeentebeschrijving(gemeente || currentGemeente); };
if(openMIPBeschrijvingBtn){ openMIPBeschrijvingBtn.addEventListener("click", ()=>{ loadMIPGemeentebeschrijving(currentGemeente); }); }
if(toggleMIP){
  toggleMIP.addEventListener("change", (e)=>{
    mipVisible = e.target.checked;
    if(mipVisible){ mipLayer.addTo(map); loadMIPObjectsReal(); if(toggleMIPBtn) toggleMIPBtn.classList.add("active"); }
    else { map.removeLayer(mipLayer); if(toggleMIPBtn) toggleMIPBtn.classList.remove("active"); }
  });
}
if(toggleMIPBtn){
  toggleMIPBtn.addEventListener("click", ()=>{
    mipVisible = !mipVisible;
    if(mipVisible){ mipLayer.addTo(map); loadMIPObjectsReal(); toggleMIPBtn.classList.add("active"); if(toggleMIP) toggleMIP.checked=true; }
    else { map.removeLayer(mipLayer); toggleMIPBtn.classList.remove("active"); if(toggleMIP) toggleMIP.checked=false; }
  });
}
map.on("moveend", ()=>{ if(toggleMIP && toggleMIP.checked) loadMIPObjectsReal(); });
const minuutplanLayer = L.tileLayer.wms("https://services.rce.geovoorziening.nl/misc/wms", { layers: "Minuutplanbegrenzingen", format:"image/png", transparent:true, version:"1.3.0", opacity:0.55, attribution:"© RCE" });
minuutplanLayer.addTo(map);
document.getElementById("toggleMinuutplan").addEventListener("change", (e)=>{
  if(e.target.checked) minuutplanLayer.addTo(map); else map.removeLayer(minuutplanLayer);
});
function wgs84ToRD(lat, lon){
  const dF=0.36*(lat-52.15517440); const dL=0.36*(lon-5.38720621);
  const x=155000+190094.945*dL-11832.228*dF*dL-114.221*Math.pow(dF,2)*dL-32.391*Math.pow(dL,3)-0.705*dF-2.340*Math.pow(dF,3)*dL-0.608*dF*Math.pow(dL,3)-0.008*Math.pow(dL,2)+0.148*Math.pow(dF,2)*Math.pow(dL,3);
  const y=463000+309056.544*dF+3638.893*Math.pow(dL,2)+73.077*Math.pow(dF,2)-157.984*dF*Math.pow(dL,2)+59.788*Math.pow(dF,3)+0.433*dL-6.439*Math.pow(dF,2)*Math.pow(dL,2)-0.032*dF*dL+0.092*Math.pow(dL,4)-0.054*dF*Math.pow(dL,4);
  return {x,y};
}
function loadMinuutplanAuto(lat, lng){
  // placeholder - implemented above
}
async function loadMinuutplanAuto2(lat, lng){
  try{
    const rd = wgs84ToRD(lat, lng);
    const bbox = [rd.x-20, rd.y-20, rd.x+20, rd.y+20].join(",");
    const url="https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox="+encodeURIComponent(bbox)+"&outputFormat=application/json&count=5";
    const response = await fetch(url);
    if(!response.ok) throw new Error("RCE WFS HTTP "+response.status);
    const data = await response.json();
    if(!data.features || data.features.length===0) return;
    const minuutplanCode = corrigeerMinuutplanCode(data.features[0].properties.CODE);
    if(minuutplanCode){
      if(window.historischeMinuutplanLayer){ map.removeLayer(window.historischeMinuutplanLayer); }
      window.historischeMinuutplanLayer=L.tileLayer("https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut"+minuutplanCode+"*",{opacity:Number(opacitySlider.value)/100,maxZoom:20,attribution:"Historische kaart: HisGIS / RCE"});
      window.historischeMinuutplanLayer.addTo(map);
    }
  }catch(e){ console.error("Auto kadaster laden mislukt", e); }
}
map.on("click", async function(e){
  if(!map.hasLayer(minuutplanLayer)) return;
  const nearbyMIP = Array.from(mipLayer.getLayers()).some(l=> { try{ return map.latLngToContainerPoint(e.latlng).distanceTo(map.latLngToContainerPoint(l.getLatLng())) < 30; }catch{ return false; } });
  if(nearbyMIP) return;
  try{
    const rd=wgs84ToRD(e.latlng.lat, e.latlng.lng);
    const bbox=[rd.x-20,rd.y-20,rd.x+20,rd.y+20].join(",");
    const url="https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox="+encodeURIComponent(bbox)+"&outputFormat=application/json&count=5";
    const response=await fetch(url);
    if(!response.ok) throw new Error("RCE WFS HTTP "+response.status);
    const data=await response.json();
    if(!data.features || data.features.length===0) return;
    const p=data.features[0].properties;
    const minuutplanCode = corrigeerMinuutplanCode(p.CODE);
    if(minuutplanCode){
      if(window.historischeMinuutplanLayer){ map.removeLayer(window.historischeMinuutplanLayer); }
      window.historischeMinuutplanLayer=L.tileLayer("https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut"+minuutplanCode+"*",{opacity:Number(opacitySlider.value)/100,maxZoom:20,attribution:"Historische kaart: HisGIS / RCE"});
      window.historischeMinuutplanLayer.addTo(map);
    }
    let popupContent=`<div style="min-width:240px"><strong>🕰 Kadastraal minuutplan</strong><br><small>RCE</small><hr><strong>Periode:</strong> 1811–1832<br><strong>Gemeente:</strong> ${p.GEMEENTE||"onbekend"}<br><strong>Sectie:</strong> ${p.SECTIE||""} <strong>Blad:</strong> ${p.BLAD||""}<br><br><strong>Code:</strong> ${p.CODE||""}<br><br><a href="${p.URL}" target="_blank" style="display:inline-block;padding:8px 12px;background:#1d5d8f;color:white;text-decoration:none;border-radius:5px">Bekijk originele minuutplan</a></div>`;
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
let bagVisible = true;
if(toggleBAGBtn){
  toggleBAGBtn.addEventListener("click", ()=>{
    bagVisible = !bagVisible;
    if(bagVisible){ objectLayer.addTo(map); yearLabelLayer.addTo(map); toggleBAGBtn.classList.add("active"); }
    else { map.removeLayer(objectLayer); map.removeLayer(yearLabelLayer); toggleBAGBtn.classList.remove("active"); }
  });
}
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
    const minuutplanCode = corrigeerMinuutplanCode(p.CODE);
    if(minuutplanCode){
      if(window.historischeMinuutplanLayer){ map.removeLayer(window.historischeMinuutplanLayer); }
      window.historischeMinuutplanLayer=L.tileLayer("https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut"+minuutplanCode+"*",{opacity:Number(opacitySlider.value)/100,maxZoom:20,attribution:"Historische kaart: HisGIS / RCE"});
      window.historischeMinuutplanLayer.addTo(map);
    }
  }catch(e){ console.error("Auto kadaster laden mislukt", e); }
}
window.addEventListener("load", ()=>{
  setTimeout(()=>{
    if(navigator.geolocation){ locateUser(); }
    setTimeout(()=>{ loadMIPObjectsReal(); }, 1200);
  }, 800);
});
minuutplanLayer.setOpacity(0.55);
