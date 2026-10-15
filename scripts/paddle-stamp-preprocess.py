# Research protocol for official OpenCV BICUBIC preprocessing, no remote IO.
import sys,json,struct,pathlib,resource
import cv2,numpy as np
root=pathlib.Path('.data/evals/public-stamps/images/test').resolve()
for line in sys.stdin:
 try:
  path=pathlib.Path(json.loads(line)['path']).resolve();assert path.parent==root
  image=cv2.imread(str(path));assert image is not None
  h,w=image.shape[:2];image=cv2.cvtColor(image,cv2.COLOR_BGR2RGB);image=cv2.resize(image,(480,480),interpolation=cv2.INTER_CUBIC).astype(np.float32)*(1/255);image=(image-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32);data=image.transpose(2,0,1).copy().tobytes();info={'width':w,'height':h,'shape':[1,3,480,480],'bytes':len(data),'pythonMaxRSS':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'opencv':cv2.__version__}
 except Exception as e:info={'error':type(e).__name__};data=b''
 header=json.dumps(info).encode();sys.stdout.buffer.write(struct.pack('>I',len(header)));sys.stdout.buffer.write(header);sys.stdout.buffer.write(data);sys.stdout.buffer.flush()
