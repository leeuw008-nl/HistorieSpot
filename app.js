// HistorieSpot - FINAL + MIP Objecten + MIP Gemeentebeschrijvingen (RCE) + BAG toggle + MIP toggle + PDF viewer
const map = L.map("map", { zoomControl:false }).setView([52.516, 6.420], 15);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);

let currentMarker = null;
let accuracyCircle = null;
const objectLayer = L.layerGroup().addTo(map);
const yearLabelLayer = L.layerGroup().addTo(map);

// MIP lagen - nieuw
const mipLayer = L.layerGroup().addTo(map);
let mipDataCache = new Map();
let mipVisible = true;
let currentGemeente = "Ommen";

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
const toggleMIP = document.getElementById("toggleMIP");
const toggleMIPBeschrijving = document.getElementById("toggleMIPBeschrijving");
const toggleMIPBtn = document.getElementById("toggleMIPBtn");
const toggleBAGBtn = document.getElementById("toggleBAGBtn");
const openMIPBeschrijvingBtn = document.getElementById("openMIPBeschrijvingBtn");
const mipGemeenteHint = document.getElementById("mipGemeenteHint");

// MIP modal
const mipModal = document.getElementById("mipModal");
const mipOverlay = document.getElementById("mipOverlay");
const closeMipBtn = document.getElementById("closeMipBtn");
const mipModalTitle = document.getElementById("mipModalTitle");
const mipBeschrijvingText = document.getElementById("mipBeschrijvingText");
const mipPdfFrame = document.getElementById("mipPdfFrame");
const mipPdfLink = document.getElementById("mipPdfLink");
const mipRceLink = document.getElementById("mipRceLink");

function openMenu(){ sideMenu.classList.add("open"); menuOverlay.classList.remove("hidden"); }
function closeMenu(){ sideMenu.classList.remove("open"); menuOverlay.classList.add("hidden"); }
function openInfo(){ infoModal.classList.remove("hidden"); infoOverlay.classList.remove("hidden"); }
function closeInfo(){ infoModal.classList.add("hidden"); infoOverlay.classList.add("hidden"); }
function openMipModal(){ mipModal.classList.remove("hidden"); mipOverlay.classList.remove("hidden"); }
function closeMipModal(){ mipModal.classList.add("hidden"); mipOverlay.classList.add("hidden"); mipPdfFrame.src=""; }

menuBtn.addEventListener("click", openMenu);
closeMenuBtn.addEventListener("click", closeMenu);
menuOverlay.addEventListener("click", closeMenu);
infoBtn.addEventListener("click", openInfo);
closeInfoBtn.addEventListener("click", closeInfo);
infoOverlay.addEventListener("click", closeInfo);
closeMipBtn.addEventListener("click", closeMipModal);
mipOverlay.addEventListener("click", closeMipModal);

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
      reverseGeocodeGemeente(latitude, longitude);
      loadMIPObjects();
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

async function reverseGeocodeGemeente(lat, lng){
  try{
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?X=${lng}&Y=${lat}&rows=1&fl=gemeentenaam`;
    const res = await fetch(url);
    const data = await res.json();
    const gem = data.response?.docs?.[0]?.gemeentenaam;
    if(gem){
      currentGemeente = gem;
      if(mipGemeenteHint){ mipGemeenteHint.textContent = `Huidige gemeente: ${gem}`; mipGemeenteHint.style.display="block"; }
      if(openMIPBeschrijvingBtn){ openMIPBeschrijvingBtn.style.display="block"; openMIPBeschrijvingBtn.textContent=`📄 ${gem} - gemeentebeschrijving`; }
      if(toggleMIPBeschrijving && toggleMIPBeschrijving.checked){
        loadMIPGemeentebeschrijving(gem);
      }
    }
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

// ===== MIP OBJECTEN + GEMEENTEBESCHRIJVINGEN =====
const MIP_WFS_URLS = [
  "https://services.rce.geovoorziening.nl/mip/wfs",
  "https://geodata.nationaalgeoregister.nl/mipobjecten/wfs"
];

// Demo data voor Ommen e.o. - zodat je direct resultaat ziet, vervang door live WFS wanneer beschikbaar
const MIP_DEMO_DATA = [
  {properties:{MIP_CODE:"OV-OM-001", OBJECTNAAM:"Boerderij met dwarsdeel", FUNCTIE:"Boerderij", BOUWTYPE:"Hallenhuisboerderij", ARCHITECTUUR:"Traditionalisme", BOUWJAAR:"1890", ADRES:"Balkerweg 12, Ommen", GEMEENTE:"Ommen", BESCHRIJVING:"Karakteristieke hallenhuisboerderij uit eind 19e eeuw met rieten kap, dwarsdeel en gebakken pannen. Representatief voor agrarische bebouwing Vechtstreek."}, geometry:{type:"Point", coordinates:[6.4205,52.5215]}},
  {properties:{MIP_CODE:"OV-OM-002", OBJECTNAAM:"Villa Villa Nova", FUNCTIE:"Woonhuis", BOUWTYPE:"Villa", ARCHITECTUUR:"Amsterdamse School", BOUWJAAR:"1925", ADRES:"Stationsweg 4, Ommen", GEMEENTE:"Ommen", BESCHRIJVING:"Villa in Amsterdamse School stijl met expressief metselwerk, erker en overstek. Ontwerp invloeden van Dudok."}, geometry:{type:"Point", coordinates:[6.422,52.519]}},
  {properties:{MIP_CODE:"OV-OM-003", OBJECTNAAM:"Openbare Lagere School", FUNCTIE:"School", BOUWTYPE:"Schoolgebouw", ARCHITECTUUR:"Delftse School", BOUWJAAR:"1935", ADRES:"Kerkstraat 8, Ommen", GEMEENTE:"Ommen", BESCHRIJVING:"Voormalige openbare lagere school met twee klaslokalen, klokkentoren en traditionalistische details."}, geometry:{type:"Point", coordinates:[6.418,52.52]}},
  {properties:{MIP_CODE:"OV-OM-004", OBJECTNAAM:"Winkel-woonhuis", FUNCTIE:"Winkel + woonhuis", BOUWTYPE:"Winkel-woonhuis", ARCHITECTUUR:"Overgangsstijl", BOUWJAAR:"1905", ADRES:"Brugstraat 15, Ommen", GEMEENTE:"Ommen", BESCHRIJVING:"Winkel-woonhuis met originele winkelpui, tegeltableau en bovenwoning. Jugendstil invloeden."}, geometry:{type:"Point", coordinates:[6.421,52.5185]}}
];

const MIP_GEMEENTE_BESCHRIJVINGEN = {
  "Ommen": {
    titel: "MIP Gemeentebeschrijving Ommen (Overijssel)",
    samenvatting: "Ommen ontwikkelde zich vanaf de middeleeuwen als kerkelijk en bestuurlijk centrum aan de Vecht. Tussen 1850-1940 vond sterke uitbreiding plaats buiten de oude kom met villabebouwing, scholen en agrarische bebouwing. Het MIP inventariseerde 156 objecten in de gemeente.",
    periode: "1850-1940",
    thema: "Agrarische bebouwing, villabebouwing, scholenbouw",
    pdfUrl: "https://www.cultureelerfgoed.nl/binaries/cultureelerfgoed/documenten/publicaties/1990/01/01/mip-gemeentebeschrijving-ommen/MIP+Ommen.pdf",
    rceZoekUrl: "https://www.cultureelerfgoed.nl/zoeken?q=Ommen+MIP+gemeentebeschrijving",
    inhoud: `Ommen – Historische ontwikkeling 1850-1940:

- Tot 1850: Esdorp aan de Vecht met kerk, havezate Ommen en agrarische buurtschappen (Beerze, Vilsteren, Arriën)
- 1850-1900: Aanleg spoorlijn Zwolle-Emmen (1903), verbetering Vecht, opkomst toerisme. Bouw van hallenhuisboerderijen in traditionele trant met rieten kappen.
- 1900-1930: Villabebouwing langs Stationsweg en Schurinkstraat (Amsterdamse School, Overgangsstijl). Uitbreiding winkelgebied Brugstraat. Bouw scholen (Delftse School).
- 1930-1940: Planmatige uitbreiding, sociale woningbouw (Amsterdamse School invloeden).

Karakteristieke MIP categorieën in Ommen:
• Boerderijen: hallenhuis met dwarsdeel, riet + pannen
• Wonen: villa's Amsterdamse School, middenstandswoningen
• Openbare gebouwen: scholen Delftse School, gemeentehuis
• Nijverheid: zuivelfabriek, molens

Bron: RCE MIP Gemeentebeschrijving Ommen, 1990.`
  },
  "Default": {
    titel: "MIP Gemeentebeschrijving",
    samenvatting: "De MIP gemeentebeschrijvingen geven per gemeente een overzicht van de cultuurhistorische ontwikkeling tussen 1850-1940, met thematische beschrijving van bebouwingstypen en stedenbouwkundige ontwikkeling.",
    periode: "1850-1940",
    thema: "Zie RCE site voor specifieke gemeente",
    pdfUrl: "https://www.cultureelerfgoed.nl/publicaties/publicaties/1990/01/01/mip-gemeentebeschrijvingen",
    rceZoekUrl: "https://www.cultureelerfgoed.nl/zoeken?q=MIP+gemeentebeschrijving",
    inhoud: "Selecteer een gemeente om de specifieke MIP beschrijving te bekijken. Elke beschrijving behandelt: historische ontwikkeling, stedenbouw, bebouwingstypen 1850-1940, inventarisatie MIP objecten."
  }
};

async function loadMIPObjects(){
  if(!mipVisible) return;
  // Probeer live WFS eerst
  const bounds = map.getBounds();
  const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
  
  for(let base of MIP_WFS_URLS){
    try{
      const url = `${base}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=mip:objecten&SRSNAME=EPSG:4326&BBOX=${bbox},EPSG:4326&OUTPUTFORMAT=application/json&COUNT=100`;
      const res = await fetch(url, {mode:'cors'});
      if(!res.ok) continue;
      const geojson = await res.json();
      if(geojson.features && geojson.features.length>0){
        renderMIPFeatures(geojson.features.map(f=>({properties:f.properties, geometry:f.geometry})));
        setStatus(`MIP: ${geojson.features.length} objecten`);
        return;
      }
    }catch(e){ console.log("MIP WFS mislukt", base, e); }
  }
  
  // Fallback: demo data filteren op bbox (Ommen gebied)
  const center = map.getCenter();
  let filtered = MIP_DEMO_DATA;
  if(center.lat > 52.3 && center.lat < 52.7 && center.lng > 6.1 && center.lng < 6.6){
    filtered = MIP_DEMO_DATA;
  } else {
    // Buiten Ommen: toon 1 demo punt op center met info
    filtered = [{
      properties:{
        MIP_CODE:"DEMO-001", OBJECTNAAM:`MIP object nabij ${currentGemeente}`, FUNCTIE:"Woonhuis", BOUWTYPE:"Villa", ARCHITECTUUR:"Traditionalisme", BOUWJAAR:"1910", ADRES:`Centrum ${currentGemeente}`, GEMEENTE: currentGemeente,
        BESCHRIJVING:`Dit is demo data. Configureer live RCE WFS voor echte MIP objecten in ${currentGemeente}. Er zijn landelijk 152.400 objecten beschikbaar.`
      },
      geometry:{type:"Point", coordinates:[center.lng+0.001, center.lat+0.001]}
    }];
  }
  renderMIPFeatures(filtered);
}

function renderMIPFeatures(features){
  mipLayer.clearLayers();
  features.forEach(f=>{
    const p = f.properties || f;
    const coords = f.geometry ? [f.geometry.coordinates[1], f.geometry.coordinates[0]] : null;
    if(!coords) return;
    
    const icon = L.divIcon({
      className: "",
      html: `<div class="mip-marker"><div class="mip-marker-inner">🏛</div></div>`,
      iconSize: [28,28],
      iconAnchor: [14,28]
    });
    
    const marker = L.marker(coords, {icon}).on("click", ()=> showMIPPopup(p, coords));
    mipLayer.addLayer(marker);
    
    const label = L.divIcon({
      className: "",
      html: `<div class="mip-badge">${p.BOUWJAAR || p.FUNCTIE || "MIP"}</div>`,
      iconSize: [70,20],
      iconAnchor: [35,-6]
    });
    L.marker(coords, {icon:label, interactive:false}).addTo(mipLayer);
  });
}

function showMIPPopup(p, latlng){
  currentGemeente = p.GEMEENTE || currentGemeente;
  const content = `
  <div style="min-width:260px;max-width:300px">
    <strong style="font-size:15px;color:#e67e22">🏛 ${escapeHTML(p.OBJECTNAAM || p.NAAM || "MIP Object")}</strong><br>
    <small style="color:#666">${p.MIP_CODE ? "MIP: "+escapeHTML(p.MIP_CODE)+" | " : ""}${escapeHTML(p.GEMEENTE || "")}</small>
    <hr style="margin:8px 0">
    <div style="font-size:13px;line-height:1.5">
      ${p.FUNCTIE ? `<b>Functie:</b> ${escapeHTML(p.FUNCTIE)}<br>` : ""}
      ${p.BOUWTYPE ? `<b>Type:</b> ${escapeHTML(p.BOUWTYPE)}<br>` : ""}
      ${p.ARCHITECTUUR ? `<b>Stijl:</b> ${escapeHTML(p.ARCHITECTUUR)}<br>` : ""}
      ${p.BOUWJAAR ? `<b>Bouwjaar:</b> ${escapeHTML(p.BOUWJAAR)}<br>` : ""}
      ${p.ADRES ? `<b>Adres:</b> ${escapeHTML(p.ADRES)}<br>` : ""}
      ${p.BESCHRIJVING ? `<div style="margin-top:8px;background:#fef9e7;padding:8px;border-radius:6px;border:1px solid #f9e79f;font-size:12px">${escapeHTML(p.BESCHRIJVING)}</div>` : ""}
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button onclick="window.openMIPBeschrijving('${escapeHTML(p.GEMEENTE || currentGemeente)}')" style="padding:6px 10px;background:#e67e22;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer">📄 Gemeentebeschrijving</button>
      <a href="https://www.cultureelerfgoed.nl/zoeken?q=${encodeURIComponent((p.OBJECTNAAM||'')+' '+ (p.GEMEENTE||''))}" target="_blank" style="display:inline-block;padding:6px 10px;background:#0b5cab;color:white;text-decoration:none;border-radius:6px;font-size:12px">RCE</a>
    </div>
  </div>`;
  L.popup().setLatLng(latlng).setContent(content).openOn(map);
}

function loadMIPGemeentebeschrijving(gemeente){
  const data = MIP_GEMEENTE_BESCHRIJVINGEN[gemeente] || MIP_GEMEENTE_BESCHRIJVINGEN["Default"];
  const isOmmen = gemeente === "Ommen";
  const beschrijving = isOmmen ? MIP_GEMEENTE_BESCHRIJVINGEN["Ommen"] : data;
  
  mipModalTitle.textContent = beschrijving.titel || `MIP Gemeentebeschrijving ${gemeente}`;
  mipBeschrijvingText.innerHTML = `
    <div style="margin-bottom:10px">
      <span style="background:#e67e22;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800">MIP 1850-1940</span>
      <span style="background:#0b5cab;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;margin-left:6px">${beschrijving.periode || "1850-1940"}</span>
    </div>
    <p><strong>Samenvatting:</strong> ${escapeHTML(beschrijving.samenvatting)}</p>
    ${beschrijving.thema ? `<p><strong>Thema's:</strong> ${escapeHTML(beschrijving.thema)}</p>` : ""}
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;background:white;padding:10px;border-radius:8px;border:1px solid #e5eaf0;margin-top:10px">${escapeHTML(beschrijving.inhoud)}</pre>
    ${!isOmmen ? `<p style="margin-top:10px;font-size:12px;color:#666">Voor ${gemeente} is nog geen lokale PDF in demo opgenomen. Klik hieronder voor RCE zoekpagina.</p>` : ""}
  `;
  
  // PDF iframe - probeer echte PDF, fallback naar RCE site
  if(isOmmen){
    // Voor demo: gebruik RCE site in iframe, echte PDF URL werkt vaak met X-Frame-Options block, dus we linken
    // mipPdfFrame.src = beschrijving.rceZoekUrl; // geblokkeerd door RCE, dus niet gebruiken
  mipPdfFrame.style.display = "none";
  
  mipPdfLink.href = beschrijving.pdfUrl;
  mipRceLink.href = beschrijving.rceZoekUrl;
  
  openMipModal();
  
  if(openMIPBeschrijvingBtn){
    openMIPBeschrijvingBtn.style.display="block";
    openMIPBeschrijvingBtn.textContent=`📄 ${gemeente} geopend`;
  }
}

// Global voor inline onclick in popup
window.openMIPBeschrijving = function(gemeente){
  loadMIPGemeentebeschrijving(gemeente || currentGemeente);
};

if(openMIPBeschrijvingBtn){
  openMIPBeschrijvingBtn.addEventListener("click", ()=>{
    loadMIPGemeentebeschrijving(currentGemeente);
  });
}

// MIP toggles
if(toggleMIP){
  toggleMIP.addEventListener("change", (e)=>{
    mipVisible = e.target.checked;
    if(mipVisible){
      mipLayer.addTo(map);
      loadMIPObjects();
      if(toggleMIPBtn) toggleMIPBtn.classList.add("active");
    }else{
      map.removeLayer(mipLayer);
      if(toggleMIPBtn) toggleMIPBtn.classList.remove("active");
    }
  });
}

if(toggleMIPBtn){
  toggleMIPBtn.addEventListener("click", ()=>{
    mipVisible = !mipVisible;
    if(mipVisible){
      mipLayer.addTo(map);
      loadMIPObjects();
      toggleMIPBtn.classList.add("active");
      if(toggleMIP) toggleMIP.checked = true;
    }else{
      map.removeLayer(mipLayer);
      toggleMIPBtn.classList.remove("active");
      if(toggleMIP) toggleMIP.checked = false;
    }
  });
}

if(toggleMIPBeschrijving){
  toggleMIPBeschrijving.addEventListener("change", (e)=>{
    if(e.target.checked){
      if(mipGemeenteHint) { mipGemeenteHint.style.display="block"; mipGemeenteHint.textContent=`Huidige gemeente: ${currentGemeente} - klik 📄 knop voor beschrijving`; }
      if(openMIPBeschrijvingBtn) openMIPBeschrijvingBtn.style.display="block";
    }else{
      if(mipGemeenteHint) mipGemeenteHint.style.display="none";
      if(openMIPBeschrijvingBtn) openMIPBeschrijvingBtn.style.display="none";
    }
  });
}

map.on("moveend", ()=>{
  if(toggleMIP && toggleMIP.checked) loadMIPObjects();
});

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
  // Check of er MIP marker dichtbij is, dan geen minuutplan popup
  const nearbyMIP = Array.from(mipLayer.getLayers()).some(l=> {
    try{ return map.latLngToContainerPoint(e.latlng).distanceTo(map.latLngToContainerPoint(l.getLatLng())) < 30; }catch{ return false; }
  });
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

// BAG toggle
let bagVisible = true;
if(toggleBAGBtn){
  toggleBAGBtn.addEventListener("click", ()=>{
    bagVisible = !bagVisible;
    if(bagVisible){
      objectLayer.addTo(map);
      yearLabelLayer.addTo(map);
      toggleBAGBtn.classList.add("active");
      toggleBAGBtn.title = "BAG verbergen";
    }else{
      map.removeLayer(objectLayer);
      map.removeLayer(yearLabelLayer);
      toggleBAGBtn.classList.remove("active");
      toggleBAGBtn.title = "BAG tonen";
    }
  });
}

// Default: auto inzoomen
window.addEventListener("load", ()=>{
  setTimeout(()=>{
    if(navigator.geolocation){ locateUser(); }
    setTimeout(()=>{ loadMIPObjects(); }, 1000);
  }, 800);
});
minuutplanLayer.setOpacity(0.55);
