"""Offline export of the already-pinned Google vision encoder, not model training."""
import hashlib,json,pathlib,sys,time
root=pathlib.Path.cwd().resolve()
run=(root/sys.argv[1]).resolve()
assert run.is_dir() and run.is_relative_to(root/"work")
sys.path.insert(0,str(run/"conversion-deps"))
import numpy as np
import torch,onnx,onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic,QuantType
from transformers import AutoConfig,SiglipVisionModel
from safetensors.torch import load_file
torch.set_num_threads(2);torch.set_num_interop_threads(1);torch.set_grad_enabled(False)
torch.backends.mha.set_fastpath_enabled(False)
parent=root/"work/siglip-mobile-20261116.yV442u"
lock=json.loads((parent/"lock.json").read_bytes())
weights=parent/"vision-fp32.safetensors"
weight_hash=hashlib.sha256(weights.read_bytes()).hexdigest()
config=AutoConfig.from_pretrained(str(root/lock["modelDirectory"]),local_files_only=True,trust_remote_code=False).vision_config
config._attn_implementation="eager"
vision=SiglipVisionModel(config).eval();vision.load_state_dict(load_file(str(weights)),strict=True)
class Encoder(torch.nn.Module):
    def __init__(self,m):super().__init__();self.encoder=m
    def forward(self,pixels):return self.encoder(pixel_values=pixels,return_dict=False)[1]
model=Encoder(vision).eval()
fp=run/"vision-fp32.onnx";quant=run/"vision-int8.onnx"
assert not fp.exists() and not quant.exists()
torch.onnx.export(model,(torch.zeros(1,3,224,224),),str(fp),opset_version=17,input_names=["pixel_values"],output_names=["embedding"],dynamo=False,external_data=False)
onnx.checker.check_model(str(fp))
quantize_dynamic(str(fp),str(quant),weight_type=QuantType.QInt8,per_channel=True,op_types_to_quantize=["MatMul","Gemm"])
onnx.checker.check_model(str(quant))
options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
session=ort.InferenceSession(str(quant),options,providers=["CPUExecutionProvider"])
protos=json.loads((parent/"text-prototypes.json").read_bytes())
vectors=np.asarray(protos["vectors"],dtype=np.float64)
baseline=json.loads((parent/"baseline.json").read_bytes())
rows=[]
for row in lock["rows"]:
    start=time.perf_counter();x=np.load(parent/(row["id"]+"-input.npy"),allow_pickle=False)
    v=session.run(["embedding"],{"pixel_values":x})[0].astype(np.float64).reshape(-1)
    assert v.shape==(768,) and np.isfinite(v).all() and np.linalg.norm(v)>0
    v/=np.linalg.norm(v);scores=vectors@v
    expected=next(b for b in baseline if b["id"]==row["id"])
    rows.append({"id":row["id"],"top1":lock["classes"][int(np.argmax(scores))],"expectedTop1":expected["top1"],"maxScoreError":float(np.max(np.abs(scores-np.asarray(expected["scores"])))),"durationMs":round((time.perf_counter()-start)*1000),"scores":scores.tolist()})
receipt={"schema":"android-siglip-export-v1","sourceRevision":"75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2","sourceWeightsSha256":weight_hash,"onnxVersion":onnx.__version__,"onnxruntimeVersion":ort.__version__,"modelSha256":hashlib.sha256(quant.read_bytes()).hexdigest(),"modelBytes":quant.stat().st_size,"rows":rows,"passes":all(r["top1"]==r["expectedTop1"] and r["maxScoreError"]<=0.005 for r in rows)}
(run/"export-receipt.json").write_text(json.dumps(receipt,indent=2))
assert receipt["passes"],"android_conversion_gate_failed_no_promotion"
print(json.dumps({k:v for k,v in receipt.items() if k!="rows"}))
