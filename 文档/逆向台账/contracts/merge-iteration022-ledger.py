# coding: utf-8
import json, hashlib, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
ledger_path = ROOT / '文档/逆向台账/ledger.json'
ledger = json.loads(ledger_path.read_text())
if any(e['id'] == 'ITER-022' for e in ledger['events']):
    raise SystemExit('ITER-022 already exists; use another event')
pins = ledger['evidence_snapshot']['files']
changes = []
baseline = '87a5808a35f5f64cb3f348dfca43b190ebe208ca'
for name, previous in list(pins.items()):
    path = ROOT / name
    if not path.exists(): continue
    data = path.read_bytes()
    current = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    if current == previous: continue
    if not name.startswith(('apps/', 'packages/', 'scripts/', 'tests/')):
        raise SystemExit('unapproved pin drift: ' + name)
    archived = ROOT / '.data/research/lawbot-2026-10-14/iteration022/baseline-code' / name
    prior_bytes = subprocess.check_output(['git', 'show', baseline + ':' + name], cwd=ROOT)
    prior = {'sha256': hashlib.sha256(prior_bytes).hexdigest(), 'bytes': len(prior_bytes)}
    if prior != previous: raise SystemExit('baseline mismatch: ' + name)
    archived.parent.mkdir(parents=True, exist_ok=True)
    archived.write_bytes(prior_bytes)
    archive_name = archived.relative_to(ROOT).as_posix()
    pins[archive_name] = prior
    pins[name] = current
    changes.append({'path': name, 'previous': previous, 'current': current, 'archived': archive_name})
report = ROOT / '文档/逆向台账/contracts/iteration022-pin-changes.json'
report.write_text(json.dumps({'baselineCommit': baseline, 'changes': changes, 'note': 'explicit progress checkpoint; historical source bytes retained'}, ensure_ascii=False, indent=2) + '\n')
paths = [
 '文档/逆向台账/contracts/full-porting-inventory-20261014.json',
 '文档/逆向台账/contracts/full-porting-inventory-20261014.md',
 '文档/逆向台账/contracts/profile-ruleset-workspace-fields-20261014.json',
 '文档/逆向台账/contracts/profile-ruleset-workspace-fields-20261014.md',
 '文档/逆向台账/contracts/review-visual-by-rules-20261014.json',
 '文档/逆向台账/contracts/review-visual-by-rules-20261014.md',
 '.data/research/lawbot-2026-10-14/iteration022/ledger-before.json',
 '.data/research/lawbot-2026-10-14/iteration022/check-fourth.log',
 '.data/research/lawbot-2026-10-14/iteration022/integration-first.log',
 '.data/research/lawbot-2026-10-14/iteration022/integration-second.log',
 '文档/逆向台账/contracts/iteration022-pin-changes.json',
 '文档/逆向台账/contracts/merge-iteration022-ledger.py',
]
evidence = []
for name in paths:
    data = (ROOT / name).read_bytes()
    meta = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    pins[name] = meta
    evidence.append({'path': name, **meta})
ledger['events'].append({
 'id': 'ITER-022', 'date': '2026-10-14', 'action': '全量未完成项盘点、并行补齐和第一轮交叉审查',
 'summary': '逐项盘点258接口37链路、41基础组12金额分支108配置3012数组项，不按前端有无调用选择性跳过。独立文本解释器、视觉候选、方案规则库、分层策略、备份还原正在接线与闭环。全部S2/R0及I级保持不变。',
 'affected_ids': [i['id'] for i in ledger['interfaces']],
 'verification': '进度检查点：11法则/13变异/TS/212单元/build通过；第一轮集成5处失败修复，第二轮20/21通过，剩余新版rules version旧硬编码断言已调整但待最终重跑。新能力仍在接线；未发布公网新版。',
 'evidence': evidence,
 'boundaries': ['未经授权的竞品处理链保持R0。', 'Windows缺失组件、私有模型、真实视觉标注、跨产品本机CMK与DOC/WPS转换依赖仍待证据。', 'CrossNER英文评测尚未发布；合成用例不能替代真实准确率。', '旧报告是历史冻结结论，不宣称当前变更全部验收或部署。', 'main基线源码原字节与previous/current哈希保留，后续变化另加事件。'],
})
ledger['evidence_snapshot']['note'] += ' ITER-022显式更新进度检查点应用pin；main87基线原字节和旧新hash逐项保留，新能力未一律提级，未发布服务。'
ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n')
print('ITER-022 added;', len(changes), 'explicit pin changes')
