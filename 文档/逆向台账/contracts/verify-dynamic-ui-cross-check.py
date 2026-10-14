#!/usr/bin/env python3
"""Read-only cross-check of UI absence claims against independently enumerated dynamic calls."""
import json
from pathlib import Path
base = Path(__file__).resolve().parent
def read(name):
    return json.loads((base / name).read_text())
a = read('ui-closure-a.json')['interfaces']
b = read('ui-closure-b.json')['contracts']
dynamic = read('dynamic-closure.json')
assert len(a) == 58 and len(b) == 57
assert len({r['id'] for r in a+b}) == 115
absent = [r for r in a if r['entryResolution'] == 'no_renderer_reference'] + [r for r in b if r['uiLocated'] is False]
channels = {r['channel'] for r in dynamic['channels']}
contradictions = [{'id':r['id'], 'channel':r['channel']} for r in absent if r['channel'] in channels]
assert not contradictions, contradictions
print(json.dumps({'status':'passed','interfacesReviewed':len(a+b),'noPublishedRendererCaller':len(absent),'dynamicLiteralChannels':len(channels),'contradictions':contradictions},ensure_ascii=False))
