// Resume native operations only after authenticating an immutable successful prefix.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkedWorkFile, readBounded } from "../local-vision/embedding-control.mjs";
import {
  claimExpandedCorpusCall,
  createExpandedCorpusTransport,
} from "./native-corpus-transport.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const parentFile = "work/expanded-native-2026-11-14.jNduPd/freeze/lock.json";
const parentSha = "bea247c13359bbc5f06cd03eb5aec4ff9addf233ebd892c32a78881e421a60d1";
const directory = "work/expanded-native-2026-11-14.jNduPd/result";
export function loadContinuation(root) {
  const pins = {};
  const take = (file, maximum = 4_300_000) => {
    const b = readBounded(checkedWorkFile(file, root), maximum);
    pins[file] = sha(b);
    return b;
  };
  assert.equal(sha(take(parentFile)), parentSha);
  const parent = JSON.parse(take(parentFile));
  const source =
    "work/expanded-native-2026-11-14.jNduPd/failed-source/evaluate-expanded-corpus.mjs";
  assert.equal(
    sha(take(source)),
    parent.sources["scripts/qa/reference-image/evaluate-expanded-corpus.mjs"],
  );
  for (let i = 0; i < 274; i++) {
    const attempt = JSON.parse(take(`${directory}/process-${i}-attempt.json`)),
      result = JSON.parse(take(`${directory}/process-${i}-result.json`));
    assert.equal(attempt.index, i);
    assert.equal(result.index, i);
    assert.equal(attempt.lockSha256, parentSha);
    assert.equal(result.status, 0);
    assert.equal(result.reason, null);
    assert.equal(result.signal, null);
    assert.equal(result.errorCode, null);
    for (const stream of ["stdout", "stderr"]) {
      const f = `${directory}/process-${i}.${stream}`;
      assert.equal(result[stream].file, f);
      const b = take(f);
      assert.equal(sha(b), result[stream].sha256);
      assert.equal(b.length, result[stream].bytes);
    }
  }
  assert.ok(
    !fs.existsSync(path.join(root, `${directory}/process-274-attempt.json`)),
    "unregistered_parent_tail",
  );
  for (let i = 0; i < 13; i++) take(`${directory}/query-${i}.json`);
  assert.ok(!fs.existsSync(path.join(root, `${directory}/query-13.json`)));
  return {
    parentFile,
    parentSha256: parentSha,
    directory,
    prefixProcesses: 274,
    priorQueries: 13,
    pins,
    parent,
  };
}
export function queryObservation(row) {
  return {
    id: row.id,
    allocationRole: row.allocationRole,
    ...(row.productId ? { productId: row.productId } : {}),
    ...(row.evaluationNovelty ? { evaluationNovelty: row.evaluationNovelty } : {}),
    imageSha256: row.imageSha256,
    result: null,
  };
}
export function createContinuationTransport(options, continuation) {
  const base = createExpandedCorpusTransport(options);
  return {
    counters: base.counters,
    async call(kind, base64 = "") {
      const index = base.counters.processes;
      if (index >= continuation.prefixProcesses) return base.call(kind, base64);
      const read = (file) => {
        const b = readBounded(checkedWorkFile(file, options.root), 4_300_000);
        assert.equal(sha(b), continuation.pins[file], "prefix_pin_drift");
        return b;
      };
      const attempt = JSON.parse(read(`${continuation.directory}/process-${index}-attempt.json`)),
        result = JSON.parse(read(`${continuation.directory}/process-${index}-result.json`));
      assert.equal(attempt.kind, kind);
      assert.equal(result.kind, kind);
      assert.equal(attempt.lockSha256, continuation.parentSha256);
      assert.equal(
        attempt.inputSha256,
        sha(Buffer.from(base64, "base64")),
        "prefix_input_mismatch",
      );
      assert.equal(attempt.command, claimExpandedCorpusCall(base.counters, kind));
      assert.equal(result.status, 0);
      assert.equal(result.reason, null);
      const b = read(result.stdout.file);
      assert.equal(sha(b), result.stdout.sha256);
      return b.toString("utf8").trim();
    },
  };
}
