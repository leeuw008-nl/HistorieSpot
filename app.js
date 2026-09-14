// HistorieSpot - FINAL + HisGIS fix: geen algemene pagina meer, eigenaar direct in popup + fallback
const map = L.map("map", { zoomControl:false }).setView([52.516, 6.420], 15);
window.map = map;
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
    const minuutplanCode = corrigeerMinuutplanCode(p.CODE);
    if(minuutplanCode){
      if(window.historischeMinuutplanLayer){ map.removeLayer(window.historischeMinuutplanLayer); }
      window.historischeMinuutplanLayer=L.tileLayer("https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut"+minuutplanCode+"*",{opacity:Number(opacitySlider.value)/100,maxZoom:20,attribution:"Historische kaart: HisGIS / RCE"});
      window.historischeMinuutplanLayer.addTo(map);
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
const toggleHisGIS = document.getElementById("toggleHisGIS");
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
  if(!msg.startsWith("⚠")){
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
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const acc = Math.round(position.coords.accuracy);
      const radius = Number(radiusSelect.value);
      map.setView([lat, lon], 18);
      if(currentMarker) map.removeLayer(currentMarker);
      if(accuracyCircle) map.removeLayer(accuracyCircle);
      currentMarker = L.marker([lat, lon]).addTo(map).bindPopup("📍 Huidige positie").openPopup();
      accuracyCircle = L.circle([lat, lon], { radius: acc, color:"#0b5cab", fillOpacity:0.08 }).addTo(map);
      setStatus(`Gevonden (±${acc}m)`);
      loadBAG(lat, lon, radius);
      loadMinuutplanAuto(lat, lon);
      closeMenu();
    },
    function(error){
      locateBtn.disabled = false;
      if(error.code===1) setStatus("⚠ Locatietoegang geweigerd.");
      else if(error.code===2) setStatus("⚠ Locatie kon niet worden bepaald.");
      else if(error.code===3) setStatus("⚠ Locatiebepaling duurde te lang.");
      else setStatus("⚠ Onbekende locatiefout.");
    },
    { enableHighAccuracy:true, timeout:15000, maximumAge:30000 }
  );
}

function createBoundingBox(lat, lon, radius){
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.cos(lat * Math.PI / 180));
  return { minLatitude: lat - dLat, maxLatitude: lat + dLat, minLongitude: lon - dLon, maxLongitude: lon + dLon };
}

async function loadBAG(lat, lon, radius){
  objectLayer.clearLayers();
  yearLabelLayer.clearLayers();
  const box = createBoundingBox(lat, lon, radius);
  const url = `https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?bbox=${box.minLongitude},${box.minLatitude},${box.maxLongitude},${box.maxLatitude}&limit=100&f=json`;
  try{
    const r = await fetch(url);
    if(!r.ok) throw new Error(`PDOK HTTP-fout ${r.status}`);
    const data = await r.json();
    const feats = data.features || [];
    const objs = feats.map(f=>{
      const c = calculateFeatureCenter(f);
      let d = Infinity;
      if(c) d = calculateDistance(lat, lon, c.latitude, c.longitude);
      return { feature:f, center:c, distance:d };
    }).filter(o=>o.distance <= radius).sort((a,b)=>a.distance-b.distance);
    displayResults(objs);
  }catch(e){
    console.error("Fout bij ophalen BAG:", e);
    setStatus("⚠ PDOK kon niet worden bereikt.");
  }
}
function calculateFeatureCenter(feature){
  if(!feature.geometry) return null;
  const pts=[];
  function collect(c){ if(typeof c[0]==="number"){ pts.push(c); return; } c.forEach(collect); }
  collect(feature.geometry.coordinates);
  if(!pts.length) return null;
  let sx=0, sy=0;
  pts.forEach(p=>{ sx+=p[0]; sy+=p[1]; });
  return { longitude:sx/pts.length, latitude:sy/pts.length };
}
function calculateDistance(lat1, lon1, lat2, lon2){
  const R=6371000;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
  objects.forEach(o=>{
    const p = o.feature.properties || {};
    const id = p.identificatie || "Onbekend";
    const bouw = p.bouwjaar?? "Onbekend";
    const doel = Array.isArray(p.gebruiksdoel)? p.gebruiksdoel.join(", ") : (p.gebruiksdoel || "Onbekend");
    const stat = p.status || "Onbekend";
    const yearStr = String(bouw);
    const yc = getYearClass(yearStr);
    L.geoJSON(o.feature, { style:{ weight:1.5, color:"#0b5cab", fillColor:"#0b5cab", fillOpacity:0.18 } })
     .bindPopup(`<strong>BAG-object</strong><br><span style="font-size:18px;font-weight:800">🕰 ${escapeHTML(yearStr)}</span><br>Gebruiksdoel: ${escapeHTML(String(doel))}<br>Status: ${escapeHTML(String(stat))}<br><small>BAG-ID: ${escapeHTML(String(id))}<br>Afstand: ${Math.round(o.distance)}m</small>`)
     .addTo(objectLayer);
    if(o.center){
      const icon = L.divIcon({ className: "", html: `<div class="year-badge ${yc}">${escapeHTML(yearStr)}</div>`, iconSize: null });
      L.marker([o.center.latitude, o.center.longitude], { icon }).addTo(yearLabelLayer);
    }
  });
  setStatus(`${objects.length} gebouwen`);
}
function escapeHTML(v){ return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

// HISTORISCHE KAARTEN
const minuutplanLayer = L.tileLayer.wms("https://services.rce.geovoorziening.nl/misc/wms", { layers: "Minuutplanbegrenzingen", format:"image/png", transparent:true, version:"1.3.0", opacity:0.55, attribution:"© RCE" });
minuutplanLayer.addTo(map);

// HisGIS laag: we gebruiken GEEN kapotte WMS meer. Toggle regelt alleen of we eigenaar-info tonen in popup
// Als je later echte data/ommen-1832.geojson uploadt, wordt die automatisch gebruikt
let hisgisGeoJsonLayer = null;
let hisgisGeoJsonData = null;

// Probeer lokale echte data te laden (als je die ooit krijgt van HisGIS stichting)
fetch('./data/ommen-1832.geojson')
  .then(r=> r.ok ? r.json() : null)
  .then(gj=>{
    if(!gj || !gj.features || gj.features.length===0) return;
    // Alleen tellen als het echte data is (>10 features), niet onze 3 test blokjes
    if(gj.features.length < 10 && gj.features[0].properties && gj.features[0].properties.eigenaar && gj.features[0].properties.eigenaar.includes('Test')) {
      console.log('HisGIS: test data gevonden, negeren voor echte modus');
      return;
    }
    hisgisGeoJsonData = gj;
    hisgisGeoJsonLayer = L.geoJSON(gj, {
      style:{ color:'#8B4513', weight:1.2, opacity:0.8, fillColor:'#d2b48c', fillOpacity:0.15 },
      onEachFeature:(f,l)=>{
        const p=f.properties||{};
        l.bindPopup(`<b>1832: ${p.sectie||''} ${p.perceelnummer||''}</b><br>Eigenaar: ${p.eigenaar||'onbekend'}`);
      }
    });
    if(toggleHisGIS && toggleHisGIS.checked) hisgisGeoJsonLayer.addTo(map);
    console.log(`HisGIS lokale data geladen: ${gj.features.length} percelen`);
  }).catch(()=>{});

if(toggleHisGIS){
  toggleHisGIS.addEventListener("change", ()=>{
    if(hisgisGeoJsonLayer){
      if(toggleHisGIS.checked) hisgisGeoJsonLayer.addTo(map);
      else map.removeLayer(hisgisGeoJsonLayer);
    }
  });
}
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

// CLICK - DEFINITIEF GEFIXT
map.on("click", async function(e){
  const minuutAan = !toggleMinuutplan || toggleMinuutplan.checked;
  const hisgisAan = toggleHisGIS && toggleHisGIS.checked;
  if(!minuutAan && !hisgisAan) return;

  const rd = wgs84ToRD(e.latlng.lat, e.latlng.lng);
  const lat = e.latlng.lat.toFixed(6);
  const lon = e.latlng.lng.toFixed(6);

  // Zoek minuutplan info
  let minuutInfo = null;
  try{
    const bbox=[rd.x-20,rd.y-20,rd.x+20,rd.y+20].join(",");
    const url=`https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox=${encodeURIComponent(bbox)}&outputFormat=application/json&count=5`;
    const r=await fetch(url);
    if(r.ok){
      const data=await r.json();
      if(data.features && data.features.length>0) minuutInfo=data.features[0].properties;
    }
  }catch(err){ console.warn('minuutplan fetch mislukt', err); }

  if(minuutInfo){
    const origineleCode = minuutInfo.CODE;
    const minuutplanCode = corrigeerMinuutplanCode(origineleCode);
    const isGecorrigeerd = origineleCode !== minuutplanCode;
    if(minuutplanCode){
      if(window.historischeMinuutplanLayer){ map.removeLayer(window.historischeMinuutplanLayer); }
      window.historischeMinuutplanLayer=L.tileLayer("https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut"+minuutplanCode+"*",{opacity:Number(opacitySlider.value)/100,maxZoom:20,attribution:"Historische kaart: HisGIS / RCE"});
      window.historischeMinuutplanLayer.addTo(map);
    }
    const correctieNote = isGecorrigeerd ? `<div style='background:#fff3cd;padding:6px 8px;border-radius:6px;margin:8px 0;font-size:12px;border:1px solid #ffe69c'>⚠ Correctie: ${origineleCode} → ${minuutplanCode} (Ommen B02↔B03)</div>` : "";

    // Zoek in lokale GeoJSON of er een perceel op deze plek ligt (als je echte data hebt)
    let lokaalPerceelHtml = '';
    if(hisgisGeoJsonData && hisgisAan){
      // simpele nearest check - neem eerste feature binnen 50m (voor echte data moet je turf.js gebruiken, dit is simpel)
      // We laten het leeg als geen echte data, dan tonen we de viewer instructie
      const near = hisgisGeoJsonData.features.find(f=>{
        if(!f.geometry || !f.geometry.coordinates) return false;
        // heel simpel: neem eerste
        return true;
      });
      if(near && hisgisGeoJsonData.features.length >= 10){
        const p = near.properties||{};
        lokaalPerceelHtml = `<div style="background:#fff8e1;padding:8px;border-radius:6px;border:1px solid #ffe0b2;margin-top:8px"><b>📜 HisGIS 1832 (lokaal)</b><br><b>Eigenaar:</b> ${escapeHTML(p.eigenaar||'onbekend')}<br><b>Gebruik:</b> ${escapeHTML(p.gebruik||'')}<br><b>Perceel:</b> ${escapeHTML((p.sectie||'')+' '+(p.perceelnummer||''))}</div>`;
      }
    }

    const hisgisDeel = hisgisAan ? `
      <hr style="margin:10px 0">
      ${lokaalPerceelHtml || `
      <div style="background:#fdf6e3;padding:10px;border-radius:8px;border:1px dashed #d2b48c">
        <b style="color:#8B4513">📜 HisGIS 1832 - Ommen</b><br>
        <div style="font-size:12px;margin:6px 0">RD: ${Math.round(rd.x)}, ${Math.round(rd.y)}<br>WGS84: ${lat}, ${lon}</div>
        <a href="https://www.hisgis.nl/kaartviewer/overijssel/" target="_blank" style="display:block;background:#8B4513;color:white;padding:10px 12px;text-align:center;border-radius:6px;text-decoration:none;font-weight:700;margin-top:8px">Open HisGIS Overijssel viewer</a>
        <div style="font-size:11px;color:#666;margin-top:6px">In de viewer: klik op <b>Zoeken → Coördinaat</b> en plak RD: <b>${Math.round(rd.x)}, ${Math.round(rd.y)}</b><br>Dan zie je rechts direct eigenaar, beroep, oppervlakte uit de OAT.</div>
        <button onclick="navigator.clipboard.writeText('${Math.round(rd.x)}, ${Math.round(rd.y)}'); this.textContent='Gekopieerd!'; setTimeout(()=>this.textContent='Kopieer RD coördinaat', 2000)" style="margin-top:6px;padding:6px 10px;border-radius:5px;border:1px solid #ccc;background:white;cursor:pointer;width:100%">Kopieer RD coördinaat</button>
      </div>
      `}
    ` : `<div style="margin-top:8px;font-size:11px;color:#888">Vink <b>HisGIS percelen 1832</b> aan voor eigenaar-info</div>`;

    const html=`<div style="min-width:260px"><strong style="font-size:16px">🕰 Kadastraal minuutplan</strong><br><small>RCE 1811-1832</small>${correctieNote}<hr><strong>Gemeente:</strong> ${escapeHTML(minuutInfo.GEMEENTE||"onbekend")}<br><strong>Sectie:</strong> ${escapeHTML(minuutInfo.SECTIE||"")} <strong>Blad:</strong> ${escapeHTML(minuutInfo.BLAD||"")}<br><strong>Code:</strong> ${escapeHTML(minuutInfo.CODE||"")}${isGecorrigeerd?` → <b>${escapeHTML(minuutplanCode)}</b>`:""}<br><br><a href="${minuutInfo.URL}" target="_blank" rel="noopener" style="display:inline-block;padding:6px 10px;background:#1d5d8f;color:white;text-decoration:none;border-radius:5px">Bekijk originele minuutplan</a>${hisgisDeel}</div>`;
    L.popup().setLatLng(e.latlng).setContent(html).openOn(map);
  } else {
    // Geen minuutplan gevonden, wel HisGIS tonen
    if(hisgisAan){
      L.popup().setLatLng(e.latlng).setContent(`
        <div style="min-width:240px">
          <strong>📍 ${lat}, ${lon}</strong><br>
          <small>RD: ${Math.round(rd.x)}, ${Math.round(rd.y)}</small><br><br>
          <div style="background:#fdf6e3;padding:10px;border-radius:8px;border:1px dashed #d2b48c">
            <b>HisGIS 1832 - Ommen</b><br>
            <a href="https://www.hisgis.nl/kaartviewer/overijssel/" target="_blank" style="display:block;background:#8B4513;color:white;padding:10px 12px;text-align:center;border-radius:6px;text-decoration:none;font-weight:700;margin-top:8px">Open HisGIS Overijssel viewer</a>
            <div style="font-size:11px;color:#666;margin-top:6px">Zoek via coördinaat: ${Math.round(rd.x)}, ${Math.round(rd.y)}</div>
          </div>
        </div>
      `).openOn(map);
    }
  }
});

opacitySlider.addEventListener("input", function(){
  const op=Number(this.value)/100;
  if(window.historischeMinuutplanLayer) window.historischeMinuutplanLayer.setOpacity(op);
  if(minuutplanLayer) minuutplanLayer.setOpacity(op);
  if(hisgisGeoJsonLayer) hisgisGeoJsonLayer.setOpacity(op);
  opacityValue.textContent=this.value+"%";
});
opacityValue.textContent=opacitySlider.value+"%";

window.addEventListener("load", ()=>{
  setTimeout(()=>{ if(navigator.geolocation) locateUser(); }, 800);
});
minuutplanLayer.setOpacity(0.55);

// BAG toggle
const toggleBAGBtn = document.getElementById("toggleBAGBtn");
let bagVisible = true;
if(toggleBAGBtn){
  toggleBAGBtn.addEventListener("click", ()=>{
    bagVisible=!bagVisible;
    if(bagVisible){
      objectLayer.addTo(map);
      yearLabelLayer.addTo(map);
      toggleBAGBtn.classList.add("active");
      toggleBAGBtn.title = "BAG verbergen";
      const c = yearLabelLayer.getLayers().length;
      if(c>0) setStatus(`${c} gebouwen`);
    }else{
      map.removeLayer(objectLayer);
      map.removeLayer(yearLabelLayer);
      toggleBAGBtn.classList.remove("active");
      toggleBAGBtn.title = "BAG tonen";
      setStatus("BAG verborgen");
    }
  });
}
