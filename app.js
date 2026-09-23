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
   OVERIJSSEL MONUMENTEN - RUIMTELIJKE KOPPELING
   BAG-pand -> monumentpunt binnen 50 meter
   ========================================================= */
const monumentLayer=L.layerGroup().addTo(map);
const monumentSeen=new Set();

function rdToWgs84(x,y){
  const dx=(x-155000)/100000;
  const dy=(y-463000)/100000;
  const lat=52.15517440+(3235.65389*dy-32.58297*dx*dx-0.2475*dy*dy-0.84978*dx*dx*dy-0.0655*dy*dy*dy-0.01709*dx*dx*dy*dy-0.00738*dx+0.0053*dx*dx*dx*dx-0.00039*dx*dx*dy*dy*dy+0.00033*dx*dx*dx*dx*dy-0.00012*dx*dy)/3600;
  const lon=5.38720621+(5260.52916*dx+105.94684*dx*dy+2.45656*dx*dy*dy-0.81885*dx*dx*dx+0.05594*dx*dy*dy*dy-0.05607*dx*dx*dx*dy+0.01199*dy-0.00256*dx*dx*dy+0.00128*dx*dx*dx*dx+0.00022*dy*dy-0.00022*dx*dx*dy*dy+0.00026*dx*dx*dx*dx*dx*dx)/3600;
  return{lat,lon};
}

const GEMEENTE_MONUMENT_IMAGES_URL="data/gemeente-monumenten-afbeeldingen.json";
let gemeenteMonumentImagesPromise=null;

async function getGemeenteMonumentImages(){
  if(gemeenteMonumentImagesPromise) return gemeenteMonumentImagesPromise;

  gemeenteMonumentImagesPromise=fetch(GEMEENTE_MONUMENT_IMAGES_URL,{cache:"no-cache"})
    .then(r=>{
      if(!r.ok) throw new Error("Monumentafbeeldingen-index HTTP "+r.status);
      return r.json();
    })
    .catch(e=>{
      gemeenteMonumentImagesPromise=null;
      throw e;
    });

  return gemeenteMonumentImagesPromise;
}

function normalizeMonumentText(value){
  return String(value||"")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[’']/g,"'")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function monumentHouseMatch(wanted,known){
  const a=normalizeMonumentText(wanted);
  const b=normalizeMonumentText(known);

  if(!a||!b) return false;
  if(a===b) return true;

  const na=a.replace(/\s+/g,"").replace(/t\/m/g,"-");
  const nb=b.replace(/\s+/g,"").replace(/t\/m/g,"-");
  if(na===nb) return true;

  const ad=(a.match(/\d+/g)||[]).join(",");
  const bd=(b.match(/\d+/g)||[]).join(",");
  return !!ad && ad===bd;
}

async function loadGemeenteMonumentImages(address){
  const straat=normalizeMonumentText(address?.straat);
  const huisnummer=normalizeMonumentText(address?.huisnummer);

  if(!straat) return [];

  const data=await getGemeenteMonumentImages();
  const monuments=Array.isArray(data?.monuments)?data.monuments:[];

  const matches=monuments.filter(m=>{
    const ms=normalizeMonumentText(m.street||"");
    if(!ms) return false;

    const streetMatch=
      ms===straat ||
      ms.includes(straat) ||
      straat.includes(ms);

    if(!streetMatch) return false;

    if(!huisnummer) return true;

    const mh=normalizeMonumentText(m.house||"");
    const ma=normalizeMonumentText(m.address||"");

    return monumentHouseMatch(huisnummer,m.house||"") ||
           monumentHouseMatch(huisnummer,m.address||"") ||
           ma.includes(huisnummer) ||
           mh.includes(huisnummer);
  });

  const result=[];
  const seen=new Set();

  matches.forEach(m=>{
    (m.images||[]).forEach(img=>{
      if(!img?.url||seen.has(img.url)) return;
      seen.add(img.url);
      result.push({
        url:img.url,
        label:img.label||""
      });
    });
  });

  return result;
}



async function getRijksmonumentDetails(number){
  if(!number || number==="Onbekend") return null;

  try{
    const url=
      "https://api.linkeddata.cultureelerfgoed.nl/"+
      "queries/rce/rest-api-rijksmonumenten/run?"+
      "page=1&pageSize=10&rijksmonumentnummer="+
      encodeURIComponent(String(number));

    const res=await fetch(url);
    if(!res.ok) return null;

    const data=await res.json();

    const list=
      Array.isArray(data) ? data :
      Array.isArray(data?.results) ? data.results :
      Array.isArray(data?.data) ? data.data :
      [];

    if(!list.length) return null;

    return list.find(x=>
      String(x?.rijksmonumentnummer||"").trim()===String(number).trim()
    ) || list[0];
  }catch(e){
    console.warn("RCE detailgegevens fout:",e);
    return null;
  }
}

async function getRijksmonumentDetailsByAddress(address,number){
  if(!address?.straat) return null;

  try{
    const params=new URLSearchParams({
      page:"1",
      pageSize:"10",
      straat:String(address.straat),
      postcode:String(address.postcode||"")
    });

    const url=
      "https://api.linkeddata.cultureelerfgoed.nl/"+
      "queries/rce/rest-api-rijksmonumenten/run?"+
      params.toString();

    const res=await fetch(url);
    if(!res.ok) return null;

    const data=await res.json();
    const list=
      Array.isArray(data) ? data :
      Array.isArray(data?.results) ? data.results :
      Array.isArray(data?.data) ? data.data :
      [];

    const wantedNumber=String(address.huisnummer||"").trim();

    return list.find(x=>{
      const n=String(x?.rijksmonumentnummer||"").trim();
      const bag=x?.heeftBasisregistratieRelatie?.heeftBAGRelatie||x?.heeftBAGRelatie||{};
      const h=String(bag.huisnummer||"").trim();
      return n===String(number).trim() &&
             (!wantedNumber || h===wantedNumber);
    }) || list.find(x=>
      String(x?.rijksmonumentnummer||"").trim()===String(number).trim()
    ) || null;
  }catch(e){
    console.warn("RCE adresgegevens fout:",e);
    return null;
  }
}

function buildRijksmonumentPopup(rce,number,fallbackAddress,wfs){
  const bag=rce?.heeftBAGRelatie||rce?.heeftBasisregistratieRelatie?.heeftBAGRelatie||{};
  const fallback=typeof fallbackAddress==="object"
    ? fallbackAddress
    : {full:fallbackAddress||""};

  const adres=
    bag.volledigAdres ||
    fallback.full ||
    "Onbekend";

  const postcode=bag.postcode||fallback.postcode||"";
  const plaats=bag.woonplaatsnaam||fallback.plaats||"";

  const inschrijving=
    rce?.datumInschrijvingInMonumentenregister ||
    rce?.inschrijving
      ? new Date(
          rce.datumInschrijvingInMonumentenregister ||
          rce.inschrijving
        ).toLocaleDateString("nl-NL")
      : "";

  const functie=
    rce?.heeftOorspronkelijkeFunctie?.heeftFunctieNaam?.["skos:prefLabel"]||
    rce?.functie||
    "";

  const omschrijving=
    rce?.heeftOmschrijving?.["ceo:omschrijving"]||
    rce?.heeftKennisregistratie?.[0]?.["ceo:omschrijving"]||
    rce?.omschrijving||
    "";

  const aard=
    rce?.heeftMonumentAard?.["skos:prefLabel"]||
    rce?.monumentAard||
    wfs?.aard_monument||
    "";

  const status=
    rce?.heeftJuridischeStatus?.["skos:prefLabel"]||
    rce?.juridischeStatus||
    wfs?.juridische_status||
    "";

  const registerUrl=wfs?.rijksmonumenturl||("https://monumentenregister.cultureelerfgoed.nl/monumenten/"+encodeURIComponent(String(number)));
  const hoofdcategorie=String(wfs?.hoofdcategorie||"").trim();
  const subcategorie=String(wfs?.subcategorie||"").trim();
  const kwaliteit=String(wfs?.kwaliteit_geometrie||"").trim();

  const diagnoseKeys=Object.keys(wfs||{})
    .filter(k=>wfs[k]!==null&&wfs[k]!==undefined&&String(wfs[k]).trim()!=="")
    .sort();

  const diagnoseRows=diagnoseKeys
    .slice(0,40)
    .map(k=>`<div><b>${esc(k)}</b>: ${esc(wfs[k])}</div>`)
    .join("");

  const diagnose=`
    <details style="margin-top:10px;padding-top:9px;border-top:1px solid #ddd;font-size:11px">
      <summary style="cursor:pointer;font-weight:700">RM-diagnose: WFS-velden (${diagnoseKeys.length})</summary>
      <div style="margin-top:7px;line-height:1.35">
        ${diagnoseRows||"<i>Geen niet-lege WFS-velden gevonden</i>"}
      </div>
    </details>
  `;

  return `
    <div style="min-width:300px;max-width:380px;font-size:14px;line-height:1.45">
      <div style="font-size:18px;font-weight:700;margin-bottom:9px">
        🏛 Rijksmonument
      </div>

      <div style="background:#f7eeee;border-left:4px solid #7b1e1e;border-radius:6px;padding:9px 10px;margin-bottom:10px">
        <div style="font-size:12px;color:#666">Rijksmonumentnummer</div>
        <div style="font-size:17px;font-weight:700">${esc(number)}</div>
      </div>

      <div style="margin-bottom:9px">
        <b>Adres</b><br>
        ${esc(adres)}
        ${postcode ? "<br>"+esc(postcode) : ""}
        ${plaats ? "<br>"+esc(plaats) : ""}
      </div>

      ${aard ? `<div style="margin-top:8px"><b>Monumentaard</b><br>${esc(aard)}</div>` : ""}
      ${status ? `<div style="margin-top:8px"><b>Juridische status</b><br>${esc(status)}</div>` : ""}
      ${hoofdcategorie ? `<div style="margin-top:8px"><b>Hoofdcategorie</b><br>${esc(hoofdcategorie)}</div>` : ""}
      ${subcategorie ? `<div style="margin-top:8px"><b>Subcategorie</b><br>${esc(subcategorie)}</div>` : ""}
      ${kwaliteit ? `<div style="margin-top:8px"><b>Kwaliteit geometrie</b><br>${esc(kwaliteit)}</div>` : ""}
      ${inschrijving ? `<div style="margin-top:8px"><b>Inschrijving register</b><br>${esc(inschrijving)}</div>` : ""}
      ${functie ? `<div style="margin-top:8px"><b>Oorspronkelijke functie</b><br>${esc(functie)}</div>` : ""}

      ${omschrijving
        ? `<div style="margin-top:10px;padding-top:9px;border-top:1px solid #ddd">
            <b>Omschrijving</b><br>
            <span style="font-size:13px">${esc(omschrijving)}</span>
          </div>`
        : ""}

      <div style="margin-top:11px;padding-top:9px;border-top:1px solid #ddd">
        <a href="${registerUrl}" target="_blank" rel="noopener"
           style="display:inline-block;padding:7px 10px;background:#7b1e1e;color:white;text-decoration:none;border-radius:5px">
          Rijksmonumentenregister
        </a>
      </div>

      ${diagnose}

      <div style="font-size:11px;color:#666;margin-top:8px">
        Bron: Rijksdienst voor het Cultureel Erfgoed
      </div>
    </div>
  `;
}


async function loadOverijsselMonumentenVoorPand(o){
  if(!o||!o.c||!o.f)return;

  const rd=wgs84ToRD(o.c.lat,o.c.lng),r=50;

  const layers=[
    {
      name:"Rijksmonumenten",
      label:"Rijksmonument",
      wfs:"https://data.geo.cultureelerfgoed.nl/openbaar/wfs",
      typeName:"geolinq:rijksmonumentpunten"
    },
    {
      name:"B73_Gemeentelijke_Monumenten",
      label:"Gemeentelijk monument",
      wfs:"https://services.geodataoverijssel.nl/geoserver/B73_Cultuur/wfs",
      typeName:"B73_Cultuur:B73_Gemeentelijke_Monumenten"
    }
  ];

  for(const layer of layers){
    try{
      const params=new URLSearchParams({
        service:"WFS",
        version:"2.0.0",
        request:"GetFeature",
        typeNames:layer.typeName,
        srsName:"EPSG:28992",
        bbox:`${rd.x-r},${rd.y-r},${rd.x+r},${rd.y+r},EPSG:28992`,
        outputFormat:"application/json",
        count:"20"
      });

      const res=await fetch(`${layer.wfs}?${params}`);
      if(!res.ok)continue;

      const data=await res.json();
      const features=Array.isArray(data.features)?data.features:[];

      for(const f of features){
        const p=f.properties||{},g=f.geometry||{};
        if(g.type!=="Point"||!Array.isArray(g.coordinates)||g.coordinates.length<2)continue;

        const mx=Number(g.coordinates[0]);
        const my=Number(g.coordinates[1]);
        const d=Math.hypot(mx-rd.x,my-rd.y);
        if(!Number.isFinite(d)||d>r)continue;

        const getProp=(...keys)=>{
          for(const key of keys){
            const value=p[key];
            if(value!==undefined&&value!==null&&String(value).trim()!=="")
              return value;
          }
          return "";
        };

        const number=String(getProp(
          "Rijksmonnr",
          "rijksmonument_nummer",
          "rijksmonument_num",
          "rijksmonumentnummer",
          "MONUMENTENNUMMER",
          "monumenten_nummer",
          "Rijksmonumentnummer",
          "RIJKSMONUMENTNUMMER",
          "Ref_nr",
          "OBJECTNUMMER",
          "objectnummer",
          "ID",
          "id"
        )||"").trim();

        const key=`${layer.name}:${number||f.id||`${mx},${my}`}`;
        if(monumentSeen.has(key))continue;
        monumentSeen.add(key);

        const ll=rdToWgs84(mx,my);
        const isRM=layer.name==="Rijksmonumenten";

        const straat=String(getProp(
          "Straat","STRAATNAAM","straatnaam","straat",
          "OPENBARERUIMTE","openbare_ruimte","openbareRuimte"
        )||"").trim();

        const huisnummer=String(getProp(
          "Huisnummer","HUISNUMMERS","huisnummers",
          "HUISNUMMER","huisnummer"
        )||"").trim();

        const postcode=String(getProp(
          "Postcode","POSTCODE","postcode"
        )||"").trim();

        const plaats=String(getProp(
          "BAG_plaats","Plaats","PLAATSNAAM","plaatsnaam",
          "plaats","WOONPLAATS","woonplaats","woonplaats_naam"
        )||"").trim();

        const address=[
          straat,
          huisnummer
        ].filter(Boolean).join(" ");

        const nummer=number||"Onbekend";

        let popup;

        if(isRM){
          // De landelijke monument-WFS levert betrouwbaar het RM-nummer,
          // maar niet de inhoudelijke adres-/registervelden.
          // Gebruik daarom dezelfde bewezen RCE-adresquery als de bestaande RCE-logica.
          popup=buildRijksmonumentPopup(null,nummer,address,p);

          if(number){
            // De verrijking gebeurt direct na het aanmaken van de marker hieronder.
            // Zo gebruiken we het BAG-adres van exact dit pand.
          }
        }else{
          const monumentType=layer.label;
          const nummer=number||"Onbekend";

        const labelMap={
          MONUMENTENNUMMER:"Monumentnummer",
          NAAM:"Naam",
          BENAMING:"Benaming",
          OMSCHRIJVING:"Omschrijving",
          BOUWJAAR:"Bouwjaar",
          BOUWPERIODE:"Bouwperiode",
          FUNCTIE:"Functie",
          OORSPRONKELIJKE_FUNCTIE:"Oorspronkelijke functie",
          STRAATNAAM:"Straat",
          HUISNUMMERS:"Huisnummer",
          PLAATSNAAM:"Plaats",
          MIP_NR:"MIP-nummer",
          IND_WAARDERING:"Waardering",
          TYPE:"Type",
          CATEGORIE:"Categorie",
          STATUS:"Status"
        };

        const hiddenKeys=new Set([
          "OBJECTID","geometry","SHAPE","SHAPE_LENGTH","SHAPE_AREA",
          "MONUMENTENNUMMER","STRAATNAAM","HUISNUMMERS","PLAATSNAAM",
          "MIP_NR","IND_WAARDERING","TOELICHTING","PREVIEW"
        ]);

        const preferredKeys=[
          "NAAM","BENAMING","OMSCHRIJVING","BOUWJAAR","BOUWPERIODE",
          "FUNCTIE","OORSPRONKELIJKE_FUNCTIE","TYPE","CATEGORIE","STATUS"
        ];

        function displayValue(v){
          if(v===null||v===undefined||v==="")return "";
          if(Array.isArray(v))return v.join(", ");
          if(typeof v==="object")return JSON.stringify(v);
          return String(v);
        }

        function absoluteUrl(v){
          const s=String(v||"").trim();
          return s.startsWith("http://") || s.startsWith("https://") ? s : "";
        }

        function fieldRow(key){
          const value=displayValue(p[key]);
          if(!value)return "";
          const label=labelMap[key]||key.replaceAll("_"," ");
          const url=absoluteUrl(value);
          const isPreview=/^preview$/i.test(key)||/preview/i.test(label)||/preview/i.test(value);

          // Het Overijssel-WFS veld "Preview" bevat een afbeelding/afbeeldings-URL.
          // Toon die direct als afbeelding in plaats van de technische URL-tekst.
          if(isPreview && url){
            return `
              <div style="margin-top:9px;padding-top:2px">
                <b>Preview</b>
                <a href="${esc(url)}" target="_blank" rel="noopener" style="display:block;margin-top:6px;text-decoration:none">
                  <img src="${esc(url)}"
                       alt="Monument preview"
                       loading="lazy"
                       style="display:block;width:100%;max-width:340px;max-height:240px;object-fit:contain;border:1px solid #ccc;border-radius:6px;background:#f5f5f5">
                </a>
              </div>`;
          }

          if(url){
            return `
              <div style="margin-top:7px">
                <b>${esc(label)}</b><br>
                <a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:3px;padding:5px 8px;background:#1d5d8f;color:white;text-decoration:none;border-radius:4px">
                  ${esc(label)} openen
                </a>
              </div>`;
          }

          // Lange technische preview-/URL-achtige waarden niet meer over de popup laten doorlopen.
          const compactValue=value.length>180 ? value.slice(0,177)+"…" : value;

          return `
            <div style="margin-top:7px;overflow-wrap:anywhere">
              <b>${esc(label)}</b><br>
              <span>${esc(compactValue)}</span>
            </div>`;
        }

        let detailRows="";
        const used=new Set();

        preferredKeys.forEach(key=>{
          if(Object.prototype.hasOwnProperty.call(p,key)){
            const row=fieldRow(key);
            if(row){
              detailRows+=row;
              used.add(key);
            }
          }
        });

        // Neem ook overige niet-technische WFS-attributen mee.
        Object.keys(p).forEach(key=>{
          if(used.has(key)||hiddenKeys.has(key)||key.startsWith("_")||String(key).trim().toLowerCase()==="toelichting"||String(key).trim().toLowerCase()==="preview")return;
          const value=displayValue(p[key]);
          if(!value)return;
          detailRows+=fieldRow(key);
        });

        popup=`
          <div style="min-width:300px;max-width:380px;font-size:14px;line-height:1.45">
            <div style="font-size:18px;font-weight:700;margin-bottom:9px">
              🏛 ${esc(monumentType)}
            </div>

            <div style="background:#f3f5f7;border-left:4px solid ${layer.name==="B73_Rijksmonumenten"?"#7b1e1e":"#1d5d8f"};border-radius:6px;padding:9px 10px;margin-bottom:10px">
              <div style="font-size:12px;color:#666">Monumentnummer</div>
              <div style="font-size:17px;font-weight:700">${esc(nummer)}</div>
            </div>

            <div style="margin-bottom:9px">
              <b>Adres</b><br>
              ${address ? esc(address) : "Onbekend"}
              ${p.PLAATSNAAM ? ", "+esc(p.PLAATSNAAM) : ""}
            </div>

            <!--GEMEENTE_PREVIEW-->

            ${detailRows
              ? `<div style="border-top:1px solid #ddd;padding-top:2px">${detailRows}</div>`
              : ""}

            <hr style="margin:11px 0 8px">

            <div style="font-size:11px;color:#666">
              Bron: Provincie Overijssel · B73 Cultuur
            </div>
          </div>
        `;

        }
        const icon=L.divIcon({
          className:"",
          html:"<div style=\"background:"+(isRM?"#7b1e1e":"#1d5d8f")+";color:white;width:30px;height:30px;border-radius:50%;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;cursor:pointer;\">"+(isRM?"RM":"GM")+"</div>",
          iconSize:[30,30],
          iconAnchor:[15,15]
        });

        const monumentMarker=L.marker([ll.lat,ll.lon],{icon}).bindPopup(popup);
        monumentLayer.addLayer(monumentMarker);

        if(isRM && number){
          (async()=>{
            try{
              // Eerst het BAG-adres van exact dit pand ophalen.
              // Dit is onafhankelijk van de RCE-detailquery.
              const addresses=await getBAGAddresses(p,o);

              if(addresses.length){
                const a=addresses[0];

                // Toon direct het bekende BAG-adres.
                monumentMarker.setPopupContent(
                  buildRijksmonumentPopup(
                    null,
                    number,
                    {
                      full:[a.straat,a.huisnummer,a.huisletter,a.toevoeging]
                        .filter(Boolean).join(" "),
                      postcode:a.postcode,
                      plaats:a.woonplaats
                    },
                    p
                  )
                );

                // Daarna de inhoudelijke RCE-registergegevens ophalen.
                const details=await getRijksmonumentDetailsByAddress(a,number);

                if(details){
                  monumentMarker.setPopupContent(
                    buildRijksmonumentPopup(
                      details,
                      number,
                      {
                        full:[a.straat,a.huisnummer,a.huisletter,a.toevoeging]
                          .filter(Boolean).join(" "),
                        postcode:a.postcode,
                        plaats:a.woonplaats
                      },
                      p
                    )
                  );
                  return;
                }
              }

              // Laatste fallback: rechtstreeks op RM-nummer.
              const details=await getRijksmonumentDetails(number);
              if(details){
                monumentMarker.setPopupContent(
                  buildRijksmonumentPopup(
                    details,
                    number,
                    address||"Onbekend",
                    p
                  )
                );
              }
            }catch(e){
              console.warn("RCE RM-verrijking:",e);
            }
          })();
        }

        if(layer.name==="B73_Gemeentelijke_Monumenten"){
          loadGemeenteMonumentImages({
            straat:p.STRAATNAAM||straat,
            huisnummer:p.HUISNUMMERS||huisnummer
          }).then(images=>{
            if(!images.length) return;
            const gallery="<div style=\"margin-top:11px;padding-top:9px;border-top:1px solid #ddd\"><b>Preview</b><div style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:7px\">"+images.map(img=>"<a href=\""+esc(img.url)+"\" target=\"_blank\" rel=\"noopener\"><img src=\""+esc(img.url)+"\" alt=\""+esc(img.label)+"\" loading=\"lazy\" onerror=\"this.parentElement.style.display='none'\" style=\"display:block;width:100%;height:120px;object-fit:cover;border:1px solid #ccc;border-radius:5px;background:#f5f5f5\"></a>").join("")+"</div><div style=\"font-size:10px;color:#666;margin-top:5px\">Bron: Gemeenteblad 2026, 30438</div></div>";
            monumentMarker.setPopupContent(
              popup.replace("<!--GEMEENTE_PREVIEW-->",gallery)
            );
          }).catch(e=>console.warn("Gemeentelijke monumentafbeeldingen:",e));
        }
      }
    }catch(e){
      console.error(layer.label+" WFS fout:",e);
    }
  }
}

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
  verblijfsobjectId:
    String(v.identificatie || href.split('/').pop() || ''),
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
      o && o.f && o.f.id
        ? String(o.f.id)
        : '';

    const clickedPandIdentificatie=
      p && p.identificatie
        ? String(p.identificatie)
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

      const matchesClickedPand = hrefs.some(h=>{
        const hs=String(h);
        return (
          (clickedPandId && (hs.endsWith('/'+clickedPandId) || hs.includes('/'+clickedPandId))) ||
          (clickedPandIdentificatie && (hs.endsWith('/'+clickedPandIdentificatie) || hs.includes('/'+clickedPandIdentificatie)))
        );
      });

      if(!matchesClickedPand) continue;
      if(!v.openbare_ruimte_naam || !v.huisnummer || !v.woonplaats_naam) continue;

      results.push({
  verblijfsobjectId:
    String(v.identificatie || f.id || ''),
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

    const straat=String(address.straat || "").trim();
    const rceStraat=
      straat ? straat.charAt(0).toUpperCase()+straat.slice(1) : "";
    const huisnummer=String(address.huisnummer || "").trim();
    const huisletter=String(address.huisletter || "").trim();
    const toevoeging=String(address.toevoeging || "").trim();
    const verblijfsobjectId=
      String(address.verblijfsobjectId || "")
        .trim()
        .replace(/^.*\/verblijfsobject\//,"");

    if(straat)
      params.set("straat",straat);

    const url=
      "https://api.linkeddata.cultureelerfgoed.nl/" +
      "queries/rce/rest-api-rijksmonumenten/run?" +
      "page=1&pageSize=10&straat=" +
      encodeURIComponent(rceStraat);

    const res=await fetch(url);
    if(!res.ok)
      return [];

    const raw=await res.text();
    if(!raw.trim())
      return [];

    const triples=[];

    for(const line of raw.split(/\r?\n/)){

      const m=line.match(
        /^<([^>]+)>\s+<([^>]+)>\s+(?:"([^"]*)"|<([^>]+)>)(?:\^\^<[^>]+>)?\s*\.$/
      );

      if(!m)
        continue;

      triples.push({
        subject:m[1],
        predicate:m[2],
        literal:
          m[3] !== undefined
            ? m[3]
            : null,
        uri:
          m[4] !== undefined
            ? m[4]
            : null
      });
    }

    const subjects=new Map();

    for(const t of triples){

      if(!subjects.has(t.subject))
        subjects.set(t.subject,[]);

      subjects.get(t.subject).push(t);
    }

    function getLiteral(subject,predicate){

      const list=subjects.get(subject) || [];

      const t=list.find(x =>
        x.predicate.endsWith("#"+predicate)
      );

      return t
        ? (t.literal !== null ? t.literal : t.uri)
        : "";
    }

    function getUri(subject,predicate){

      const list=subjects.get(subject) || [];

      const t=list.find(x =>
        x.predicate.endsWith("#"+predicate)
      );

      return t ? t.uri : "";
    }

    function normalize(value){

      return String(value || "")
        .toLowerCase()
        .replace(/\s+/g," ")
        .trim();
    }

    const results=[];

    for(const [monumentSubject,monumentTriples] of subjects){

      const isRijksmonument=
        monumentTriples.some(t =>
          t.predicate.endsWith("#type") &&
          t.uri &&
          t.uri.endsWith("#Rijksmonument")
        );

      if(!isRijksmonument)
        continue;

      const basisSubject=
        getUri(
          monumentSubject,
          "heeftBasisregistratieRelatie"
        );

      if(!basisSubject)
        continue;

      const bagSubject=
        getUri(
          basisSubject,
          "heeftBAGRelatie"
        );

      if(!bagSubject)
        continue;

      const rceStraat=
        getLiteral(
          bagSubject,
          "openbareRuimte"
        );

      const rceHuisnummer=
        getLiteral(
          bagSubject,
          "huisnummer"
        );

      const rcePostcode=
        getLiteral(
          bagSubject,
          "postcode"
        );

      const rceVerblijfsobject=
        getUri(
          bagSubject,
          "heeftVerblijfsobject"
        );

      const rceVerblijfsobjectId=
        String(rceVerblijfsobject || "")
          .replace(/^.*\/verblijfsobject\//,"")
          .trim();

      const bagIdMatch=
        verblijfsobjectId &&
        rceVerblijfsobjectId &&
        verblijfsobjectId === rceVerblijfsobjectId;

      const straatMatch=
        normalize(rceStraat) ===
        normalize(straat);

      const huisnummerMatch=
        String(rceHuisnummer).trim() ===
        String(huisnummer).trim();

      const adresMatch=
        straatMatch &&
        huisnummerMatch;

      if(!bagIdMatch && !adresMatch)
        continue;

      const rijksmonumentnummer=
        getLiteral(
          monumentSubject,
          "rijksmonumentnummer"
        );

      const cultuurhistorischObjectnummer=
        getLiteral(
          monumentSubject,
          "cultuurhistorischObjectnummer"
        );

      const monumentAard=
        getLiteral(monumentSubject,"heeftMonumentaard") ||
        getLiteral(monumentSubject,"monumentaard") ||
        getLiteral(monumentSubject,"aardMonument");

      const juridischeStatus=
        getLiteral(monumentSubject,"heeftJuridischeStatus") ||
        getLiteral(monumentSubject,"juridischeStatus") ||
        getLiteral(monumentSubject,"juridische_status");

      const inschrijving=
        getLiteral(monumentSubject,"datumInschrijvingInMonumentenregister");

      const omschrijving=
        getLiteral(monumentSubject,"omschrijving") ||
        getLiteral(monumentSubject,"heeftOmschrijving");

      const functieSubject=getUri(monumentSubject,"heeftOorspronkelijkeFunctie");
      const functie=functieSubject
        ? getLiteral(functieSubject,"prefLabel") || getLiteral(functieSubject,"skos:prefLabel")
        : getLiteral(monumentSubject,"heeftOorspronkelijkeFunctie");

      results.push({
        rijksmonumentnummer:
          rijksmonumentnummer ||
          cultuurhistorischObjectnummer,

        cultuurhistorischObjectnummer,
        monumentAard,
        juridischeStatus,
        inschrijving,
        omschrijving,
        functie,

        heeftBAGRelatie:{
          huisnummer:rceHuisnummer,
          openbareRuimte:rceStraat,
          postcode:rcePostcode,

          heeftVerblijfsobject:
            rceVerblijfsobject
        }
      });
    }

    return results;

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

  const registerUrl=
    "https://monumentenregister.cultureelerfgoed.nl/monumenten/"+
    encodeURIComponent(number);

  const popup=`
    <div style="min-width:300px;max-width:360px;font-size:14px;line-height:1.45">
      <div style="font-size:18px;font-weight:700;margin-bottom:8px">
        🏛 Rijksmonument
      </div>

      <div style="background:#f7eeee;border-left:4px solid #7b1e1e;border-radius:6px;padding:9px 10px;margin-bottom:10px">
        <div style="font-size:12px;color:#666">Rijksmonumentnummer</div>
        <div style="font-size:17px;font-weight:700">${esc(number)}</div>
      </div>

      <div style="margin-bottom:8px">
        <b>Adres</b><br>
        ${esc(adres)}
        ${address.postcode ? ", "+esc(address.postcode) : ""}
        ${address.woonplaats ? "<br>"+esc(address.woonplaats) : ""}
      </div>

      ${
        inschrijving
          ? `<div style="margin-top:8px">
               <b>Inschrijving register</b><br>${esc(inschrijving)}
             </div>`
          : ""
      }

      ${
        functie
          ? `<div style="margin-top:8px">
               <b>Oorspronkelijke functie</b><br>${esc(functie)}
             </div>`
          : ""
      }

      ${
        omschrijving
          ? `<div style="margin-top:10px;padding-top:9px;border-top:1px solid #ddd">
               <b>Omschrijving</b><br>
               <span style="font-size:13px">${esc(omschrijving)}</span>
             </div>`
          : ""
      }

      <div style="margin-top:11px;padding-top:9px;border-top:1px solid #ddd">
        <a href="${registerUrl}" target="_blank" rel="noopener"
           style="display:inline-block;padding:7px 10px;background:#7b1e1e;color:white;text-decoration:none;border-radius:5px">
          Rijksmonumentenregister
        </a>
      </div>

      <div style="font-size:11px;color:#666;margin-top:8px">
        Bron: Rijksdienst voor het Cultureel Erfgoed
      </div>
    </div>
  `;

  const icon=L.divIcon({
    className:"",
    html:
      `<div style="
        background:#7b1e1e;
        color:white;
        width:28px;
        height:28px;
        border-radius:50%;
        border:2px solid white;
        box-shadow:0 1px 5px rgba(0,0,0,.45);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:13px;
        font-weight:bold;
        cursor:pointer;
      ">RM</div>`,
    iconSize:[28,28],
    iconAnchor:[14,14]
  });

  const marker=L.marker(
    [lat,lng],
    {icon:icon}
  ).bindPopup(popup);

  rceLayer.addLayer(marker);
}

/* =========================================================
   RCE FUNCTIE 4
   BAG-pand -> verblijfsobject -> adres -> RCE.
   ========================================================= */

async function loadRCEForPand(o){

  if(!o || !o.f)
    return;

  const p=o.f.properties || {};

  const addresses=
    await getBAGAddresses(p,o);

  if(!addresses.length){
    return;
  }

  for(const address of addresses){

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
      showRCE(
        rce,
        address,
        o.c.lat,
        o.c.lng
      );
    });
  }
}

/* =========================================================
   BESTAANDE BAG-FUNCTIE
   ========================================================= */

async function loadBAG(lat,lng,radius){
  window.rceDiagnosisShown=false;

  bagLayer.clearLayers();
  bagLabel.clearLayers();

  rceLayer.clearLayers();
  rceSeen.clear();

  const b=box(lat,lng,radius);

  const url=
    `https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?bbox=${b.minLo},${b.minLa},${b.maxLo},${b.maxLa}&limit=1000&f=json`;

  try{

    const res=await fetch(url);

    if(!res.ok)
      throw new Error(`BAG HTTP ${res.status}`);

    const data=await res.json();

    const list=data.features.map(f=>{

      const c=centerOf(f);

      if(!c)
        return null;

      const d=dist(
        lat,
        lng,
        c.lat,
        c.lng
      );

      if(d>radius)
        return null;

      return{
        f,
        c,
        d
      };

    })
    .filter(Boolean)
    .sort((a,b)=>a.d-b.d);

    list.forEach(o=>{

      const p=o.f.properties || {};

      const y=
        (p.bouwjaar!==null &&
         p.bouwjaar!==undefined &&
         p.bouwjaar!=="")
          ? String(p.bouwjaar)
          : "Onbekend";

      if(!matchesYearFilter(y))
        return;

      const bagId=
        p.identificatie ||
        "Onbekend";

      const documentdatum=
        p.documentdatum ||
        "Onbekend";

      const documentnummer=
        p.documentnummer ||
        "Onbekend";

      const status=
        p.status ||
        "Onbekend";

      const geconstateerd=
        p.geconstateerd ||
        "Onbekend";

      const gebruiksdoel=
        p.gebruiksdoel ||
        "Onbekend";

      const cl=yearClass(y);

      const col=
        useKadaster
          ? kadasterColor(y)
          : "#0b5cab";

      const bagTabId="bagTab_"+String(bagId).replace(/[^a-zA-Z0-9]/g,"");
      const hisgisTabId="hisgisTab_"+String(bagId).replace(/[^a-zA-Z0-9]/g,"");
      const hisgisResultId="hisgisResult_"+String(bagId).replace(/[^a-zA-Z0-9]/g,"");

      const popup =
        '<div class="history-popup">' +
          '<div class="history-popup-tabs" role="tablist" aria-label="Historische gegevens">' +
            '<button type="button" class="history-tab active" role="tab" aria-selected="true" ' +
              'onclick="document.getElementById(\''+bagTabId+'\').style.display=\'block\';document.getElementById(\''+hisgisTabId+'\').style.display=\'none\';this.parentNode.querySelectorAll(\'.history-tab\').forEach(function(b){b.classList.remove(\'active\');b.setAttribute(\'aria-selected\',\'false\');});this.classList.add(\'active\');this.setAttribute(\'aria-selected\',\'true\');">' +
              '<span class="history-tab-icon">▦</span> BAG' +
            '</button>' +
            '<button type="button" class="history-tab" role="tab" aria-selected="false" ' +
              'onclick="document.getElementById(\''+bagTabId+'\').style.display=\'none\';document.getElementById(\''+hisgisTabId+'\').style.display=\'block\';this.parentNode.querySelectorAll(\'.history-tab\').forEach(function(b){b.classList.remove(\'active\');b.setAttribute(\'aria-selected\',\'false\');});this.classList.add(\'active\');this.setAttribute(\'aria-selected\',\'true\');hisgisParcelProbe('+o.c.lat+','+o.c.lng+',\''+hisgisResultId+'\');">' +
              '<span class="history-tab-icon">⌖</span> HisGIS' +
            '</button>' +
          '</div>' +
          '<div id="'+bagTabId+'" class="history-tab-panel">' +
            '<div class="history-panel-title">BAG-pand</div>' +
            '<div class="history-year-row"><span>Bouwjaar</span><strong>'+esc(y)+'</strong></div>' +
            '<div class="history-distance">Afstand '+Math.round(o.d)+' meter</div>' +
            '<div class="history-details">' +
              '<div class="history-detail-row"><span>BAG-identificatie</span><strong>'+esc(bagId)+'</strong></div>' +
              '<div class="history-detail-row"><span>Status</span><strong>'+esc(status)+'</strong></div>' +
              '<div class="history-detail-row"><span>Gebruiksdoel</span><strong>'+esc(gebruiksdoel)+'</strong></div>' +
              '<div class="history-detail-row"><span>Geconstateerd</span><strong>'+esc(geconstateerd)+'</strong></div>' +
              '<div class="history-detail-row"><span>BAG-document</span><strong>'+esc(documentnummer)+'</strong></div>' +
              '<div class="history-detail-row"><span>Documentdatum</span><strong>'+esc(documentdatum)+'</strong></div>' +
            '</div>' +
          '</div>' +
          '<div id="'+hisgisTabId+'" class="history-tab-panel" style="display:none">' +
            '<div class="history-panel-title">HisGIS 1832</div>' +
            '<div id="'+hisgisResultId+'" class="history-hisgis-result">' +
              '<div class="history-loading-hint">Klik op HisGIS om het historische perceel en de OAT-gegevens te laden.</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      const poly=L.geoJSON(
        o.f,
        {
          style:{
            weight:1.2,
            color:col,
            fillColor:
              useKadaster
                ? col
                : "#0b5cab",
            fillOpacity:0.15
          }
        }
      ).bindPopup(popup);

      bagLayer.addLayer(poly);

      const ic=L.divIcon({
        className:"",
        html:
          `<div class="year-badge ${cl}" style="cursor:pointer">
            ${esc(y)}
          </div>`,
        iconSize:null
      });

      const lab=L.marker(
        [o.c.lat,o.c.lng],
        {icon:ic}
      ).bindPopup(popup);

      bagLabel.addLayer(lab);

      loadOverijsselMonumentenVoorPand(o);

    });

    setStatus(
      `${list.length} BAG binnen ${radius}m`
    );

  }catch(e){

    console.error(
      "BAG fout:",
      e
    );

    setStatus("BAG fout");

  }
}

locateBtn&&locateBtn.addEventListener(
  "click",
  ()=>{
    if(!navigator.geolocation){
      setStatus("Geen geolocatie");
      return;
    }

    setStatus("Locatie bepalen...");
    locateBtn.disabled=true;

    navigator.geolocation.getCurrentPosition(
      p=>{
        locateBtn.disabled=false;
        const lat=p.coords.latitude,
              lng=p.coords.longitude,
              acc=Math.round(p.coords.accuracy),
              r=Number(radiusSel.value);
        map.setView([lat,lng],18);
        if(curMarker)map.removeLayer(curMarker);
        if(accCircle)map.removeLayer(accCircle);
        if(selectedMarker){map.removeLayer(selectedMarker);selectedMarker=null;}
        if(curMarker)map.removeLayer(curMarker);
        curMarker=L.marker([lat,lng]).addTo(map).bindPopup("Huidige positie").openPopup();
        curMarker.on("click",()=>{
          loadBAG(lat,lng,r);
          loadHistForLocation(lat,lng);
          setStatus("Huidige positie – BAG laden...");
        });
        accCircle=L.circle([lat,lng],{radius:acc,color:"#0b5cab",fillOpacity:0.08}).addTo(map);
        loadBAG(lat,lng,r);
        closeMenu();
      },
      ()=>{locateBtn.disabled=false;setStatus("Locatie geweigerd");},
      {enableHighAccuracy:true,timeout:15000}
    );
  }
);

radiusSel&&radiusSel.addEventListener(
  "change",
  ()=>{
    const r=Number(radiusSel.value);
    if(curMarker){
      const ll=curMarker.getLatLng();
      loadBAG(ll.lat,ll.lng,r);
    }else{
      loadBAG(52.516,6.42,r);
    }
  }
);

async function loadHistForLocation(lat,lng){
  try{
    if(!map.hasLayer(minuutLayer)) minuutLayer.addTo(map);
    const rd=wgs84ToRD(lat,lng);
    const b=[rd.x-50,rd.y-50,rd.x+50,rd.y+50].join(",");
    const url=`https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox=${encodeURIComponent(b)}&outputFormat=application/json&count=1`;
    const res=await fetch(url); const data=await res.json(); if(!data.features||!data.features.length) return;
    let code=data.features[0].properties.CODE; const orig=code; code=corr(code);
    if(window.histLayer) map.removeLayer(window.histLayer);
    window.histLayer=L.tileLayer(`https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut${code}*`,{opacity:Number(opSlider.value)/100||0.6,maxZoom:20}).addTo(map);
  }catch(e){console.error("hist 1832 load fail",e);}
}

/* =========================================================
   AUTOMATISCHE ACTIVERING 1832 + BAG
   Zodra de zichtbare kaart binnen 100 meter van het kaartcentrum
   is ingezoomd, worden BAG en de 1832-laag automatisch geladen.
   ========================================================= */
let autoHistorieCenter=null;

function mapViewRadiusMeters(){
  const center=map.getCenter();
  const bounds=map.getBounds();
  const sw=bounds.getSouthWest();
  const ne=bounds.getNorthEast();

  return Math.max(
    dist(center.lat,center.lng,sw.lat,sw.lng),
    dist(center.lat,center.lng,ne.lat,ne.lng)
  );
}

function autoActivateHistoricalView(){
  if(!map || !map.getCenter()) return;

  const viewRadius=mapViewRadiusMeters();

  // Buiten het 250-meter kaartbeeld ruimen we de automatisch geladen
  // BAG-, 1832-, gemeentelijke en rijksmonumentenweergave op.
  if(viewRadius>250){
    bagLayer.clearLayers();
    bagLabel.clearLayers();
    rceLayer.clearLayers();
    monumentLayer.clearLayers();
    rceSeen.clear();
    monumentSeen.clear();

    if(window.histLayer){
      map.removeLayer(window.histLayer);
      window.histLayer=null;
    }

    autoHistorieCenter=null;
    return;
  }

  const center=map.getCenter();

  // Voorkom opnieuw laden bij iedere kleine kaartbeweging.
  if(
    autoHistorieCenter &&
    dist(
      center.lat,center.lng,
      autoHistorieCenter.lat,autoHistorieCenter.lng
    )<25
  ) return;

  autoHistorieCenter={
    lat:center.lat,
    lng:center.lng
  };

  const r=Number(radiusSel.value)||50;

  setStatus("Binnen 250 m – BAG en 1832-kaart automatisch laden...");
  loadBAG(center.lat,center.lng,r);
  loadHistForLocation(center.lat,center.lng);
}

map.on("moveend",autoActivateHistoricalView);

async function hisgisOatProof(lat,lng,code,requestedPerceel=null,requestedBlad=null,resultId=null,requestedSectie=null,requestedGemeente=null,requestedGemeenteCode=null,requestedOatScan=null){
  const resultBox=document.getElementById(resultId||"hisgisOatResult");
  if(resultBox) resultBox.innerHTML="<small>HisGIS OAT-gegevens zoeken...</small>";
  setStatus("HisGIS 1832: juiste OAT-scan zoeken...");
  try{
    const sectie=String(requestedSectie||"").trim().toUpperCase();
    const perceelZoek=String(requestedPerceel||"").trim();
    const gemeenteCode=String(requestedGemeenteCode||"04041").trim();
    const gemeenteNaam=String(requestedGemeente||"").trim();
    if(!sectie||!perceelZoek)
      throw new Error("Onvoldoende kadastrale gegevens voor OAT-zoekactie");

    /*
     * OAT-scanvolgorde is onafhankelijk van het minuutplanblad.
     * We zoeken daarom binnen een ruime reeks scan-nummers en stoppen
     * bij de eerste exacte perceelmatch.
     *
     * De OAT-code gebruikt de vijfcijferige kadastrale gemeente-code
     * uit de minuutplan-code: OAT + gemeente-code + sectie + scan.
     *
     * De API geeft bij een bestaande scan HTTP 200; een niet-bestaande
     * scan geeft HTTP 404. 404 gebruiken we hier uitsluitend om naar de
     * volgende scan te gaan.
     */
    if(!window.hisgisOatScanCache)
      window.hisgisOatScanCache=new Map();

    let found=null;
    let candidateCodes=[];
    let koppelStatus="niet geprobeerd";
    let koppelRowFound=false;
    let koppelRowCodes=[];
    let scansGetest=0;

    // HisGIS-perceelvlakken kunnen de exacte OAT-scan al als tag bevatten.
    // Die informatie is betrouwbaarder dan zelf scan-nummers raden.
    const directOatScan=String(requestedOatScan||"").trim().toUpperCase();
    if(/^OAT\d{5}[A-Z]\d{3}$/.test(directOatScan))
      candidateCodes.push(directOatScan);

    // Naast de code uit het minuutplan nemen we voor Drentse gemeenten
    // ook de 2-cijferige provinciecode (03) + 3-cijferige kadastrale
    // gemeentecode mee. De huidige gemeentecode is niet altijd dezelfde
    // code die in de historische OAT-bestanden wordt gebruikt.
    const gemeenteCodes=[gemeenteCode];
    if(/^0109$/.test(gemeenteCode)||/^00109$/.test(gemeenteCode)||/^01090$/.test(gemeenteCode))
      gemeenteCodes.push("03109");
    if(/^03109$/.test(gemeenteCode))
      gemeenteCodes.push("00109","01090");

    // Tweede route: de openbare HisGIS-koppelsite voor de sectie.
    // Deze pagina kent de werkelijke OAT-scan per perceel en voorkomt dat
    // we scan-nummers hoeven te raden. We halen alleen scan-codes uit de
    // HTML; de OAT-API blijft daarna de bron voor de inhoud.
    const koppelGemeentes=[gemeenteNaam].filter(Boolean);
    for(const gm of koppelGemeentes){
      try{
        const u="https://osm.hisgis.nl/koppel/"+encodeURIComponent(gm)+"/"+encodeURIComponent(sectie);
        const r=await fetch(u);
        if(!r.ok){
          koppelStatus="HTTP "+r.status;
          continue;
        }
        const html=await r.text();
        koppelStatus="opgehaald";

        const scanCodes=[...html.matchAll(/OAT\d{5}[A-Z]\d{3}/gi)]
          .map(m=>String(m[0]).toUpperCase());

        // Probeer eerst de exacte koppeling perceel -> OAT-scan uit de
        // koppelsite te halen. Dat is betrouwbaarder dan een scanreeks
        // raden: één OAT-scan bevat meerdere opeenvolgende percelen.
        const rowRe=/<tr[^>]*>[\s\S]*?<\/tr>/gi;
        for(const rowMatch of html.matchAll(rowRe)){
          const row=rowMatch[0];
          const plain=row.replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ");
          const parcelRe=new RegExp("(^|\\D)"+String(perceelZoek)+"($|\\D)");
          if(parcelRe.test(plain)){
            koppelRowFound=true;
            const rowCodes=[...row.matchAll(/OAT\d{5}[A-Z]\d{3}/gi)]
              .map(m=>String(m[0]).toUpperCase());
            koppelRowCodes.push(...rowCodes);
            rowCodes.forEach(code=>{
              if(gemeenteCodes.some(gc=>code.startsWith("OAT"+gc+sectie)))
                candidateCodes.unshift(code);
            });
          }
        }

        // Voeg overige echte scanverwijzingen van de koppelsite toe.
        scanCodes.forEach(code=>{
          if(gemeenteCodes.some(gc=>code.startsWith("OAT"+gc+sectie)))
            candidateCodes.push(code);
        });
      }catch(e){
        koppelStatus="fout: "+(e?.message||String(e));
      }
    }

    // Eerst de officiële gemeente-REST-service proberen. Deze geeft de
    // beschikbare OAT-informatie per gemeente; we halen daar alleen echte
    // OAT-scan-codes uit. Zo zijn we niet afhankelijk van een vaste reeks
    // A001..D200, die per gemeente kan verschillen.
    const gemeenteCandidates=[gemeenteNaam,...gemeenteCodes].filter(Boolean);
    const scanCodeRe=/OAT\d{5}[A-Z]\d{3}/gi;

    for(const gm of gemeenteCandidates){
      try{
        const u="https://oat.hisgis.nl/oat-ws/rest/gemeente/"+encodeURIComponent(gm);
        const r=await fetch(u);
        if(!r.ok) continue;
        const d=await r.json();
        const raw=JSON.stringify(d);
        const codes=raw.match(scanCodeRe)||[];
        codes.forEach(code=>{
          const normalized=String(code).toUpperCase();
          if(normalized.startsWith("OAT"+gemeenteCode+sectie))
            candidateCodes.push(normalized);
        });
      }catch(e){
        // De scan-API blijft de veilige fallback.
      }
    }

    candidateCodes=[...new Set(candidateCodes)].sort();

    // Vul de gevonden kandidaten altijd aan met de gewone scanreeks.
    // De koppelsite/gemeente-REST kan namelijk wel kandidaten teruggeven
    // zonder de scan te bevatten waarin het gevraagde perceel staat.
    // Alleen als de kandidaatlijst leeg is zoeken we dus niet uitsluitend;
    // de numerieke reeks blijft ook dan beschikbaar.
    for(const gc of gemeenteCodes){
      for(let n=1;n<=500;n++){
        candidateCodes.push("OAT"+gc+sectie+String(n).padStart(3,"0"));
      }
    }

    candidateCodes=[...new Set(candidateCodes)];

    for(const oatCode of candidateCodes){
      let data=window.hisgisOatScanCache.get(oatCode);

      if(!data){
        try{
          const res=await fetch("https://oat.hisgis.nl/oat-ws/rest/percelen/oat/"+oatCode);
          if(!res.ok){
            if(res.status===404) continue;
            throw new Error("OAT HTTP "+res.status+" ("+oatCode+")");
          }
          data=await res.json();
          window.hisgisOatScanCache.set(oatCode,data);
        }catch(e){
          if(String(e.message||"").includes("OAT HTTP 404")) continue;
          throw e;
        }
      }

      scansGetest++;
      const rows=Array.isArray(data.results)?data.results:[];
      const match=rows.find(p=>{
        const pnr=String(p.perceelnr||"").trim()+String(p.perceelnrtvg||"");
        return pnr===perceelZoek;
      });

      if(match){
        found={data,oatCode,match};
        break;
      }
    }

    if(!found){
      const diag=[
        "Koppelsite: "+koppelStatus,
        "rij voor perceel: "+(koppelRowFound?"gevonden":"niet gevonden"),
        "OAT-code in rij: "+([...new Set(koppelRowCodes)].join(", ")||"geen"),
        "kandidaten: "+candidateCodes.length,
        "scans getest: "+scansGetest
      ].join(" · ");
      throw new Error(
        "Perceel "+perceelZoek+
        " niet gevonden in de beschikbare OAT-scans van sectie "+sectie+
        " (gemeente "+gemeenteNaam+"; codes "+gemeenteCodes.join(", ")+"). "+
        diag
      );
    }

    const data=found.data;
    const match=found.match;
    const articles=Array.isArray(data.artikelen)?data.artikelen:[];
    const articleMap=new Map();
    articles.forEach(a=>{
      let id=String(a.artikelnr||"");
      if(a.artikelnrtvg) id+=String(a.artikelnrtvg);
      articleMap.set(id,a);
    });

    const aid=
      String(match.artikelLink?.artikelnr||"")+
      String(match.artikelLink?.artikelnrtvg||"");
    const article=articleMap.get(aid);

    const ownerEntries=(article?.rechtsPersonen||[]).map(rp=>{
      const ref=rp.persoonsVerwijzing;
      const p=rp.persoon||ref?.persoon||{};
      if(Object.keys(p).length){
        const base=[p.titel,p.voornaam,p.voorvoegsel,p.achternaam].filter(Boolean).join(" ");
        const details=[p.beroep,p.woonplaats].filter(Boolean).join(" te ");
        const text=base+(details?" ("+details+")":"");
        return ref?.verwijzing==="ERVEN_VAN" ? "Erven van "+text : text;
      }
      return rp.instantie?.naam||"";
    }).filter(Boolean);

    const owners=[...new Set(ownerEntries)];
    const gebruik=match.grondGebruik||"";
    const opp=Number(match.oppervlak||0);
    const oppervlakte=opp
      ? String(Math.floor(opp/10000))+" bunder, "+
        String(Math.floor((opp%10000)/100))+" roede, "+
        String(opp%100)+" el"
      : "";

    const gemeente=String(requestedGemeente||"Stad Ommen");

    if(resultBox){
      resultBox.innerHTML=
        "<div style='margin-top:8px;padding-top:9px;border-top:1px solid #ddd'>"+
        "<b>HisGIS 1832 – gevonden OAT-perceel</b><br>"+
        "Kadastrale gemeente: "+esc(gemeente)+"<br>"+
        "Sectie: "+esc(sectie)+"<br>"+
        "Minuutplan: "+esc(code||"Onbekend")+"<br>"+
        "<b>Perceel: "+esc(perceelZoek)+"</b><br>"+
        "OAT-scan: "+esc(found.oatCode)+"<br>"+
        "Eigenaren / rechthebbenden: "+esc(owners.join("; ")||"Niet gevonden")+
        (gebruik?"<br>Grondgebruik: "+esc(gebruik):"")+
        (oppervlakte?"<br>Oppervlakte: "+esc(oppervlakte):"")+
        "<br><small>Bron: HisGIS OAT 1832, juiste OAT-scan automatisch gezocht.</small>"+
        "</div>";
    }

    setStatus("HisGIS 1832: perceel "+perceelZoek+" gevonden in "+found.oatCode);
  }catch(err){
    console.error("HisGIS OAT proef:",err);
    if(resultBox)
      resultBox.innerHTML="<small style='color:#8b0000'>HisGIS OAT-proef: "+esc(err.message||String(err))+"</small>";
    setStatus("HisGIS OAT-proef: "+(err.message||"fout"));
  }
}

function hisgisOnlineLink(lat,lng){
  const R=6378137;
  const x=R*Number(lng)*Math.PI/180;
  const y=R*Math.log(Math.tan(Math.PI/4+Number(lat)*Math.PI/360));
  return "https://beta.hisgis.nl/?x="+encodeURIComponent(x.toFixed(3))+
    "&y="+encodeURIComponent(y.toFixed(3))+
    "&z=18&r=0&l=11111";
}

async function hisgisParcelProbe(lat,lng,resultId=null){
  const resultBox=document.getElementById(resultId||"hisgisOatResult");
  if(resultBox) resultBox.innerHTML="<small>HisGIS-perceel op de kaart zoeken...</small>";
  setStatus("HisGIS 1832: perceel op de kaart zoeken...");
  try{
    const query='[out:json][timeout:20];way(around:100,'+lat+','+lng+')[\"kad:perceelnr\"];out tags geom;';
    const url="https://overpass.hisgis.nl/cache/api/interpreter?data="+encodeURIComponent(query);
    const res=await fetch(url);
    if(!res.ok) throw new Error("HisGIS-Overpass HTTP "+res.status);

    const data=await res.json();
    const ways=(Array.isArray(data.elements)?data.elements:[])
      .filter(w=>w.type==="way"&&Array.isArray(w.geometry)&&w.geometry.length>=3&&w.tags?.["kad:perceelnr"]);

    function inside(x,y,pts){
      let hit=false;
      for(let i=0,j=pts.length-1;i<pts.length;j=i++){
        const xi=pts[i].lat,yi=pts[i].lon,xj=pts[j].lat,yj=pts[j].lon;
        if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)) hit=!hit;
      }
      return hit;
    }

    const hit=ways.find(w=>inside(lat,lng,w.geometry));
    if(!hit) throw new Error("Geen ingetekend HisGIS-perceel op deze locatie gevonden ("+ways.length+" percelen in uitsnede)");

    const t=hit.tags||{};
    const gemeente=t["kad:gemeente"]||"Onbekend";
    const sectie=t["kad:sectie"]||"Onbekend";
    const minuutplan=String(t["minuutplan"]||"").trim();
    const blad=t["kad:blad"]||((/^MIN\d{5}[A-Z]\d+$/i.test(minuutplan)) ? minuutplan.match(/^MIN\d{5}[A-Z](\d+)$/i)[1] : "Onbekend");
    const perceel=t["kad:perceelnr"]||"Onbekend";
    const toevoeging=t["kad:perceelnrtvg"]||"";
    const fullPerceel=String(perceel)+String(toevoeging);

    if(resultBox){
      resultBox.innerHTML="<div style='margin-top:8px;padding-top:9px;border-top:1px solid #ddd'>"+
        "<b>HisGIS 1832 – perceel gevonden</b><br>"+
        "Kadastrale gemeente: "+esc(gemeente)+"<br>"+
        "Sectie: "+esc(sectie)+"<br>"+
        "Blad: "+esc(blad)+"<br>"+
        "<b>Perceel: "+esc(fullPerceel)+"</b><br>"+
        "OAT-tags: "+esc(Object.keys(t).filter(k=>/^oat:/i.test(k)).map(k=>k+"="+t[k]).join(" · ")||"geen")+"<br>"+
        "<small>HisGIS-perceelgrens bevat de kliklocatie · way "+esc(hit.id)+"</small>"+
        "</div>";
    }

    setStatus("HisGIS 1832: perceel "+fullPerceel+" gevonden");

    const oatScan=String(t["oat:scan"]||"").trim();
    const gemeenteCode=(/^MIN(\d{5})[A-Z]/i.test(minuutplan))
      ? minuutplan.match(/^MIN(\d{5})[A-Z]/i)[1]
      : "";
    await hisgisOatProof(lat,lng,minuutplan,fullPerceel,blad,resultId,sectie,gemeente,gemeenteCode,oatScan);
  }catch(err){
    console.error("HisGIS kaartproef:",err);
    if(resultBox) resultBox.innerHTML="<small style='color:#8b0000'>HisGIS-kaartproef: "+esc(err.message||String(err))+"</small>";
    setStatus("HisGIS-kaartproef: "+(err.message||"fout"));
  }
}

let selectedMarker=null;
map.on("click",async e=>{
  const lat=e.latlng.lat, lng=e.latlng.lng, r=Number(radiusSel.value);
  if(selectedMarker) map.removeLayer(selectedMarker);
  selectedMarker=L.marker([lat,lng],{icon:L.divIcon({className:"",html:'<div style="background:#e63946;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',iconSize:[14,14],iconAnchor:[7,7]})}).addTo(map);
  setStatus(`Geselecteerd: ${lat.toFixed(5)}, ${lng.toFixed(5)} – BAG laden...`);
  autoHistorieCenter={
    lat,
    lng
  };
  loadBAG(lat,lng,r);
  loadHistForLocation(lat,lng);
  try{
    if(map.hasLayer(minuutLayer)){
      const rd=wgs84ToRD(lat,lng),b=[rd.x-20,rd.y-20,rd.x+20,rd.y+20].join(","),url=`https://services.rce.geovoorziening.nl/misc/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=misc:Minuutplanbegrenzingen&srsName=EPSG:28992&bbox=${encodeURIComponent(b)}&outputFormat=application/json&count=1`;
      const res=await fetch(url),data=await res.json();if(data.features&&data.features.length){
        let code=data.features[0].properties.CODE;const orig=code;code=corr(code);
        if(window.histLayer)map.removeLayer(window.histLayer);
        window.histLayer=L.tileLayer(`https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut${code}*`,{opacity:Number(opSlider.value)/100||0.6,maxZoom:20}).addTo(map);
        const p=data.features[0].properties;
        L.popup().setLatLng(e.latlng).setContent(`<div style="min-width:240px"><strong>🕰 Minuutplan 1811-1832</strong><br>${esc(p.GEMEENTE)} ${esc(p.SECTIE)} ${esc(p.BLAD)}<br>RCE ${esc(orig)} → HisGIS ${esc(code)}<br><br><a href="${esc(p.URL)}" target="_blank" style="display:inline-block;padding:8px 12px;background:#1d5d8f;color:white;text-decoration:none;border-radius:5px">Origineel</a><br><br><a href="https://osm.hisgis.nl/koppel/Ommen/${encodeURIComponent(String(p.SECTIE||""))}" target="_blank" rel="noopener" style="display:inline-block;padding:8px 12px;background:#6b4f2a;color:white;text-decoration:none;border-radius:5px">HisGIS 1832 – sectie ${esc(p.SECTIE||"")}</a><br><br>${code==="MIN04041B03" ? '<a href="${hisgisOnlineLink(lat,lng)}" target="_blank" rel="noopener" style="display:inline-block;padding:8px 12px;background:#7a5a2b;color:white;text-decoration:none;border-radius:5px">HisGIS online – deze locatie bekijken</a><br><br><button type="button" onclick="hisgisParcelProbe('+lat+','+lng+')" style="display:inline-block;padding:8px 12px;background:#7a5a2b;color:white;border:0;border-radius:5px;cursor:pointer">HisGIS perceel automatisch bepalen</button><br><br><div id="hisgisOatResult"></div><a href="https://tvermaut.github.io/hisgis-oat-scan-view/?OAT04041B061" target="_blank" rel="noopener" style="display:inline-block;padding:8px 12px;background:#6b4f2a;color:white;text-decoration:none;border-radius:5px;margin-top:8px">OAT-scan blad 61 bekijken</a><br><br>' : ''}<small>Diagnose: de kliklocatie wordt vergeleken met de ingetekende HisGIS-perceelvlakken.</div>`).openOn(map);
      }
    }
  }catch(err){console.error(err);}
});

yearFilterSel&&yearFilterSel.addEventListener("change",e=>{activeYearFilter=e.target.value;const r=Number(radiusSel.value);if(curMarker){const ll=curMarker.getLatLng();loadBAG(ll.lat,ll.lng,r);}else loadBAG(52.516,6.42,r);});
toggleKadasterColors&&toggleKadasterColors.addEventListener("change",e=>{useKadaster=e.target.checked;const r=Number(radiusSel.value);if(curMarker){const ll=curMarker.getLatLng();loadBAG(ll.lat,ll.lng,r);}else loadBAG(52.516,6.42,r);});
window.addEventListener("load",()=>{
  // Monumenten worden ruimtelijk geladen per BAG-pand.
  if(toggleKadasterColors)toggleKadasterColors.checked=true;
  setTimeout(()=>{
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(p=>{
        const lat=p.coords.latitude,lng=p.coords.longitude,r=Number(radiusSel.value);
        map.setView([lat,lng],18);
        curMarker=L.marker([lat,lng]).addTo(map).bindPopup("Huidige positie");
        accCircle=L.circle([lat,lng],{radius:p.coords.accuracy,color:"#0b5cab",fillOpacity:0.08}).addTo(map);
        loadBAG(lat,lng,r);loadHistForLocation(lat,lng);
      },()=>{
        loadBAG(52.516,6.42,Number(radiusSel.value));loadHistForLocation(52.516,6.42);
      },{enableHighAccuracy:true,timeout:8000});
    }else{
      loadBAG(52.516,6.42,Number(radiusSel.value));loadHistForLocation(52.516,6.42);
    }
  },600);
});