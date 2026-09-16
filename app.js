// OUDE SITUATIE ZONDER MONUMENTEN - gefixed voor 4 punten
const map=L.map("map",{zoomControl:false}).setView([52.516,6.42],15);
window.map=map;
L.control.zoom({position:'bottomleft'}).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
let curMarker=null,accCircle=null;
const bagLayer=L.layerGroup().addTo(map),bagLabel=L.layerGroup().addTo(map);
const CORR={"MIN04041B02":"MIN04041B03","MIN04041B03":"MIN04041B02"};
function corr(c){return CORR[c]||c;}
const locateBtn=document.getElementById("locateBtn"),radiusSel=document.getElementById("radius"),statusBox=document.getElementById("status"),menuBtn=document.getElementById("menuBtn"),closeMenuBtn=document.getElementById("closeMenuBtn"),sideMenu=document.getElementById("sideMenu"),menuOverlay=document.getElementById("menuOverlay"),infoBtn=document.getElementById("infoBtn"),closeInfoBtn=document.getElementById("closeInfoBtn"),infoModal=document.getElementById("infoModal"),infoOverlay=document.getElementById("infoOverlay"),toggleMin=document.getElementById("toggleMinuutplan"),opSlider=document.getElementById("historischeOpacity"),opVal=document.getElementById("historischeOpacityValue"),toggleBAGBtn=document.getElementById("toggleBAGBtn"),yearFilterSel=document.getElementById("yearFilter"),toggleKadasterColors=document.getElementById("toggleKadasterColors");
function openMenu(){sideMenu&&sideMenu.classList.add("open");menuOverlay&&menuOverlay.classList.remove("hidden");}
function closeMenu(){sideMenu&&sideMenu.classList.remove("open");menuOverlay&&menuOverlay.classList.add("hidden");}
function openInfo(){infoModal&&infoModal.classList.remove("hidden");infoOverlay&&infoOverlay.classList.remove("hidden");}
function closeInfo(){infoModal&&infoModal.classList.add("hidden");infoOverlay&&infoOverlay.classList.add("hidden");}
menuBtn&&menuBtn.addEventListener("click",openMenu);
closeMenuBtn&&closeMenuBtn.addEventListener("click",closeMenu);
menuOverlay&&menuOverlay.addEventListener("click",closeMenu);
infoBtn&&infoBtn.addEventListener("click",openInfo);
closeInfoBtn&&closeInfoBtn.addEventListener("click",closeInfo);
infoOverlay&&infoOverlay.addEventListener("click",closeInfo);
function setStatus(t){if(statusBox)statusBox.textContent=t;}
function esc(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");}

function getYearCat(y){const n=parseInt(y,10); if(isNaN(n)) return null; if(n<1800) return "pre1800"; if(n<1900) return "1800-1900"; if(n<1950) return "1900-1950"; if(n<1965) return "1950-1965"; if(n<1980) return "1965-1980"; if(n<2000) return "1980-2000"; return "na2000";}
function kadasterColor(y){const n=parseInt(y,10); if(isNaN(n)) return "#0b5cab"; if(n<1800) return "#7a1d1d"; if(n<1900) return "#d26e00"; if(n<1950) return "#b89a00"; if(n<1965) return "#5a9a4a"; if(n<1980) return "#4a8ab5"; if(n<2000) return "#7a5ab5"; return "#a0a0a0";}
let activeYearFilter="all", useKadaster=true;
function matchesYearFilter(y){if(activeYearFilter==="all") return true; return getYearCat(y)===activeYearFilter;}

function yearClass(y){const n=parseInt(y,10);if(isNaN(n))return"unknown";if(n<1850)return"very-old";if(n<1920)return"old";return"";}
function dist(a,b,c,d){const R=6371000,la=(c-a)*Math.PI/180,lo=(d-b)*Math.PI/180;const x=Math.sin(la/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(lo/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function box(lat,lng,r){const dLa=r/111320,dLo=r/(111320*Math.cos(lat*Math.PI/180));return{minLa:lat-dLa,maxLa:lat+dLa,minLo:lng-dLo,maxLo:lng+dLo};}
function centerOf(f){if(!f.geometry)return null;const pts=[];function rec(c){if(typeof c[0]==="number"){pts.push(c);return;}c.forEach(rec);}rec(f.geometry.coordinates);if(!pts.length)return null;let sl=0,sa=0;pts.forEach(p=>{sl+=p[0];sa+=p[1];});return{lat:sa/pts.length,lng:sl/pts.length};}
function wgs84ToRD(lat,lon){const dF=0.36*(lat-52.1551744),dL=0.36*(lon-5.38720621);const x=155000+190094.945*dL-11832.228*dF*dL-114.221*Math.pow(dF,2)*dL-32.391*Math.pow(dL,3)-0.705*dF-2.34*Math.pow(dF,3)*dL-0.608*dF*Math.pow(dL,3)-0.008*Math.pow(dL,2)+0.148*Math.pow(dF,2)*Math.pow(dL,3);const y=463000+309056.544*dF+3638.893*Math.pow(dL,2)+73.077*Math.pow(dF,2)-157.984*dF*Math.pow(dL,2)+59.788*Math.pow(dF,3)+0.433*dL-6.439*Math.pow(dF,2)*Math.pow(dL,2)-0.032*dF*dL+0.092*Math.pow(dL,4)-0.054*dF*Math.pow(dL,4);return{x,y};}
const minuutLayer=L.tileLayer.wms("https://services.rce.geovoorziening.nl/misc/wms",{layers:"Minuutplanbegrenzingen",format:"image/png",transparent:true,version:"1.3.0",opacity:0.5}).addTo(map);
minuutLayer.addTo(map);
toggleMin&&toggleMin.addEventListener("change",e=>{e.target.checked?minuutLayer.addTo(map):map.removeLayer(minuutLayer);});
opSlider&&opSlider.addEventListener("input",function(){const o=Number(this.value)/100;if(window.histLayer)window.histLayer.setOpacity(o);if(minuutLayer)minuutLayer.setOpacity(o);if(opVal)opVal.textContent=this.value+"%";});
toggleBAGBtn&&toggleBAGBtn.addEventListener("click",()=>{const h=map.hasLayer(bagLayer);if(h){map.removeLayer(bagLayer);map.removeLayer(bagLabel);toggleBAGBtn.classList.remove("active");}else{bagLayer.addTo(map);bagLabel.addTo(map);toggleBAGBtn.classList.add("active");}});
async function loadBAG(lat,lng,radius){
  bagLayer.clearLayers();bagLabel.clearLayers();
  const b=box(lat,lng,radius);
  const url=`https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?bbox=${b.minLo},${b.minLa},${b.maxLo},${b.maxLa}&limit=1000&f=json`;
  try{
    const res=await fetch(url);const data=await res.json();
    const list=data.features.map(f=>{const c=centerOf(f);if(!c)return null;const d=dist(lat,lng,c.lat,c.lng);if(d>radius)return null;return{f,c,d};}).filter(Boolean).sort((a,b)=>a.d-b.d);
    list.forEach(o=>{
      const y=String(o.f.properties.bouwjaar||"Onb"); if(!matchesYearFilter(y)) return;
      const cl=yearClass(y); const col=useKadaster?kadasterColor(y):"#0b5cab";
      const poly=L.geoJSON(o.f,{style:{weight:1.2,color:col,fillColor:useKadaster?col:"#0b5cab",fillOpacity:0.15}}).bindPopup(`<b>BAG</b><br>Bouwjaar: <b>${esc(y)}</b><br>${Math.round(o.d)}m`);
      bagLayer.addLayer(poly);
      const ic=L.divIcon({className:"",html:`<div class="year-badge ${cl}" style="cursor:pointer">${esc(y)}</div>`, iconSize:null});
      const lab=L.marker([o.c.lat,o.c.lng],{icon:ic}).bindPopup(`<b>BAG</b><br>Bouwjaar: <b>${esc(y)}</b><br>${Math.round(o.d)}m`);
      bagLabel.addLayer(lab);
    });
    setStatus(`${list.length} BAG binnen ${radius}m`);
  }catch(e){console.error(e);setStatus("BAG fout");}
}
locateBtn&&locateBtn.addEventListener("click",()=>{
  if(!navigator.geolocation){setStatus("Geen geolocatie");return;}
  setStatus("Locatie bepalen...");locateBtn.disabled=true;
  navigator.geolocation.getCurrentPosition(p=>{
    locateBtn.disabled=false;
    const lat=p.coords.latitude,lng=p.coords.longitude,acc=Math.round(p.coords.accuracy),r=Number(radiusSel.value);
    map.setView([lat,lng],18);
    if(curMarker)map.removeLayer(curMarker);
    if(accCircle)map.removeLayer(accCircle);
    if(selectedMarker){map.removeLayer(selectedMarker); selectedMarker=null;}
    if(curMarker)map.removeLayer(curMarker);
    curMarker=L.marker([lat,lng]).addTo(map).bindPopup("Huidige positie").openPopup();
    curMarker.on("click",()=>{ loadBAG(lat,lng,r); loadHistForLocation(lat,lng); setStatus("Huidige positie – BAG laden..."); });
    accCircle=L.circle([lat,lng],{radius:acc,color:"#0b5cab",fillOpacity:0.08}).addTo(map);
    loadBAG(lat,lng,r);closeMenu();
  },()=>{locateBtn.disabled=false;setStatus("Locatie geweigerd");},{enableHighAccuracy:true,timeout:15000});
});
radiusSel&&radiusSel.addEventListener("change",()=>{const r=Number(radiusSel.value);if(curMarker){const ll=curMarker.getLatLng();loadBAG(ll.lat,ll.lng,r);}else{loadBAG(52.516,6.42,r);}});

async function loadHistForLocation(lat,lng){
  try{
    if(!map.hasLayer(minuutLayer)) minuutLayer.addTo(map);
    const rd=wgs84ToRD(lat,lng), b=[rd.x-50,rd.y-50,rd.x+50,rd.y+50].join(","), url=`https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox=${encodeURIComponent(b)}&outputFormat=application/json&count=1`;
    const res=await fetch(url); const data=await res.json(); if(!data.features||!data.features.length) return;
    let code=data.features[0].properties.CODE; const orig=code; code=corr(code);
    if(window.histLayer) map.removeLayer(window.histLayer);
    window.histLayer=L.tileLayer(`https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut${code}*`,{opacity:Number(opSlider.value)/100||0.6,maxZoom:20}).addTo(map);
  }catch(e){console.error("hist 1832 load fail",e);}
}

async function testMIPForBAG(lat, lng) {
  const rd = wgs84ToRD(lat, lng);
  const d = 50;
  const bbox = `${rd.x-d},${rd.y-d},${rd.x+d},${rd.y+d}`;

  const url =
    `https://services.rce.geovoorziening.nl/mip/wfs?service=WFS&version=2.0.0` +
    `&request=GetFeature&typeNames=MIP_Objecten&srsName=EPSG:28992` +
    `&bbox=${bbox}&outputFormat=application/json`;

  try {
    const r = await fetch(url);
    const data = await r.json();

    if (!data.features?.length) {
      L.popup()
        .setLatLng([lat, lng])
        .setContent("<b>MIP-test</b><br>Geen MIP-object binnen 50 meter.")
        .openOn(map);
      return;
    }

    const html = data.features.map((f, i) => {
      const p = f.properties || {};
      return `<b>MIP-object ${i + 1}</b><br>` +
             Object.entries(p)
               .map(([k,v]) => `${k}: ${v}`)
               .join("<br>");
    }).join("<hr>");

    L.popup({maxWidth:450})
      .setLatLng([lat, lng])
      .setContent("<b>MIP-test vanuit BAG-pand</b><br>" + html)
      .openOn(map);

  } catch (e) {
    L.popup()
      .setLatLng([lat, lng])
      .setContent("<b>MIP-test fout</b><br>" + e.message)
      .openOn(map);
  }
}

let selectedMarker=null;
async function testMIP(lat,lng){
  const rd=wgs84ToRD(lat,lng),d=50;
  const b=[rd.x-d,rd.y-d,rd.x+d,rd.y+d].join(",");
  const url=`https://services.rce.geovoorziening.nl/mip/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=MIP_Objecten&srsName=EPSG:28992&bbox=${encodeURIComponent(b)}&outputFormat=application/json`;
  try{
    const res=await fetch(url),data=await res.json();

    if(!data.features?.length){
      setStatus("MIP-test: geen object binnen 50 meter");
      return;
    }

    setStatus("MIP gevonden: " + data.features.length + " object(en) — " +
      Object.entries(data.features[0].properties || {})
        .map(([k,v]) => `${k}: ${v}`)
        .join(" | "));

  }catch(err){
    setStatus("MIP-test fout: "+err.message);
  }
}
map.on("click",async e=>{
  const lat=e.latlng.lat, lng=e.latlng.lng, r=Number(radiusSel.value);
  // Toon BAG voor geklikte positie
  if(selectedMarker) map.removeLayer(selectedMarker);
  selectedMarker=L.marker([lat,lng],{icon:L.divIcon({className:"",html:'<div style="background:#e63946;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',iconSize:[14,14],iconAnchor:[7,7]})}).addTo(map);
  setStatus(`Geselecteerd: ${lat.toFixed(5)}, ${lng.toFixed(5)} – BAG laden...`);
  loadBAG(lat,lng,r);
  loadHistForLocation(lat,lng);
  testMIP(lat,lng);
  try{
    if(map.hasLayer(minuutLayer)){
      const rd=wgs84ToRD(lat,lng),b=[rd.x-20,rd.y-20,rd.x+20,rd.y+20].join(","),url=`https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox=${encodeURIComponent(b)}&outputFormat=application/json&count=1`;
      const res=await fetch(url),data=await res.json();if(data.features&&data.features.length){
        let code=data.features[0].properties.CODE;const orig=code;code=corr(code);
        if(window.histLayer)map.removeLayer(window.histLayer);
        window.histLayer=L.tileLayer(`https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut${code}*`,{opacity:Number(opSlider.value)/100||0.6,maxZoom:20}).addTo(map);
        const p=data.features[0].properties;
        L.popup().setLatLng(e.latlng).setContent(`<div style="min-width:240px"><strong>🕰 Minuutplan 1811-1832</strong><br>${esc(p.GEMEENTE)} ${esc(p.SECTIE)} ${esc(p.BLAD)}<br>RCE ${esc(orig)} → HisGIS ${esc(code)}<br><br><a href="${esc(p.URL)}" target="_blank" style="display:inline-block;padding:8px 12px;background:#1d5d8f;color:white;text-decoration:none;border-radius:5px">Origineel</a><br><br><small>Geklikte positie wordt nu gebruikt voor BAG</small></div>`).openOn(map);
      }
    }
  }catch(err){console.error(err);}
});

yearFilterSel&&yearFilterSel.addEventListener("change",e=>{activeYearFilter=e.target.value; const r=Number(radiusSel.value); if(curMarker){const ll=curMarker.getLatLng(); loadBAG(ll.lat,ll.lng,r);} else loadBAG(52.516,6.42,r);});
toggleKadasterColors&&toggleKadasterColors.addEventListener("change",e=>{useKadaster=e.target.checked; const r=Number(radiusSel.value); if(curMarker){const ll=curMarker.getLatLng(); loadBAG(ll.lat,ll.lng,r);} else loadBAG(52.516,6.42,r);});

window.addEventListener("load",()=>{
  if(toggleKadasterColors) toggleKadasterColors.checked=true;

  setTimeout(()=>{
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(p=>{
        const lat=p.coords.latitude,lng=p.coords.longitude,r=Number(radiusSel.value);
        map.setView([lat,lng],18);
        curMarker=L.marker([lat,lng]).addTo(map).bindPopup("Huidige positie");
        accCircle=L.circle([lat,lng],{radius:p.coords.accuracy,color:"#0b5cab",fillOpacity:0.08}).addTo(map);
        loadBAG(lat,lng,r); loadHistForLocation(lat,lng);
      },()=>{
        loadBAG(52.516,6.42,Number(radiusSel.value)); loadHistForLocation(52.516,6.42);
      },{enableHighAccuracy:true,timeout:8000});
    }else{
      loadBAG(52.516,6.42,Number(radiusSel.value)); loadHistForLocation(52.516,6.42);
    }
  },600);
});
// ===== TIJDELIJKE MIP-TEST KRUISSTRAAT 1 =====
async function testMIPKruisstraat1() {
  const lat = 52.519098;
  const lng = 6.423525;
  const rd = wgs84ToRD(lat, lng);
  const d = 50;
  const bbox = `${rd.x-d},${rd.y-d},${rd.x+d},${rd.y+d}`;

  try {
    const cap = await fetch(
      "https://services.rce.geovoorziening.nl/mip/wfs?service=WFS&version=2.0.0&request=GetCapabilities"
    ).then(r => r.text());

    const names = [...cap.matchAll(/<Name>([^<]*MIP[^<]*)<\/Name>/gi)]
      .map(m => m[1]);
    if (!names.length) return setStatus("MIP: geen MIP-laag gevonden");

    const url =
      `https://services.rce.geovoorziening.nl/mip/wfs?service=WFS&version=2.0.0` +
      `&request=GetFeature&typeNames=${encodeURIComponent(names[0])}` +
      `&srsName=EPSG:28992&bbox=${bbox}&outputFormat=application/json`;

    const data = await fetch(url).then(r => r.json());
    const p = data.features?.[0]?.properties;

    setStatus(p
      ? `MIP gevonden: ${JSON.stringify(p)}`
      : "MIP: geen object binnen 50 meter");
  } catch (e) {
    setStatus("MIP-test fout: " + e.message);
  }
}

testMIPKruisstraat1();
