# Offline-only conversion of fixed Apache-2.0-declared public stamp weights.
import os,json,hashlib,pathlib,resource,sys
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1';os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
import torch,onnx
from transformers import YolosForObjectDetection,YolosImageProcessor
from PIL import Image
source=pathlib.Path('.data/evals/stamp-model/ooredoo-source');out=pathlib.Path('.data/evals/stamp-model/ooredoo-onnx');out.mkdir(parents=True,exist_ok=True)
expected='eb767096894faeeb7d71ec45590aaba5fcac29a06f52b9ef2924a827e7f08634'
assert hashlib.sha256((source/'model.safetensors').read_bytes()).hexdigest()==expected
model=YolosForObjectDetection.from_pretrained(str(source),local_files_only=True,attn_implementation='eager',use_safetensors=True).eval();processor=YolosImageProcessor.from_pretrained(str(source),local_files_only=True)
torch.set_num_threads(2)
class Wrapper(torch.nn.Module):
 def __init__(self,m):super().__init__();self.model=m
 def forward(self,pixel_values):
  result=self.model(pixel_values=pixel_values,return_dict=True);return result.logits,result.pred_boxes
wrapper=Wrapper(model).eval();pixels=torch.zeros((1,3,640,640),dtype=torch.float32);path=out/'model.onnx'
with torch.no_grad():
 torch.onnx.export(wrapper,(pixels,),str(path),input_names=['pixel_values'],output_names=['logits','pred_boxes'],dynamic_axes={'pixel_values':{2:'height',3:'width'}},opset_version=17,do_constant_folding=True,dynamo=False)
 onnx.checker.check_model(onnx.load(str(path)),full_check=True)
 references=[]
 for name,pixels in [('square640',torch.zeros((1,3,640,640))),('rect640x960',torch.rand((1,3,640,960),generator=torch.Generator().manual_seed(20261015)))]:
  logits,boxes=wrapper(pixels);data=pixels.numpy().tobytes();(out/(name+'.f32')).write_bytes(data);references.append({'name':name,'shape':list(pixels.shape),'inputSha256':hashlib.sha256(data).hexdigest(),'logits':logits.numpy().reshape(-1).tolist(),'pred_boxes':boxes.numpy().reshape(-1).tolist()})
 image=Image.open('.data/evals/public-stamps/images/test/stamp_detectation_marcos_000125.jpg').convert('RGB');pixels=processor(images=image,return_tensors='pt')['pixel_values'];logits,boxes=wrapper(pixels);data=pixels.numpy().tobytes();(out/'published-image.f32').write_bytes(data);references.append({'name':'published-image','shape':list(pixels.shape),'inputSha256':hashlib.sha256(data).hexdigest(),'logits':logits.numpy().reshape(-1).tolist(),'pred_boxes':boxes.numpy().reshape(-1).tolist()})
 (out/'parity-reference.json').write_text(json.dumps({'references':references}))
 result={'model':'Ooredoo-Group/ooredoo-stamp-detection','revision':'4576990c16edc1e67fe543768200e09cc3ee605e','weightSHA256':expected,'onnxSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'onnxBytes':path.stat().st_size,'input':'batch1,RGB normalized, dynamic H/W; official YolosImageProcessor aspect resize640 shortest960longest; no test tuning','parameters':sum(p.numel()for p in model.parameters()),'torch':torch.__version__,'transformers':__import__('transformers').__version__,'onnx':onnx.__version__,'python':sys.version,'maxRSS':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'maxRSSUnit':'bytes on macOS; KiB on Linux','preprocessing':json.loads((source/'preprocessor_config.json').read_text()),'license':'Model card Apache-2.0; base hustvl/yolos-small Apache-2.0; original training image grants/overlap unverified'}
 (out/'export.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
