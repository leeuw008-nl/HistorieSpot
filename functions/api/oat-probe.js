// Temporary diagnostic endpoint for the isolated HistorieSpot OAT test branch.
// Inspect the reachable OAT application landing page and probe documented-looking routes.
// Remove after the correct public route is identified.
export async function onRequest() {
  const base = "https://oat.hisgis.nl";
  const paths = [
    "/oat-ws/",
    "/oat-ws/rest/",
    "/oat-ws/rest/application.wadl",
    "/oat-ws/rest/application.wadl?detail=true",
    "/oat-ws/openapi.json",
    "/oat-ws/openapi.yaml",
    "/oat-ws/swagger.json",
    "/oat-ws/swagger-ui/",
    "/oat-ws/api-docs",
    "/oat-ws/api-docs/",
    "/oat-ws/rest/gemeente",
    "/oat-ws/rest/gemeenten",
    "/oat-ws/rest/gemeente/Bredevoort",
    "/oat-ws/rest/gemeente/Dokkum",
    "/oat-ws/rest/gemeente/Bredevoord",
    "/oat-ws/rest/percelen"
  ];
  const results = await Promise.all(paths.map(async path => {
    try {
      const response = await fetch(base + path, {
        headers: { "Accept": "application/json, text/html, application/xml;q=0.9, */*;q=0.8" },
        redirect: "follow"
      });
      const body = await response.text();
      const result = {
        path,
        status: response.status,
        finalUrl: response.url,
        contentType: response.headers.get("content-type"),
        bodyLength: body.length,
        snippet: body.slice(0, 320).replace(/\s+/g, " ")
      };
      if (path === "/oat-ws/") {
        result.landingHtml = body.slice(0, 12000);
        result.references = [...body.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]).slice(0, 100);
      }
      if (/wadl|openapi|swagger|api-docs/.test(path) && response.ok) {
        result.document = body.slice(0, 12000);
      }
      return result;
    } catch (error) {
      return { path, error: String(error?.message || error) };
    }
  }));
  return new Response(JSON.stringify({
    diagnostic: "temporary OAT route discovery",
    checkedAt: new Date().toISOString(),
    results
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
