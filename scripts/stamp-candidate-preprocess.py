# Offline evaluation bridge: exact pinned Transformers/Pillow image processor.
# Length-delimited tensor protocol, no arbitrary code or network, public fixtures only.
import os,json,sys,struct,resource
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1';os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
from transformers import YolosImageProcessor
from PIL import Image
processor=YolosImageProcessor.from_pretrained('.data/evals/stamp-model/ooredoo-source',local_files_only=True)
for line in sys.stdin:
 try:
  path=json.loads(line)['path']
  with Image.open(path)as image:
   image=image.convert('RGB');width,height=image.size;pixels=processor(images=image,return_tensors='np')['pixel_values'];data=pixels.astype('<f4',copy=False).tobytes()
  info={'width':width,'height':height,'shape':list(pixels.shape),'bytes':len(data),'pythonMaxRSS':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
 except Exception as e:info={'error':str(e),'bytes':0};data=b''
 header=json.dumps(info).encode();sys.stdout.buffer.write(struct.pack('>I',len(header)));sys.stdout.buffer.write(header);sys.stdout.buffer.write(data);sys.stdout.buffer.flush()
