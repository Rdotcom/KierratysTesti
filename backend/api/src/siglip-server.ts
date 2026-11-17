import path from "node:path";
import { fileURLToPath } from "node:url";
import { SiglipObjectRecognizer } from "@kierratysappi/data-providers/siglip-recognition";
import { buildApp } from "./app";
import { parseSiglipWebOrigins } from "./siglip-config";

// Dedicated owner-run local service; never loads .env files, API keys or paid providers.
if (process.env.NODE_ENV === "production") throw Error("local_server_is_not_public_production");
const python = process.env.SIGLIP_PYTHON,
  assets = process.env.SIGLIP_ASSETS;
if (!python || !assets) throw Error("set_SIGLIP_PYTHON_and_SIGLIP_ASSETS");
const worker = fileURLToPath(
  new URL("../../data-providers/python/siglip-worker.py", import.meta.url),
);
const recognizer = new SiglipObjectRecognizer({
  python: path.resolve(python),
  assets: path.resolve(assets),
  worker,
  ...(process.env.SIGLIP_PYTHONPATH
    ? {
        pythonPath: process.env.SIGLIP_PYTHONPATH.split(path.delimiter)
          .map((value) => path.resolve(value))
          .join(path.delimiter),
      }
    : {}),
});
const port = Number(process.env.PORT ?? 3004);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("invalid_local_port");
const host = process.env.HOST ?? "127.0.0.1";
if (!["127.0.0.1", "0.0.0.0"].includes(host)) throw Error("invalid_local_host");
const app = await buildApp({
  objectImageRecognizer: recognizer,
  logger: false,
  allowedWebOrigins: parseSiglipWebOrigins(process.env.SIGLIP_WEB_ORIGINS),
  lookupService: {
    lookup: async (input) => ({
      status: "provider_unavailable",
      gtin: input.gtin,
      retryable: true,
    }),
  },
});
const shutdown = () => void app.close();
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
await app.listen({ host, port });
console.log(
  `Self-hosted SigLIP2 listening on ${host}:${port}; no photo persistence or paid provider.`,
);
