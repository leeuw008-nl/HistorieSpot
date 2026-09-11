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
// HISTORIEPUNT - KLIKBARE MINUUTPLANS
// RCE Kadastrale Minuutplans 1811-1832
// ========================================

// WGS84 -> RD New
function wgs84ToRD(lat, lon) {

    const dF = 0.36 * (lat - 52.15517440);
    const dL = 0.36 * (lon - 5.38720621);

    const x =
        155000
        + 190094.945 * dL
        - 11832.228 * dF * dL
        - 114.221 * Math.pow(dF, 2) * dL
        - 32.391 * Math.pow(dL, 3)
        - 0.705 * dF
        - 2.340 * Math.pow(dF, 3) * dL
        - 0.608 * dF * Math.pow(dL, 3)
        - 0.008 * Math.pow(dL, 2)
        + 0.148 * Math.pow(dF, 2) * Math.pow(dL, 3);

    const y =
        463000
        + 309056.544 * dF
        + 3638.893 * Math.pow(dL, 2)
        + 73.077 * Math.pow(dF, 2)
        - 157.984 * dF * Math.pow(dL, 2)
        + 59.788 * Math.pow(dF, 3)
        + 0.433 * dL
        - 6.439 * Math.pow(dF, 2) * Math.pow(dL, 2)
        - 0.032 * dF * dL
        + 0.092 * Math.pow(dL, 4)
        - 0.054 * dF * Math.pow(dL, 4);

    return {
        x: x,
        y: y
    };
}


// Klik op de kaart
map.on("click", async function (e) {

    // Alleen actief wanneer historische laag zichtbaar is
    if (!map.hasLayer(minuutplanLayer)) {
        return;
    }

    try {

        // Klikpunt omzetten naar RD New
        const rd = wgs84ToRD(
            e.latlng.lat,
            e.latlng.lng
        );

        // Zoekgebied rond klikpunt: 20 meter
        const minX = rd.x - 20;
        const maxX = rd.x + 20;
        const minY = rd.y - 20;
        const maxY = rd.y + 20;

        const bbox = [
            minX,
            minY,
            maxX,
            maxY
        ].join(",");

        const url =
            "https://services.rce.geovoorziening.nl/misc/wfs" +
            "?service=WFS" +
            "&version=2.0.0" +
            "&request=GetFeature" +
            "&typeNames=misc:Minuutplanbegrenzingen" +
            "&srsName=EPSG:28992" +
            "&bbox=" + encodeURIComponent(bbox) +
            "&outputFormat=application/json" +
            "&count=5";

        console.log("RCE minuutplan klik:", e.latlng);
        console.log("RD-coördinaten:", rd);
        console.log("WFS:", url);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                "RCE WFS HTTP " + response.status
            );
        }

        const data = await response.json();

        console.log("RCE resultaat:", data);

        if (
            !data.features ||
            data.features.length === 0
        ) {

            console.log(
                "Geen minuutplan op deze locatie."
            );

            return;
        }

        const p = data.features[0].properties;
// ========================================
// HISTORISCHE MINUUTPLAN-LAAG
// HisGIS - gegeorefereerde minuutplans
// ========================================

const minuutplanCode = p.CODE;

console.log("Minuutplancode:", minuutplanCode);

if (minuutplanCode) {

    // ----------------------------------------
    // Vorige historische laag verwijderen
    // ----------------------------------------

    if (window.historischeMinuutplanLayer) {
        map.removeLayer(window.historischeMinuutplanLayer);
        window.historischeMinuutplanLayer = null;
    }

    // ----------------------------------------
    // Nieuwe historische kaartlaag
    // ----------------------------------------

    window.historischeMinuutplanLayer = L.tileLayer(
        "https://geoservices.hisgis.nl/tiles/minuutplans/{z}/{x}/{y}.png?cut" +
        minuutplanCode +
        "*",
        {
            opacity: 0.55,
            maxZoom: 20,
            attribution:
                "Historische kaart: HisGIS / RCE"
        }
    );

    window.historischeMinuutplanLayer.addTo(map);

    console.log(
        "Historische minuutplanlaag toegevoegd:",
        minuutplanCode
    );

    // ----------------------------------------
    // Historische kaartbediening
    // ----------------------------------------

    if (!window.historischeOpacityControl) {

        window.historischeOpacityControl = L.control({
            position: "topright"
        });

        window.historischeOpacityControl.onAdd =
            function () {

                const div =
                    L.DomUtil.create(
                        "div",
                        "leaflet-control"
                    );

                div.id =
                    "historischeKaartControl";

                div.style.background =
                    "white";

                div.style.padding =
                    "10px";

                div.style.borderRadius =
                    "6px";

                div.style.boxShadow =
                    "0 1px 5px rgba(0,0,0,0.4)";

                div.style.width =
                    "180px";

                div.innerHTML = `

                    <div style="
                        font-weight:bold;
                        margin-bottom:6px;
                    ">
                        Historische kaart
                    </div>

                    <div style="
                        font-size:12px;
                        margin-bottom:6px;
                    ">
                        Minuutplan
                        <strong>
                            ${minuutplanCode}
                        </strong>
                    </div>

                    <input
                        id="historischeOpacity"
                        type="range"
                        min="0"
                        max="100"
                        value="55"
                        style="width:100%;"
                    >

                    <div style="
                        text-align:center;
                        font-size:12px;
                        margin-top:3px;
                    ">
                        Zichtbaarheid:
                        <span id="historischeOpacityValue">
                            55
                        </span>%
                    </div>

                `;

                L.DomEvent.disableClickPropagation(
                    div
                );

                return div;
            };

        window.historischeOpacityControl.addTo(
            map
        );

        // ----------------------------------------
        // Slider koppelen
        // ----------------------------------------

        setTimeout(function () {

            const slider =
                document.getElementById(
                    "historischeOpacity"
                );

            const value =
                document.getElementById(
                    "historischeOpacityValue"
                );

            if (slider) {

                slider.addEventListener(
                    "input",
                    function () {

                        const opacity =
                            Number(this.value) / 100;

                        if (
                            window.historischeMinuutplanLayer
                        ) {

                            window.historischeMinuutplanLayer
                                .setOpacity(opacity);

                        }

                        if (value) {
                            value.textContent =
                                this.value;
                        }

                    }
                );

            }

        }, 100);

    }

    else {

        // ----------------------------------------
        // Bestaande bediening bijwerken
        // ----------------------------------------

        const control =
            document.getElementById(
                "historischeKaartControl"
            );

        if (control) {

            const codeElement =
                control.querySelector(
                    "strong"
                );

            if (codeElement) {
                codeElement.textContent =
                    minuutplanCode;
            }

        }

    }

}
// ========================================
// TRANSPARANTIE HISTORISCHE KAART
// ========================================

if (window.historischeOpacityControl) {
    map.removeControl(window.historischeOpacityControl);
}

window.historischeOpacityControl = L.control({
    position: "topright"
});

window.historischeOpacityControl.onAdd = function () {

    const div = L.DomUtil.create(
        "div",
        "leaflet-control"
    );

    div.style.background = "white";
    div.style.padding = "10px";
    div.style.borderRadius = "6px";
    div.style.boxShadow = "0 1px 5px rgba(0,0,0,0.4)";
    div.style.width = "170px";

    div.innerHTML = `
        <div style="
            font-weight:bold;
            margin-bottom:6px;
        ">
            Historische kaart
        </div>

        <input
            id="historischeOpacity"
            type="range"
            min="0"
            max="100"
            value="55"
            style="width:100%;"
        >

        <div style="
            text-align:center;
            font-size:12px;
            margin-top:3px;
        ">
            Transparantie: <span id="historischeOpacityValue">55</span>%
        </div>
    `;

    L.DomEvent.disableClickPropagation(div);

    return div;
};

window.historischeOpacityControl.addTo(map);


// Slider koppelen
setTimeout(function () {

    const slider =
        document.getElementById(
            "historischeOpacity"
        );

    const value =
        document.getElementById(
            "historischeOpacityValue"
        );

    if (slider) {

        slider.addEventListener(
            "input",
            function () {

                const opacity =
                    Number(this.value) / 100;

                if (
                    window.historischeMinuutplanLayer
                ) {

                    window.historischeMinuutplanLayer
                        .setOpacity(opacity);
                }

                if (value) {
                    value.textContent =
                        this.value;
                }

            }
        );
    }

}, 100);
        let popupContent = `
            <div style="min-width:240px">

                <strong style="font-size:16px">
                    🕰 Kadastraal minuutplan
                </strong>

                <br>

                <small>
                    Rijksdienst voor het Cultureel Erfgoed
                </small>

                <hr>

                <strong>Periode:</strong><br>
                1811–1832

                <br><br>

                <strong>Gemeente:</strong><br>
                ${p.GEMEENTE || "onbekend"}

                <br><br>

                <strong>Sectie:</strong>
                ${p.SECTIE || ""}

                <br>

                <strong>Blad:</strong>
                ${p.BLAD || ""}

                <br><br>

                <strong>Code:</strong><br>
                ${p.CODE || ""}

                <br><br>

                <a
                    href="${p.URL}"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="
                        display:inline-block;
                        padding:8px 12px;
                        background:#1d5d8f;
                        color:white;
                        text-decoration:none;
                        border-radius:5px;
                    "
                >
                    Bekijk originele minuutplan
                </a>

            </div>
        `;

        L.popup()
            .setLatLng(e.latlng)
            .setContent(popupContent)
            .openOn(map);

    }

    catch (error) {

        console.error(
            "Fout bij ophalen minuutplan:",
            error
        );

    }

});
