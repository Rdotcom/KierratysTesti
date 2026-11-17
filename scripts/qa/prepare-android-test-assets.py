"""Public frozen JPEG fixtures and synthetic marking/barcode: test APK only."""
import hashlib,json,pathlib,sys
root=pathlib.Path.cwd().resolve();run=(root/sys.argv[1]).resolve()
assert run.is_dir() and run.is_relative_to(root/"work")
import numpy as np,torch
from PIL import Image,ImageDraw,ImageFont,ImageOps
from transformers import AutoConfig,SiglipVisionModel
from safetensors.torch import load_file
torch.set_num_threads(2);torch.set_num_interop_threads(1);torch.set_grad_enabled(False)
torch.backends.mha.set_fastpath_enabled(False)
parent=root/"work/siglip-mobile-20261116.yV442u"
lock=json.loads((parent/"lock.json").read_bytes())
config=AutoConfig.from_pretrained(str(root/lock["modelDirectory"]),local_files_only=True,trust_remote_code=False).vision_config
config._attn_implementation="eager";model=SiglipVisionModel(config).eval();model.load_state_dict(load_file(str(parent/"vision-fp32.safetensors")),strict=True)
vectors=np.asarray(json.loads((parent/"text-prototypes.json").read_bytes())["vectors"],dtype=np.float64)
out=root/"mobile/app/modules/local-vision/android/src/androidTest/assets/parity"
out.mkdir(parents=True,exist_ok=True)
rows=[]
for i in range(1,5):
    source=root/f"work/siglip-camera-device-v2-20261116.wG9VmT/assets/commons-{i}-clean.jpg"
    encoded=source.read_bytes();target=out/source.name
    if target.exists():assert target.read_bytes()==encoded
    else:target.write_bytes(encoded)
    image=ImageOps.exif_transpose(Image.open(source)).convert("RGB")
    rgb=np.asarray(image.resize((224,224),Image.Resampling.BILINEAR))
    tensor=((rgb.astype(np.float64)/255).astype(np.float32)-np.float32(.5))/np.float32(.5)
    pixels=np.transpose(tensor,(2,0,1))[None].copy()
    with torch.inference_mode():v=model(pixel_values=torch.from_numpy(pixels),return_dict=False)[1].numpy().astype(np.float64).reshape(-1)
    v/=np.linalg.norm(v);scores=vectors@v
    info=json.loads((root/f"work/object-clean-20261116.oaxGJU/dataset/commons-{i}-source.json").read_bytes())
    page=next(iter(info["query"]["pages"].values()));metadata=page["imageinfo"][0]["extmetadata"]
    import re
    rows.append({"id":f"commons-{i}-clean","file":target.name,"sha256":hashlib.sha256(encoded).hexdigest(),"scores":scores.tolist(),"top1":lock["classes"][int(np.argmax(scores))],"title":page["title"],"sourceUrl":page["imageinfo"][0]["descriptionurl"],"artist":re.sub(r"<[^>]+>","",metadata["Artist"]["value"]),"licence":metadata["LicenseShortName"]["value"],"licenceUrl":metadata["LicenseUrl"]["value"].replace("http:","https:"),"changes":"Metadata removed/canonicalized and JPEG-reencoded during previous documented development preparation; not a new test split."})
# Synthetic evidence, never a real object/product photograph or shipped product row.
mark=Image.new("RGB",(900,500),"white");draw=ImageDraw.Draw(mark)
font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf",120)
draw.text((80,150),"PAP 21",font=font,fill="black");mark.save(out/"synthetic-pap21.jpg",quality=95)
left=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"]
odd=["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"]
right=["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"]
patterns=["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"]
code="6408430030309";bits="101"+"".join((left if p=="L" else odd)[int(d)]for p,d in zip(patterns[int(code[0])],code[1:7]))+"01010"+"".join(right[int(d)]for d in code[7:])+"101"
barcode=Image.new("RGB",(1000,600),"white");draw=ImageDraw.Draw(barcode)
for j,bit in enumerate(bits):
    if bit=="1":draw.rectangle((100+j*8,100,100+j*8+7,450),fill="black")
barcode.save(out/"synthetic-gtin.jpg",quality=95)
(out/"expected.json").write_text(json.dumps({"schema":"android-actual-jpeg-parity-v1","classes":lock["classes"],"rows":rows,"maximumScoreError":0.005,"syntheticMarking":"PAP 21","syntheticGtin":code},indent=2))
print(json.dumps({"jpegFixtures":4,"syntheticFixtures":2,"classes":15,"testOnly":True}))
