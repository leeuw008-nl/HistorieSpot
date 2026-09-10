const CACHE_NAME = "historiespot-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];


// ========================================
// INSTALL
// ========================================

self.addEventListener("install", event => {

  event.waitUntil(

    caches.open(CACHE_NAME)
      .then(cache => {

        return cache.addAll(APP_FILES);

      })

  );

  self.skipWaiting();
});


// ========================================
// ACTIVATE
// ========================================

self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys()
      .then(cacheNames => {

        return Promise.all(

          cacheNames
            .filter(
              name => name !== CACHE_NAME
            )
            .map(
              name => caches.delete(name)
            )

        );

      })

  );

  self.clients.claim();
});


// ========================================
// REQUESTS
// ========================================

self.addEventListener("fetch", event => {

  const request =
    event.request;

  const url =
    new URL(request.url);


  // Alleen bestanden van
  // HistorieSpot zelf uit de cache halen.

  if (
    url.origin === self.location.origin
  ) {

    event.respondWith(

      caches.match(request)
        .then(cachedResponse => {

          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(request);

        })

    );

    return;
  }


  // Externe bronnen zoals:
  // OpenStreetMap
  // PDOK
  //
  // blijven rechtstreeks via internet
  // worden opgehaald.

  event.respondWith(

    fetch(request)
      .catch(() => {

        return caches.match(request);

      })

  );

});
