const map=L.map("map",{zoomControl:false}).setView([52.516,6.42],16);
L.control.zoom({position:'bottomleft'}).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
let curMarker=null,accCircle=null,lastLat=52.516,lastLng=6.42,monumentenData=[];
const bagLayer=L.layerGroup().addTo(map),bagLabel=L.layerGroup().addTo(map),monLayer=L.layerGroup().addTo(map),monLabel=L.layerGroup().addTo(map);
const minuutLayer=L.tileLayer.wms("https://services.rce.geovoorziening.nl/misc/wms",{layers:"Minuutplanbegrenzingen",format:"image/png",transparent:true,version:"1.3.0",opacity:0.5}).addTo(map);
// menu/info
const menuBtn=document.getElementById("menuBtn"),closeMenuBtn=document.getElementById("closeMenuBtn"),sideMenu=document.getElementById("sideMenu"),menuOverlay=document.getElementById("menuOverlay");
const infoBtn=document.getElementById("infoBtn"),closeInfoBtn=document.getElementById("closeInfoBtn"),infoModal=document.getElementById("infoModal"),infoOverlay=document.getElementById("infoOverlay");
const toggleMin=document.getElementById("toggleMinuutplan"),opSlider=document.getElementById("historischeOpacity"),opVal=document.getElementById("historischeOpacityValue");
const toggleMIP=document.getElementById("toggleMIP"),toggleMIPBtn=document.getElementById("toggleMIPBtn"),toggleBAGBtn=document.getElementById("toggleBAGBtn");
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
toggleMin&&toggleMin.addEventListener("change",e=>{e.target.checked?minuutLayer.addTo(map):map.removeLayer(minuutLayer);});
opSlider&&opSlider.addEventListener("input",function(){const o=Number(this.value)/100;if(window.histLayer)window.histLayer.setOpacity(o);if(minuutLayer)minuutLayer.setOpacity(o);if(opVal)opVal.textContent=this.value+"%";});
toggleBAGBtn&&toggleBAGBtn.addEventListener("click",()=>{const h=map.hasLayer(bagLayer);if(h){map.removeLayer(bagLayer);map.removeLayer(bagLabel);toggleBAGBtn.classList.remove("active");}else{bagLayer.addTo(map);bagLabel.addTo(map);toggleBAGBtn.classList.add("active");}});
toggleMIPBtn&&toggleMIPBtn.addEventListener("click",()=>{const h=map.hasLayer(monLayer);if(h){map.removeLayer(monLayer);map.removeLayer(monLabel);toggleMIPBtn.classList.remove("active");if(toggleMIP)toggleMIP.checked=false;}else{monLayer.addTo(map);monLabel.addTo(map);toggleMIPBtn.classList.add("active");if(toggleMIP)toggleMIP.checked=true;}});
toggleMIP&&toggleMIP.addEventListener("change",e=>{if(e.target.checked){monLayer.addTo(map);monLabel.addTo(map);toggleMIPBtn&&toggleMIPBtn.classList.add("active");}else{map.removeLayer(monLayer);map.removeLayer(monLabel);toggleMIPBtn&&toggleMIPBtn.classList.remove("active");}});

const locateBtn=document.getElementById("locateBtn"),radiusSel=document.getElementById("radius"),statusBox=document.getElementById("status");
function setStatus(t){if(statusBox)statusBox.textContent=t;}
function esc(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");}
function yearClass(y){const n=parseInt(y,10);if(isNaN(n))return"unknown";if(n<1850)return"very-old";if(n<1920)return"old";return"";}
function dist(a,b,c,d){const R=6371000,la=(c-a)*Math.PI/180,lo=(d-b)*Math.PI/180;const x=Math.sin(la/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(lo/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function box(lat,lng,r){const dLa=r/111320,dLo=r/(111320*Math.cos(lat*Math.PI/180));return{minLa:lat-dLa,maxLa:lat+dLa,minLo:lng-dLo,maxLo:lng+dLo};}
function centerOf(f){if(!f.geometry)return null;const pts=[];function rec(c){if(typeof c[0]==="number"){pts.push(c);return;}c.forEach(rec);}rec(f.geometry.coordinates);if(!pts.length)return null;let sl=0,sa=0;pts.forEach(p=>{sl+=p[0];sa+=p[1];});return{lat:sa/pts.length,lng:sl/pts.length};}
function wgs84ToRD(lat,lon){const dF=0.36*(lat-52.1551744),dL=0.36*(lon-5.38720621);const x=155000+190094.945*dL, y=463000+309056.544*dF;return{x,y};}
async function loadMinAuto(lat,lng){
  try{const rd=wgs84ToRD(lat,lng),b=[rd.x-20,rd.y-20,rd.x+20,rd.y+20].join(","),url=`https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox=${encodeURIComponent(b)}&outputFormat=application/json&count=1`;const r=await fetch(url),d=await r.json();if(!d.features||!d.features.length)return;const code=d.features[0].properties.CODE;if(window.histLayer)map.removeLayer(window.histLayer);window.histLayer=L.tileLayer(`https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut${code}*`,{opacity:0.6,maxZoom:20}).addTo(map);}catch(e){}
}
async function loadBAG(lat,lng,radius){
  bagLayer.clearLayers();bagLabel.clearLayers();lastLat=lat;lastLng=lng;
  const b=box(lat,lng,radius*1.5);
  const url=`https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?bbox=${b.minLo},${b.minLa},${b.maxLo},${b.maxLa}&limit=1000&f=json`;
  try{
    const res=await fetch(url);const data=await res.json();
    const list=data.features.map(f=>{const c=centerOf(f);if(!c)return null;const d=dist(lat,lng,c.lat,c.lng);if(d>radius)return null;return{f,c,d};}).filter(Boolean).sort((a,b)=>a.d-b.d);
    list.forEach(o=>{const y=String(o.f.properties.bouwjaar||"Onb");const cl=yearClass(y);L.geoJSON(o.f,{style:{weight:1.2,color:"#0b5cab",fillOpacity:0.15}}).bindPopup(`<b>BAG</b><br>Bouwjaar: <b>${esc(y)}</b><br>Afstand ${Math.round(o.d)}m`).addTo(bagLayer);const ic=L.divIcon({className:"",html:`<div class="year-badge ${cl}">${esc(y)}</div>`});L.marker([o.c.lat,o.c.lng],{icon:ic}).addTo(bagLabel);});
    loadMon(radius,lat,lng);
    setStatus(`${list.length} BAG + ${monLayer.getLayers().length} monumenten binnen ${radius}m`);
  }catch(e){console.error(e);setStatus("BAG fout");}
}
function loadMon(radius,lat,lng){
  monLayer.clearLayers();monLabel.clearLayers();
  monumentenData.forEach(m=>{
    const d=dist(lat,lng,m.lat,m.lng);if(d>radius)return;
    const cl=yearClass(m.b),col=m.t==="R"?"#c0392b":"#27ae60";
    const dot=L.circleMarker([m.lat,m.lng],{radius:7,color:"white",weight:2,fillColor:col,fillOpacity:0.95}).bindPopup(`<b style="color:${col}">${esc(m.n)} (${m.t==="R"?"Rijks":"Gemeentelijk"})</b><br>${esc(m.a)}<br><b>Echt bouwjaar: ${esc(m.b)}</b><br>${Math.round(d)}m`);
    monLayer.addLayer(dot);
    const ic=L.divIcon({className:"",html:`<div class="year-badge ${cl}" style="background:${col};border-color:${col}">${esc(m.b.substring(0,4))}</div>`});
    L.marker([m.lat,m.lng],{icon:ic,interactive:false}).addTo(monLabel);
  });
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
    curMarker=L.marker([lat,lng]).addTo(map).bindPopup("Huidige positie").openPopup();
    accCircle=L.circle([lat,lng],{radius:acc,color:"#0b5cab",fillOpacity:0.08}).addTo(map);
    loadBAG(lat,lng,r);closeMenu();
  },()=>{locateBtn.disabled=false;setStatus("Locatie geweigerd");},{enableHighAccuracy:true,timeout:15000});
});
radiusSel&&radiusSel.addEventListener("change",()=>{const r=Number(radiusSel.value);if(lastLat!==null)loadBAG(lastLat,lastLng,r);else loadBAG(52.516,6.42,r);});

map.on("click",async e=>{
  const hasMon=[...monLayer.getLayers(),...bagLabel.getLayers()].some(l=>{try{return map.latLngToContainerPoint(e.latlng).distanceTo(map.latLngToContainerPoint(l.getLatLng()))<35;}catch{return false;}});
  if(hasMon)return;
  if(!map.hasLayer(minuutLayer))return;
  try{
    const rd=wgs84ToRD(e.latlng.lat,e.latlng.lng),b=[rd.x-20,rd.y-20,rd.x+20,rd.y+20].join(","),url=`https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox=${encodeURIComponent(b)}&outputFormat=application/json&count=1`;
    const res=await fetch(url),data=await res.json();if(!data.features||!data.features.length)return;
    const p=data.features[0].properties,code=p.CODE;
    if(window.histLayer)map.removeLayer(window.histLayer);
    window.histLayer=L.tileLayer(`https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut${code}*`,{opacity:Number(opSlider.value)/100||0.6,maxZoom:20}).addTo(map);
    L.popup().setLatLng(e.latlng).setContent(`<div style="min-width:240px"><strong>🕰 Kadastraal minuutplan 1811-1832</strong><br>Gemeente: ${esc(p.GEMEENTE||"")}<br>Sectie: ${esc(p.SECTIE||"")} Blad: ${esc(p.BLAD||"")}<br><br><a href="${esc(p.URL)}" target="_blank" style="display:inline-block;padding:8px 12px;background:#1d5d8f;color:white;text-decoration:none;border-radius:5px">Origineel</a></div>`).openOn(map);
  }catch(err){console.error(err);}
});

fetch("monumenten.json").then(r=>r.json()).then(d=>{monumentenData=d;const rad=Number(radiusSel?.value||100);loadBAG(52.516,6.42,rad);}).catch(()=>{monumentenData=[];const rad=Number(radiusSel?.value||100);loadBAG(52.516,6.42,rad);});

window.addEventListener("load",()=>{
  setTimeout(()=>{
    const r=Number(radiusSel?.value||100);
    lastLat=52.516;lastLng=6.42;
    // geen huidige positie icoon bij opstarten
    if(!monumentenData.length){fetch("monumenten.json").then(r=>r.json()).then(d=>{monumentenData=d;loadBAG(52.516,6.42,r);});}
    else loadBAG(52.516,6.42,r);
  },500);
});
