```javascript
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
let searchCircle = null;

let currentLatitude = null;
let currentLongitude = null;

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
// Zoekradius gewijzigd
// ----------------------------------------

radiusSelect.addEventListener("change", function () {

  const radius = Number(radiusSelect.value);

  // Als er nog geen GPS-positie is:
  if (
    currentLatitude === null ||
    currentLongitude === null
  ) {
    setStatus(
      "Druk op ‘Waar ben ik?’ om eerst de huidige positie te bepalen."
    );

    return;
  }

  // Zoekcirkel aanpassen
  updateSearchCircle(
    currentLatitude,
    currentLongitude,
    radius
  );

  // BAG opnieuw ophalen
  loadBAG(
    currentLatitude,
    currentLongitude,
    radius
  );
});


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

    // ------------------------------------
    // Succes
    // ------------------------------------

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


      // Positie bewaren
      currentLatitude = latitude;
      currentLongitude = longitude;


      // ----------------------------------
      // Kaart naar huidige positie
      // ----------------------------------

      map.setView(
        [latitude, longitude],
        18
      );


      // ----------------------------------
      // Oude GPS-marker verwijderen
      // ----------------------------------

      if (currentMarker) {
        map.removeLayer(currentMarker);
      }


      // ----------------------------------
      // Oude nauwkeurigheid verwijderen
      // ----------------------------------

      if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
      }


      // ----------------------------------
      // Oude zoekcirkel verwijderen
      // ----------------------------------

      if (searchCircle) {
        map.removeLayer(searchCircle);
      }


      // ----------------------------------
      // GPS-marker
      // ----------------------------------

      currentMarker = L.marker([
        latitude,
        longitude
      ])
      .addTo(map)
      .bindPopup(
        "📍 Huidige positie"
      )
      .openPopup();


      // ----------------------------------
      // GPS-nauwkeurigheid
      // ----------------------------------

      accuracyCircle = L.circle(
        [latitude, longitude],
        {
          radius: accuracy,
          color: "#0b5cab",
          fillOpacity: 0.08,
          weight: 2
        }
      ).addTo(map);


      // ----------------------------------
      // Zoekcirkel
      // ----------------------------------

      updateSearchCircle(
        latitude,
        longitude,
        radius
      );


      // ----------------------------------
      // Status
      // ----------------------------------

      setStatus(
        `📍 Locatie gevonden. ` +
        `Nauwkeurigheid ongeveer ${accuracy} meter. ` +
        `Zoekgebied: ${radius} meter.`
      );


      // ----------------------------------
      // BAG ophalen
      // ----------------------------------

      loadBAG(
        latitude,
        longitude,
        radius
      );

    },


    // ------------------------------------
    // Fout
    // ------------------------------------

    function(error) {

      locateBtn.disabled = false;


      if (error.code === 1) {

        setStatus(
          "⚠️ Locatietoegang is geweigerd. " +
          "Geef HistorieSpot toestemming om de locatie te gebruiken."
        );

      }

      else if (error.code === 2) {

        setStatus(
          "⚠️ De locatie kon niet worden bepaald. " +
          "Controleer of GPS/locatievoorzieningen zijn ingeschakeld."
        );

      }

      else if (error.code === 3) {

        setStatus(
          "⚠️ Het bepalen van de locatie duurde te lang. " +
          "Probeer het opnieuw."
        );

      }

      else {

        setStatus(
          "⚠️ Er is een onbekende locatiefout opgetreden."
        );
      }
    },


    // ------------------------------------
    // GPS-instellingen
    // ------------------------------------

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000
    }
  );
}


// ----------------------------------------
// Zoekcirkel tekenen / aanpassen
// ----------------------------------------

function updateSearchCircle(
  latitude,
  longitude,
  radius
) {

  if (searchCircle) {
    map.removeLayer(searchCircle);
  }


  searchCircle = L.circle(
    [latitude, longitude],
    {
      radius: radius,
      color: "#0b5cab",
      weight: 2,
      fillOpacity: 0.04
    }
  ).addTo(map);
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


    // ------------------------------------
    // Afstand tot ieder gebouw bepalen
    // ------------------------------------

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
```
