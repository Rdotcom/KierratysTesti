import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { preparePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import {
  type NetworkResult,
  NetworkScoreSchema,
  observationFromScores,
} from "@kierratysappi/contracts/network-recognition";
import { z } from "zod";

export interface ObjectImageRecognizer {
  recognize(jpegBase64: string, signal?: AbortSignal): Promise<NetworkResult>;
}
const modelHash = "d90cf29df7a26cd39d5c8d03c0b6c13179f03e8e905659111be3cbf54552984b";
const prototypeHash = "eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21";
const WorkerOutputSchema = z.object({ scores: NetworkScoreSchema }).strict();
function regular(file: string): void {
  if (!path.isAbsolute(file) || realpathSync(file) !== file || !lstatSync(file).isFile())
    throw Error("invalid_local_model_path");
}
export class SiglipObjectRecognizer implements ObjectImageRecognizer {
  readonly #python: string;
  readonly #worker: string;
  readonly #assets: string;
  readonly #pythonPath: string | undefined;
  #running = false;
  constructor(options: { python: string; worker: string; assets: string; pythonPath?: string }) {
    // A venv python may be a symlink; resolve its real executable without executing a shell.
    if (!path.isAbsolute(options.python)) throw Error("invalid_python_path");
    regular(realpathSync(options.python));
    this.#python = options.python;
    this.#worker = options.worker;
    regular(this.#worker);
    this.#assets = options.assets;
    if (!path.isAbsolute(this.#assets) || realpathSync(this.#assets) !== this.#assets)
      throw Error("invalid_model_directory");
    for (const [name, hash] of [
      ["vision-int8.onnx", modelHash],
      ["prototypes.json", prototypeHash],
    ]) {
      const file = path.join(this.#assets, name ?? "");
      regular(file);
      if (createHash("sha256").update(readFileSync(file)).digest("hex") !== hash)
        throw Error("model_hash_mismatch");
    }
    if (options.pythonPath)
      for (const directory of options.pythonPath.split(path.delimiter)) {
        if (
          !path.isAbsolute(directory) ||
          realpathSync(directory) !== directory ||
          !lstatSync(directory).isDirectory()
        )
          throw Error("invalid_python_modules_path");
      }
    this.#pythonPath = options.pythonPath;
  }
  async recognize(jpegBase64: string, signal?: AbortSignal): Promise<NetworkResult> {
    const fail = (
      reason: Extract<NetworkResult, { status: "unavailable" }>["reason"],
    ): NetworkResult => ({ status: "unavailable", reason });
    if (signal?.aborted) return fail("cancelled");
    if (this.#running) return fail("busy");
    let input: Buffer;
    try {
      input = Buffer.from(preparePhotoBase64(jpegBase64), "base64");
    } catch {
      return fail("invalid_image");
    }
    this.#running = true;
    return new Promise<NetworkResult>((resolve) => {
      const child = spawn(this.#python, ["-s", this.#worker, this.#assets], {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONUNBUFFERED: "1",
          PYTHONNOUSERSITE: "1",
          OMP_NUM_THREADS: "2",
          OPENBLAS_NUM_THREADS: "2",
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          ...(process.platform === "win32"
            ? Object.fromEntries(
                ["SystemRoot", "WINDIR", "TEMP", "TMP"].flatMap((name) =>
                  process.env[name] ? [[name, process.env[name]]] : [],
                ),
              )
            : {}),
          ...(this.#pythonPath ? { PYTHONPATH: this.#pythonPath } : {}),
        },
      });
      let output = "",
        reason: "timeout" | "cancelled" | "failed" | undefined,
        finished = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = (why: typeof reason) => {
        if (!reason) reason = why;
        child.kill("SIGTERM");
        killTimer ??= setTimeout(() => child.kill("SIGKILL"), 250);
        killTimer.unref();
      };
      const abort = () => stop("cancelled");
      const timer = setTimeout(() => stop("timeout"), 12_000);
      timer.unref();
      const finish = (result: NetworkResult) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        signal?.removeEventListener("abort", abort);
        this.#running = false;
        input.fill(0);
        resolve(result);
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (Buffer.byteLength(output) + Buffer.byteLength(chunk) > 8192) stop("failed");
        else output += chunk;
      });
      // Drain but never retain or log parser/image content or a child's environment.
      let errors = 0;
      child.stderr.on("data", (chunk: Buffer) => {
        errors += chunk.length;
        if (errors > 8192) stop("failed");
      });
      child.stdin.on("error", () => {});
      child.on("error", () => {
        reason = "failed";
      });
      child.on("close", (code) => {
        if (reason) return finish(fail(reason));
        if (code !== 0) return finish(fail("failed"));
        try {
          const raw = WorkerOutputSchema.parse(JSON.parse(output));
          finish({
            status: "observed",
            observation: observationFromScores(raw.scores, new Date().toISOString()),
          });
        } catch {
          finish(fail("invalid_response"));
        }
      });
      child.stdin.end(input);
    });
  }
}
