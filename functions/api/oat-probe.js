// Temporary diagnostic endpoint for the isolated HistorieSpot OAT test branch.
// Uses routes listed by the OAT service's own WADL and landing page.
// Remove after the correct data path is confirmed.
export async function onRequest() {
  const base = "https://oat.hisgis.nl/oat-ws/rest";
  const paths = [
    "/scans/Bredevoort",
    "/scans/Bredevoord",
    "/scans/Dokkum",
    "/percelen/Bredevoort",
    "/percelen/Bredevoord",
    "/percelen/Dokkum",
    "/percelen/Bredevoort/B",
    "/percelen/Bredevoord/B",
    "/percelen/Dokkum/A",
    "/status/gemeentes",
    "/status/gemeentes/Bredevoort",
    "/status/gemeentes/Bredevoord",
    "/status/gemeentes/Dokkum",
    "/tarieven?gemeente=Bredevoort",
    "/tarieven?gemeente=Dokkum"
  ];
  const results = await Promise.all(paths.map(async path => {
    try {
      const response = await fetch(base + path, {
        headers: { "Accept": "application/json, text/plain;q=0.9, */*;q=0.8" },
        redirect: "follow"
      });
      const body = await response.text();
      let parsed;
      try { parsed = JSON.parse(body); } catch {}
      return {
        path,
        status: response.status,
        contentType: response.headers.get("content-type"),
        bodyLength: body.length,
        data: parsed === undefined ? undefined : parsed,
        snippet: parsed === undefined ? body.slice(0, 1200).replace(/\s+/g, " ") : undefined
      };
    } catch (error) {
      return { path, error: String(error?.message || error) };
    }
  }));
  return new Response(JSON.stringify({
    diagnostic: "OAT data route check for Bredevoort and Dokkum",
    checkedAt: new Date().toISOString(),
    results
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
