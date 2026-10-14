// Temporary focused OAT diagnostic for the isolated HistorieSpot test branch.
// Returns only exact target parcel records so the output stays readable.
// Remove after diagnosis.
async function getJson(base, path) {
  const response = await fetch(base + path, {
    headers: { "Accept": "application/json, text/plain;q=0.9, */*;q=0.8" },
    redirect: "follow"
  });
  const body = await response.text();
  let data;
  try { data = JSON.parse(body); } catch {}
  return { status: response.status, contentType: response.headers.get("content-type"), body, data };
}

function parcelMatches(value, target, path = "$", out = []) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((item, i) => parcelMatches(item, target, path + "[" + i + "]", out));
    return out;
  }
  const section = value.sectie && typeof value.sectie === "object" ? value.sectie.letter : undefined;
  const hasParcelNumber = value.perceelnr !== undefined || (value.nr !== undefined && value.oatScan);
  const number = value.perceelnr !== undefined ? value.perceelnr : value.nr;
  const sectionMatches = !target.section || String(section || "").toUpperCase() === target.section;
  if (hasParcelNumber && String(number) === target.parcel && sectionMatches) {
    out.push({ path, record: value });
    return out;
  }
  for (const [key, val] of Object.entries(value)) {
    if (val && typeof val === "object") parcelMatches(val, target, path + "." + key, out);
  }
  return out;
}

function summarizeDirect(data, target) {
  if (!data || typeof data !== "object") return { parsed: false };
  const results = Array.isArray(data.results) ? data.results : [];
  const matches = parcelMatches(results, target);
  return {
    gemeente: data.gemeente ? { naam: data.gemeente.naam, uniekeNaam: data.gemeente.uniekeNaam, status: data.gemeente.status, provincie: data.gemeente.provincie?.naam } : undefined,
    resultCount: results.length,
    articleCount: Array.isArray(data.artikelen) ? data.artikelen.length : undefined,
    targetMatches: matches.slice(0, 10)
  };
}

export async function onRequest() {
  const base = "https://oat.hisgis.nl/oat-ws/rest";
  const targets = [
    { municipality: "Bredevoord", parcel: "67", section: "B" },
    { municipality: "Dokkum", parcel: "484" }
  ];
  const results = await Promise.all(targets.map(async target => {
    const directPath = target.section
      ? "/percelen/" + target.municipality + "/" + target.section + "/" + target.parcel
      : "/percelen/" + target.municipality;
    const direct = await getJson(base, directPath);
    const scansResult = await getJson(base, "/scans/" + target.municipality);
    const statusResult = await getJson(base, "/status/gemeentes/" + encodeURIComponent(target.municipality));
    const scans = Array.isArray(scansResult.data) ? scansResult.data : [];
    const scanChecks = await Promise.all(scans.map(async scan => {
      if (!scan || !scan.code) return null;
      try {
        const result = await getJson(base, "/percelen/oat/" + encodeURIComponent(scan.code));
        const matches = result.data === undefined ? [] : parcelMatches(result.data, target);
        return {
          code: scan.code,
          listedRange: scan.percelen,
          scanMetadata: Object.fromEntries(Object.entries(scan).filter(([key]) => !["code", "percelen"].includes(key))),
          status: result.status,
          bodyLength: result.body.length,
          resultCount: Array.isArray(result.data?.results) ? result.data.results.length : undefined,
          sampleParcelFields: Array.isArray(result.data?.results) && result.data.results[0] ? Object.keys(result.data.results[0]) : undefined,
          sampleParcel: Array.isArray(result.data?.results) && result.data.results[0] ? result.data.results[0] : undefined,
          targetMatches: matches.slice(0, 5),
          errorSnippet: result.data === undefined ? result.body.slice(0, 180).replace(/\\s+/g, " ") : undefined
        };
      } catch (error) {
        return { code: scan.code, error: String(error?.message || error) };
      }
    }));
    return {
      municipality: target.municipality,
      targetParcel: target.section ? target.section + "-" + target.parcel : target.parcel,
      directLookup: {
        path: directPath,
        status: direct.status,
        bodyLength: direct.body.length,
        summary: summarizeDirect(direct.data, target),
        errorSnippet: direct.data === undefined ? direct.body.slice(0, 300).replace(/\\s+/g, " ") : undefined
      },
      scanListStatus: scansResult.status,
      scanCount: scans.length,
      municipalityStatus: { status: statusResult.status, contentType: statusResult.contentType, bodyLength: statusResult.body.length, data: statusResult.data ?? statusResult.body.slice(0, 500) },
      scanListSample: scans.slice(0, 3),
      scanChecks: scanChecks.filter(Boolean)
    };
  }));
  return new Response(JSON.stringify({
    diagnostic: "OAT exact-parcel scan search (compact output)",
    checkedAt: new Date().toISOString(),
    results
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
