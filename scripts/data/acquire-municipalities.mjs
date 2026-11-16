// One bounded public Statistics Finland WFS request. No owner coordinates or key.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  output = path.resolve(root, process.argv[2]);
assert(output.startsWith(`${root}/work/`) && fs.realpathSync(output) === output);
assert(!fs.existsSync(path.join(output, "municipalities.json")));
const url = new URL("https://geo.stat.fi/geoserver/tilastointialueet/wfs");
for (const [k, v] of Object.entries({
  service: "WFS",
  version: "2.0.0",
  request: "GetFeature",
  typeNames: "tilastointialueet:kunta1000k_2026",
  outputFormat: "application/json",
  srsName: "urn:ogc:def:crs:OGC:1.3:CRS84",
  count: "400",
}))
  url.searchParams.set(k, v);
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
assert(response.ok && response.body);
let size = 0;
const chunks = [];
for await (const bytes of response.body) {
  size += bytes.length;
  assert(size <= 5_000_000);
  chunks.push(bytes);
}
const raw = Buffer.concat(chunks),
  parsed = JSON.parse(raw);
assert(
  parsed.type === "FeatureCollection" &&
    parsed.features.length >= 300 &&
    parsed.features.length < 400,
);
assert.equal(parsed.numberReturned, parsed.features.length);
assert.equal(parsed.crs.properties.name, "urn:ogc:def:crs:CRS::84");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const codes = new Set();
let vertices = 0;
const municipalities = parsed.features
  .map((f) => {
    const p = f.properties;
    assert(/^\d{3}$/.test(p.kunta) && !codes.has(p.kunta) && p.vuosi === 2026);
    codes.add(p.kunta);
    assert(typeof p.nimi === "string" && p.nimi.length < 80);
    assert(["Polygon", "MultiPolygon"].includes(f.geometry.type));
    const polygons =
      f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons)
      for (const ring of polygon) {
        assert(ring.length >= 4 && JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)));
        for (const point of ring) {
          assert(
            point.length === 2 &&
              point[0] >= 18 &&
              point[0] <= 33 &&
              point[1] >= 59 &&
              point[1] <= 71,
          );
          vertices++;
        }
      }
    return { code: p.kunta, name: p.nimi, polygons };
  })
  .sort((a, b) => a.code.localeCompare(b.code));
assert(vertices < 250000);
const result = {
  schema: "fi-municipalities-2026-v1",
  source: {
    name: "Tilastokeskus / Statistics Finland · Kunnat 2026 (1:1 000 000)",
    url: url.href,
    checkedAt: "2026-11-16",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceSha256: hash(raw),
    // Deliberately conservative near-border refusal; cartographic, not cadastral data.
    boundaryUncertaintyMeters: 1500,
  },
  municipalities,
};
fs.writeFileSync(path.join(output, "source.geojson"), raw, { flag: "wx" });
fs.writeFileSync(path.join(output, "municipalities.json"), JSON.stringify(result), { flag: "wx" });
console.log(
  JSON.stringify({
    municipalities: municipalities.length,
    vertices,
    rawBytes: raw.length,
    sourceSha256: hash(raw),
    derivedBytes: Buffer.byteLength(JSON.stringify(result)),
    derivedSha256: hash(JSON.stringify(result)),
  }),
);
