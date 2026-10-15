# Research only: fixed official Paddle layout model, local tensors, no remote or product integration.
import os,json,pathlib,hashlib,resource,time,sys
os.environ['FLAGS_use_mkldnn']='0';os.environ['FLAGS_pir_apply_inplace_pass']='0'
import paddle,numpy as np,onnx
root=pathlib.Path('.data/evals/stamp-model/paddle-source');out=pathlib.Path('.data/evals/stamp-model/paddle-onnx');out.mkdir(exist_ok=True)
assert hashlib.sha256((root/'inference.pdiparams').read_bytes()).hexdigest()=='491c3382d84ca04d2033afbee0c105942ed82fea392bb4a19170646adebe088a'
model=out/'model.onnx';onnx.checker.check_model(onnx.load(str(model)),full_check=True)
config=paddle.inference.Config(str(root/'inference.json'),str(root/'inference.pdiparams'));config.disable_gpu();config.set_cpu_math_library_num_threads(2);config.disable_glog_info();config.switch_ir_optim(False)
predictor=paddle.inference.create_predictor(config);print('INPUTS',predictor.get_input_names(),'OUTPUTS',predictor.get_output_names(),flush=True)
inputs=json.loads((out/'parity-inputs.json').read_text());rows=[]
for row in inputs['inputs']:
 image=np.fromfile(out/row['name'],dtype=np.float32).reshape(1,3,480,480);scale=np.array([[480/row['height'],480/row['width']]],dtype=np.float32)
 for name in predictor.get_input_names():
  tensor=predictor.get_input_handle(name);value=image if name=='image'else scale if name=='scale_factor'else None
  assert value is not None,name;tensor.reshape(value.shape);tensor.copy_from_cpu(value)
 began=time.monotonic();predictor.run();outputs={}
 for name in predictor.get_output_names():
  a=predictor.get_output_handle(name).copy_to_cpu();outputs[name]={'shape':list(a.shape),'data':a.reshape(-1).tolist()}
 rows.append({**row,'scaleFactor':scale.reshape(-1).tolist(),'outputs':outputs,'elapsedMs':(time.monotonic()-began)*1000});print('DONE',row['name'],[(n,v['shape'])for n,v in outputs.items()],flush=True)
report={'model':'PaddlePaddle/PP-DocLayout-S','revision':'8ac289e66575bb9bba6e15c53719d8b15cc9b3b2','weightSHA256':hashlib.sha256((root/'inference.pdiparams').read_bytes()).hexdigest(),'onnxSHA256':hashlib.sha256(model.read_bytes()).hexdigest(),'onnxBytes':model.stat().st_size,'paddle':paddle.__version__,'onnx':onnx.__version__,'python':sys.version,'maxRSS':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'maxRSSUnit':'bytes on macOS,KiB Linux','preprocess':'Official RGB/OpenCV INTER_CUBIC480x480 distortion;scale1/255 ImageNet mean/std;scale_factor480/H,W','threshold':'Official config .5, graph NMS score .3/iou .5; unchanged before786 test','references':rows};(out/'parity-reference.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items()if k!='references'},indent=2))
