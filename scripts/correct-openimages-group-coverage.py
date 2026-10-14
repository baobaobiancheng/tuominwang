"""Derive group coverage from frozen inference; never changes TP/FP/FN or predictions."""
import json,hashlib
from pathlib import Path
p=Path('.data/evals/openimages-face');source=p/'all-image-results.jsonl';rows=[json.loads(s) for s in source.read_text().splitlines() if s]
assert len(rows)==5749 and all(r['status'] in ['evaluated','failed'] for r in rows)
selected=json.loads((p/'selected-metadata.json').read_text());details=json.loads((p/'input-rejection-details.json').read_text()) if (p/'input-rejection-details.json').exists() else {}
def rejected_detail(image_id):
 # Read JPEG SOF metadata without decoding the oversized input or relaxing production guards.
 data=(p/'images'/(image_id+'.jpg')).read_bytes();assert data[:2]==b'\xff\xd8';offset=2
 while offset<len(data):
  assert data[offset]==255;offset+=1
  while data[offset]==255:offset+=1
  marker=data[offset];offset+=1
  if marker in [1,216,217] or 208<=marker<=215:continue
  size=int.from_bytes(data[offset:offset+2],'big');assert size>=2 and offset+size<=len(data)
  if marker in [192,193,194,195,197,198,199,201,202,203,205,206,207]:
   height=int.from_bytes(data[offset+3:offset+5],'big');width=int.from_bytes(data[offset+5:offset+7],'big');assert width and height
   label=next(r['Confidence'] for r in selected['labels'] if r['ImageID']==image_id)
   return dict(imageHash=hashlib.sha256(data).hexdigest(),bytes=len(data),width=width,height=height,verifiedLabel=label,rotationMetadata=selected['images'][image_id]['Rotation'])
  if marker==218:break
  offset+=size
 raise ValueError('FAILED_IMAGE_DIMENSIONS_NOT_FOUND:'+image_id)
def intersection(a,b):
 return max(0,min(a['x']+a['width'],b['x']+b['width'])-max(a['x'],b['x']))*max(0,min(a['y']+a['height'],b['y']+b['height'])-max(a['y'],b['y']))
def box(b,r):
 return dict(x=float(b['XMin'])*r['width'],y=float(b['YMin'])*r['height'],width=(float(b['XMax'])-float(b['XMin']))*r['width'],height=(float(b['YMax'])-float(b['YMin']))*r['height'])
changes=[]
for row in rows:
 if row['status']=='failed':
  detail=details.get(row['imageId']) or rejected_detail(row['imageId']);row.update(detail);row['groundTruth']=[r for r in selected['boxes'] if r['ImageID']==row['imageId']];assert not row['groundTruth'];row['predictions']=None;row['metrics']=None;continue
 gold=[box(b,row) for b in row['groundTruth'] if b['IsGroupOf']=='0'];groups=[box(b,row) for b in row['groundTruth'] if b['IsGroupOf']=='1']
 for threshold in [.25,.5,.75]:
  t=str(threshold);matched=set();covered=set();tp=fp=ignored=0
  for pred in sorted(row['predictions'],key=lambda b:-b['score']):
   best=-1;best_iou=threshold
   for i,g in enumerate(gold):
    if i in matched:continue
    area=intersection(pred,g);iou=area/(pred['width']*pred['height']+g['width']*g['height']-area or 1)
    if iou>=best_iou:best=i;best_iou=iou
   if best>=0:matched.add(best);tp+=1;continue
   qualifying={i for i,g in enumerate(groups) if intersection(pred,g)/(pred['width']*pred['height'] or 1)>=.5}
   if qualifying:covered.update(qualifying);ignored+=1
   else:fp+=1
  metrics=row['metrics'][t];assert (tp,fp,len(gold)-tp,ignored)==tuple(metrics[k] for k in ['tp','fp','fn','ignoredGroupPredictions'])
  old=metrics['groupBoxesCovered'];metrics['rawFirstAssignedGroupBoxesCovered']=old;metrics['groupBoxesCovered']=len(covered)
  if old!=len(covered):changes.append(dict(imageId=row['imageId'],threshold=threshold,oldFirstAssigned=old,correctedCovered=len(covered)))
output=p/'all-image-results-group-corrected.jsonl';output.write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows))
sha=lambda b:hashlib.sha256(b).hexdigest()
manifest={'scope':'Auxiliary groupBoxesCovered only; all predictions, gold and TP/FP/FN/ignoredGroupPredictions exactly unchanged','definition':'Union of every GroupOf box whose intersection/predictionArea >=.5 for a prediction not matched to individual gold at that IoU threshold. Overlapping groups each counted once.','rawInference':str(source),'rawInferenceSha256':sha(source.read_bytes()),'derivedResults':str(output),'derivedResultsSha256':sha(output.read_bytes()),'deriverCode':'scripts/correct-openimages-group-coverage.py','deriverSha256':sha(Path(__file__).read_bytes()),'changedRows':changes,'all5749RowsPreserved':True,'allNonCoverageCountersUnchanged':True}
(p/'group-coverage-correction.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'images':len(rows),'changedMetricRows':len(changes),'changedImageIds':len(set(r['imageId'] for r in changes))}))
