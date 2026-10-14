// Temporary focused OAT diagnostic for the isolated HistorieSpot test branch.
// Keep output small for mobile copying. Remove after diagnosis.
function findParcelMatches(value, target, path = "$", out = []) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((item, i) => findParcelMatches(item, target, path + "[" + i + "]", out));
    return out;
  }
  const entries = Object.entries(value);
  const matches = entries.some(([key, val]) => {
    const k = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const v = String(val ?? "").trim();
    return (k.includes("perceel") || k === "nr" || k.includes("nummer")) && v === String(target);
  });
  if (matches) {
    out.push({ path, record: value });
    return out;
  }
  for (const [key, val] of entries) {
    if (val && typeof val === "object") findParcelMatches(val, target, path + "." + key, out);
  }
  return out;
}

export async function onRequest() {
  const base = "https://oat.hisgis.nl/oat-ws/rest";
  const checks = [
    { path: "/percelen/Bredevoord/B/67", label: "Bredevoord section B parcel 67" },
    { path: "/percelen/Dokkum", label: "Dokkum municipality records", target: 484 },
    { path: "/scans/Bredevoord", label: "Bredevoord scan list" },
    { path: "/scans/Dokkum", label: "Dokkum scan list" },
    { path: "/status/gemeentes/Bredevoord", label: "Bredevoord municipality status" },
    { path: "/status/gemeentes/Dokkum", label: "Dokkum municipality status" }
  ];
  const results = await Promise.all(checks.map(async check => {
    try {
      const response = await fetch(base + check.path, {
        headers: { "Accept": "application/json, text/plain;q=0.9, */*;q=0.8" },
        redirect: "follow"
      });
      const body = await response.text();
      let parsed;
      try { parsed = JSON.parse(body); } catch {}
      let data;
      if (parsed !== undefined) {
        if (check.target !== undefined) {
          const matches = findParcelMatches(parsed, check.target);
          data = { topLevelType: Array.isArray(parsed) ? "array" : typeof parsed, topLevelCount: Array.isArray(parsed) ? parsed.length : undefined, targetParcelMatches: matches.slice(0, 20) };
        } else if (check.path.startsWith("/scans/") && Array.isArray(parsed)) {
          data = { count: parsed.length, scans: parsed.map(item => ({ code: item.code, percelen: item.percelen })) };
        } else {
          data = parsed;
        }
      }
      return {
        label: check.label,
        path: check.path,
        status: response.status,
        contentType: response.headers.get("content-type"),
        bodyLength: body.length,
        data: data === undefined ? undefined : data,
        snippet: parsed === undefined ? body.slice(0, 500).replace(/\\s+/g, " ") : undefined
      };
    } catch (error) {
      return { label: check.label, path: check.path, error: String(error?.message || error) };
    }
  }));
  return new Response(JSON.stringify({
    diagnostic: "Focused OAT parcel check - Bredevoord B-67 and Dokkum 484",
    checkedAt: new Date().toISOString(),
    results
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
