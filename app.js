// OUDE SITUATIE ZONDER MONUMENTEN - gefixed voor 4 punten
const map=L.map("map",{zoomControl:false}).setView([52.516,6.42],15);
window.map=map;
L.control.zoom({position:'bottomleft'}).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);

let curMarker=null,accCircle=null;

const bagLayer=L.layerGroup().addTo(map),
      bagLabel=L.layerGroup().addTo(map);

/* =========================================================
   RCE Rijksmonumenten - NIEUW
   ========================================================= */
const rceLayer=L.layerGroup().addTo(map);
const rceSeen=new Set();

/* ========================================================= */

const CORR={"MIN04041B02":"MIN04041B03","MIN04041B03":"MIN04041B02"};
function corr(c){return CORR[c]||c;}

const locateBtn=document.getElementById("locateBtn"),
      radiusSel=document.getElementById("radius"),
      statusBox=document.getElementById("status"),
      menuBtn=document.getElementById("menuBtn"),
      closeMenuBtn=document.getElementById("closeMenuBtn"),
      sideMenu=document.getElementById("sideMenu"),
      menuOverlay=document.getElementById("menuOverlay"),
      infoBtn=document.getElementById("infoBtn"),
      closeInfoBtn=document.getElementById("closeInfoBtn"),
      infoModal=document.getElementById("infoModal"),
      infoOverlay=document.getElementById("infoOverlay"),
      toggleMin=document.getElementById("toggleMinuutplan"),
      opSlider=document.getElementById("historischeOpacity"),
      opVal=document.getElementById("historischeOpacityValue"),
      toggleBAGBtn=document.getElementById("toggleBAGBtn"),
      yearFilterSel=document.getElementById("yearFilter"),
      toggleKadasterColors=document.getElementById("toggleKadasterColors");

function openMenu(){
  sideMenu&&sideMenu.classList.add("open");
  menuOverlay&&menuOverlay.classList.remove("hidden");
}

function closeMenu(){
  sideMenu&&sideMenu.classList.remove("open");
  menuOverlay&&menuOverlay.classList.add("hidden");
}

function openInfo(){
  infoModal&&infoModal.classList.remove("hidden");
  infoOverlay&&infoOverlay.classList.remove("hidden");
}

function closeInfo(){
  infoModal&&infoModal.classList.add("hidden");
  infoOverlay&&infoOverlay.classList.add("hidden");
}

menuBtn&&menuBtn.addEventListener("click",openMenu);
closeMenuBtn&&closeMenuBtn.addEventListener("click",closeMenu);
menuOverlay&&menuOverlay.addEventListener("click",closeMenu);
infoBtn&&infoBtn.addEventListener("click",openInfo);
closeInfoBtn&&closeInfoBtn.addEventListener("click",closeInfo);
infoOverlay&&infoOverlay.addEventListener("click",closeInfo);

function setStatus(t){
  if(statusBox)statusBox.textContent=t;
}

function esc(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function getYearCat(y){
  const n=parseInt(y,10);
  if(isNaN(n)) return null;
  if(n<1800) return "pre1800";
  if(n<1900) return "1800-1900";
  if(n<1950) return "1900-1950";
  if(n<1965) return "1950-1965";
  if(n<1980) return "1965-1980";
  if(n<2000) return "1980-2000";
  return "na2000";
}

function kadasterColor(y){
  const n=parseInt(y,10);
  if(isNaN(n)) return "#0b5cab";
  if(n<1800) return "#7a1d1d";
  if(n<1900) return "#d26e00";
  if(n<1950) return "#b89a00";
  if(n<1965) return "#5a9a4a";
  if(n<1980) return "#4a8ab5";
  if(n<2000) return "#7a5ab5";
  return "#a0a0a0";
}

let activeYearFilter="all", useKadaster=true;

function matchesYearFilter(y){
  if(activeYearFilter==="all") return true;
  return getYearCat(y)===activeYearFilter;
}

function yearClass(y){
  const n=parseInt(y,10);
  if(isNaN(n))return"unknown";
  if(n<1850)return"very-old";
  if(n<1920)return"old";
  return"";
}

function dist(a,b,c,d){
  const R=6371000,
        la=(c-a)*Math.PI/180,
        lo=(d-b)*Math.PI/180;

  const x=Math.sin(la/2)**2+
          Math.cos(a*Math.PI/180)*
          Math.cos(c*Math.PI/180)*
          Math.sin(lo/2)**2;

  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function box(lat,lng,r){
  const dLa=r/111320,
        dLo=r/(111320*Math.cos(lat*Math.PI/180));

  return{
    minLa:lat-dLa,
    maxLa:lat+dLa,
    minLo:lng-dLo,
    maxLo:lng+dLo
  };
}

function centerOf(f){
  if(!f.geometry)return null;

  const pts=[];

  function rec(c){
    if(typeof c[0]==="number"){
      pts.push(c);
      return;
    }
    c.forEach(rec);
  }

  rec(f.geometry.coordinates);

  if(!pts.length)return null;

  let sl=0,sa=0;

  pts.forEach(p=>{
    sl+=p[0];
    sa+=p[1];
  });

  return{
    lat:sa/pts.length,
    lng:sl/pts.length
  };
}

function wgs84ToRD(lat,lon){
  const dF=0.36*(lat-52.1551744),
        dL=0.36*(lon-5.38720621);

  const x=
    155000+
    190094.945*dL-
    11832.228*dF*dL-
    114.221*Math.pow(dF,2)*dL-
    32.391*Math.pow(dL,3)-
    0.705*dF-
    2.34*Math.pow(dF,3)*dL-
    0.608*Math.pow(dF,2)*Math.pow(dL,3)-
    0.008*Math.pow(dL,2)+
    0.148*Math.pow(dF,2)*Math.pow(dL,3);

  const y=
    463000+
    309056.544*dF+
    3638.893*Math.pow(dL,2)+
    73.077*Math.pow(dF,2)-
    157.984*dF*Math.pow(dL,2)+
    59.788*Math.pow(dF,3)+
    0.433*dL-
    6.439*Math.pow(dF,2)*Math.pow(dL,2)-
    0.032*dF*dL+
    0.092*Math.pow(dL,4)-
    0.054*dF*Math.pow(dL,4);

  return{x,y};
}

const minuutLayer=L.tileLayer.wms(
  "https://services.rce.geovoorziening.nl/misc/wms",
  {
    layers:"Minuutplanbegrenzingen",
    format:"image/png",
    transparent:true,
    version:"1.3.0",
    opacity:0.5
  }
).addTo(map);

minuutLayer.addTo(map);

toggleMin&&toggleMin.addEventListener(
  "change",
  e=>{
    e.target.checked
      ? minuutLayer.addTo(map)
      : map.removeLayer(minuutLayer);
  }
);

opSlider&&opSlider.addEventListener(
  "input",
  function(){
    const o=Number(this.value)/100;

    if(window.histLayer)
      window.histLayer.setOpacity(o);

    if(minuutLayer)
      minuutLayer.setOpacity(o);

    if(opVal)
      opVal.textContent=this.value+"%";
  }
);

toggleBAGBtn&&toggleBAGBtn.addEventListener(
  "click",
  ()=>{
    const h=map.hasLayer(bagLayer);

    if(h){
      map.removeLayer(bagLayer);
      map.removeLayer(bagLabel);
      toggleBAGBtn.classList.remove("active");
    }else{
      bagLayer.addTo(map);
      bagLabel.addTo(map);
      toggleBAGBtn.classList.add("active");
    }
  }
);


/* =========================================================
   RCE FUNCTIE 1
   Haalt het verblijfsobject op dat bij een BAG-pand hoort.
   ========================================================= */

async function getBAGAddresses(p,o){
  const results=[];

  if(p && Array.isArray(p.verblijfsobject)){
    const hrefs=p.verblijfsobject.map(v=>v && (v.href || v)).filter(Boolean);
    for(const href of hrefs){
      try{
        const res=await fetch(href);
        if(!res.ok) continue;
        const data=await res.json();
        const v=data && Array.isArray(data.features) && data.features.length
          ? (data.features[0].properties || {})
          : (data.properties || {});
        if(!v.openbare_ruimte_naam || !v.huisnummer || !v.woonplaats_naam) continue;
        results.push({
          straat:v.openbare_ruimte_naam,
          huisnummer:v.huisnummer,
          huisletter:v.huisletter || '',
          toevoeging:v.toevoeging || '',
          postcode:v.postcode || '',
          woonplaats:v.woonplaats_naam
        });
      }catch(e){ console.error('BAG verblijfsobject fout:',href,e); }
    }
  }

  if(results.length) return results;
  if(!p || !o || !o.c) return [];

  try{
    const b=box(o.c.lat,o.c.lng,50);
    const url=`https://api.pdok.nl/kadaster/bag/ogc/v2/collections/verblijfsobject/items?bbox=${b.minLo},${b.minLa},${b.maxLo},${b.maxLa}&limit=100&f=json`;
    const res=await fetch(url);
    if(!res.ok) return [];
    const data=await res.json();
    const features=Array.isArray(data.features) ? data.features : [];

    const clickedPandId=
      o.f && o.f.id
        ? String(o.f.id)
        : '';

    for(const f of features){
      const v=f.properties || {};
      const rel=v.pand;
      const hrefs=[];

      if(Array.isArray(rel)) rel.forEach(r=>{
        if(typeof r==='string') hrefs.push(r);
        else if(r && r.href) hrefs.push(r.href);
      });
      else if(typeof rel==='string') hrefs.push(rel);
      else if(rel && rel.href) hrefs.push(rel.href);

      if(v["pand.href"]){
        if(Array.isArray(v["pand.href"]))
          v["pand.href"].forEach(h=>hrefs.push(h));
        else
          hrefs.push(v["pand.href"]);
      }

      const matchesClickedPand=
        clickedPandId &&
        hrefs.some(h=>String(h).endsWith('/'+clickedPandId));

      if(!matchesClickedPand) continue;
      if(!v.openbare_ruimte_naam || !v.huisnummer || !v.woonplaats_naam) continue;

      results.push({
        straat:v.openbare_ruimte_naam,
        huisnummer:v.huisnummer,
        huisletter:v.huisletter || '',
        toevoeging:v.toevoeging || '',
        postcode:v.postcode || '',
        woonplaats:v.woonplaats_naam
      });
    }
  }catch(e){ console.error('BAG VO zoekfout:',e); }

  return results;
}

async function findRCEByAddress(address){

  try{

    const params=new URLSearchParams();

    params.set("page","1");
    params.set("pageSize","10");

    /*
      De RCE API ondersteunt postcode en volledigAdres.
      We gebruiken beide wanneer postcode beschikbaar is.
    */

    const volledigAdres=
      `${address.straat} ${address.huisnummer}${address.huisletter || ""}${address.toevoeging || ""}`;

    params.set("volledigAdres",volledigAdres);

    if(address.postcode)
      params.set("postcode",address.postcode);

    if(address.woonplaats)
      params.set("woonplaatsnaam",address.woonplaats);

    const url=
      "https://api.linkeddata.cultureelerfgoed.nl/" +
      "queries/rce/rest-api-rijksmonumenten/run?" +
      params.toString();

    const res=await fetch(url);

    if(!res.ok)
      return [];

    const data=await res.json();

    return Array.isArray(data)
      ? data
      : [];

  }catch(e){

    console.error(
      "RCE Rijksmonumenten fout:",
      e
    );

    return [];
  }
}


/* =========================================================
   RCE FUNCTIE 3
   Toon gevonden Rijksmonumenten als aparte marker.
   Bestaande BAG-popup blijft onaangetast.
   ========================================================= */

function showRCE(rce,address,lat,lng){

  const number=
    rce.rijksmonumentnummer ||
    rce.cultuurhistorischObjectnummer ||
    "";

  if(!number)
    return;

  if(rceSeen.has(number))
    return;

  rceSeen.add(number);

  const bag=
    rce.heeftBAGRelatie || {};

  const omschrijving=
    rce.heeftOmschrijving &&
    rce.heeftOmschrijving["ceo:omschrijving"]
      ? rce.heeftOmschrijving["ceo:omschrijving"]
      : (
          rce.heeftKennisregistratie &&
          rce.heeftKennisregistratie[0] &&
          rce.heeftKennisregistratie[0]["ceo:omschrijving"]
            ? rce.heeftKennisregistratie[0]["ceo:omschrijving"]
            : ""
        );

  const functie=
    rce.heeftOorspronkelijkeFunctie &&
    rce.heeftOorspronkelijkeFunctie.heeftFunctieNaam &&
    rce.heeftOorspronkelijkeFunctie.heeftFunctieNaam["skos:prefLabel"]
      ? rce.heeftOorspronkelijkeFunctie.heeftFunctieNaam["skos:prefLabel"]
      : "";

  const inschrijving=
    rce.datumInschrijvingInMonumentenregister
      ? new Date(
          rce.datumInschrijvingInMonumentenregister
        ).toLocaleDateString("nl-NL")
      : "";

  const adres=
    bag.volledigAdres ||
    `${address.straat} ${address.huisnummer}`;

  const popup=`
    <div style="min-width:280px">
      <b>🏛 Rijksmonument</b><br>
      Rijksmonumentnummer:
      <b>${esc(number)}</b>

      <hr style="margin:8px 0">

      <b>${esc(adres)}</b><br>
      ${address.postcode
        ? esc(address.postcode)+" "
        : ""}${esc(address.woonplaats)}

      ${functie
        ? `<br><br><b>Oorspronkelijke functie:</b><br>${esc(functie)}`
        : ""}

      ${inschrijving
        ? `<br><br><b>Ingeschreven:</b> ${esc(inschrijving)}`
        : ""}

      ${omschrijving
        ? `<br><br><b>Omschrijving:</b><br>${esc(omschrijving)}`
        : ""}
    </div>
  `;

  L.circleMarker([lat,lng],{
    radius:9,
    color:'#b00000',
    weight:3,
    fillColor:'#ff4444',
    fillOpacity:0.9
  }).bindPopup(popup).addTo(rceLayer);
}

async function loadRCEForPand(o){
  if(!o || !o.f)
    return;
  const p=o.f.properties || {};
  const addresses=
    await getBAGAddresses(p,o);
  if(window.rceFlowDebug) window.rceFlowDebug(
    "FLOW → BAG-adressen terug: " + addresses.length
  );
  if(!addresses.length){
    return;
  }
  for(const address of addresses){
    if(window.rceFlowDebug) window.rceFlowDebug(
      "FLOW → findRCEByAddress aanroep voor " +
      address.straat + " " + address.huisnummer
    );
    const monuments=
      await findRCEByAddress(address);
    const adresDiagnose=
      `${address.straat} ${address.huisnummer}${address.huisletter || ""}${address.toevoeging || ""}, ${address.postcode || "postcode onbekend"}, ${address.woonplaats}`;
    setStatus(
      `RCE-diagnose: BAG verblijfsobject → ${adresDiagnose} → ${monuments.length} RCE-resultaat/resultaten`
    );
    if(!monuments.length)
      continue;
    monuments.forEach(rce=>{
      showRCE(rce,address,o.c.lat,o.c.lng);
    });
  }
}
