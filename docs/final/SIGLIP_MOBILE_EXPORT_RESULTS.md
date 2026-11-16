# SigLIP2 mobile export and parity — November 16, 2026

## Outcome

An image-only **125,467,999-byte (119.66 MiB)** candidate, including the cached
15-class text-prototype JSON, passes the original INT8 engineering gates on the
same four development scenes. All four top-1 classes are preserved; minimum
embedding cosine is **0.99982950**, maximum class-score error **0.00064997**.
Original gates remain cosine>=0.995, score error<=0.005,4/4success/same top1 and
resources<=150MiB. An independent vector/rank/byte/hash recount passes.

This is NOT broad recognition accuracy, physical-phone acceptance or a model
promotion. The installed app still uses its existing MobileCLIP path; barcode,
OCR, photo UI, catalogues and sorting/provenance behavior are unchanged. The
1.50GB source checkpoint was a development download, not the installed app:
the91.64%resource reduction below is NOT an app-size reduction claim.

## Measured artifacts

| Artifact | Bytes | Result |
| --- | ---: | --- |
| Official full text+vision source checkpoint | 1,500,800,904 | Development source only |
| Saved FP32 image-only safetensors | 371,558,952 | Strictly reloaded; text tower omitted |
| Original FP16 CoreML + prototypes | 185,068,077 | FAILED parity and150MiB size gate |
| Original per-channel INT8/FP16 compute + prototypes | 93,111,880 | FAILED parity despite small size |
| Selective block32 INT8/FP32 compute + prototypes | 125,467,999 | Passed bounded INT8 engineering gate |

Final candidate stores72encoder linear-weight matrices in signed symmetric
INT8 blocks of32; patch/position embeddings, pooling head, biases and normalization
remain FP32. Activations/computation remain FP32; this is **weight storage
compression, not INT8 arithmetic**. No training, calibration, paid inference or
image-based threshold fitting. Text prototypes are computed once and cached
(327,254bytes), not encoded on each photo.

Input is Float32[1,3,224,224], output Float32[1,768]; exact original processor
input tensors are reused. CoreML spec9/iOS18 is required for blockwise storage;
the app minimum OS has NOT been changed. This candidate is not Android compatible
as-is. The existing native512D MobileCLIP consumer cannot load it unchanged.
An isolated768D consumer and end-to-end image preprocessing parity are next.

## Actual four-scene parity

| Clean development scene | Baseline and final top1 | Cosine | Max class-score error | Mac CPU ms |
| --- | --- | ---: | ---: | ---: |
| commons-1-clean | multiple-cups | 0.99982950 | 0.00064997 | 61 |
| commons-2-clean | spoon | 0.99994622 | 0.00030781 | 52 |
| commons-3-clean | spoon | 0.99993897 | 0.00042561 | 51 |
| commons-4-clean | spoon-and-fork | 0.99991344 | 0.00046324 | 50 |

These are15fixed prompt-class scores, not calibrated probabilities or material/
sorting answers. Two spoon positives and two multi-object controls, all already
seen development images, cannot establish open-world precision or unknown rejection.
The credit-disputed fifth image remains excluded. Timings exclude model loading
and photo preprocessing; they are not iPhone/Samsung, cold-start, energy or RAM
measurements. No real photos were used for fitting, tracing or calibration.

## Failures and repairs retained

1. Initial export made4FP32 references, exactly matching previous score baseline
   (maximum error0), then CoreMLTools9/NumPy2.5.5 failed casting a one-element
   constant. Original attempt/process/stdout/stderr and references are unchanged.
2. Isolated NumPy2.3.5 recovery v1 failed before tracing: incorrect nested vision
   constructor. Historical source/doc snapshots and hashes are preserved in
   failed-recovery-source/index.json. Recovery v2 fixes only this constructor.
3. Original FP16 and INT8 then executed all4photos each,0runtime failures but
   only3/4top1preserved (multiple-cups became cup). Worst cosines0.97424/0.87045;
   score errors0.01665/0.02187. These candidates remain FAILED, never overwritten.
4. Synthetic zero/ramp diagnostic: eager/traced vectors identical; FP32 CoreML
   cosine>0.99999999999. Reduced precision introduces error on these probes;
   keeping only linear/conv in FP16 still fails the second0.999synthetic gate
   (cosine0.99449). That mixed candidate receives0real-photo calls.
5. FP32-compute/original per-channel INT8 storage fails synthetic0.995gate
   (0.89630/0.93562), so receives0real-photo calls. No hidden retry.
6. A separately preregistered selective block32 repair passes synthetic probes
   (0.99997381/0.99996158), then executes its4photo calls, preserving4/4top1.
   Selection is engineering iteration on seen development data, not a new holdout.

This work unit totals **16real image calls**:4FP32 reference+8original converted+
4final block32. There are also22synthetic forwards (including4zero tracing calls)
and one15text-embedding batch. Frozen per-stage budgets and every failed artifact
are retained. Conversion/prediction processes run under inherited OS deny-network
policy. No application network request, API key, photo upload or paid model used.

## Validation and reproducibility

- Source/prompt/image/prototype/code/environment pins frozen before each stage;
  converted package pinned before final prediction. Exclusive stage outputs and
  directory creation refuse repeats. Independent review checks6historical locks,
  historical source mapping, raw score/vector joins, ranks, actual bytes and gates.
- Runtime: CoreMLTools9.0, private NumPy2.3.5 compatibility layer, Torch2.15.0,
  Transformers5.23.0. Torch2.15 is untested by CoreMLTools9 (latest tested2.7),
  warnings preserved; actual bounded parity does not certify all converter paths.
- Parsed final model contains72constexpr_blockwise_shift_scale operations and
  no Float16 compute casts. Xcode-beta coremlcompiler compiles the package
  successfully. CommandLineTools default lacks coremlcompiler; initial utility
  lookup/help failures are not signed-app-build failures or phone evidence.
- 19 new automated gate/evidence regressions and full1906tests(875Node+
  1031workspace)/allchecks/builds/18web routes pass,19existinglint warnings.
  Actual repeat refuses withEEXIST before Python dispatch; final lock/results
  hashes unchanged. Full validation receipts are recorded in TEST_EVIDENCE.md.
  No project dependency/lockfile changed; all model
  and conversion downloads/artifacts stay in ignored private work/.

Private run: work/siglip-mobile-20261116.yV442u/.
Recount (no inference):

```sh
node scripts/qa/siglip-mobile-review.mjs work/siglip-mobile-20261116.yV442u
```

The initial/compatibility/diagnostic/storage/block protocols in docs/research/
record the exact staged procedure. Historical attempts are not rerun instructions:
reuse requires new isolated registration, never overwrite or silently re-pin.

| Receipt | SHA-256 |
| --- | --- |
| Initial lock | 3f22e5d8729cb1367f87c916b4eab15aa7ebaa717f40639db1f482f7c40f6680 |
| Recovery v2 lock | 498aa2b367cba6828194e0a8167427c327cb699d24a7077c36d194fd6cea4300 |
| Final block lock | d2ace54bc4e2681184210793a2b11ce9424b8491b326e2305c175b704590a859 |
| Final results | b64bc3f64653c8d0a358221bc0fce96ce08f64e335ad56b670872b45af701141 |
| Final assessment | c39354cc73fd415a72a0cf2f94c5a3d1e3c3e322f6f054f3bc925a561832220b |
| Final artifact pin manifest | a86f677ad5200b8c7f389f36a6cc81dc847f172fb75897adc3aa283eff05dec6 |
| Final weight.bin | e0490bf502e85c813dd3f640bdfcd1419f3915a5daf882da869a8bfca4525ff5 |
| Independent recount | e9028ceed09df953c97486d6c635b864b165e555fefda28d3ced00e9eb9eb4b1 |

No privacy/licensing/material approval is inferred from numeric parity. Existing
source attribution and quality/release failures remain. Public release NO-GO.

Primary sources checked November16:
[Apple typed execution](https://apple.github.io/coremltools/docs-guides/source/typed-execution.html),
[Apple weight quantization](https://apple.github.io/coremltools/docs-guides/source/opt-quantization-overview.html).
Installed version-pinned configuration/pass source establishes the specific
block32/iOS18 behavior; generated online API reference currently describes8.1.
