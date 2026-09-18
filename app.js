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

async function loadOverijsselMonumentenVoorPand(o){
  if(!o||!o.c||!o.f)return;
  const rd=wgs84ToRD(o.c.lat,o.c.lng),r=50;
  const layers=[
    {name:"B73_Rijksmonumenten",label:"Rijksmonument"},
    {name:"B73_Gemeentelijke_Monumenten",label:"Gemeentelijk monument"}
  ];
  for(const layer of layers){
    try{
      const params=new URLSearchParams({
        service:"WFS",version:"2.0.0",request:"GetFeature",
        typeNames:`B73_Cultuur:${layer.name}`,srsName:"EPSG:28992",
        bbox:`${rd.x-r},${rd.y-r},${rd.x+r},${rd.y+r},EPSG:28992`,
        outputFormat:"application/json",count:"20"
      });
      const res=await fetch(`https://services.geodataoverijssel.nl/geoserver/B73_Cultuur/wfs?${params}`);
      if(!res.ok)continue;
      const data=await res.json();
      const features=Array.isArray(data.features)?data.features:[];
      for(const f of features){
        const p=f.properties||{},g=f.geometry||{};
        if(g.type!=="Point"||!Array.isArray(g.coordinates)||g.coordinates.length<2)continue;
        const mx=Number(g.coordinates[0]),my=Number(g.coordinates[1]),d=Math.hypot(mx-rd.x,my-rd.y);
        if(!Number.isFinite(d)||d>r)continue;
        const number=p.MONUMENTENNUMMER||"";
        const key=`${layer.name}:${number||f.id||`${mx},${my}`}`;
        if(monumentSeen.has(key))continue;
        monumentSeen.add(key);
        const ll=rdToWgs84(mx,my);
        const address=[p.STRAATNAAM,p.HUISNUMMERS].filter(Boolean).join(" ");
        const monumentType=layer.label;
        const nummer=number||"Onbekend";

        // Toon alle inhoudelijk bruikbare monumentgegevens die de WFS werkelijk levert.
        // De locatie, ruimtelijke koppeling en zoekradius blijven ongewijzigd.
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
          "MIP_NR","IND_WAARDERING"
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
          return /^https?:\\/\\//i.test(s) ? s : "";
        }

        function fieldRow(key){
          const value=displayValue(p[key]);
          if(!value)return "";
          const label=labelMap[key]||key.replaceAll("_"," ");
          const url=absoluteUrl(value);
          const isPreview=/^preview$/i.test(key)||/preview/i.test(label);

          if(isPreview && url){
            return `
              <div style="margin-top:9px">
                <b>${esc(label)}</b><br>
                <a href="${esc(url)}" target="_blank" rel="noopener" style="display:block;margin-top:5px;text-decoration:none">
                  <img src="${esc(url)}" alt="Preview" style="display:block;width:100%;max-width:340px;max-height:220px;object-fit:contain;border:1px solid #ccc;border-radius:5px;background:#f5f5f5">
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
          if(used.has(key)||hiddenKeys.has(key)||key.startsWith("_"))return;
          const value=displayValue(p[key]);
          if(!value)return;
          detailRows+=fieldRow(key);
        });

        const popup=`
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

            ${detailRows
              ? `<div style="border-top:1px solid #ddd;padding-top:2px">${detailRows}</div>`
              : ""}

            <hr style="margin:11px 0 8px">

            <div style="font-size:11px;color:#666">
              Bron: Provincie Overijssel · B73 Cultuur
            </div>
          </div>
        `;

        const isRM=layer.name==="B73_Rijksmonumenten";
        const icon=L.divIcon({
          className:"",
          html:"<div style=\"background:"+(isRM?"#7b1e1e":"#1d5d8f")+";color:white;width:30px;height:30px;border-radius:50%;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;cursor:pointer;\">"+(isRM?"RM":"GM")+"</div>",
          iconSize:[30,30],iconAnchor:[15,15]
        });
        monumentLayer.addLayer(L.marker([ll.lat,ll.lon],{icon}).bindPopup(popup));
      }
    }catch(e){console.error("Overijssel monument WFS fout:",e);}
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

      results.push({

        rijksmonumentnummer:
          rijksmonumentnummer ||
          cultuurhistorischObjectnummer,

        cultuurhistorischObjectnummer,

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

      const popup=`
        <div style="min-width:250px">
          <b>BAG-pand</b><br>
          Bouwjaar: <b>${esc(y)}</b><br>
          Afstand: ${Math.round(o.d)} m
          <hr style="margin:8px 0">
          <small>
            BAG-identificatie: ${esc(bagId)}<br>
            Status: ${esc(status)}<br>
            Gebruiksdoel: ${esc(gebruiksdoel)}<br>
            Geconstateerd: ${esc(geconstateerd)}<br>
            BAG-document: ${esc(documentnummer)}<br>
            Documentdatum: ${esc(documentdatum)}
          </small>
        </div>
      `;

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

let selectedMarker=null;
map.on("click",async e=>{
  const lat=e.latlng.lat, lng=e.latlng.lng, r=Number(radiusSel.value);
  if(selectedMarker) map.removeLayer(selectedMarker);
  selectedMarker=L.marker([lat,lng],{icon:L.divIcon({className:"",html:'<div style="background:#e63946;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',iconSize:[14,14],iconAnchor:[7,7]})}).addTo(map);
  setStatus(`Geselecteerd: ${lat.toFixed(5)}, ${lng.toFixed(5)} – BAG laden...`);
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
        L.popup().setLatLng(e.latlng).setContent(`<div style="min-width:240px"><strong>🕰 Minuutplan 1811-1832</strong><br>${esc(p.GEMEENTE)} ${esc(p.SECTIE)} ${esc(p.BLAD)}<br>RCE ${esc(orig)} → HisGIS ${esc(code)}<br><br><a href="${esc(p.URL)}" target="_blank" style="display:inline-block;padding:8px 12px;background:#1d5d8f;color:white;text-decoration:none;border-radius:5px">Origineel</a><br><br><small>Geklikte positie wordt nu gebruikt voor BAG</small></div>`).openOn(map);
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
