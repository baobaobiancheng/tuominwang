# coding: utf-8
import concurrent.futures,urllib.request,urllib.error,json,time,hashlib,csv,os
from pathlib import Path
p=Path('.data/evals/openimages-face');p.mkdir(parents=True,exist_ok=True);(p/'images').mkdir(exist_ok=True)
sources={
 'validation-annotations-bbox.csv':'https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv',
 'validation-annotations-human-imagelabels-boxable.csv':'https://storage.googleapis.com/openimages/v5/validation-annotations-human-imagelabels-boxable.csv',
 'validation-images-with-rotation.csv':'https://storage.googleapis.com/openimages/2018_04/validation/validation-images-with-rotation.csv',
 'class-descriptions.csv':'https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions-boxable.csv',
 'official-description.html':'https://storage.googleapis.com/openimages/web/factsfigures_v7.html',
 'official-download.html':'https://storage.googleapis.com/openimages/web/download_v7.html',
 'official-rotation.html':'https://storage.googleapis.com/openimages/web/2018-05-17-rotation-information.html',
 'official-downloader.py':'https://raw.githubusercontent.com/openimages/dataset/master/downloader.py',
 'official-mirror-README.md':'https://raw.githubusercontent.com/cvdfoundation/open-images-dataset/master/README.md',
}
for name,url in sources.items():
 if not (p/name).exists():
  with urllib.request.urlopen(url,timeout=120) as response:(p/name).write_bytes(response.read())
classes=dict(csv.reader(open(p/'class-descriptions.csv')))
assert classes.get('/m/0dzct')=='Human face'
boxes=[r for r in csv.DictReader(open(p/'validation-annotations-bbox.csv')) if r['LabelName']=='/m/0dzct']
labels=[r for r in csv.DictReader(open(p/'validation-annotations-human-imagelabels-boxable.csv')) if r['LabelName']=='/m/0dzct']
ids=set(r['ImageID'] for r in boxes)|set(r['ImageID'] for r in labels)
metadata={r['ImageID']:r for r in csv.DictReader(open(p/'validation-images-with-rotation.csv')) if r['ImageID'] in ids}
assert len(ids)==len(metadata)==5749 and len(boxes)==5594 and len(labels)==5749
data={'label':'/m/0dzct','boxes':boxes,'labels':labels,'images':metadata};(p/'selected-metadata.json').write_text(json.dumps(data,indent=2))
(p/'official-source-manifest.json').write_text(json.dumps([{'path':name,'url':url,'sha256':hashlib.sha256((p/name).read_bytes()).hexdigest()} for name,url in sources.items()],indent=2))
rows=[]
def get(item):
 imageid,meta=item; path=p/'images'/f'{imageid}.jpg'; url=f'https://open-images-dataset.s3.amazonaws.com/validation/{imageid}.jpg'
 assert meta['License']=='https://creativecommons.org/licenses/by/2.0/'
 for attempt in range(4):
  try:
   if not path.exists():
    with urllib.request.urlopen(url,timeout=60) as r: b=r.read()
    if not b.startswith(b'\xff\xd8'): raise ValueError('NOT_JPEG')
    path.with_suffix('.part').write_bytes(b);path.with_suffix('.part').replace(path)
   b=path.read_bytes()
   return {'imageId':imageid,'download':url,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'attribution':meta,'status':'downloaded'}
  except Exception as e:
   if attempt==3:return {'imageId':imageid,'download':url,'attribution':meta,'status':'failed','error':type(e).__name__+':'+str(e)}
   time.sleep(max(float(e.headers.get('Retry-After','0')) if isinstance(e,urllib.error.HTTPError) and str(e.headers.get('Retry-After','0')).isdigit() else 0,2**attempt))
with concurrent.futures.ThreadPoolExecutor(max_workers=int(os.environ.get('OPENIMAGES_DOWNLOAD_WORKERS','16'))) as pool:
 futures=[pool.submit(get,item) for item in sorted(data['images'].items())]
 for future in concurrent.futures.as_completed(futures):
  row=future.result()
  rows.append(row)
  if len(rows)%100==0:
   print(json.dumps({'completed':len(rows),'total':len(data['images']),'errors':sum(r['status']=='failed' for r in rows)}),flush=True)
   (p/'download-checkpoint.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
(p/'download-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2));print(json.dumps({'complete':len(rows),'failed':sum(r['status']=='failed' for r in rows)}),flush=True)
