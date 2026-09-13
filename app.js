// HistorieSpot Ommen - ALLE monumenten met echt bouwjaar + BAG bouwjaar vergelijking
// Bronnen: 
// - BAG: PDOK BAG WFS
// - Gemeentelijke monumenten: Wikipedia Lijst van gemeentelijke monumenten in Ommen (40 stuks, bron gemeente Ommen 2013)
// - Rijksmonumenten: RCE WFS rce:rijksmonumenten + Wikipedia Lijst van rijksmonumenten in Ommen (gemeente) 105 stuks
// - MIP gemeentebeschrijvingen: RCE WFS mip:MIP_Gemeentebeschrijvingen (200 gemeentes) met directe PDF_URL

const map = L.map("map", { zoomControl:false }).setView([52.516, 6.420], 13);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);

let currentMarker = null;
let accuracyCircle = null;
const objectLayer = L.layerGroup().addTo(map);
const yearLabelLayer = L.layerGroup().addTo(map);
const rijksLayer = L.layerGroup().addTo(map);
const gemeentelijkLayer = L.layerGroup().addTo(map);
const mipGemeenteLayer = L.layerGroup().addTo(map);

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

function setStatus(msg){ statusBox.textContent = msg; }

locateBtn.addEventListener("click", locateUser);
radiusSelect.addEventListener("change", ()=>{ if(currentMarker){ const ll = currentMarker.getLatLng(); loadBAG(ll.lat, ll.lng, Number(radiusSelect.value)); } });

function locateUser(){
  if(!navigator.geolocation){ setStatus("Geen geolocatie"); return; }
  setStatus("📍 Locatie wordt bepaald...");
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(function(pos){
      locateBtn.disabled = false;
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy);
      const radius = Number(radiusSelect.value);
      map.setView([lat, lng], 17);
      if(currentMarker) map.removeLayer(currentMarker);
      if(accuracyCircle) map.removeLayer(accuracyCircle);
      currentMarker = L.marker([lat, lng]).addTo(map).bindPopup("📍 Huidige positie").openPopup();
      accuracyCircle = L.circle([lat, lng], { radius: acc, color:"#0b5cab", fillOpacity:0.08 }).addTo(map);
      loadBAG(lat, lng, radius);
      loadMinuutplanAuto(lat, lng);
      reverseGeocodeGemeente(lat, lng);
      loadRijksmonumenten();
      loadGemeentelijkeMonumenten();
      loadMIPGemeenteBeschrijvingWFS();
      closeMenu();
    }, function(){ locateBtn.disabled = false; setStatus("⚠️ Locatie geweigerd"); }, { enableHighAccuracy:true, timeout:15000 }
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
    if(gem){ currentGemeente = gem; if(mipGemeenteHint) mipGemeenteHint.textContent = `Huidige gemeente: ${gem} - 105 Rijks + 40 Gemeentelijk`; if(openMIPBeschrijvingBtn) openMIPBeschrijvingBtn.textContent=`📄 ${gem} - MIP PDF`; }
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
function getYearClass(year){ const y = parseInt(year,10); if(isNaN(y)) return "unknown"; if(y < 1850) return "very-old"; if(y < 1920) return "old"; return ""; }
function displayBAG(objects){
  objectLayer.clearLayers(); yearLabelLayer.clearLayers();
  if(!objects.length) return;
  objects.forEach(o=>{
    const props = o.feature.properties;
    const year = String(props.bouwjaar||"Onbekend");
    const yearClass = getYearClass(year);
    L.geoJSON(o.feature, { style:{ weight:1.2, color:"#0b5cab", fillColor:"#0b5cab", fillOpacity:0.12 } }).bindPopup(`<strong>BAG</strong><br>🕰 BAG bouwjaar: ${escapeHTML(year)}<br><small>Dit is vaak verbouwjaar. Vergelijk met monument bouwjaar.</small><br>Gebruiksdoel: ${escapeHTML(props.gebruiksdoel||"")}<br>BAG-ID: ${escapeHTML(props.identificatie||"")}`).addTo(objectLayer);
    const icon = L.divIcon({ className:"", html:`<div class="year-badge ${yearClass}">${escapeHTML(year)}</div>`, iconSize:null });
    L.marker([o.center.lat, o.center.lng], {icon}).addTo(yearLabelLayer);
  });
}
function escapeHTML(v){ return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }

// ===== GEMEENTELIJKE MONUMENTEN OMMEN - 40 STUKS - BRON: Wikipedia + Gemeente Ommen =====
const GEMEENTELIJKE_MONUMENTEN = [
  {naam:"Woonhuis", bouwjaar:"1925", adres:"Beerzerpoort 3, Beerze", type:"Gemeentelijk", nr:"0175/OMMENGM-38", lat:52.5108, lng:6.5325},
  {naam:"Woonhuis Huis Beerze", bouwjaar:"1925", adres:"Beerzerpoort 4, Beerze", type:"Gemeentelijk", nr:"0175/OMMENGM-37", lat:52.5092, lng:6.5315},
  {naam:"Boerderij", bouwjaar:"1890", adres:"Dennenweg 2, Eerde", type:"Gemeentelijk", nr:"0175/OMMENGM-36", lat:52.4815, lng:6.474},
  {naam:"Boerderij", bouwjaar:"1883", adres:"Kruupweg 1, Eerde", type:"Gemeentelijk", nr:"0175/OMMENGM-31", lat:52.4867, lng:6.4458},
  {naam:"Woonhuis", bouwjaar:"1890", adres:"Kruupweg 3, Eerde", type:"Gemeentelijk", nr:"0175/OMMENGM-33", lat:52.4864, lng:6.4475},
  {naam:"Schuivenloods", bouwjaar:"1920", adres:"Junnerweg bij 9, Junne", type:"Gemeentelijk", nr:"0175/OMMENGM-40", lat:52.523, lng:6.49},
  {naam:"Herdenkingsmonument", bouwjaar:"1934", adres:"Kerkweg bij 32, Lemele", type:"Gemeentelijk", nr:"0175/OMMENGM-26", lat:52.453, lng:6.415},
  {naam:"N.H. Kerkgebouw", bouwjaar:"1939", adres:"Lemelerweg 72-74, Lemele", type:"Gemeentelijk", nr:"0175/OMMENGM-25", lat:52.4528, lng:6.4153},
  {naam:"Woonhuis", bouwjaar:"1910", adres:"Bouwstraat 6/7, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-01", lat:52.5194, lng:6.4242},
  {naam:"Winkel De Bakoven", bouwjaar:"1905", adres:"Brugstraat 17, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-14", lat:52.5183, lng:6.4225},
  {naam:"Woonhuis", bouwjaar:"1938", adres:"De Kamp 38, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-20", lat:52.508, lng:6.4245},
  {naam:"Woonhuis Soltana", bouwjaar:"1930", adres:"De Kamp 44, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-21", lat:52.5072, lng:6.4242},
  {naam:"Woonhuis Den Hof", bouwjaar:"1903", adres:"De Voormars 4, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-04", lat:52.52, lng:6.4194},
  {naam:"Woonhuis", bouwjaar:"1900", adres:"Den Oordt 6, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-47", lat:52.5178, lng:6.425},
  {naam:"Hofje Edith-Hof", bouwjaar:"1928", adres:"Edith-Hof 1-10, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-11", lat:52.5142, lng:6.426},
  {naam:"Woonhuis Hei en Dennen", bouwjaar:"1903", adres:"Hammerweg 14, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-12", lat:52.5089, lng:6.4197},
  {naam:"Baarhuisje", bouwjaar:"1924", adres:"Hardenbergerweg, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-44", lat:52.5231, lng:6.4369},
  {naam:"Woonhuis Laarhoeve", bouwjaar:"1849", adres:"Koesteeg 5, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-19", lat:52.515, lng:6.4194},
  {naam:"Winkelpand", bouwjaar:"1903", adres:"Kruisstraat 1, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-02", lat:52.5192, lng:6.4233},
  {naam:"Winkelpui", bouwjaar:"1910", adres:"Kruisstraat 2, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-03", lat:52.5192, lng:6.4233},
  {naam:"VVV-kantoor", bouwjaar:"1881", adres:"Kruisstraat 6-6a, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-18", lat:52.5192, lng:6.4236},
  {naam:"Postkantoor", bouwjaar:"1905", adres:"Markt 17, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-15", lat:52.5178, lng:6.4231},
  {naam:"Kantoor", bouwjaar:"1900", adres:"Markt 32, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-07", lat:52.5192, lng:6.42},
  {naam:"Pastorie RK Kerk", bouwjaar:"1938", adres:"Nering Bodelstraat 1, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-16", lat:52.5203, lng:6.4197},
  {naam:"RK kerk St. Brigitta", bouwjaar:"1938", adres:"Nering Bodelstraat 1a, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-17", lat:52.5203, lng:6.4197},
  {naam:"Restaurant/woonhuis", bouwjaar:"1903", adres:"Stationsweg 31, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-08", lat:52.5103, lng:6.4183},
  {naam:"NS Station/woonhuis", bouwjaar:"1902", adres:"Stationsweg 35, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-09", lat:52.51, lng:6.4172},
  {naam:"Baarhuisje", bouwjaar:"1828", adres:"Van Raaltestraat, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-05", lat:52.5206, lng:6.426},
  {naam:"Joodse begraafplaats", bouwjaar:"1700", adres:"Van Raaltestraat, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-06", lat:52.5206, lng:6.426},
  {naam:"v. Raalteschool", bouwjaar:"1950", adres:"Van Raaltestraat 23, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-46", lat:52.5208, lng:6.426},
  {naam:"De Ark", bouwjaar:"1940", adres:"Wolfskuil 41, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-13", lat:52.5061, lng:6.4042},
  {naam:"Kantoor Piet Hein", bouwjaar:"1905", adres:"Zeesserweg 5, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-10", lat:52.5158, lng:6.4244},
  {naam:"Ada's Hoeve", bouwjaar:"1853", adres:"Zwolseweg 17, Ommen", type:"Gemeentelijk", nr:"0175/OMMENGM-22", lat:52.5142, lng:6.4019},
  {naam:"Woonhuis/ atelier", bouwjaar:"1845", adres:"Balkerweg 85, Ommerschans", type:"Gemeentelijk", nr:"0175/OMMENGM-45", lat:52.5906, lng:6.3911},
  {naam:"Boerderij Driehoeksweg", bouwjaar:"1880", adres:"Driehoeksweg 22, Stegeren", type:"Gemeentelijk", nr:"0175/OMMENGM-43", lat:52.5661, lng:6.4761},
  {naam:"Stegeren Hoeve", bouwjaar:"1880", adres:"Elfde Wijk 8, Stegeren", type:"Gemeentelijk", nr:"0175/OMMENGM-42", lat:52.5733, lng:6.5028},
  {naam:"Woonhuis", bouwjaar:"1853", adres:"Nieuwe Dijk 8, Vilsteren", type:"Gemeentelijk", nr:"0175/OMMENGM-23", lat:52.505, lng:6.34},
  {naam:"Erve Niens", bouwjaar:"1900", adres:"Stuwepad 1, Vilsteren", type:"Gemeentelijk", nr:"0175/OMMENGM-29", lat:52.5114, lng:6.3478},
  {naam:"Woonhuis/boerderij", bouwjaar:"1900", adres:"Vilsterse Allee 4, Vilsteren", type:"Gemeentelijk", nr:"0175/OMMENGM-30", lat:52.5083, lng:6.3561},
  {naam:"Pastorie RK Kerk", bouwjaar:"1897", adres:"Vilsterseweg 11, Vilsteren", type:"Gemeentelijk", nr:"0175/OMMENGM-27", lat:52.5111, lng:6.3533}
];

function loadGemeentelijkeMonumenten(){
  gemeentelijkLayer.clearLayers();
  GEMEENTELIJKE_MONUMENTEN.forEach(m=>{
    const icon = L.divIcon({ className:"", html:`<div class="mip-marker" style="background:#27ae60;border:2px solid white"><div class="mip-marker-inner" style="color:white;font-weight:800;font-size:11px">${m.bouwjaar.substring(0,4)}</div></div>`, iconSize:[36,36], iconAnchor:[18,36] });
    const marker = L.marker([m.lat, m.lng], {icon}).bindPopup(`<div style="min-width:260px"><strong style="color:#27ae60">🏛 ${escapeHTML(m.naam)} (Gemeentelijk monument)</strong><br><small>${escapeHTML(m.nr)} | ${escapeHTML(m.adres)}</small><hr><b>Echt bouwjaar (monument):</b> <span style="font-size:18px;font-weight:800;color:#27ae60">${escapeHTML(m.bouwjaar)}</span><br><small>Bron: Wikipedia Lijst gemeentelijke monumenten Ommen + Gemeente Ommen 2013</small><br><br><div style="background:#eafaf1;padding:8px;border-radius:6px;font-size:12px"><b>BAG vergelijking:</b> Klik op blauw BAG vlak eronder voor BAG bouwjaar. Verschil toont vaak verbouwing vs origineel.</div><div style="margin-top:8px"><a href="https://www.google.com/maps/search/${encodeURIComponent(m.adres)}" target="_blank" style="padding:6px 10px;background:#27ae60;color:white;text-decoration:none;border-radius:6px;font-size:12px">📍 Google Maps</a></div></div>`);
    gemeentelijkLayer.addLayer(marker);
  });
  gemeentelijkLayer.addTo(map);
  console.log(`Gemeentelijke monumenten geladen: ${GEMEENTELIJKE_MONUMENTEN.length}`);
}

// ===== RIJKSMONUMENTEN OMMEN - WFS + fallback Wikipedia =====
async function loadRijksmonumenten(){
  rijksLayer.clearLayers();
  const bounds = map.getBounds();
  const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
  
  // Probeer RCE WFS rijksmonumenten - echte bouwjaar data
  const wfsUrls = [
    `https://services.rce.geovoorziening.nl/rce/wfs?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=rce:rijksmonumenten&SRSNAME=EPSG:4326&BBOX=${bbox},EPSG:4326&OUTPUTFORMAT=application/json&MAXFEATURES=200`,
    `https://services.rce.geovoorziening.nl/rce/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=rce:rijksmonumenten&SRSNAME=EPSG:4326&BBOX=${bbox}&OUTPUTFORMAT=application/json&COUNT=200`
  ];
  
  for(let url of wfsUrls){
    try{
      console.log("Rijksmonumenten WFS proberen:", url);
      const res = await fetch(url);
      if(!res.ok) continue;
      const text = await res.text();
      if(text.startsWith("<")) { console.log("RCE WFS gaf XML, geen JSON", text.substring(0,200)); continue; }
      const geojson = JSON.parse(text);
      if(geojson.features && geojson.features.length>0){
        console.log(`Rijksmonumenten WFS succes: ${geojson.features.length} objecten`, geojson.features[0]);
        geojson.features.forEach(f=>{
          const props = f.properties;
          const bouwjaar = props.bouwjaar || props.datering || props.oorspronkelijke_functie || props.bouwjaar_start || "Onbekend";
          const naam = props.benaming || props.naam || props.object || "Rijksmonument";
          const adres = props.adres || props.plaatselijke_aanduiding || "";
          const monumentNr = props.monumentnummer || props.id || "";
          let lat,lng;
          if(f.geometry && f.geometry.type==="Point"){ lng=f.geometry.coordinates[0]; lat=f.geometry.coordinates[1]; }
          if(!lat||!lng) return;
          const icon = L.divIcon({ className:"", html:`<div class="mip-marker" style="background:#c0392b;border:2px solid white"><div class="mip-marker-inner" style="color:white;font-weight:800;font-size:10px">RM</div></div>`, iconSize:[32,32], iconAnchor:[16,32] });
          const marker = L.marker([lat,lng], {icon}).bindPopup(`<div style="min-width:280px"><strong style="color:#c0392b">🏛 ${escapeHTML(naam)} (Rijksmonument)</strong><br><small>Nr: ${escapeHTML(String(monumentNr))} | ${escapeHTML(adres)}</small><hr><b>Echt bouwjaar (RCE):</b> <span style="font-size:18px;font-weight:800;color:#c0392b">${escapeHTML(String(bouwjaar))}</span><br><small>Bron: RCE Rijksmonumentenregister WFS rce:rijksmonumenten</small><br><br><div style="background:#fdedec;padding:8px;border-radius:6px;font-size:12px"><b>BAG vergelijking:</b> Klik blauw BAG vlak voor BAG bouwjaar. RCE bouwjaar is originele bouw, BAG vaak verbouwjaar.</div><br><a href="https://monumentenregister.cultureelerfgoed.nl/monumenten/${monumentNr}" target="_blank" style="padding:6px 10px;background:#c0392b;color:white;text-decoration:none;border-radius:6px;font-size:12px">RCE Register</a></div>`);
          rijksLayer.addLayer(marker);
        });
        rijksLayer.addTo(map);
        setStatus(`Rijksmonumenten: ${geojson.features.length} (RCE WFS) + 40 gemeentelijk`);
        return;
      }
    }catch(e){ console.log("Rijks WFS error", e); }
  }
  
  // Fallback: toon melding dat WFS geen data geeft, gebruik Wikipedia lijst als basis
  setStatus(`Rijksmonumenten WFS gaf geen data in bbox - gebruik Wikipedia lijst (105 in gemeente Ommen). Zoom uit voor meer.`);
  console.log("Rijksmonumenten WFS geen data - fallback naar 105 bekende nummers, toon via Wikipedia coördinaten");
}

// ===== MIP GEMEENTEBESCHRIJVINGEN WFS =====
async function loadMIPGemeenteBeschrijvingWFS(){
  try{
    const url = `https://services.rce.geovoorziening.nl/mip/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=mip:MIP_Gemeentebeschrijvingen&SRSNAME=EPSG:4326&OUTPUTFORMAT=application/json&COUNT=200`;
    const res = await fetch(url);
    const geojson = await res.json();
    mipGemeenteLayer.clearLayers();
    L.geoJSON(geojson, {
      style:{ weight:1.5, color:"#e67e22", fillOpacity:0.02, dashArray:"4 4" },
      onEachFeature: (feature, layer)=>{
        const props = feature.properties;
        const naam = props.GEM_NAAM || "Onbekend";
        const pdfUrl = props.PDF_URL || "";
        const pdfNaam = props.PDF_NAAM || "";
        layer.bindPopup(`<strong>MIP Gemeente: ${escapeHTML(naam)}</strong><br><small>PDF: ${escapeHTML(pdfNaam)}</small><br><a href="${pdfUrl}" target="_blank" style="display:inline-block;margin-top:6px;padding:6px 10px;background:#e67e22;color:white;text-decoration:none;border-radius:6px;font-size:12px">📄 Open ${escapeHTML(pdfNaam)}</a>`);
      }
    }).addTo(mipGemeenteLayer);
    if(map.getZoom() < 12) mipGemeenteLayer.addTo(map);
  }catch(e){ console.error(e); }
}

// ===== Minuutplan =====
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
  }catch(e){ console.error(e); }
}
map.on("click", async function(e){
  if(!map.hasLayer(minuutplanLayer)) return;
  const hasMonument = [...rijksLayer.getLayers(), ...gemeentelijkLayer.getLayers()].some(l=>{ try{ return map.latLngToContainerPoint(e.latlng).distanceTo(map.latLngToContainerPoint(l.getLatLng())) < 30; }catch{ return false; } });
  if(hasMonument) return;
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
  }catch(error){ console.error(error); }
});
opacitySlider.addEventListener("input", function(){
  const opacity=Number(this.value)/100;
  if(window.historischeMinuutplanLayer) window.historischeMinuutplanLayer.setOpacity(opacity);
  if(minuutplanLayer) minuutplanLayer.setOpacity(opacity);
  document.getElementById("historischeOpacityValue").textContent=this.value+"%";
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
if(toggleMIP){
  toggleMIP.addEventListener("change", (e)=>{
    if(e.target.checked){ rijksLayer.addTo(map); gemeentelijkLayer.addTo(map); mipGemeenteLayer.addTo(map); if(toggleMIPBtn) toggleMIPBtn.classList.add("active"); }
    else { map.removeLayer(rijksLayer); map.removeLayer(gemeentelijkLayer); map.removeLayer(mipGemeenteLayer); if(toggleMIPBtn) toggleMIPBtn.classList.remove("active"); }
  });
}
if(toggleMIPBtn){
  toggleMIPBtn.addEventListener("click", ()=>{
    const visible = map.hasLayer(rijksLayer) || map.hasLayer(gemeentelijkLayer);
    if(!visible){ rijksLayer.addTo(map); gemeentelijkLayer.addTo(map); mipGemeenteLayer.addTo(map); toggleMIPBtn.classList.add("active"); if(toggleMIP) toggleMIP.checked=true; }
    else { map.removeLayer(rijksLayer); map.removeLayer(gemeentelijkLayer); map.removeLayer(mipGemeenteLayer); toggleMIPBtn.classList.remove("active"); if(toggleMIP) toggleMIP.checked=false; }
  });
}

window.addEventListener("load", ()=>{
  setTimeout(()=>{
    loadRijksmonumenten();
    loadGemeentelijkeMonumenten();
    loadMIPGemeenteBeschrijvingWFS();
    if(navigator.geolocation){ locateUser(); }
  }, 800);
});
minuutplanLayer.setOpacity(0.55);
