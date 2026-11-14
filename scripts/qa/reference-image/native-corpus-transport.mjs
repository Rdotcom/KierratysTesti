// Offline development transport; no app/network/file path from JS photo input.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkedOutput, writeJsonExclusive } from "../local-vision/embedding-control.mjs";

export const NATIVE_CORPUS_LIMITS = Object.freeze({
  capabilities: 1,
  hashes: 333,
  encodes: 93,
  decodes: 53,
  processes: 480,
  processWallMs: 20000,
  maximumOutputBytes: 4300000,
});
const commands = {
  capabilities: "--reference-capabilities",
  hashes: "--reference-hash-stdin",
  encodes: "--reference-encode-stdin",
  decodes: "--reference-rgb-stdin",
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function claimNativeCorpusCall(counters, kind) {
  assert.ok(Object.hasOwn(commands, kind), "unknown_operation");
  assert.ok(
    counters.processes < NATIVE_CORPUS_LIMITS.processes &&
      counters[kind] < NATIVE_CORPUS_LIMITS[kind],
    "call_budget",
  );
  counters.processes++;
  counters[kind]++;
  return commands[kind];
}
function writeRaw(file, bytes, root) {
  assert.ok(bytes.length <= NATIVE_CORPUS_LIMITS.maximumOutputBytes, "raw_output_bound");
  const target = checkedOutput(file, root);
  const fd = fs.openSync(
    target,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    fs.writeFileSync(fd, bytes);
  } finally {
    fs.closeSync(fd);
  }
  return { file: path.relative(root, target), sha256: sha(bytes), bytes: bytes.length };
}

/** Fresh bounded process per operation: intentionally NOT warm app latency.
 * Async I/O lets real JS deadlines fire; no spawnSync timer starvation. */
export function createNativeCorpusTransport({ root, binary, resource, output, lockSha256 }) {
  const counters = { capabilities: 0, hashes: 0, encodes: 0, decodes: 0, processes: 0 };
  let busy = false;
  return {
    counters,
    async call(kind, base64 = "") {
      assert.ok(!busy, "transport_busy");
      assert.equal(typeof base64, "string");
      assert.ok(base64.length <= 2000000);
      const command = claimNativeCorpusCall(counters, kind),
        index = counters.processes - 1;
      writeJsonExclusive(
        path.join(output, `process-${index}-attempt.json`),
        {
          index,
          kind,
          command,
          inputSha256: sha(Buffer.from(base64, "base64")),
          lockSha256,
        },
        root,
      );
      busy = true;
      try {
        const started = performance.now();
        const result = await new Promise((resolve) => {
          let child,
            timer,
            reason = null,
            errorCode = null,
            total = 0;
          const chunks = { stdout: [], stderr: [] };
          const stop = (why) => {
            reason ??= why;
            child?.kill("SIGKILL");
          };
          try {
            child = spawn(binary, ["--resources", resource, command], {
              cwd: root,
              stdio: ["pipe", "pipe", "pipe"],
              env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
            });
          } catch {
            resolve({
              status: null,
              signal: null,
              reason: "spawn_failed",
              errorCode: null,
              stdout: Buffer.alloc(0),
              stderr: Buffer.alloc(0),
            });
            return;
          }
          for (const stream of ["stdout", "stderr"])
            child[stream].on("data", (chunk) => {
              total += chunk.length;
              if (total > NATIVE_CORPUS_LIMITS.maximumOutputBytes) stop("output_bound");
              else chunks[stream].push(chunk);
            });
          child.on("error", (error) => {
            errorCode = error.code ?? "transport_error";
            reason ??= "spawn_failed";
          });
          child.stdin.on("error", () => {
            reason ??= "stdin_failed";
          });
          child.on("close", (status, signal) => {
            clearTimeout(timer);
            resolve({
              status,
              signal,
              reason,
              errorCode,
              stdout: Buffer.concat(chunks.stdout),
              stderr: Buffer.concat(chunks.stderr),
            });
          });
          timer = setTimeout(() => stop("process_timeout"), NATIVE_CORPUS_LIMITS.processWallMs);
          child.stdin.end(base64);
        });
        const stdout = writeRaw(path.join(output, `process-${index}.stdout`), result.stdout, root);
        const stderr = writeRaw(path.join(output, `process-${index}.stderr`), result.stderr, root);
        writeJsonExclusive(
          path.join(output, `process-${index}-result.json`),
          {
            index,
            kind,
            status: result.status,
            signal: result.signal,
            reason: result.reason,
            errorCode: result.errorCode,
            wallMs: Math.ceil(performance.now() - started),
            stdout,
            stderr,
          },
          root,
        );
        assert.ok(result.status === 0 && !result.reason, "required_native_failure");
        return result.stdout.toString("utf8").trim();
      } finally {
        busy = false;
      }
    },
  };
}
