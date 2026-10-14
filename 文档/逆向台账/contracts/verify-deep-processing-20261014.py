#!/usr/bin/env python3
"""Read-only evidence checks, not semantic proof or licensed execution."""
from pathlib import Path
import hashlib,json
here=Path(__file__).resolve().parent;root=here.parents[2]
doc=json.loads((here/'deep-processing-20261014.json').read_text()); errors=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
PROCESSING_IDS="""IPC-5a998529649c IPC-88cd1d915682 IPC-fd1ca8c6cb27 IPC-e8dcb4d0e8b3 IPC-7d7d2d58da91 IPC-42a70f50df5f IPC-85f474cad97a IPC-8c5afeb517e6 IPC-9a8232e44fb9 IPC-a09f09579955 IPC-7b3e67a5a715 IPC-3211d99d0f20 IPC-58567733591e IPC-e4cf3e6c3c0a IPC-c1cec3199992 IPC-27dd16394cd6 IPC-8fc7e5c07051 IPC-a07c3fdcbe45 IPC-f071ce7c965b IPC-81f79eee361a IPC-8f1caa190dda IPC-d9b14aa97589 IPC-3bea45842355 IPC-f1f713df2b98 IPC-629ace0aecd1 IPC-9577d3a9d6d0 IPC-e29b03465bc3 IPC-95d4f752bfb1 IPC-523337153cab IPC-102f9010076c IPC-7f07e8bd74ee IPC-d7d18b241f88 IPC-0ea3b09c375b IPC-96ccc7c0ce76 IPC-e84cabdffc27 IPC-a982d6d137ce IPC-47ecc7525dfe IPC-d3864dc80560 IPC-5569a4344615 IPC-0ecb1de9c806 IPC-f02ad1fa2413 IPC-4dd20e80cae3 IPC-ba07bb14e3df IPC-910347ed48b5""".split()
actual_ids=[x["id"] for x in doc["interfaces"]]
if len(actual_ids)!=44 or set(actual_ids)!=set(PROCESSING_IDS):errors.append("fixed 44 interface set mismatch")
if doc["scopeIds"]!=sorted(PROCESSING_IDS):errors.append("fixed scope mismatch")
for row in doc["interfaces"]:
 for sid in row["sectionIds"]:
  if sid not in {c["id"] for c in doc["contracts"]}:errors.append(row["id"]+": unknown section "+sid)
 for key in row["newEvidenceIds"]:
  if key not in doc["evidence"]:errors.append(row["id"]+": unknown new evidence "+key)

for k,e in doc['evidence'].items():
 try:
  data=(root/e['path']).read_bytes();lines=data.splitlines(keepends=True)
  if not 1<=e['startLine']<=e['endLine']<=len(lines):errors.append(k+': invalid range')
  if sha(data)!=e['fileSha256']:errors.append(k+': file hash drift')
  if sha(b''.join(lines[e['startLine']-1:e['endLine']]))!=e['sliceSha256']:errors.append(k+': slice hash drift')
 except OSError as ex:errors.append(k+': '+str(ex))
for c in doc['contracts']:
 for k in c['evidence']:
  if k not in doc['evidence']:errors.append(c['id']+': unknown evidence '+k)
 if not c['closedBoundary'] or not c['remainingUnknown']:errors.append(c['id']+': missing boundary')
for f in doc['findings']:
 for k in f['evidence']:
  if k not in doc['evidence']:errors.append(f['id']+': unknown evidence '+k)
for field in ['raw','readable']:
 if sha((root/doc['transform'][field+'Path']).read_bytes())!=doc['transform'][field+'Sha256']:errors.append(field+': transform hash drift')
if doc['summary']['sections']!=len(doc['contracts']):errors.append('section count')
if doc['summary']['candidateS3']!=sum(bool(c['candidateS3']) for c in doc['contracts']):errors.append('candidate count')
if doc['summary']['evidenceRanges']!=len(doc['evidence']):errors.append('range count')
print(json.dumps({'ok':not errors,'errors':errors,'summary':doc['summary']},ensure_ascii=False,indent=2))
raise SystemExit(bool(errors))
