# coding:utf-8
import os,json,hashlib,pathlib,argparse
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1';os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
import torch,onnx
from transformers import YolosForObjectDetection
parser=argparse.ArgumentParser(description='Offline conversion of the pinned licensed signature weights; no remote code/download')
parser.add_argument('--source',default='.data/evals/public-visual/yolos-tiny-source');parser.add_argument('--output',default='.data/models/signature/model.onnx');args=parser.parse_args()
source=pathlib.Path(args.source);expected='fe95c5b4651a826f2ce3e4fb21e62445f943eac34950ba87abe5e9e3602b3897'
assert hashlib.sha256((source/'model.safetensors').read_bytes()).hexdigest()==expected
model=YolosForObjectDetection.from_pretrained(str(source),local_files_only=True,attn_implementation='eager').eval()
class Wrapper(torch.nn.Module):
 def __init__(self,m):super().__init__();self.model=m
 def forward(self,pixel_values):
  result=self.model(pixel_values=pixel_values,return_dict=True)
  return result.logits,result.pred_boxes
wrapper=Wrapper(model).eval();pixels=torch.zeros((1,3,640,640),dtype=torch.float32)
output=pathlib.Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
with torch.no_grad():
 torch.onnx.export(wrapper,(pixels,),str(output),input_names=['pixel_values'],output_names=['logits','pred_boxes'],opset_version=17,do_constant_folding=True,dynamo=False)
 model_onnx=onnx.load(str(output));onnx.checker.check_model(model_onnx,full_check=True)
 logits,boxes=wrapper(pixels)
 pathlib.Path('.data/evals/public-visual/yolos-zero-reference.json').write_text(json.dumps({'logits':logits.numpy().reshape(-1).tolist(),'pred_boxes':boxes.numpy().reshape(-1).tolist()}))
print(json.dumps({'torch':torch.__version__,'onnx':onnx.__version__,'weightsSHA256':expected,'onnxSHA256':hashlib.sha256(output.read_bytes()).hexdigest(),'onnxBytes':output.stat().st_size,'parameters':sum(p.numel()for p in model.parameters()),'fixedInput':[1,3,640,640],'outputs':{'logits':list(logits.shape),'pred_boxes':list(boxes.shape)}},indent=2))
