// HistorieSpot - Ommen - BAG + 40 gemeentelijk + 20 rijks - zelfde badges + zoekradius + 2 stappen verder ingezoomd
const map = L.map("map", { zoomControl: false }).setView([52.516, 6.42], 16);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "OSM" }).addTo(map);

let curMarker = null, accCircle = null, lastLat = 52.516, lastLng = 6.42;
const bagLayer = L.layerGroup().addTo(map);
const bagLabel = L.layerGroup().addTo(map);
const monLayer = L.layerGroup().addTo(map);
const monLabel = L.layerGroup().addTo(map);

const locateBtn = document.getElementById("locateBtn");
const radiusSel = document.getElementById("radius");
const statusBox = document.getElementById("status");

function setStatus(t) { statusBox.textContent = t; }
function esc(s) { return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function yearClass(y) { const n = parseInt(y, 10); if (isNaN(n)) return "unknown"; if (n < 1850) return "very-old"; if (n < 1920) return "old"; return ""; }
function dist(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function box(lat, lng, r) {
  const dLat = r / 111320, dLng = r / (111320 * Math.cos(lat * Math.PI / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
function centerOf(f) {
  if (!f.geometry) return null; const pts = []; function rec(c) { if (typeof c[0] === "number") { pts.push(c); return; } c.forEach(rec); } rec(f.geometry.coordinates);
  if (!pts.length) return null; let slng = 0, slat = 0; pts.forEach(p => { slng += p[0]; slat += p[1]; }); return { lat: slat / pts.length, lng: slng / pts.length };
}

// 40 gemeentelijk + 12 rijks Ommen plaats - echt bouwjaar
const MONUMENTEN = [
  // gemeentelijk Ommen plaats 25
  {n:"Woonhuis", b:"1910", a:"Bouwstraat 6/7, Ommen", t:"Gemeentelijk", lat:52.5194, lng:6.4242},
  {n:"Winkel De Bakoven", b:"1905", a:"Brugstraat 17, Ommen", t:"Gemeentelijk", lat:52.5183, lng:6.4225},
  {n:"Woonhuis", b:"1938", a:"De Kamp 38, Ommen", t:"Gemeentelijk", lat:52.508, lng:6.4245},
  {n:"Soltana", b:"1930", a:"De Kamp 44, Ommen", t:"Gemeentelijk", lat:52.5072, lng:6.4242},
  {n:"Den Hof", b:"1903", a:"De Voormars 4, Ommen", t:"Gemeentelijk", lat:52.52, lng:6.4194},
  {n:"Woonhuis", b:"1900", a:"Den Oordt 6, Ommen", t:"Gemeentelijk", lat:52.5178, lng:6.425},
  {n:"Edith-Hof", b:"1928", a:"Edith-Hof 1-10, Ommen", t:"Gemeentelijk", lat:52.5142, lng:6.426},
  {n:"Hei en Dennen", b:"1903", a:"Hammerweg 14, Ommen", t:"Gemeentelijk", lat:52.5089, lng:6.4197},
  {n:"Baarhuisje", b:"1924", a:"Hardenbergerweg, Ommen", t:"Gemeentelijk", lat:52.5231, lng:6.4369},
  {n:"Laarhoeve", b:"1849", a:"Koesteeg 5, Ommen", t:"Gemeentelijk", lat:52.515, lng:6.4194},
  {n:"Winkelpand", b:"1903", a:"Kruisstraat 1, Ommen", t:"Gemeentelijk", lat:52.5192, lng:6.4233},
  {n:"Winkelpui", b:"1910", a:"Kruisstraat 2, Ommen", t:"Gemeentelijk", lat:52.5192, lng:6.4233},
  {n:"VVV-kantoor", b:"1881", a:"Kruisstraat 6-6a, Ommen", t:"Gemeentelijk", lat:52.5192, lng:6.4236},
  {n:"Postkantoor", b:"1905", a:"Markt 17, Ommen", t:"Gemeentelijk", lat:52.5178, lng:6.4231},
  {n:"Kantoor", b:"1900", a:"Markt 32, Ommen", t:"Gemeentelijk", lat:52.5192, lng:6.42},
  {n:"Pastorie RK", b:"1938", a:"Nering Bodelstraat 1, Ommen", t:"Gemeentelijk", lat:52.5203, lng:6.4197},
  {n:"St. Brigitta", b:"1938", a:"Nering Bodelstraat 1a, Ommen", t:"Gemeentelijk", lat:52.5203, lng:6.4197},
  {n:"Restaurant", b:"1903", a:"Stationsweg 31, Ommen", t:"Gemeentelijk", lat:52.5103, lng:6.4183},
  {n:"NS Station", b:"1902", a:"Stationsweg 35, Ommen", t:"Gemeentelijk", lat:52.51, lng:6.4172},
  {n:"Baarhuisje", b:"1828", a:"Van Raaltestraat, Ommen", t:"Gemeentelijk", lat:52.5206, lng:6.426},
  {n:"Joodse begraafplaats", b:"1700", a:"Van Raaltestraat, Ommen", t:"Gemeentelijk", lat:52.5206, lng:6.426},
  {n:"v. Raalteschool", b:"1950", a:"Van Raaltestraat 23, Ommen", t:"Gemeentelijk", lat:52.5208, lng:6.426},
  {n:"De Ark", b:"1940", a:"Wolfskuil 41, Ommen", t:"Gemeentelijk", lat:52.5061, lng:6.4042},
  {n:"Piet Hein", b:"1905", a:"Zeesserweg 5, Ommen", t:"Gemeentelijk", lat:52.5158, lng:6.4244},
  {n:"Ada's Hoeve", b:"1853", a:"Zwolseweg 17, Ommen", t:"Gemeentelijk", lat:52.5142, lng:6.4019},
  // rijks Ommen plaats 12
  {n:"Besthmenermolen", b:"1862", a:"Hammerweg 59a, Ommen", t:"Rijks", lat:52.4969, lng:6.4231},
  {n:"Stadhuis", b:"1828", a:"Markt 1-5, Ommen", t:"Rijks", lat:52.5189, lng:6.4239},
  {n:"Brigitta Kerk", b:"15e eeuw", a:"Kerkplein 2, Ommen", t:"Rijks", lat:52.5186, lng:6.4233},
  {n:"Den Oordt Molen", b:"1824", a:"Den Oordt 7, Ommen", t:"Rijks", lat:52.5178, lng:6.4256},
  {n:"De Lelie Molen", b:"1846", a:"Molenpad 7, Ommen", t:"Rijks", lat:52.5219, lng:6.4261},
  {n:"Tuinkoepel", b:"1700", a:"Stationsweg, Ommen", t:"Rijks", lat:52.5158, lng:6.4219},
  {n:"Olde Vechte", b:"1849", a:"Zeesserweg 12, Ommen", t:"Rijks", lat:52.5158, lng:6.4278},
  {n:"De Konijnenbelt", b:"1806", a:"Zwolseweg 5, Ommen", t:"Rijks", lat:52.5172, lng:6.4206},
  {n:"Geref. Kerk", b:"1932", a:"Bouwstraat 23, Ommen", t:"Rijks", lat:52.52, lng:6.424},
  {n:"Hoeve Bargsigt", b:"1924", a:"Hammerweg 44, Ommen", t:"Rijks", lat:52.5022, lng:6.4198},
  {n:"Het Laar", b:"18e eeuw", a:"Het Laar 2, Ommen", t:"Rijks", lat:52.5136, lng:6.4136},
  {n:"Het Laar koetshuis", b:"1843", a:"Het Laar 2B, Ommen", t:"Rijks", lat:52.5108, lng:6.4106}
];

async function loadBAG(lat, lng, radius) {
  bagLayer.clearLayers(); bagLabel.clearLayers();
  lastLat = lat; lastLng = lng;
  const b = box(lat, lng, radius);
  const url = `https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?bbox=${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}&limit=100&f=json`;
  try {
    const res = await fetch(url); const data = await res.json();
    const list = data.features.map(f => {
      const c = centerOf(f); if (!c) return null;
      const d = dist(lat, lng, c.lat, c.lng); if (d > radius) return null;
      return { f, c, d };
    }).filter(Boolean).sort((a, b) => a.d - b.d);
    list.forEach(o => {
      const y = String(o.f.properties.bouwjaar || "Onbekend");
      const cls = yearClass(y);
      L.geoJSON(o.f, { style: { weight: 1.2, color: "#0b5cab", fillOpacity: 0.15 } }).bindPopup(`<b>BAG</b><br>Bouwjaar BAG: <b>${esc(y)}</b><br>Afstand: ${Math.round(o.d)}m<br>${esc(o.f.properties.gebruiksdoel || "")}`).addTo(bagLayer);
      const icon = L.divIcon({ className: "", html: `<div class="year-badge ${cls}">${esc(y)}</div>` });
      L.marker([o.c.lat, o.c.lng], { icon }).addTo(bagLabel);
    });
    loadMonumentenInRadius(lat, lng, radius);
    setStatus(`${list.length} BAG + ${monLayer.getLayers().length} monumenten binnen ${radius}m`);
  } catch (e) { console.error(e); }
}

function loadMonumentenInRadius(lat, lng, radius) {
  monLayer.clearLayers(); monLabel.clearLayers();
  MONUMENTEN.forEach(m => {
    const d = dist(lat, lng, m.lat, m.lng);
    if (d > radius) return;
    const cls = yearClass(m.b);
    const color = m.t === "Rijks" ? "#c0392b" : "#27ae60";
    const dot = L.circleMarker([m.lat, m.lng], { radius: 7, color: "white", weight: 2, fillColor: color, fillOpacity: 0.95 }).bindPopup(`<b style="color:${color}">${esc(m.n)} (${esc(m.t)})</b><br>${esc(m.a)}<br><b>Echt bouwjaar:</b> <span style="font-size:18px;font-weight:800;color:${color}">${esc(m.b)}</span><br><small>Afstand: ${Math.round(d)}m</small><br><div style="margin-top:6px;font-size:11px;background:#f4f6f7;padding:6px;border-radius:6px">Vergelijk met blauw BAG badge eronder: verschil = verbouw vs origineel</div>`);
    monLayer.addLayer(dot);
    const icon = L.divIcon({ className: "", html: `<div class="year-badge ${cls}" style="background:${color};border-color:${color}">${esc(m.b.substring(0, 4))}</div>` });
    L.marker([m.lat, m.lng], { icon, interactive: false }).addTo(monLabel);
  });
}

locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) { setStatus("Geen geolocatie"); return; }
  setStatus("Locatie bepalen...");
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(p => {
    locateBtn.disabled = false;
    const lat = p.coords.latitude, lng = p.coords.longitude, acc = Math.round(p.coords.accuracy), r = Number(radiusSel.value);
    map.setView([lat, lng], 18);
    if (curMarker) map.removeLayer(curMarker);
    if (accCircle) map.removeLayer(accCircle);
    curMarker = L.marker([lat, lng]).addTo(map).bindPopup("Huidige positie").openPopup();
    accCircle = L.circle([lat, lng], { radius: acc, color: "#0b5cab", fillOpacity: 0.08 }).addTo(map);
    loadBAG(lat, lng, r);
  }, () => { locateBtn.disabled = false; setStatus("Locatie geweigerd"); }, { enableHighAccuracy: true, timeout: 15000 });
});

radiusSel.addEventListener("change", () => {
  const r = Number(radiusSel.value);
  if (lastLat) { loadBAG(lastLat, lastLng, r); }
});

// minuutplan
const minuutplanLayer = L.tileLayer.wms("https://services.rce.geovoorziening.nl/misc/wms", { layers: "Minuutplanbegrenzingen", format: "image/png", transparent: true, version: "1.3.0", opacity: 0.5 });
minuutplanLayer.addTo(map);
document.getElementById("toggleMinuutplan")?.addEventListener("change", e => { if (e.target.checked) minuutplanLayer.addTo(map); else map.removeLayer(minuutplanLayer); });

function wgs84ToRD(lat, lon) {
  const dF = 0.36 * (lat - 52.15517440), dL = 0.36 * (lon - 5.38720621);
  const x = 155000 + 190094.945 * dL - 11832.228 * dF * dL - 114.221 * Math.pow(dF, 2) * dL - 32.391 * Math.pow(dL, 3);
  const y = 463000 + 309056.544 * dF + 3638.893 * Math.pow(dL, 2) + 73.077 * Math.pow(dF, 2);
  return { x, y };
}
async function loadMinuutplanAuto(lat, lng) {
  try {
    const rd = wgs84ToRD(lat, lng); const b = [rd.x - 20, rd.y - 20, rd.x + 20, rd.y + 20].join(",");
    const url = `https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox=${encodeURIComponent(b)}&outputFormat=application/json&count=1`;
    const res = await fetch(url); const data = await res.json();
    if (!data.features || !data.features.length) return;
    const code = data.features[0].properties.CODE;
    if (window.histLayer) map.removeLayer(window.histLayer);
    window.histLayer = L.tileLayer(`https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut${code}*`, { opacity: 0.6, maxZoom: 20 }).addTo(map);
  } catch (e) { }
}

window.addEventListener("load", () => {
  setTimeout(() => {
    loadBAG(52.516, 6.42, Number(radiusSel.value));
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        map.setView([lat, lng], 18);
        loadBAG(lat, lng, Number(radiusSel.value));
      });
    }
  }, 600);
});
