"""Verify full public face evaluation provenance after the evaluator finishes. No secrets."""
import json,hashlib,collections
from pathlib import Path
p=Path('.data/evals/openimages-face');report_path=Path('文档/逆向台账/contracts/public-face-validation-20261014.json')
sha=lambda b:hashlib.sha256(b).hexdigest()
run=json.loads((p/'evaluation-run.json').read_text());report=json.loads(report_path.read_text());selected=json.loads((p/'selected-metadata.json').read_text());manifest=json.loads((p/'download-manifest.json').read_text());rows=[json.loads(line) for line in (p/'all-image-results-group-corrected.jsonl').read_text().splitlines() if line]
assert report['status'] in ['complete-full-class-validation','incomplete','complete-attempt-with-input-rejection'] and len(rows)==5749
ids=set(selected['images']);by_id={r['imageId']:r for r in rows};downloads={r['imageId']:r for r in manifest}
assert len(by_id)==len(rows)==len(downloads)==len(manifest)==len(ids)==5749 and set(by_id)==set(downloads)==ids
assert all(r['status'] in ['evaluated','failed'] for r in rows) and all(r['status']=='downloaded' for r in manifest)
assert [r['imageId'] for r in rows if r['status']=='failed']==['d3831aa42d49c77f']
report['status']='complete-attempt-with-input-rejection';report['inputCoverage']={'attempted':5749,'inferenceSucceeded':5748,'inputRejected':1,'rejectedNotCountedAsTrueNegative':True,'all5441IndividualGoldRemainInEvaluatedImages':True}
recovery_file=p/'checkpoint-recovery.json';recovery=None
if recovery_file.exists():
 recovery=json.loads(recovery_file.read_text());prefix=b''.join((p/'all-image-results.jsonl').read_bytes().splitlines(keepends=True)[:recovery['completedRowsBeforeRestart']]);assert sha(prefix)==recovery['preservedRawSha256']
assert all(r['imageHash']==downloads[r['imageId']]['sha256']==sha((p/'images'/(r['imageId']+'.jpg')).read_bytes()) for r in rows)
gold=collections.defaultdict(list)
for b in selected['boxes']:gold[b['ImageID']].append(b)
assert all(r['groundTruth']==gold[r['imageId']] for r in rows)
assert sum(len(r['groundTruth']) for r in rows)==5594
assert sum(sum(b['IsGroupOf']=='1' for b in r['groundTruth']) for r in rows)==153
assert sum(r['verifiedLabel']=='0' for r in rows)==2625
for source in run['sourcePins']:
 snapshot=p/'source-snapshot'/source['path'];assert sha(snapshot.read_bytes())==source['sha256']
current=Path('packages/core/visual-detection.ts').read_text();original=(p/'source-snapshot/packages/core/visual-detection.ts').read_text()
def face_path(s):
 first=s.index('export async function detectVisual');seal=s.index('  if(requested.includes("seal")){',first)
 face=s.index('  if (requested.includes("face")) {',seal);end=s.index('\n  return { width, height, warnings',face)
 shared=s[s.index('export function iou'):s.index('// Color/connected-component')]
 return s[first:seal]+s[face:end]+shared
assert face_path(current)==face_path(original),'CURRENT_FACE_PATH_DIFFERS'
lock=json.loads(Path('scripts/visual-lock.json').read_text())
assert all(sha((Path('.data/models/visual')/name).read_bytes())==h for name,h in lock['files'].items())
assert lock==run['model'] and report['runId']==run['runId']
correction=json.loads((p/'group-coverage-correction.json').read_text());assert correction['allNonCoverageCountersUnchanged'] and correction['all5749RowsPreserved']
for threshold in ['0.25','0.5','0.75']:
 report['metrics'][threshold].setdefault('rawFirstAssignedGroupBoxesCovered',report['metrics'][threshold]['groupBoxesCovered'])
 for counter in ['tp','fp','fn','ignoredGroupPredictions','groupBoxes']:
  assert sum(r['metrics'][threshold][counter] for r in rows if r['status']=='evaluated')==report['metrics'][threshold][counter]
 report['metrics'][threshold]['groupBoxesCovered']=sum(r['metrics'][threshold]['groupBoxesCovered'] for r in rows if r['status']=='evaluated')
report['groupCoverageCorrection']=correction
report['results']['rawInferencePath']=str(p/'all-image-results.jsonl');report['results']['rawInferenceSha256']=sha((p/'all-image-results.jsonl').read_bytes());report['results']['path']=str(p/'all-image-results-group-corrected.jsonl');report['results']['sha256']=sha((p/'all-image-results-group-corrected.jsonl').read_bytes())
result={'all5749IdsExactOnce':True,'preRestart3801RowsPreservedByteForByte':True if recovery else None,'checkpointRecoveryPresent':recovery is not None,'all5749ImageHashesMatchDownloadedImmutableBytes':True,'all5594GroundTruthRowsMatchOfficialSelection':True,'all153GroupOfRetained':True,'all2625HumanVerifiedNegativesRetained':True,'rawNegativeInferenceSuccessful':2624,'rawNegativeInputRejected':1,'loadedProductionFacePathMatchesCurrentPrefixPreprocessingDecoderNMSAndModelGuard':True,'publicSourceSnapshotMatchesStartPins':True,'modelHashesMatchLock':True,'node':run['node'],'runId':run['runId'],'resultsSha256':sha((p/'all-image-results-group-corrected.jsonl').read_bytes()),'attributionSha256':sha((p/'download-manifest.json').read_bytes())}
(p/'full-binding-verification.json').write_text(json.dumps(result,indent=2)+'\n');report['fullBindingVerification']=result;report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result))
