import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webSecurityHeaders } from "./lib/web-security.mjs";

const root = fs.realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const output = path.join(root, "mobile/app/dist");
if (fs.realpathSync(output) !== output || !fs.existsSync(path.join(output, "index.html")))
  throw Error("invalid_web_export");
const headers = webSecurityHeaders(output, process.env);
fs.writeFileSync(
  path.join(output, "_headers"),
  `/*\n${Object.entries(headers)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join("\n")}\n`,
);
console.log("Wrote strict web headers with hashes for trusted inline bootstrap scripts.");
