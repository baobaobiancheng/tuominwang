#!/usr/bin/env python3
# coding: utf-8
"""Explicit ITER-020 implementation merge; reconstruct from immutable ITER-019 backup.
--check verifies the deterministic merge without writing. No application imports.
"""
from pathlib import Path
from collections import Counter
import argparse, copy, hashlib, json

R = Path(__file__).resolve().parents[3]
P = R / '文档/逆向台账'
C = P / 'contracts'
BASE = '.data/research/lawbot-2026-10-14/ledger-before-iteration020.json'
BASE_SHA = 'c53a868fb77fa1677509578d698a982e2d77983a3fc2c1ccb6e72fe8a6e246cb'
REPORT = '文档/逆向台账/contracts/implementation-gap-closure-20261014.json'
HANDOFF = '文档/脱敏规则技术交接-20261014.md'
SELF = Path(__file__).resolve().relative_to(R).as_posix()
REPINS = {'apps/api/main.ts', 'apps/web/main.tsx', 'packages/adapters/processing-worker.ts',
          'Dockerfile', 'apps/web/page-review.tsx'}
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads((R / p).read_text())
def pin(path):
    b = (R / path).read_bytes()
    return {'sha256': sha(b), 'bytes': len(b)}
def ref(path, note):
    return {'path': path, 'note': note}
def append_unique(seq, entry):
    if entry not in seq: seq.append(entry)
def status_counts(d):
    return {k: dict(Counter(i[k] for i in d['interfaces'])) for k in
            ['kind', 'static_depth', 'runtime_status', 'implementation_status', 'flow_mapping']}

def build():
    assert pin(BASE)['sha256'] == BASE_SHA, 'ITER019 backup changed'
    before = load(BASE)
    assert before['events'][-1]['id'] == 'ITER-019'
    d = copy.deepcopy(before)
    review = load(REPORT)
    assert review['status'] == 'final-no-open-code-findings-rerun-passed-with-original-failure-retained'
    assert review['findings'] == [] and review['scope']['competitorRuntime'] == 'R0'
    assert pin(HANDOFF)['sha256'] == review['handoff']['sha256'], 'handoff/report freeze mismatch'
    # Review hash assertions establish the author's audited snapshot; they are not semantic proof.
    for e in review['evidence']:
        assert pin(e['path'])['sha256'] == e['fileSha256'], ('review snapshot changed', e['path'])
    historical = [
        '文档/逆向台账/contracts/implementation-ui-status-20261014.json',
        '文档/逆向台账/contracts/implementation-ui-status-20261014.md',
        '文档/逆向台账/contracts/review-rules-handoff-20261014.json',
        '文档/逆向台账/contracts/review-rules-handoff-20261014.md',
        '文档/逆向台账/contracts/build-review-rules-handoff-20261014.py',
        '.data/research/lawbot-2026-10-14/iteration020/own-rules-manifest.json',
        '.data/research/lawbot-2026-10-14/iteration020/current-core-tests.json',
        '文档/逆向台账/contracts/review-ledger-iteration019-20261014.json',
        '文档/逆向台账/contracts/review-ledger-iteration019-20261014.md',
        '文档/逆向台账/contracts/build-review-ledger-iteration019-20261014.py',
    ]
    files = sorted(set([BASE, SELF, REPORT, REPORT.replace('.json', '.md'), HANDOFF,
        'packages/adapters/processing.ts', 'tests/run-isolated.ts', '文档/使用指南/新增功能操作-20261014.md',
        '.data/evals/iteration021-screens/ocr-correction-desktop.png',
        '.data/evals/iteration021-screens/docx-layout-Word-layout-li-53689-ects-stale-anonymous-layout/docx-layout-review.png',
        '.data/evals/iteration021-screens/visual-candidates-desktop.png',
        *REPINS, *historical, *[e['path'] for e in review['evidence']]]))
    # No ambient auto-repin: exactly the five authorized application changes may differ.
    drift = {p for p, v in before['evidence_snapshot']['files'].items() if pin(p) != v}
    assert drift == REPINS, ('unexpected old evidence drift', sorted(drift))
    added, replaced = [], []
    for path in files:
        value = pin(path)
        old = d['evidence_snapshot']['files'].get(path)
        if old is None: added.append({'path': path, **value})
        elif old != value:
            assert path in REPINS
            replaced.append({'path': path, 'previous': old, 'current': value,
                             'reason': 'ITER020实际实现或接线；旧pin完整保存在ITER019备份及本事件，不追认旧源码为当前源码。'})
        d['evidence_snapshot']['files'][path] = value
    assert {v['path'] for v in replaced} == REPINS
    common = [ref(REPORT, '本轮定向实现审查；4问题修复回读，0open；非全产品/竞品验收。'),
              ref(HANDOFF, '当前规则与实现交接；历史独审只覆盖其旧快照，最终变更范围见本轮gap报告。'),
              ref('.data/evals/iteration021-check-release.log', '我方82单元测试/17文件、11 Bend laws、13变异拒绝及构建通过。'),
              ref('.data/evals/iteration021-edge-final.log', '首次全量38项37通过1失败；新三功能用例通过，旧DOCX就绪等待超时。'),
              ref('.data/evals/iteration021-edge-files.log', '旧DOCX下载按钮等待5秒改45秒后files定向7/7，不宣称完整38项重跑全绿。')]
    notes = {
        'UI-339d8e53408d': (
            '已有DOCX结构版式预览：段落/run、表格、受支持本地图片、实体定位与处理预览；新Word浏览器用例验证真实下载及ZIP正文。浏览器字体、分页、浮动/多节布局不保证与Word原版式像素一致，隐藏对象须另外审查；未完成竞品等价对齐。',
            ['apps/web/docx-review.tsx', 'apps/web/docx-review.css', 'apps/api/docx-layout.ts',
             'packages/core/docx-layout.ts', 'tests/docx-layout.test.ts', 'tests/e2e/docx-layout.spec.ts'],
            '我方后续：验证真实复杂Word分页、浮动/多节布局与隐藏对象覆盖；当前预览不是Word像素等价，竞品仍R0。'),
        'UI-32ce2fb60c5f': (
            '已有单处人工补标及页内OCR改字保存：UTF-16选区/原文/版本校验，保守重新关联原字框，新增map/revision使复核快照失效并取消旧任务，重新识别保留纠正文本；原件不改写、已签发旧产物保持不变。删除/空白保留原像素关联，无接收范围拒绝并需手工区域；未实现项目范围批量改字，也不证明竞品算法等价。',
            ['apps/web/ocr-text-editor.tsx', 'apps/api/ocr.ts', 'packages/core/ocr-correction.ts',
             'packages/adapters/ocr-correction.ts', 'packages/contracts/ocr.ts',
             'tests/ocr-correction.test.ts', 'tests/ocr.integration.ts', 'tests/e2e/ocr-correction.spec.ts',
             '.data/evals/iteration021-integration-final.log', '.data/evals/iteration021-screens/ocr-correction-desktop.png'],
            '我方后续：项目范围批量改字未实现；插删共享原框可能额外清除邻近内容，须复核预览；无接收范围的全删用手工区域，竞品仍R0。'),
    }
    changed_interfaces = []
    for i in d['interfaces']:
        if i['id'] not in notes: continue
        assert i['implementation_status'] == 'I1' and i['static_depth'] == 'S2' and i['runtime_status'] == 'R0'
        note, evidence, action = notes[i['id']]
        changed_interfaces.append(i['id'])
        i.setdefault('implementation_history', []).append({'iteration': 'ITER-020', 'previous_note': i['implementation_note'],
              'previous_evidence': copy.deepcopy(i['implementation_evidence']), 'current_status': 'I1',
              'scope': '仅更新我方局部实现事实；静态分析与竞品运行级别不变。'})
        i['implementation_note'] = note
        for e in common + [ref(p, 'ITER020我方实现/验收证据；不充当竞品运行证据。') for p in evidence]:
            append_unique(i['implementation_evidence'], e)
        append_unique(i['next_actions'], action)
    assert set(changed_interfaces) == set(notes)
    flow_notes = {
        'FLOW-review-preview-mode': notes['UI-339d8e53408d'][0],
        'FLOW-manual-correction-scope': notes['UI-32ce2fb60c5f'][0],
        'FLOW-ocr': '已有OCR、区域复核及页内改字版本链；纠正后重新识别校验source/maps哈希并保留人工文本/坐标，待重新复核，原件不改。单元、18项集成组及Edge改字用例已验；独立图片全量重跑与项目批量改字不由这些局部证据证明等价。',
        'FLOW-image': '已有按页人脸/红蓝印章候选建议及人工确认区域的独立实现；权限/revision/hash门与canonical坐标转换，候选不自动写清除区域，正常复核导出。合成印章Edge像素检验通过，YuNet单图smoke有限；自动签名/黑白章、真实语料精度/召回与竞品图片标签输出契约未完成等价验收。',
    }
    for f in d['flows']:
        if f['id'] not in flow_notes: continue
        f.setdefault('implementation_history', []).append({'iteration': 'ITER-020', 'previous_summary': f['implementation_summary']})
        f['implementation_summary'] = flow_notes[f['id']]
        for e in common: append_unique(f['evidence'], e)
        append_unique(f['next_actions'], 'ITER020我方局部能力及剩余差异见implementation-gap-closure；保持竞品R0，不把本地通过当逐项等价。')
    d['sources'].update({
        'iteration020_implementation_gap_review': REPORT,
        'iteration020_rules_technical_handoff': HANDOFF,
        'iteration020_rules_34_cases': '.data/research/lawbot-2026-10-14/iteration020/handoff-34-cases.json',
        'iteration020_merge_script': SELF,
        'iteration020_new_features_guide': '文档/使用指南/新增功能操作-20261014.md',
        'iteration020_preimplementation_ui_snapshot': historical[0],
        'iteration020_historical_rules_handoff_review': historical[2],
    })
    d['evidence_snapshot']['note'] += ' ITER-020：补我方Word结构预览、页内OCR改字、视觉候选的实现/验收与规则交接；显式更新5项应用pin，previous/current与原ledger备份保留；早期UI/26例与旧交接独审仅为历史阶段，不代表最终功能或最终文档全部被独审。竞品S2/R0、全部I级别不变，未据本地验证声明公网发布。'
    event = {'id': 'ITER-020', 'date': '2026-10-14', 'action': '补齐Word结构预览、页内OCR纠错与视觉候选，更新规则交接和实现验收',
        'summary': 'Word支持结构版式、跨run高亮/同段选区和本地图片；OCR改字保存新map/revision、失效复核并保留旧字像素关联；新增按页人脸/红蓝印章候选人工确认。2条UI I1与4条flow实现摘要补实证，其他I0 IPC不提级。17我方检测项、41竞品基础组及108配置类别明确分开，34规则示例独立执行通过。所有258入口仍S2/R0；未执行竞品或声明全产品等价。',
        'affected_ids': sorted([*notes, *flow_notes]),
        'verification': '我方pnpm check：11 Bend laws、13错误变异拒绝、17文件82单元测试及TS/Vite构建通过；隔离DB/API/worker18/18。首次Edge全量38项37通过1失败（旧DOCX5秒就绪等待），等待调整为45秒后files定向7/7；保留首次失败，不写38/38全量重跑。定向独立审查4问题已修0open；规则34/34仅纯detect例。Bend不证明整个产品；竞品S2/R0不变，本事件无公网部署成功声明。日志名iteration021为执行目录标签，归属台账ITER020。',
        'evidence': [{'path': p, **pin(p)} for p in files],
        'added_evidence': added, 'repinned_evidence': replaced,
        'historical_stage_evidence': {'paths': historical, 'note': '实现前UI/公网GET与26例核心测试为历史阶段；旧handoff review固定其旧文档hash。最终能力/51整文件hash/34例/文档变更审查边界以本轮gap报告为准，不将旧结论冒充当前。'},
        'historical_ledger': {'path': BASE, **pin(BASE)},
        'state_counts_before': status_counts(before), 'state_counts_after': status_counts(d),
        'remaining_implementation_gaps': review['remainingGaps'] + [
             'Word不保证原生字体分页/浮动多节像素一致，未知对象可能阻断；隐藏对象仍需原文审查。',
             'OCR项目范围批量改字未实现；保守框可多清邻近内容，无接收范围全删拒绝。',
             '自动签名/黑白章未实现，视觉真实语料精度召回未建立。'],
    }
    d['events'].append(event)
    assert d['events'][:-1] == before['events']
    assert status_counts(d) == status_counts(before)
    assert d['reference'] == before['reference'] and d['status_dictionary'] == before['status_dictionary']
    for old, new in zip(before['interfaces'], d['interfaces']):
        if old['id'] not in notes: assert old == new, ('unrelated interface changed', old['id'])
        else:
            allowed = {'implementation_note', 'implementation_evidence', 'implementation_history', 'next_actions'}
            assert all(old.get(k) == new.get(k) for k in set(old) | set(new) if k not in allowed)
    for old, new in zip(before['flows'], d['flows']):
        if old['id'] not in flow_notes: assert old == new
        else:
            allowed = {'implementation_summary', 'implementation_history', 'evidence', 'next_actions'}
            assert all(old.get(k) == new.get(k) for k in set(old) | set(new) if k not in allowed)
    for path, value in before['evidence_snapshot']['files'].items():
        assert path in d['evidence_snapshot']['files']
        if path not in REPINS: assert d['evidence_snapshot']['files'][path] == value
    return d, {'event': 'ITER-020', 'addedEvidence': len(added), 'repinnedEvidence': len(replaced),
               'pins': len(d['evidence_snapshot']['files']), 'updatedInterfaces': len(notes), 'updatedFlows': len(flow_notes),
               'oldEventsUnchanged': True, 'otherInterfacesUnchanged': True, 'statusCounts': status_counts(d)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    d, result = build()
    current = load('文档/逆向台账/ledger.json')
    if args.check:
        assert current == d, 'ITER020 ledger differs from reproducible merge'
    else:
        assert current == load(BASE) or current == d, 'concurrent/unexpected ledger change'
        (P / 'ledger.json').write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'mode': 'check' if args.check else 'merge', **result}, ensure_ascii=False))

if __name__ == '__main__': main()
