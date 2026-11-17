"""Weight-only alternative: preserve FP32 activations; do not relax parity gates."""
import hashlib,json,pathlib,sys,time
root=pathlib.Path.cwd().resolve();run=(root/sys.argv[1]).resolve()
assert run.is_dir() and run.is_relative_to(root/"work")
sys.path.insert(0,str(run/"conversion-deps"))
import numpy as np,onnx,onnxruntime as ort
from onnx import numpy_helper,helper
parent=root/"work/siglip-mobile-20261116.yV442u"
lock=json.loads((parent/"lock.json").read_bytes());baseline=json.loads((parent/"baseline.json").read_bytes())
vectors=np.asarray(json.loads((parent/"text-prototypes.json").read_bytes())["vectors"],dtype=np.float64)
options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
def evaluate(file):
    session=ort.InferenceSession(str(file),options,providers=["CPUExecutionProvider"]);rows=[]
    for row in lock["rows"]:
        start=time.perf_counter();x=np.load(parent/(row["id"]+"-input.npy"),allow_pickle=False)
        v=session.run(["embedding"],{"pixel_values":x})[0].astype(np.float64).reshape(-1)
        assert v.shape==(768,) and np.isfinite(v).all() and np.linalg.norm(v)>0
        v/=np.linalg.norm(v);scores=vectors@v;expected=next(b for b in baseline if b["id"]==row["id"])
        rows.append({"id":row["id"],"top1":lock["classes"][int(np.argmax(scores))],"expectedTop1":expected["top1"],"maxScoreError":float(np.max(np.abs(scores-np.asarray(expected["scores"])))),"durationMs":round((time.perf_counter()-start)*1000),"scores":scores.tolist()})
    return rows
fp=run/"vision-fp32.onnx";out=run/"vision-weight-only-int8.onnx";assert not out.exists()
fp_rows=evaluate(fp)
assert all(r["top1"]==r["expectedTop1"] and r["maxScoreError"]<=0.0001 for r in fp_rows),"float_export_drift"
graph=onnx.load(str(fp));initializers=[];dequant=[];count=0
for tensor in graph.graph.initializer:
    a=numpy_helper.to_array(tensor)
    if a.dtype==np.float32 and a.ndim==2 and a.size>=65536:
        axis=1;scale=np.maximum(np.max(np.abs(a),axis=0)/127,np.finfo(np.float32).tiny).astype(np.float32)
        q=np.clip(np.rint(a/scale.reshape(1,-1)),-127,127).astype(np.int8)
        initializers.extend([numpy_helper.from_array(q,tensor.name+"_q"),numpy_helper.from_array(scale,tensor.name+"_scale"),numpy_helper.from_array(np.zeros(a.shape[1],dtype=np.int8),tensor.name+"_zero")])
        dequant.append(helper.make_node("DequantizeLinear",[tensor.name+"_q",tensor.name+"_scale",tensor.name+"_zero"],[tensor.name],axis=axis));count+=1
    else:initializers.append(tensor)
assert count>40
nodes=list(graph.graph.node);del graph.graph.node[:];graph.graph.node.extend(dequant+nodes)
del graph.graph.initializer[:];graph.graph.initializer.extend(initializers)
onnx.checker.check_model(graph);onnx.save(graph,str(out))
rows=evaluate(out)
receipt={"schema":"android-siglip-weight-only-v1","quantizedMatrices":count,"sourceRevision":"75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2","onnxruntimeVersion":ort.__version__,"modelSha256":hashlib.sha256(out.read_bytes()).hexdigest(),"modelBytes":out.stat().st_size,"floatRows":fp_rows,"rows":rows,"passes":all(r["top1"]==r["expectedTop1"] and r["maxScoreError"]<=0.005 for r in rows)}
(run/"weight-only-receipt.json").write_text(json.dumps(receipt,indent=2));assert receipt["passes"],"weight_only_gate_failed_no_promotion"
print(json.dumps({k:v for k,v in receipt.items() if k not in ["rows","floatRows"]}))
