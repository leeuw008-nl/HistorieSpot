// Temporary server-side OAT/koppelsite probe for the isolated HistorieSpot test branch.
// This route is diagnostic only and does not change the live app.
async function inspect(url) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
      redirect: "follow"
    });
    const body = await response.text();
    let json;
    try { json = JSON.parse(body); } catch {}
    const rows = [...body.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(m => {
      const html = m[0];
      const plain = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
      return { plain: plain.slice(0, 500), codes: [...new Set((html.match(/OAT\d{5}[A-Z]\d{3}/gi) || []).map(x => x.toUpperCase()))] };
    });
    const parcelRecords = Array.isArray(json?.results) ? json.results.map(p => ({
      nr: p.perceelnr ?? p.nr ?? null,
      toevoeging: p.perceelnrtvg ?? null,
      sectie: p.sectie?.letter ?? p.sectie ?? null,
      artikel: p.artikelLink ? [p.artikelLink.artikelnr, p.artikelLink.artikelnrtvg, p.artikelLink.reeks].filter(v => v !== undefined && v !== null && v !== "").join("/") : null,
      oatScan: p.oatScan ?? null,
      veldnamen: Object.keys(p)
    })) : [];
    return {
      url, status: response.status, finalUrl: response.url,
      contentType: response.headers.get("content-type"),
      bodyLength: body.length,
      jsonSummary: json && typeof json === "object" ? {
        gemeente: json.gemeente ? { naam: json.gemeente.naam, uniekeNaam: json.gemeente.uniekeNaam, status: json.gemeente.status } : undefined,
        resultCount: Array.isArray(json.results) ? json.results.length : undefined,
        articleCount: Array.isArray(json.artikelen) ? json.artikelen.length : undefined,
        topLevelKeys: Object.keys(json)
      } : undefined,
      sections: [...new Set(parcelRecords.map(p => String(p.sectie ?? "onbekend")))],
      parcelRecords: parcelRecords.slice(0, 100),
      scanCodes: [...new Set((body.match(/OAT\d{5}[A-Z]\d{3}/gi) || []).map(x => x.toUpperCase()))].slice(0, 100),
      parcel67Rows: rows.filter(r => /(^|\D)67(\D|$)/.test(r.plain)).slice(0, 10),
      bodyStart: !json ? body.slice(0, 700).replace(/\s+/g, " ") : undefined
    };
  } catch (e) {
    return { url, error: String(e?.message || e) };
  }
}

export async function onRequest() {
  const urls = [
    "https://osm.hisgis.nl/koppel/Bredevoord/B",
    "https://oat.hisgis.nl/oat-ws/rest/percelen/Bredevoord/B",
    "https://oat.hisgis.nl/oat-ws/rest/percelen/Bredevoord",
    "https://oat.hisgis.nl/oat-ws/rest/percelen/Bredevoord/B/67",
    "https://oat.hisgis.nl/oat-ws/rest/percelen/Dokkum",
    "https://oat.hisgis.nl/oat-ws/rest/percelen/Dokkum/A/484"
  ];
  const results = await Promise.all(urls.map(inspect));
  return new Response(JSON.stringify({
    diagnostic: "Server-side OAT/koppelsite probe including all municipal parcel records",
    checkedAt: new Date().toISOString(),
    results
  }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
