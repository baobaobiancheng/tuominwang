#!/usr/bin/env python3
"""Validate existing manual observations, not the truth/completeness of prose.

Default/--check never writes. --generate writes reports only after all checks and
in-memory negative probes pass. No vendor source is imported or executed.
"""
import argparse
import copy
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path('文档/逆向台账/contracts')
RESEARCH = Path('.data/research/lawbot-2026-10-13')
INPUTS = {
    'workflow': HERE / 'manual-workflow-contracts.json',
    'collaboration': HERE / 'manual-collaboration-contracts.json',
    'system': HERE / 'manual-system-contracts.json',
}
COVERAGE = HERE / 'manual-coverage.json'
RECOMMENDATIONS = RESEARCH / 'manual-ledger-recommendations.json'
COUNTS = {'workflow': 63, 'collaboration': 101, 'system': 53}
UI_SOURCES = {str(RESEARCH / 'readable/renderer.js'), str(RESEARCH / 'extracted/dist/renderer/assets/BMcdb0OZ.js')}
sha = lambda data: hashlib.sha256(data).hexdigest()

def require(condition, message):
    if not condition:
        raise ValueError(message)

def read(relative):
    path = ROOT / relative
    require(path.resolve().is_relative_to(ROOT), f'outside workspace: {relative}')
    return path.read_bytes()

def load(relative):
    return json.loads(read(relative))

def rows(kind, document):
    return document['interfaces' if kind == 'collaboration' else 'contracts']

class EvidenceVerifier:
    def __init__(self):
        self.files = {}
        self.ranges = set()
        self.utf16 = {}
        self.lines = {}

    def data(self, path):
        require(isinstance(path, str) and path, 'evidence path must be a nonempty string')
        require((ROOT / path).is_file(), f'evidence file missing: {path}')
        if path not in self.files:
            self.files[path] = read(path)
        return self.files[path]

    def require_range(self, obj):
        require(isinstance(obj, dict), 'evidence range must be an object')
        require(isinstance(obj.get('path'), str) and obj['path'], 'evidence range missing path')
        hashes = [obj[k] for k in ['sliceSha256', 'slice_sha256'] if k in obj]
        require(len(hashes) == 1 and isinstance(hashes[0], str) and re.fullmatch('[0-9a-f]{64}', hashes[0]), f'missing/invalid slice hash: {obj["path"]}')
        has_utf16 = 'start' in obj or 'end' in obj
        if has_utf16:
            require('start' in obj and 'end' in obj, f'incomplete UTF16 range: {obj["path"]}')
        else:
            camel = 'startLine' in obj and 'endLine' in obj
            snake = 'start_line' in obj and 'end_line' in obj
            require(camel != snake, f'missing/ambiguous line coordinates: {obj["path"]}')
        self.walk(obj)

    def require_ranges(self, items):
        require(isinstance(items, list), 'evidence ranges must be a list')
        for item in items:
            self.require_range(item)

    def walk(self, obj):
        if isinstance(obj, list):
            for item in obj:
                self.walk(item)
        elif isinstance(obj, dict):
            has_slice = 'sliceSha256' in obj or 'slice_sha256' in obj
            has_coordinates = any(k in obj for k in ['start', 'end', 'startLine', 'endLine', 'start_line', 'end_line'])
            if has_slice or ('path' in obj and has_coordinates):
                require(isinstance(obj.get('path'), str) and obj['path'], 'evidence range missing path')
                hashes = [obj[k] for k in ['sliceSha256', 'slice_sha256'] if k in obj]
                require(len(hashes) == 1 and isinstance(hashes[0], str) and re.fullmatch('[0-9a-f]{64}', hashes[0]), f'missing/invalid slice hash: {obj["path"]}')
                path = obj['path']
                data = self.data(path)
                if 'start' in obj or 'end' in obj:
                    require('start' in obj and 'end' in obj, f'incomplete UTF16 range: {path}')
                    if path not in self.utf16:
                        self.utf16[path] = data.decode('utf-8').encode('utf-16-le')
                    encoded = self.utf16[path]
                    a, b = obj['start'], obj['end']
                    require(type(a) is int and type(b) is int and 0 <= a < b <= len(encoded)//2, f'bad UTF16 range: {path}')
                    fragment = encoded[a*2:b*2].decode('utf-16-le').encode('utf-8')
                    coordinate = 'UTF16-half-open'
                else:
                    a, b = obj.get('startLine', obj.get('start_line')), obj.get('endLine', obj.get('end_line'))
                    if path not in self.lines:
                        self.lines[path] = data.decode('utf-8').splitlines(keepends=True)
                    lines = self.lines[path]
                    require(type(a) is int and type(b) is int and 1 <= a <= b <= len(lines), f'bad line range: {path}')
                    fragment = ''.join(lines[a-1:b]).encode('utf-8')
                    coordinate = 'lines-inclusive'
                expected = obj.get('sliceSha256', obj.get('slice_sha256'))
                require(sha(fragment) == expected, f'slice hash mismatch: {path}:{a}-{b}')
                self.ranges.add((path, coordinate, a, b, expected))
            if 'path' in obj and ('fileSha256' in obj or 'sha256' in obj):
                data = self.data(obj['path'])
                require(sha(data) == obj.get('fileSha256', obj.get('sha256')), f'file hash mismatch: {obj["path"]}')
                if 'bytes' in obj:
                    require(len(data) == obj['bytes'], f'file size mismatch: {obj["path"]}')
            if 'evidence' in obj:
                value = obj['evidence']
                if isinstance(value, list):
                    self.require_ranges(value)
                elif isinstance(value, dict) and 'path' in value:
                    self.require_range(value)
                elif isinstance(value, dict):
                    self.require_ranges(list(value.values()))
                else:
                    raise ValueError('evidence must be a range, range list, or keyed range registry')
            for value in obj.values():
                if isinstance(value, (list, dict)):
                    self.walk(value)


def validate(documents, index, raw, evidence=None):
    evidence = evidence or EvidenceVerifier()
    canonical = {r['channel']: r for r in index['channels']}
    raw_channels = {r['channel']: r for r in raw['channels']}
    require(len(index['channels']) == len(canonical) == 217, 'canonical IPC denominator drift')
    require(set(canonical) == set(raw_channels), 'canonical/raw channel drift')
    seen, normalized = set(), []
    for kind, document in documents.items():
        entries = rows(kind, document)
        require(len(entries) == COUNTS[kind], f'{kind}: deleted/added manual entry')
        if kind == 'workflow':
            require(document['coverage']['manualChannels'] == len(entries) and document['coverage']['completeBusinessContracts'] == 0 and document['runtime'].startswith('R0'), 'workflow summary state/count drift')
        elif kind == 'collaboration':
            summary = document['summary']
            require(summary['scope_ipc_count'] == len(entries) and all(summary[k] == 0 for k in ['complete_contracts', 'S3_recommendations', 'R2_recommendations', 'implementation_upgrades']), 'collaboration summary state/count drift')
        else:
            summary = document['summary']
            require(summary['manualChannels'] == summary['S2'] == summary['R0'] == len(entries) and summary['completeContracts'] == 0, 'system summary state/count drift')
        for source in document.get('source_files', document.get('sourceFiles', [])):
            require(isinstance(source.get('path'), str) and isinstance(source.get('sha256'), str) and re.fullmatch('[0-9a-f]{64}', source['sha256']), f'{kind}: missing source snapshot hash')
        evidence.walk(document)
        for entry in entries:
            channel = entry['channel']
            require(channel in canonical, f'unknown channel: {channel}')
            require(channel not in seen, f'duplicate channel: {channel}')
            seen.add(channel)
            ref = canonical[channel]
            require(entry['id'] == ref['id'], f'wrong stable id: {channel}')
            require(entry.get('implementation_status_action', 'unchanged') == 'unchanged', f'implementation upgrade: {channel}')
            if kind == 'workflow':
                rec = entry['recommendation']
                require((rec['staticDepth'], rec['runtimeState']) == ('S2', 'R0') and rec['completeBusinessContract'] is False, f'state escalation: {channel}')
                require(entry['originalHandlerEvidence'] == [h['evidence'] for h in ref['handlers']], f'handler association drift: {channel}')
                require(entry['originalOperationEvidence'] == [o['evidence'] for o in ref['operations']], f'operation association drift: {channel}')
                preload = entry['preloadEvidence']
                require(rec['manualContractRef'] == {'path': str(INPUTS[kind]), 'channel': channel}, f'wrong manual ref: {channel}')
                require(entry['flowId'] in {f['id'] for f in document['flows']}, f'unknown flow: {channel}')
                ids = entry['evidenceIds']
                require(ids and all(i in document['evidence'] for i in ids), f'unknown line evidence: {channel}')
                local_evidence = [document['evidence'][i] for i in ids]
                ui_status = entry['uiRelation']
                require(ui_status in ['tracked', 'tracked-event', 'not-established'], f'unknown UI status: {channel}')
                ui_located = ui_status != 'not-established'
                ui_evidence = [e for e in local_evidence if '/renderer' in e['path']]
                summary = entry['title'] + '；' + entry['inputAndFiltering'] + '；' + entry['outputContract']
                local_relation = entry['persistentAndMemoryEffects']
                gaps = entry['unresolvedDependencies']
            elif kind == 'collaboration':
                require((entry['keep_static_depth'], entry['keep_runtime_status']) == ('S2', 'R0') and entry['manual_contract_complete'] is False, f'state escalation: {channel}')
                require(entry['raw_handler_evidence'] == [o['evidence'] for o in ref['operations'] if o['side'] == 'main' and o['operation'] in ['handle', 'on']], f'handler registration association drift: {channel}')
                require(entry['raw_event_evidence'] == ref['eventEmissions'], f'event association drift: {channel}')
                preload = entry['preload_exposures']
                family = document['families'][entry['family_ref']]
                local_evidence = entry['manual_handler_service_evidence'] + family['evidence']
                ui_status = entry['ui_status']
                require(ui_status in ['call_located', 'not_located_in_this_pass'], f'unknown UI status: {channel}')
                ui_located = ui_status == 'call_located'
                ui_evidence = entry['ui_evidence']
                summary = entry['input_contract'] + '；' + entry['success_contract'] + '；' + entry['semantic_observation']
                local_relation = entry['semantic_observation']
                gaps = [family['gap']] + entry['recommendation']['next_actions']
            else:
                require((entry['staticDepth'], entry['runtime']) == ('S2', 'R0') and entry['complete'] is False, f'state escalation: {channel}')
                require(entry['rawOperations'] == ref['operations'], f'operation association drift: {channel}')
                require(entry['handlerRefs'] == raw_channels[channel]['handlers'], f'handler association drift: {channel}')
                preload = entry['preloadExposures']
                local_evidence = entry['evidence']
                ui_evidence = [e for e in local_evidence if '/renderer' in e['path']]
                ui_located = bool(ui_evidence)
                ui_status = 'call_located' if ui_located else 'not_located_in_this_pass'
                summary = entry['input'] + '；' + entry['returns']
                local_relation = entry['chain']
                gaps = entry['gaps']
            require(preload == ref['preloadExposures'], f'preload association drift: {channel}')
            require(local_evidence and gaps, f'missing manual evidence/gaps: {channel}')
            evidence.require_ranges(local_evidence)
            evidence.require_ranges(ui_evidence)
            require(all(e['path'] in UI_SOURCES for e in ui_evidence), f'UI evidence is not a known renderer source: {channel}')
            require(not ui_located or ui_evidence, f'UI claim without renderer evidence: {channel}')
            # Local links are explicitly separated from the not-proven UI/service chain.
            normalized.append({
                'id': entry['id'], 'channel': channel,
                'manualContractRef': {'path': str(INPUTS[kind]), 'channel': channel, 'id': entry['id']},
                'recommendedStaticDepth': 'S2', 'runtimeRecommendation': 'R0',
                'implementationStatusAction': 'unchanged', 'completeBusinessContract': False,
                'summary': summary,
                'uiStatus': ui_status, 'uiLocated': ui_located, 'uiEvidence': ui_evidence,
                'confirmedLocalRelations': {
                    'canonicalChannel': channel,
                    'preload': preload,
                    'handlerOrEventOperations': [o for o in ref['operations'] if o['side'] == 'main'],
                    'handlerEvidence': [h['evidence'] for h in ref['handlers']],
                    'eventEmissions': ref['eventEmissions'],
                    'manualServiceObservation': local_relation,
                    'manualSourceEvidence': local_evidence,
                    'associationBasis': '原始注册、preload转发和主进程事件位置逐项与canonical完全相同；人工服务关系由引用的源码段支持，非按命名推断。',
                },
                'flowMappingRecommendation': '已追踪局部关系' if ui_located else '保留局部服务证据，UI入口待核',
                'remaining': gaps + ([] if ui_located else ['本次未确认renderer入口，不能补推完整UI链路']) + ['外部依赖/所有异常与恢复未闭合；竞品未逐项运行；不提升S3/R2或我方实现状态'],
            })
    require(seen == set(canonical), 'missing manual IPC coverage')
    return sorted(normalized, key=lambda r: r['channel']), evidence


def negative_probes(documents, index, raw):
    outcomes = []
    for kind in INPUTS:
        mutations = {
            'delete-entry': lambda d: rows(kind, d[kind]).pop(),
            'duplicate-entry': lambda d: rows(kind, d[kind]).__setitem__(1, copy.deepcopy(rows(kind, d[kind])[0])),
            'slice-hash': lambda d: corrupt_hash(d[kind]),
            'S3': lambda d: escalate(kind, rows(kind, d[kind])[0], 'static'),
            'R2': lambda d: escalate(kind, rows(kind, d[kind])[0], 'runtime'),
            'complete-true': lambda d: escalate(kind, rows(kind, d[kind])[0], 'complete'),
            'implementation-upgrade': lambda d: rows(kind, d[kind])[0].__setitem__('implementation_status_action', 'I3'),
            'wrong-preload-association': lambda d: rows(kind, d[kind])[0].__setitem__({'workflow': 'preloadEvidence', 'collaboration': 'preload_exposures', 'system': 'preloadExposures'}[kind], []),
            'missing-manual-slice-hash': lambda d: drop_manual_hash(kind, d[kind]),
        }
        for name, mutate in mutations.items():
            changed = copy.deepcopy(documents)
            mutate(changed)
            try:
                validate(changed, index, raw)
            except (ValueError, KeyError) as error:
                outcomes.append({'probe': kind + ':' + name, 'rejected': True, 'reason': str(error)})
            else:
                raise ValueError('negative probe accepted: ' + kind + ':' + name)
    for name, forged in [
        ('fake-renderer-missing-hash', {'path': 'nonexistent-renderer.js', 'start_line': 1, 'end_line': 1}),
        ('fake-renderer-valid-shaped-hash', {'path': 'nonexistent-renderer.js', 'start_line': 1, 'end_line': 1, 'slice_sha256': '0'*64}),
        ('renderer-out-of-range', {'path': str(RESEARCH / 'readable/renderer.js'), 'start_line': 999999999, 'end_line': 999999999, 'slice_sha256': '0'*64}),
        ('UI-path-only', {'path': str(RESEARCH / 'readable/renderer.js')}),
        ('UI-nonrenderer-valid-evidence', copy.deepcopy(documents['collaboration']['interfaces'][0]['manual_handler_service_evidence'][0])),
    ]:
        changed = copy.deepcopy(documents)
        entry = changed['collaboration']['interfaces'][0]
        entry['ui_status'], entry['ui_evidence'] = 'call_located', [forged]
        try:
            validate(changed, index, raw)
        except (ValueError, KeyError) as error:
            outcomes.append({'probe': name, 'rejected': True, 'reason': str(error)})
        else:
            raise ValueError('negative probe accepted: ' + name)
    return outcomes


def drop_manual_hash(kind, document):
    if kind == 'workflow':
        ref = next(iter(document['evidence'].values()))
    elif kind == 'collaboration':
        ref = document['interfaces'][0]['manual_handler_service_evidence'][0]
    else:
        ref = document['contracts'][0]['evidence'][0]
    for key in ['sliceSha256', 'slice_sha256']:
        ref.pop(key, None)


def corrupt_hash(obj):
    if isinstance(obj, dict):
        for key in ['sliceSha256', 'slice_sha256']:
            if key in obj:
                obj[key] = '0' * 64
                return True
        return any(corrupt_hash(v) for v in obj.values())
    if isinstance(obj, list):
        return any(corrupt_hash(v) for v in obj)
    return False


def escalate(kind, entry, dimension):
    if kind == 'workflow':
        entry['recommendation'][{'static': 'staticDepth', 'runtime': 'runtimeState', 'complete': 'completeBusinessContract'}[dimension]] = {'static': 'S3', 'runtime': 'R2', 'complete': True}[dimension]
    else:
        key = {'collaboration': {'static': 'keep_static_depth', 'runtime': 'keep_runtime_status', 'complete': 'manual_contract_complete'}, 'system': {'static': 'staticDepth', 'runtime': 'runtime', 'complete': 'complete'}}[kind][dimension]
        entry[key] = {'static': 'S3', 'runtime': 'R2', 'complete': True}[dimension]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--generate', action='store_true')
    args = parser.parse_args()
    # These are read-only modes: never regenerate away drift before validation.
    for command in [
        ['node', str(HERE / 'extract-ipc.mjs'), '--check'],
        ['python3', str(HERE / 'summarize-contracts.py'), '--check'],
        ['python3', str(HERE / 'build-manual-workflows.py'), '--check'],
    ]:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        require(result.returncode == 0, 'prerequisite check failed: ' + ' '.join(command) + '\n' + result.stdout + result.stderr)
    documents = {kind: load(path) for kind, path in INPUTS.items()}
    index = load(HERE / 'ipc-contract-index.json')
    require(sha(read(index['source'])) == index['sourceSha256'], 'canonical source hash drift')
    raw = load(index['source'])
    verifier = EvidenceVerifier()
    verifier.walk(index)
    normalized, verifier = validate(documents, index, raw, verifier)
    probes = negative_probes(documents, index, raw)
    inputs = {str(p): sha(read(p)) for p in [*INPUTS.values(), HERE / 'ipc-contract-index.json', Path(index['source'])]}
    recommendation = {
        'schemaVersion': 1, 'scope': '217个已知IPC的人工局部契约建议；不是完整业务契约验收',
        'inputSha256': inputs, 'completeBusinessContracts': 0,
        'runtime': 'R0', 'implementationStatusAction': 'unchanged', 'channels': normalized,
    }
    recommendation_bytes = (json.dumps(recommendation, ensure_ascii=False, indent=2) + '\n').encode()
    coverage = {
        'schemaVersion': 1, 'passed': True, 'scope': 'manual IPC observation coverage only',
        'knownIpcChannels': 217, 'manualIpcChannels': len(normalized),
        'sources': {kind: {'path': str(INPUTS[kind]), 'count': len(rows(kind, d)), 'sha256': inputs[str(INPUTS[kind])]} for kind, d in documents.items()},
        'missing': [], 'duplicates': [], 'staticDepthCounts': {'S2': 217},
        'runtimeCounts': {'R0': 217}, 'completeBusinessContracts': 0, 'implementationUpgrades': 0,
        'uiLocated': sum(r['uiLocated'] for r in normalized),
        'uiNotLocated': sum(not r['uiLocated'] for r in normalized),
        'namespaceCounts': dict(sorted(Counter(r['channel'].split(':')[0] for r in normalized).items())),
        'canonicalSha256': inputs[str(HERE / 'ipc-contract-index.json')],
        'sourceSnapshots': [{'path': path, 'sha256': sha(data)} for path, data in sorted(verifier.files.items())],
        'verifiedUniqueSourceRanges': len(verifier.ranges), 'negativeProbes': probes,
        'recommendations': {'path': str(RECOMMENDATIONS), 'sha256': sha(recommendation_bytes)},
        'limitations': ['覆盖率只表示217个已知IPC都有人工记录，动态字符串桥不是封闭全集', '哈希验证证据未漂移，不自动证明人工语义正确', '注册→preload关联逐项校验；UI→服务→依赖→存储全链未闭合', '没有执行竞品、激活或联网私有接口；没有完整S3/R2结论', '源码快照哈希是当前核验基线，不能证明更早时刻文件内容'],
    }
    outputs = {COVERAGE: (json.dumps(coverage, ensure_ascii=False, indent=2) + '\n').encode(), RECOMMENDATIONS: recommendation_bytes}
    if args.generate:
        # All validation above is complete before either prior report is touched.
        for path, data in outputs.items():
            temporary = ROOT / (str(path) + '.tmp')
            temporary.write_bytes(data)
            temporary.replace(ROOT / path)
    else:
        for path, data in outputs.items():
            require((ROOT / path).is_file() and read(path) == data, 'manual derived report missing or stale: ' + str(path) + '; review first, then explicitly --generate')
    print(json.dumps({'passed': True, 'mode': 'generate' if args.generate else 'check', 'channels': len(normalized), 'evidenceRanges': len(verifier.ranges), 'negativeProbesRejected': len(probes), 'artifacts': {str(p): sha(b) for p, b in outputs.items()}}, ensure_ascii=False))

if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, UnicodeError) as error:
        print(json.dumps({'passed': False, 'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
