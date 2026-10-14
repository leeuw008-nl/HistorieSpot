// Temporary diagnostic endpoint for the isolated HistorieSpot OAT test branch.
// Probes likely public REST/OpenAPI routes server-side, avoiding browser CORS limitations.
// Remove after the correct public route is identified.
export async function onRequest() {
  const base = "https://oat.hisgis.nl";
  const paths = [
    "/oat-ws/rest/gemeente",
    "/oat-ws/rest/gemeenten",
    "/oat-ws/rest/gemeente/Bredevoort",
    "/oat-ws/rest/gemeente/Dokkum",
    "/oat-ws/rest/gemeente/Bredevoord",
    "/oat-ws/rest/percelen",
    "/oat-ws/api-docs/oas-3.0.0.json",
    "/oat-ws/swagger/ui",
    "/oat-ws/",
    "/api-docs/oas-3.0.0.json",
    "/swagger/ui"
  ];
  const results = await Promise.all(paths.map(async path => {
    try {
      const response = await fetch(base + path, {
        headers: { "Accept": "application/json, text/html;q=0.9, */*;q=0.8" },
        redirect: "follow"
      });
      const body = await response.text();
      return {
        path,
        status: response.status,
        finalUrl: response.url,
        contentType: response.headers.get("content-type"),
        bodyLength: body.length,
        snippet: body.slice(0, 260).replace(/\s+/g, " ")
      };
    } catch (error) {
      return { path, error: String(error?.message || error) };
    }
  }));
  return new Response(JSON.stringify({
    diagnostic: "temporary OAT endpoint probe",
    checkedAt: new Date().toISOString(),
    results
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
