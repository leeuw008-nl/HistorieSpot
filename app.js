// OUDE SITUATIE ZONDER MONUMENTEN - gefixed voor 4 punten
const map=L.map("map",{zoomControl:false}).setView([52.516,6.42],15);
L.control.zoom({position:'bottomleft'}).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
let curMarker=null,accCircle=null;
const bagLayer=L.layerGroup().addTo(map),bagLabel=L.layerGroup().addTo(map);
const CORR={"MIN04041B02":"MIN04041B03","MIN04041B03":"MIN04041B02"};
function corr(c){return CORR[c]||c;}
const locateBtn=document.getElementById("locateBtn"),radiusSel=document.getElementById("radius"),statusBox=document.getElementById("status"),menuBtn=document.getElementById("menuBtn"),closeMenuBtn=document.getElementById("closeMenuBtn"),sideMenu=document.getElementById("sideMenu"),menuOverlay=document.getElementById("menuOverlay"),infoBtn=document.getElementById("infoBtn"),closeInfoBtn=document.getElementById("closeInfoBtn"),infoModal=document.getElementById("infoModal"),infoOverlay=document.getElementById("infoOverlay"),toggleMin=document.getElementById("toggleMinuutplan"),opSlider=document.getElementById("historischeOpacity"),opVal=document.getElementById("historischeOpacityValue"),toggleBAGBtn=document.getElementById("toggleBAGBtn");
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
async function loadBAG(latitude, longitude, radius){
  objectLayer.clearLayers();
  yearLabelLayer.clearLayers();
  const box = createBoundingBox(latitude, longitude, radius);
  let allFeatures = [];
  try{
    for(let start=0; start<4000; start+=1000){
      const url = "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items"
        + `?bbox=${box.minLongitude},${box.minLatitude},${box.maxLongitude},${box.maxLatitude}`
        + `&limit=1000&f=json&startIndex=${start}`;
      const r = await fetch(url);
      if(!r.ok) break;
      const data = await r.json();
      const feats = data.features||[];
      allFeatures = allFeatures.concat(feats);
      if(feats.length < 1000) break; // klaar
    }
    const nearby = allFeatures.map(function(f){
      const c = calculateFeatureCenter(f);
      let d = Infinity;
      if(c) d = calculateDistance(latitude, longitude, c.latitude, c.longitude);
      return {feature:f, center:c, distance:d};
    }).filter(o=>o.distance <= radius).sort((a,b)=>a.distance-b.distance);
    displayResults(nearby);
  }catch(e){
    console.error(e);
    setStatus("⚠️ PDOK kon niet worden bereikt.");
  }
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
radiusSel&&radiusSel.addEventListener("change",()=>{const r=Number(radiusSel.value);if(curMarker){const ll=curMarker.getLatLng();loadBAG(ll.lat,ll.lng,r);}else{loadBAG(52.516,6.42,r);}});
map.on("click",async e=>{
  if(!map.hasLayer(minuutLayer))return;
  try{
    const rd=wgs84ToRD(e.latlng.lat,e.latlng.lng),b=[rd.x-20,rd.y-20,rd.x+20,rd.y+20].join(","),url=`https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox=${encodeURIComponent(b)}&outputFormat=application/json&count=1`;
    const res=await fetch(url),data=await res.json();if(!data.features||!data.features.length)return;
    let code=data.features[0].properties.CODE;const orig=code;code=corr(code);
    if(window.histLayer)map.removeLayer(window.histLayer);
    window.histLayer=L.tileLayer(`https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut${code}*`,{opacity:Number(opSlider.value)/100||0.6,maxZoom:20}).addTo(map);
    const p=data.features[0].properties;
    L.popup().setLatLng(e.latlng).setContent(`<div style="min-width:240px"><strong>🕰 Minuutplan 1811-1832</strong><br>${esc(p.GEMEENTE)} ${esc(p.SECTIE)} ${esc(p.BLAD)}<br>RCE ${esc(orig)} → HisGIS ${esc(code)}<br><br><a href="${esc(p.URL)}" target="_blank" style="display:inline-block;padding:8px 12px;background:#1d5d8f;color:white;text-decoration:none;border-radius:5px">Origineel</a></div>`).openOn(map);
  }catch(err){console.error(err);}
});
window.addEventListener("load",()=>{
  setTimeout(()=>{
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(p=>{
        const lat=p.coords.latitude,lng=p.coords.longitude,r=Number(radiusSel.value);
        map.setView([lat,lng],18);
        curMarker=L.marker([lat,lng]).addTo(map).bindPopup("Huidige positie");
        accCircle=L.circle([lat,lng],{radius:p.coords.accuracy,color:"#0b5cab",fillOpacity:0.08}).addTo(map);
        loadBAG(lat,lng,r);
      },()=>{
        loadBAG(52.516,6.42,Number(radiusSel.value));
      },{enableHighAccuracy:true,timeout:8000});
    }else{
      loadBAG(52.516,6.42,Number(radiusSel.value));
    }
  },600);
});
