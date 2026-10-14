// Temporary focused OAT diagnostic for the isolated HistorieSpot test branch.
// Queries the documented scan endpoint and searches scan records for the two target parcel numbers.
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

function targetRecords(value, target, path = "$", out = []) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((item, i) => targetRecords(item, target, path + "[" + i + "]", out));
    return out;
  }
  const entries = Object.entries(value);
  const relevant = entries.some(([key, val]) => {
    const k = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (k.includes("perceel") || k === "nr" || k.includes("nummer")) && String(val ?? "").trim() === String(target);
  });
  if (relevant) {
    out.push({ path, record: value });
    return out;
  }
  for (const [key, val] of entries) {
    if (val && typeof val === "object") targetRecords(val, target, path + "." + key, out);
  }
  return out;
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
    const scans = Array.isArray(scansResult.data) ? scansResult.data : [];
    const scanChecks = await Promise.all(scans.map(async scan => {
      if (!scan || !scan.code) return null;
      try {
        const result = await getJson(base, "/percelen/oat/" + encodeURIComponent(scan.code));
        const matches = result.data === undefined ? [] : targetRecords(result.data, target.parcel);
        const bodyHasParcel = new RegExp("(?<![0-9])" + target.parcel + "(?![0-9])").test(result.body);
        return {
          code: scan.code,
          listedRange: scan.percelen,
          status: result.status,
          bodyLength: result.body.length,
          targetMatches: matches.slice(0, 8),
          containsStandaloneParcelNumber: bodyHasParcel,
          errorSnippet: result.data === undefined ? result.body.slice(0, 220).replace(/\\s+/g, " ") : undefined
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
        data: direct.data === undefined ? undefined : direct.data,
        snippet: direct.data === undefined ? direct.body.slice(0, 500).replace(/\\s+/g, " ") : undefined
      },
      scanListStatus: scansResult.status,
      scanCount: scans.length,
      scanChecks: scanChecks.filter(Boolean)
    };
  }));
  return new Response(JSON.stringify({
    diagnostic: "OAT scan-by-scan search for Bredevoord B-67 and Dokkum 484",
    checkedAt: new Date().toISOString(),
    results
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
