# DINOv2 comparison choice and outcome

Access date:2026-11-15. Follows the master task and actual native integration;
no repeated source acquisition or prior failed inference experiment.

Primary sources:

- [Official facebook/dinov2-small repository](https://huggingface.co/facebook/dinov2-small):
  feature-extraction model, Apache2metadata. Card is by HuggingFace, not original
  authors. Pin revisioned safetensors, not moving main/pickle.
- [Transformers DINOv2 documentation](https://huggingface.co/docs/transformers/model_doc/dinov2):
  CLS is a global descriptor, not SKUclassifier. Explicit224crop follows downloaded
  processor configuration; no unmeasured bitwise processor/CoreML parity claim.
- [Original DINOv2 licence](https://github.com/facebookresearch/dinov2/blob/main/LICENSE):
  retain Apache2text. No XRay/Cell/noncommercial variant substituted. OFF image/
  descriptor attribution remains separate from model provenance.

Decision: compare actual CPUfloat32 CLS/current MobileCLIP with same10references/
58queries before mobile conversion. No fine-tuning/training/API, app dependency
or inference download. Isolated wheel/model hashes locked, inference OSoffline.

Outcome:14/17top1versus11/17, but one prior400gNutella agreement lost; preregistered
no-regression gate fails.68encodes complete. Remaining wrong-source ranks confuse
400g/750g. Cached OCR resolves one; another has no observed size. Implement guided
variant recovery next, not automatic size inference/immediate model swap. See
DINOV2_COMPARISON_PROTOCOL.md and DINOV2_COMPARISON_RESULTS.md for frozen evidence.
