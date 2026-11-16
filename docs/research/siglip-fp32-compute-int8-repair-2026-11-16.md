# FP32 compute with INT8 storage — registered engineering repair

November16, after frozen synthetic precision diagnostic: tracing is exact on both
inputs, FP32 CoreML cosine>0.99999999999, old FP16 only0.99469/0.98183. Mixed
linear/conv-FP16 fails second synthetic0.99449, so do NOT run photos with it.
This localizes observed error to reduced compute precision on these probes,
not to text prototypes, photo decoding, tracing or a rank threshold.

One new candidate ONLY: compress saved diagnostic FP32 CoreML with the ORIGINAL
symmetric per-channel INT8/512threshold weight policy. Keep FP32 activation/
accumulation compute; weight storage compression is not INT8 compute. iOS17target
unchanged. No new trace, text embedding, calibration, training or photo reference.
Freeze inherited diagnostic source/environment/input/package/results hashes.

Budget: first2synthetic zero/ramp predictions, compare FP32 diagnostic outputs
against original eager references reconstructed from the diagnostic FP32 model.
Synthetic reference is the same saved diagnostic FP32 package (2predictions).
If both compressed/reference cosines>=0.995, freeze output package before exactly
four real cached-input predictions. Otherwise stop; no image calls/retry/search.

Keep original INT8 gate:4/4successful+same top1, cosine>=0.995,maxclass-score error
<=0.005, resources plus prototype JSON<=150MiB. FP32original parent agreement
<=0.00001 unchanged. Original FP16/INT8failed results remain separate. New result
is seen-development engineering evidence, not a fresh holdout, accuracy claim,
physical-phone measurement or release permission. Do not change installed model,
barcode scanner, Android implementation or app behavior. OS deny-network.
