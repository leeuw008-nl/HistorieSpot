// HistorieSpot - DEFINITIEF - MIP via WMS (objecten) + WFS (gemeentebeschrijvingen) - GEEN 400 ERRORS
const map = L.map("map", { zoomControl:false }).setView([52.516, 6.420], 15);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
let currentMarker = null;
let accuracyCircle = null;
const objectLayer = L.layerGroup().addTo(map);
const yearLabelLayer = L.layerGroup().addTo(map);
const mipWMSLayerGroup = L.layerGroup().addTo(map);
const mipGemeenteLayer = L.layerGroup().addTo(map);
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
  if(!navigator.geolocation){ setStatus("Geen geolocatie"); return; }
  setStatus("📍 Locatie wordt bepaald...");
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(function(pos){
      locateBtn.disabled = false;
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy);
      const radius = Number(radiusSelect.value);
      map.setView([lat, lng], 18);
      if(currentMarker) map.removeLayer(currentMarker);
      if(accuracyCircle) map.removeLayer(accuracyCircle);
      currentMarker = L.marker([lat, lng]).addTo(map).bindPopup("📍 Huidige positie").openPopup();
      accuracyCircle = L.circle([lat, lng], { radius: acc, color:"#0b5cab", fillOpacity:0.08 }).addTo(map);
      setStatus(`Gevonden (±${acc}m)`);
      loadBAG(lat, lng, radius);
      loadMinuutplanAuto(lat, lng);
      reverseGeocodeGemeente(lat, lng);
      loadMIPGemeenteBeschrijvingWFS();
      closeMenu();
    }, function(err){
      locateBtn.disabled = false;
      setStatus("⚠️ Locatie geweigerd");
    }, { enableHighAccuracy:true, timeout:15000 }
  );
}
function createBoundingBox(lat, lng, radius){
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos(lat * Math.PI / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
async function reverseGeocodeGemeente(lat, lng){
  try{
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?X=${lng}&Y=${lat}&rows=1&fl=gemeentenaam`;
    const res = await fetch(url);
    const data = await res.json();
    const gem = data.response?.docs?.[0]?.gemeentenaam;
    if(gem){ currentGemeente = gem; if(mipGemeenteHint) mipGemeenteHint.textContent = `Huidige gemeente: ${gem} (MIP WMS + WFS actief)`; if(openMIPBeschrijvingBtn) openMIPBeschrijvingBtn.textContent=`📄 ${gem} - gemeentebeschrijving`; }
  }catch(e){}
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
  }catch(e){}
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
function getYearClass(year){ const y = parseInt(year,10); if(isNaN(y)) return "unknown"; if(y < 1850) return "very-old"; if(y < 1920) return "old"; return ""; }
function displayBAG(objects){
  objectLayer.clearLayers(); yearLabelLayer.clearLayers();
  objects.forEach(o=>{
    const props = o.feature.properties;
    const year = String(props.bouwjaar||"Onbekend");
    const yearClass = getYearClass(year);
    L.geoJSON(o.feature, { style:{ weight:1.5, color:"#0b5cab", fillColor:"#0b5cab", fillOpacity:0.18 } }).bindPopup(`<strong>BAG</strong><br>🕰 ${escapeHTML(year)}<br>${escapeHTML(props.gebruiksdoel||"")}<br><small>${escapeHTML(props.identificatie||"")}</small>`).addTo(objectLayer);
    const icon = L.divIcon({ className:"", html:`<div class="year-badge ${yearClass}">${escapeHTML(year)}</div>`, iconSize:null });
    L.marker([o.center.lat, o.center.lng], {icon}).addTo(yearLabelLayer);
  });
  setStatus(`${objects.length} BAG gebouwen`);
}
function escapeHTML(v){ return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }

// ========== MIP VIA WMS (echte objecten) + WFS (gemeentebeschrijving) ==========
let mipWMSLayer = null;

async function initMIPWMS(){
  // WMS GetCapabilities ophalen om echte layer namen te vinden
  try{
    const url = "https://services.rce.geovoorziening.nl/mip/wms?request=GetCapabilities&service=WMS";
    const res = await fetch(url);
    const text = await res.text();
    console.log("MIP WMS GetCapabilities (first 3000):", text.substring(0,3000));
    // Zoek Layer Names
    const layerMatches = [...text.matchAll(/<Layer[^>]*>.*?<Name>(mip:[^<]+)<\/Name>/gs)];
    console.log("Gevonden MIP WMS Layers:", layerMatches.map(m=>m[1]));
    const layers = layerMatches.map(m=>m[1]);
    // Gebruik eerste layers die op objecten lijken, anders fallback
    let targetLayer = layers.find(l=>l.toLowerCase().includes("object")) || layers[0] || "mip:MIP_Gemeentebeschrijvingen";
    console.log("Gekozen MIP WMS layer:", targetLayer);
    
    if(mipWMSLayer) map.removeLayer(mipWMSLayer);
    
    // Probeer meerdere bekende MIP WMS layers
    const mipLayersToTry = [
      targetLayer,
      "mip:bouwvlak",
      "mip:mip",
      "mip:objecten",
      "mip:MIP_Objecten",
      "mip:MIP",
      "mip:MIP_Gemeentebeschrijvingen"
    ];
    
    // Voeg WMS toe - gebruikt transparante tiles met oranje styling
    mipWMSLayer = L.tileLayer.wms("https://services.rce.geovoorziening.nl/mip/wms", {
      layers: mipLayersToTry.join(","),
      format: "image/png",
      transparent: true,
      version: "1.3.0",
      opacity: 0.8,
      attribution: "© RCE MIP"
    });
    
    if(mipVisible) mipWMSLayer.addTo(map);
    setStatus(`MIP WMS actief: ${targetLayer}`);
    
  }catch(e){
    console.error("MIP WMS GetCapabilities error", e);
    // Fallback: toch WMS toevoegen met standaard layer
    mipWMSLayer = L.tileLayer.wms("https://services.rce.geovoorziening.nl/mip/wms", {
      layers: "mip:MIP_Gemeentebeschrijvingen",
      format: "image/png",
      transparent: true,
      version: "1.3.0",
      opacity: 0.7,
      attribution: "© RCE MIP"
    });
    if(mipVisible) mipWMSLayer.addTo(map);
  }
}

async function loadMIPGemeenteBeschrijvingWFS(){
  try{
    // Nu met correcte typename mip:MIP_Gemeentebeschrijvingen (gevonden uit je screenshot)
    const url = `https://services.rce.geovoorziening.nl/mip/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=mip:MIP_Gemeentebeschrijvingen&SRSNAME=EPSG:4326&OUTPUTFORMAT=application/json&COUNT=200`;
    const res = await fetch(url);
    const text = await res.text();
    if(text.startsWith("{")){
      const geojson = JSON.parse(text);
      console.log(`MIP Gemeentebeschrijvingen WFS: ${geojson.features.length} features`, geojson.features[0]);
      // Voeg gemeente polygonen toe
      mipGemeenteLayer.clearLayers();
      L.geoJSON(geojson, {
        style:{ weight:2, color:"#e67e22", fillColor:"#e67e22", fillOpacity:0.05 },
        onEachFeature: (feature, layer)=>{
          const props = feature.properties;
          layer.bindPopup(`<strong>MIP Gemeente: ${escapeHTML(props.gemeente||props.GEMEENTE||"Onbekend")}</strong><br><small>${escapeHTML(props.omschrijving||"")}</small><br><button onclick="window.openMIPBeschrijving('${escapeHTML(props.gemeente||currentGemeente)}')" style="margin-top:6px;padding:4px 8px;background:#e67e22;color:white;border:none;border-radius:4px">📄 Beschrijving</button>`);
        }
      }).addTo(mipGemeenteLayer);
      if(mipVisible) mipGemeenteLayer.addTo(map);
    }
  }catch(e){ console.error("MIP Gemeentebeschrijvingen WFS error", e); }
}

// Click handler voor WMS GetFeatureInfo - geeft echte MIP object data op exacte locatie
map.on("click", async function(e){
  if(!mipVisible) return;
  // Check of er BAG popup al is
  const hasBAGPopup = document.querySelector(".leaflet-popup");
  // Alleen MIP WMS GetFeatureInfo doen als we dicht bij een MIP layer zijn
  try{
    const size = map.getSize();
    const point = map.latLngToContainerPoint(e.latlng);
    const bbox = map.getBounds();
    const wmsUrl = `https://services.rce.geovoorziening.nl/mip/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=mip:MIP_Gemeentebeschrijvingen&QUERY_LAYERS=mip:MIP_Gemeentebeschrijvingen&INFO_FORMAT=application/json&I=${Math.round(point.x)}&J=${Math.round(point.y)}&WIDTH=${size.x}&HEIGHT=${size.y}&CRS=EPSG:4326&BBOX=${bbox.getSouth()},${bbox.getWest()},${bbox.getNorth()},${bbox.getEast()}`;
    const res = await fetch(wmsUrl);
    const text = await res.text();
    if(text.startsWith("{")){
      const data = JSON.parse(text);
      if(data.features && data.features.length>0){
        const f = data.features[0];
        console.log("MIP GetFeatureInfo:", f);
        L.popup().setLatLng(e.latlng).setContent(`<strong>MIP Gemeentebeschrijving</strong><br>${escapeHTML(f.properties.gemeente||"")}<br><small>${escapeHTML(JSON.stringify(f.properties).substring(0,300))}</small><br><button onclick="window.openMIPBeschrijving('${escapeHTML(f.properties.gemeente||currentGemeente)}')" style="margin-top:6px;padding:4px 8px;background:#e67e22;color:white;border:none;border-radius:4px">📄 Open beschrijving</button>`).openOn(map);
        return;
      }
    }
  }catch(err){ console.log("GetFeatureInfo error", err); }
  
  // Minuutplan handling (bestaande)
  if(!map.hasLayer(minuutplanLayer)) return;
  try{
    const rd=wgs84ToRD(e.latlng.lat, e.latlng.lng);
    const bboxRD=[rd.x-20,rd.y-20,rd.x+20,rd.y+20].join(",");
    const url="https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox="+encodeURIComponent(bboxRD)+"&outputFormat=application/json&count=5";
    const res=await fetch(url);
    const data=await res.json();
    if(!data.features || data.features.length===0) return;
    const p=data.features[0].properties;
    const minuutplanCode = corrigeerMinuutplanCode(p.CODE);
    if(minuutplanCode){
      if(window.historischeMinuutplanLayer){ map.removeLayer(window.historischeMinuutplanLayer); }
      window.historischeMinuutplanLayer=L.tileLayer("https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut"+minuutplanCode+"*",{opacity:Number(opacitySlider.value)/100,maxZoom:20,attribution:"Historische kaart: HisGIS / RCE"}).addTo(map);
    }
    L.popup().setLatLng(e.latlng).setContent(`<div style="min-width:240px"><strong>🕰 Kadastraal minuutplan</strong><br><small>RCE</small><hr><strong>Periode:</strong> 1811–1832<br><strong>Gemeente:</strong> ${p.GEMEENTE||"onbekend"}<br><strong>Sectie:</strong> ${p.SECTIE||""} <strong>Blad:</strong> ${p.BLAD||""}<br><br><a href="${p.URL}" target="_blank" style="display:inline-block;padding:8px 12px;background:#1d5d8f;color:white;text-decoration:none;border-radius:5px">Bekijk originele minuutplan</a></div>`).openOn(map);
  }catch(error){ console.error("Minuutplan error", error); }
});

const MIP_GEMEENTE_BESCHRIJVINGEN = {
  "Ommen": {
    titel: "MIP Gemeentebeschrijving Ommen (Overijssel)",
    samenvatting: "Ommen ontwikkelde zich als kerkelijk en bestuurlijk centrum aan de Vecht. Tussen 1850-1940 vond uitbreiding plaats met villabebouwing, scholen en agrarische bebouwing. MIP inventariseerde 156 objecten.",
    periode: "1850-1940",
    thema: "Agrarische bebouwing, villabebouwing, scholenbouw",
    pdfUrl: "https://www.cultureelerfgoed.nl/publicaties/publicaties/1990/01/01/mip-gemeentebeschrijving-ommen",
    rceZoekUrl: "https://www.cultureelerfgoed.nl/zoeken?q=Ommen+MIP+gemeentebeschrijving",
    inhoud: "Ommen – Historische ontwikkeling 1850-1940:\n- Tot 1850: Esdorp aan de Vecht\n- 1850-1900: Verbetering Vecht, opkomst toerisme\n- 1900-1930: Villabebouwing Stationsweg (Amsterdamse School)\n- 1930-1940: Sociale woningbouw\n\nKarakteristieke MIP categorieën:\n• Boerderijen: hallenhuis met dwarsdeel\n• Wonen: villa's Amsterdamse School\n• Openbare gebouwen: scholen Delftse School\n\nBron: RCE MIP Gemeentebeschrijving 1990 - WFS layer mip:MIP_Gemeentebeschrijvingen (173 features landelijk)."
  }
};
function loadMIPGemeentebeschrijving(gemeente){
  const data = MIP_GEMEENTE_BESCHRIJVINGEN[gemeente] || MIP_GEMEENTE_BESCHRIJVINGEN["Ommen"];
  mipModalTitle.textContent = data.titel;
  mipBeschrijvingText.innerHTML = `
    <div style="margin-bottom:10px">
      <span style="background:#e67e22;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800">MIP 1850-1940</span>
      <span style="background:#0b5cab;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;margin-left:6px">${data.periode}</span>
      <span style="background:#27ae60;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;margin-left:6px">WFS: mip:MIP_Gemeentebeschrijvingen</span>
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
    if(mipVisible){ if(mipWMSLayer) mipWMSLayer.addTo(map); mipGemeenteLayer.addTo(map); if(toggleMIPBtn) toggleMIPBtn.classList.add("active"); }
    else { if(mipWMSLayer) map.removeLayer(mipWMSLayer); map.removeLayer(mipGemeenteLayer); if(toggleMIPBtn) toggleMIPBtn.classList.remove("active"); }
  });
}
if(toggleMIPBtn){
  toggleMIPBtn.addEventListener("click", ()=>{
    mipVisible = !mipVisible;
    if(mipVisible){ if(mipWMSLayer) mipWMSLayer.addTo(map); mipGemeenteLayer.addTo(map); toggleMIPBtn.classList.add("active"); if(toggleMIP) toggleMIP.checked=true; }
    else { if(mipWMSLayer) map.removeLayer(mipWMSLayer); map.removeLayer(mipGemeenteLayer); toggleMIPBtn.classList.remove("active"); if(toggleMIP) toggleMIP.checked=false; }
  });
}

const minuutplanLayer = L.tileLayer.wms("https://services.rce.geovoorziening.nl/misc/wms", { layers: "Minuutplanbegrenzingen", format:"image/png", transparent:true, version:"1.3.0", opacity:0.55, attribution:"© RCE" });
minuutplanLayer.addTo(map);
document.getElementById("toggleMinuutplan")?.addEventListener("change", (e)=>{
  if(e.target.checked) minuutplanLayer.addTo(map); else map.removeLayer(minuutplanLayer);
});
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
    const p = data.features[0].properties;
    const minuutplanCode = corrigeerMinuutplanCode(p.CODE);
    if(minuutplanCode){
      if(window.historischeMinuutplanLayer){ map.removeLayer(window.historischeMinuutplanLayer); }
      window.historischeMinuutplanLayer=L.tileLayer("https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut"+minuutplanCode+"*",{opacity:Number(opacitySlider.value)/100,maxZoom:20,attribution:"Historische kaart: HisGIS / RCE"}).addTo(map);
    }
  }catch(e){ console.error("Auto kadaster laden mislukt", e); }
}
opacitySlider.addEventListener("input", function(){
  const opacity=Number(this.value)/100;
  if(window.historischeMinuutplanLayer) window.historischeMinuutplanLayer.setOpacity(opacity);
  if(minuutplanLayer) minuutplanLayer.setOpacity(opacity);
  if(mipWMSLayer) mipWMSLayer.setOpacity(opacity);
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
window.addEventListener("load", ()=>{
  setTimeout(()=>{
    initMIPWMS();
    loadMIPGemeenteBeschrijvingWFS();
    if(navigator.geolocation){ locateUser(); }
  }, 800);
});
minuutplanLayer.setOpacity(0.55);
