// ========================================
// HistorieSpot
// GPS + PDOK/Kadaster BAG
// ========================================

// ----------------------------------------
// Kaart initialiseren
// ----------------------------------------

const map = L.map("map").setView([52.516, 6.420], 15);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);


// ----------------------------------------
// Globale variabelen
// ----------------------------------------

let currentMarker = null;
let accuracyCircle = null;

const objectLayer = L.layerGroup().addTo(map);

const locateBtn = document.getElementById("locateBtn");
const radiusSelect = document.getElementById("radius");
const statusBox = document.getElementById("status");
const resultsBox = document.getElementById("results");


// ----------------------------------------
// Statusmelding
// ----------------------------------------

function setStatus(message) {
  statusBox.textContent = message;
}


// ----------------------------------------
// GPS-knop
// ----------------------------------------

locateBtn.addEventListener("click", locateUser);


// ----------------------------------------
// GPS-locatie bepalen
// ----------------------------------------

function locateUser() {

  if (!navigator.geolocation) {
    setStatus(
      "Deze browser ondersteunt geen locatiebepaling."
    );
    return;
  }

  setStatus(
    "📍 Locatie wordt bepaald..."
  );

  locateBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(

    // Succes
    function(position) {

      locateBtn.disabled = false;

      const latitude =
        position.coords.latitude;

      const longitude =
        position.coords.longitude;

      const accuracy =
        Math.round(position.coords.accuracy);

      const radius =
        Number(radiusSelect.value);


      // Kaart naar huidige positie
      map.setView(
        [latitude, longitude],
        18
      );


      // Oude positie verwijderen
      if (currentMarker) {
        map.removeLayer(currentMarker);
      }

      if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
      }


      // Marker
      currentMarker = L.marker([
        latitude,
        longitude
      ])
      .addTo(map)
      .bindPopup(
        "📍 Huidige positie"
      )
      .openPopup();


      // Nauwkeurigheidscirkel
      accuracyCircle = L.circle(
        [latitude, longitude],
        {
          radius: accuracy,
          color: "#0b5cab",
          fillOpacity: 0.08
        }
      ).addTo(map);


      setStatus(
        `Locatie gevonden. Nauwkeurigheid ongeveer ${accuracy} meter. ` +
        `BAG-objecten binnen ${radius} meter worden opgezocht...`
      );


      // BAG ophalen
      loadBAG(
        latitude,
        longitude,
        radius
      );
    },


    // Fout
    function(error) {

      locateBtn.disabled = false;

      if (error.code === 1) {

        setStatus(
          "⚠️ Locatietoegang is geweigerd. " +
          "Geef HistorieSpot toestemming om de locatie te gebruiken."
        );

      } else if (error.code === 2) {

        setStatus(
          "⚠️ De locatie kon niet worden bepaald."
        );

      } else if (error.code === 3) {

        setStatus(
          "⚠️ Het bepalen van de locatie duurde te lang."
        );

      } else {

        setStatus(
          "⚠️ Er is een onbekende locatiefout opgetreden."
        );
      }
    },


    // GPS-instellingen
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000
    }
  );
}


// ----------------------------------------
// Zoekgebied rond GPS bepalen
// ----------------------------------------

function createBoundingBox(
  latitude,
  longitude,
  radiusMeters
) {

  const latitudeDelta =
    radiusMeters / 111320;

  const longitudeDelta =
    radiusMeters /
    (
      111320 *
      Math.cos(latitude * Math.PI / 180)
    );


  return {

    minLatitude:
      latitude - latitudeDelta,

    maxLatitude:
      latitude + latitudeDelta,

    minLongitude:
      longitude - longitudeDelta,

    maxLongitude:
      longitude + longitudeDelta
  };
}


// ----------------------------------------
// BAG-gegevens ophalen
// ----------------------------------------

async function loadBAG(
  latitude,
  longitude,
  radius
) {

  objectLayer.clearLayers();

  resultsBox.innerHTML =
    "<p>⏳ BAG-gegevens worden opgehaald...</p>";


  const box =
    createBoundingBox(
      latitude,
      longitude,
      radius
    );


  const url =
    "https://api.pdok.nl/kadaster/bag/ogc/v2/" +
    "collections/pand/items" +

    `?bbox=` +
    `${box.minLongitude},` +
    `${box.minLatitude},` +
    `${box.maxLongitude},` +
    `${box.maxLatitude}` +

    "&limit=100&f=json";


  try {

    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        `PDOK HTTP-fout ${response.status}`
      );
    }


    const data =
      await response.json();


    const features =
      data.features || [];


    // Afstand tot ieder gebouw bepalen
    const nearbyObjects =
      features
        .map(function(feature) {

          const center =
            calculateFeatureCenter(feature);

          let distance =
            Infinity;

          if (center) {

            distance =
              calculateDistance(
                latitude,
                longitude,
                center.latitude,
                center.longitude
              );
          }

          return {
            feature: feature,
            center: center,
            distance: distance
          };
        })


        // Alleen objecten binnen radius
        .filter(function(object) {

          return object.distance <= radius;

        })


        // Dichtstbijzijnde eerst
        .sort(function(a, b) {

          return a.distance - b.distance;

        });


    displayResults(
      nearbyObjects
    );

  }

  catch (error) {

    console.error(
      "Fout bij ophalen BAG:",
      error
    );


    resultsBox.innerHTML =
      "<p>⚠️ De BAG-gegevens konden niet worden opgehaald.</p>";

    setStatus(
      "⚠️ PDOK kon niet worden bereikt. " +
      "Controleer de internetverbinding en probeer opnieuw."
    );
  }
}


// ----------------------------------------
// Middelpunt van BAG-object berekenen
// ----------------------------------------

function calculateFeatureCenter(
  feature
) {

  if (
    !feature.geometry
  ) {
    return null;
  }


  const points = [];


  function collectPoints(
    coordinates
  ) {

    if (
      typeof coordinates[0] === "number"
    ) {

      points.push(
        coordinates
      );

      return;
    }


    coordinates.forEach(
      collectPoints
    );
  }


  collectPoints(
    feature.geometry.coordinates
  );


  if (!points.length) {
    return null;
  }


  let totalLongitude = 0;
  let totalLatitude = 0;


  points.forEach(function(point) {

    totalLongitude += point[0];
    totalLatitude += point[1];

  });


  return {

    longitude:
      totalLongitude / points.length,

    latitude:
      totalLatitude / points.length
  };
}


// ----------------------------------------
// Afstand berekenen
// Haversine
// ----------------------------------------

function calculateDistance(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {

  const earthRadius =
    6371000;


  const latitudeDifference =
    (latitude2 - latitude1) *
    Math.PI / 180;

  const longitudeDifference =
    (longitude2 - longitude1) *
    Math.PI / 180;


  const a =
    Math.sin(latitudeDifference / 2) *
    Math.sin(latitudeDifference / 2) +

    Math.cos(
      latitude1 * Math.PI / 180
    ) *

    Math.cos(
      latitude2 * Math.PI / 180
    ) *

    Math.sin(longitudeDifference / 2) *
    Math.sin(longitudeDifference / 2);


  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );


  return earthRadius * c;
}


// ----------------------------------------
// Resultaten tonen
// ----------------------------------------

function displayResults(
  objects
) {

  if (!objects.length) {

    resultsBox.innerHTML =
      "<p>Geen BAG-gebouwen binnen de gekozen zoekradius gevonden.</p>";

    setStatus(
      "Geen BAG-objecten binnen de gekozen radius."
    );

    return;
  }


  resultsBox.innerHTML = "";


  objects.forEach(
    function(object, index) {

      const feature =
        object.feature;

      const properties =
        feature.properties || {};


      const identification =
        properties.identificatie ||
        "Onbekend";


      const constructionYear =
        properties.bouwjaar ??
        "Onbekend";


      const purpose =
        Array.isArray(
          properties.gebruiksdoel
        )
          ? properties.gebruiksdoel.join(", ")
          : (
              properties.gebruiksdoel ||
              "Onbekend"
            );


      const status =
        properties.status ||
        "Onbekend";


      // --------------------------------
      // Gebouw op kaart
      // --------------------------------

      L.geoJSON(
        feature,
        {
          style: {
            weight: 2,
            fillOpacity: 0.18
          }
        }
      )
      .bindPopup(
        `
        <strong>HistorieSpot BAG-object</strong><br>
        Bouwjaar: ${escapeHTML(
          String(constructionYear)
        )}<br>
        Gebruiksdoel: ${escapeHTML(
          String(purpose)
        )}
        `
      )
      .addTo(objectLayer);


      // --------------------------------
      // Informatiekaart
      // --------------------------------

      const card =
        document.createElement(
          "article"
        );

      card.className =
        "card";


      card.innerHTML =
        `
        <h3>
          ${index + 1}. Gebouw
        </h3>

        <div class="meta">
          <strong>Afstand:</strong>
          ${Math.round(object.distance)} meter
        </div>

        <div class="meta">
          <strong>Bouwjaar:</strong>
          ${escapeHTML(
            String(constructionYear)
          )}
        </div>

        <div class="meta">
          <strong>Gebruiksdoel:</strong>
          ${escapeHTML(
            String(purpose)
          )}
        </div>

        <div class="meta">
          <strong>Status:</strong>
          ${escapeHTML(
            String(status)
          )}
        </div>

        <div class="meta">
          <strong>BAG-ID:</strong>
          ${escapeHTML(
            String(identification)
          )}
        </div>
        `;


      resultsBox.appendChild(
        card
      );
    }
  );


  setStatus(
    `${objects.length} BAG-object(en) gevonden binnen ` +
    `${radiusSelect.value} meter.`
  );
}


// ----------------------------------------
// HTML beveiligen
// ----------------------------------------

function escapeHTML(
  value
) {

  return value
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}
// ========================================
// HISTORISCHE KAART - KADASTRALE MINUUTPLANS
// RCE - 1811-1832
// ========================================

const minuutplanLayer = L.tileLayer.wms(
    "https://services.rce.geovoorziening.nl/misc/wms",
    {
        layers: "Minuutplanbegrenzingen",
        format: "image/png",
        transparent: true,
        version: "1.3.0",
        opacity: 0.75,
        attribution: "© Rijksdienst voor het Cultureel Erfgoed"
    }
);

// Historische laag standaard uitgeschakeld.
// Voeg de laag toe via de knop hieronder.
minuutplanLayer.addTo(map);
// ========================================
// TEST RCE WFS - MINUUTPLANBEGRENZINGEN
// ========================================

async function testMinuutplanWFS() {

    try {

        const bounds = map.getBounds();

        // Leaflet-kaart gebruikt EPSG:3857.
        // Daarom vragen we de WFS ook in EPSG:3857 op.

        const sw = map.options.crs.project(bounds.getSouthWest());
        const ne = map.options.crs.project(bounds.getNorthEast());

        const bbox = [
            sw.x,
            sw.y,
            ne.x,
            ne.y
        ].join(",");

        const url =
            "https://services.rce.geovoorziening.nl/misc/wfs" +
            "?service=WFS" +
            "&version=1.1.0" +
            "&request=GetFeature" +
            "&typeName=misc:Minuutplanbegrenzingen" +
            "&srsName=EPSG:3857" +
            "&bbox=" + encodeURIComponent(bbox) +
            "&outputFormat=application/json";

        console.log("RCE WFS aanvraag:");
        console.log(url);

        const response = await fetch(url);

        console.log("HTTP-status:", response.status);
        console.log("Content-Type:", response.headers.get("content-type"));

        const text = await response.text();

        console.log("Ruwe RCE WFS-respons:");
        console.log(text);

        const data = JSON.parse(text);

        console.log("RCE WFS JSON:");
        console.log(data);

        console.log(
            "Aantal gevonden minuutplan-secties:",
            data.features ? data.features.length : 0
        );

        if (data.features && data.features.length > 0) {

            console.log(
                "Eerste gevonden sectie:",
                data.features[0]
            );

            console.log(
                "Gegevens eerste sectie:",
                data.features[0].properties
            );

        } else {

            console.log(
                "Geen minuutplan-secties gevonden in de huidige kaartuitsnede."
            );

        }

    } catch (error) {

        console.error(
            "Fout bij testen RCE WFS:",
            error
        );

    }
}

testMinuutplanWFS();
