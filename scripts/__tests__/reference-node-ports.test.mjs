import assert from "node:assert/strict";
import test from "node:test";
import {
  createNodeReferencePorts,
  NODE_REFERENCE_DECODE_POLICY,
} from "../qa/reference-image/node-runtime-ports.mjs";

const limits = { maximumDimension: 1024, maximumPixels: 1048576 };
const encoded = () => Uint8Array.of(255, 216, 255, 217);
function decoder(metadata = { width: 64, height: 32, format: "jpeg" }, rgb = {}) {
  const events = [];
  const sharp = (bytes, options) => {
    events.push(["open", bytes, options]);
    const pipeline = {
      async metadata() {
        events.push(["metadata"]);
        return metadata;
      },
      rotate() {
        events.push(["orient"]);
        return pipeline;
      },
      flatten(options) {
        events.push(["flatten", options]);
        return pipeline;
      },
      toColourspace(space) {
        events.push(["colour", space]);
        return pipeline;
      },
      removeAlpha() {
        events.push(["alpha"]);
        return pipeline;
      },
      raw() {
        events.push(["raw"]);
        return pipeline;
      },
      async toBuffer(options) {
        events.push(["buffer", options]);
        return {
          info: { width: 64, height: 32, channels: 3 },
          data: new Uint8Array(64 * 32 * 3),
          ...rgb,
        };
      },
    };
    return pipeline;
  };
  return { sharp, events };
}

test("Node adapter uses real SHA256 and one explicit image-preprocessing version", async () => {
  assert.equal(NODE_REFERENCE_DECODE_POLICY, "single-frame-jpeg-png-srgb-white-auto-orient-v1");
  const ports = createNodeReferencePorts(decoder().sharp);
  assert.equal(
    await ports.sha256(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.ok(Object.isFrozen(ports));
});

test("metadata bounds precede RGB decoding; output is owned packed RGB", async () => {
  const value = decoder();
  const result = await createNodeReferencePorts(value.sharp).decodeRgb(encoded(), limits);
  assert.deepEqual(result, { width: 64, height: 32, data: new Uint8Array(64 * 32 * 3) });
  assert.equal(Object.getPrototypeOf(result.data), Uint8Array.prototype);
  assert.deepEqual(
    value.events.map(([name]) => name),
    ["open", "metadata", "open", "orient", "flatten", "colour", "alpha", "raw", "buffer"],
  );
  assert.deepEqual(value.events[0][2], {
    limitInputPixels: 1048576,
    failOn: "warning",
    sequentialRead: true,
  });
  assert.deepEqual(value.events[4][1], { background: "#ffffff" });
  assert.equal(value.events[5][1], "srgb");
});

test("oversized, animated, unsupported, malformed and invalid RGB inputs fail closed", async () => {
  for (const change of [
    { format: "svg" },
    { format: "webp" },
    { pages: 2 },
    { width: 1025 },
    { height: 0 },
    { width: 33.5 },
    { width: undefined },
  ]) {
    const value = decoder({ width: 64, height: 32, format: "jpeg", ...change });
    await assert.rejects(
      createNodeReferencePorts(value.sharp).decodeRgb(encoded(), limits),
      /metadata/u,
    );
    assert.equal(
      value.events.some(([name]) => name === "raw"),
      false,
    );
  }
  for (const rgb of [{ info: { width: 64, height: 32, channels: 4 } }, { data: new Uint8Array(1) }])
    await assert.rejects(
      createNodeReferencePorts(decoder(undefined, rgb).sharp).decodeRgb(encoded(), limits),
      /rgb/u,
    );
  const value = decoder();
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array(2 * 1024 * 1024 + 1),
    "https://example.org/private",
    [],
  ])
    await assert.rejects(createNodeReferencePorts(value.sharp).decodeRgb(bytes, limits), /input/u);
  assert.deepEqual(value.events, []);
  await assert.rejects(
    createNodeReferencePorts(value.sharp).decodeRgb(encoded(), { maximumDimension: 2048 }),
    /input/u,
  );
  assert.throws(() => createNodeReferencePorts(null));
  await assert.rejects(
    createNodeReferencePorts(value.sharp).decodeRgb(
      new TextEncoder().encode("<svg></svg>"),
      limits,
    ),
    /signature/u,
  );
  assert.deepEqual(value.events, []);
});
