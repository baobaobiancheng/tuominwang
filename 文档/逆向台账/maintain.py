#!/usr/bin/env python3
# coding: utf-8
"""Validate ledger.json and deterministically generate its review views. No application imports."""
from pathlib import Path
from collections import Counter
import argparse, csv, hashlib, io, json, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SOURCE = HERE / 'ledger.json'

def csv_text(headers, rows):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(headers)
    writer.writerows(rows)
    return '\ufeff' + stream.getvalue()

def refs(evidence):
    return ' | '.join(e['path'] + (':' + str(e['line']) if e.get('line') else '') + (':' + str(e['column']) if e.get('column') else '') for e in evidence)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Validate without writing; fail if generated views are stale')
    args = parser.parse_args()
    ledger = json.loads(SOURCE.read_text())
    items, flows = ledger['interfaces'], ledger['flows']
    errors, warnings = [], []
    ids = [i['id'] for i in items]
    flow_ids = [f['id'] for f in flows]
    if len(ids) != len(set(ids)): errors.append('重复接口ID')
    if len(flow_ids) != len(set(flow_ids)): errors.append('重复链路ID')
    keys = [(i['kind'], i['name']) for i in items]
    if len(keys) != len(set(keys)): errors.append('重复接口种类/名称')
    line_cache, content_cache, verified_files = {}, {}, {}
    snapshot = ledger.get('evidence_snapshot', {})
    pinned_files = snapshot.get('files', {})
    if not snapshot.get('baseline_at') or not snapshot.get('note') or not pinned_files:
        errors.append('缺少证据快照基线时间、边界说明或文件哈希')
    def checked_path(relative, owner):
        path = (ROOT / relative).resolve()
        if not path.is_relative_to(ROOT): errors.append(f'{owner}: 证据不在工作区 {relative}'); return None
        if not path.is_file(): errors.append(f'{owner}: 证据文件不存在 {relative}'); return None
        key = path.relative_to(ROOT).as_posix()
        if key not in verified_files:
            data = path.read_bytes()
            content_cache[path] = data
            actual = hashlib.sha256(data).hexdigest()
            pinned = pinned_files.get(key)
            matches = bool(pinned and pinned.get('sha256') == actual and pinned.get('bytes') == len(data))
            verified_files[key] = {'sha256': actual, 'bytes': len(data), 'matches_baseline': matches}
            if not pinned: errors.append(f'{owner}: 证据缺少哈希基线 {key}')
            elif not matches: errors.append(f'{owner}: 证据内容与快照不符 {key}')
        return path
    evidence_count = 0
    def check_evidence(entries, owner):
        nonlocal evidence_count
        for entry in entries:
            evidence_count += 1
            path = checked_path(entry['path'], owner)
            if path is None: continue
            if entry.get('line'):
                if path not in line_cache: line_cache[path] = content_cache[path].decode('utf-8').splitlines()
                lines = line_cache[path]
                n = entry['line']
                if not isinstance(n, int) or not 1 <= n <= len(lines): errors.append(f'{owner}: 证据行号无效 {entry["path"]}:{n}')
                elif entry.get('column') and not 0 <= entry['column'] <= len(lines[n-1].encode('utf-16-le')) // 2 + 1:
                    errors.append(f'{owner}: 证据列号无效 {entry["path"]}:{n}:{entry["column"]}')
    for item in items:
        expected = item['kind'] + '-' + hashlib.sha256(item['name'].encode()).hexdigest()[:12]
        if item['id'] != expected: errors.append(f'{item["id"]}: 稳定ID与种类/名称不一致')
        for field in ['static_depth', 'runtime_status', 'implementation_status']:
            if item[field] not in ledger['status_dictionary'][field]: errors.append(f'{item["id"]}: 非法状态 {field}')
        if not item.get('evidence'): errors.append(f'{item["id"]}: 证据为空')
        if not item.get('flow_ids'): errors.append(f'{item["id"]}: 未关联链路')
        for fid in item['flow_ids']:
            if fid not in flow_ids: errors.append(f'{item["id"]}: 未定义链路 {fid}')
        if not item.get('next_actions'): errors.append(f'{item["id"]}: 待办为空')
        if item['implementation_status'] != 'I0' and not item.get('implementation_evidence'): errors.append(f'{item["id"]}: 实现判断缺证据')
        if item['runtime_status'] != 'R0' and not item.get('runtime_evidence'): errors.append(f'{item["id"]}: 运行判断缺逐项证据')
        check_evidence(item.get('evidence', []) + item.get('implementation_evidence', []) + item.get('runtime_evidence', []), item['id'])
    for flow in flows:
        if not flow.get('evidence'): errors.append(f'{flow["id"]}: 链路证据为空')
        check_evidence(flow.get('evidence', []), flow['id'])
    check_evidence(ledger['reference'].get('runtime_evidence', []), 'reference')
    for source_name, path in ledger['sources'].items(): checked_path(path, 'source:' + source_name)
    # Retain and verify historical pinned files even when no current entry cites them.
    for path in pinned_files: checked_path(path, 'evidence_snapshot')
    legacy = list(csv.DictReader((ROOT / ledger['sources']['legacy_ipc_csv']).read_text('utf-8-sig').splitlines()))
    legacy_names = {r['通道'] for r in legacy}
    ipc = {i['name']: i for i in items if i['kind'] == 'IPC'}
    missing_legacy = sorted(legacy_names - ipc.keys())
    if missing_legacy: errors.append('缺少历史IPC: ' + ', '.join(missing_legacy))
    for row in legacy:
        if row['通道'] in ipc and ipc[row['通道']].get('legacy_row') != row: errors.append('原始IPC行未原样保留: ' + row['通道'])
    contracts = json.loads((ROOT / ledger['sources']['ipc_contracts']).read_text())
    observed = {c['channel']: {o['observationId'] for o in c['observations']} for c in contracts['channels']}
    for channel, expected in observed.items():
        actual = {e.get('observation_id') for e in ipc.get(channel, {}).get('evidence', [])}
        if not expected <= actual: errors.append('丢失REA操作证据: ' + channel)
    event_ids = [e['id'] for e in ledger['events']]
    if len(event_ids) != len(set(event_ids)): errors.append('重复变更事件ID')
    mentioned = set()
    for event in ledger['events']:
        for key in event['affected_ids']:
            if key not in ids and key not in flow_ids: errors.append('变更记录引用未知ID: ' + key)
            mentioned.add(key)
    if set(ids) - mentioned: errors.append('有接口缺少变更事件')
    counts = {field: dict(sorted(Counter(i[field] for i in items).items())) for field in ['kind','static_depth','runtime_status','implementation_status','flow_mapping']}
    reference = ledger['reference']
    entry_closure = reference.get('entry_closure', {})
    if entry_closure:
        a = json.loads((ROOT / ledger['sources']['ui_entry_closure_a']).read_text())['interfaces']
        b = json.loads((ROOT / ledger['sources']['ui_entry_closure_b']).read_text())['contracts']
        expected_entries = {r['id']: r['entryResolution'] != 'no_renderer_reference' for r in a}
        expected_entries.update({r['id']: r['uiLocated'] for r in b})
        actual_entries = {i['id']: i['entry_closure']['renderer_located'] for i in items if i.get('entry_closure', {}).get('iteration') == 'ITER-015'}
        if len(a) + len(b) != len(expected_entries) or actual_entries != expected_entries:
            errors.append('UI入口闭合固定集合或分类与A/B报告不符')
        expected_counts = {'reviewed': len(expected_entries), 'renderer_located': sum(expected_entries.values()), 'no_published_renderer_caller': sum(not v for v in expected_entries.values()), 'unclassified': 0}
        if any(entry_closure.get(k) != v for k, v in expected_counts.items()): errors.append('UI入口闭合汇总与逐项报告不符')
        dynamic = json.loads((ROOT / ledger['sources']['dynamic_entry_closure']).read_text())
        dynamic_summary = dynamic['summary']
        for field, source_field in [('unresolved_dynamic_ipc', 'unresolvedRendererInvokeCallsites'), ('runtime_unbounded_dynamic_ipc', 'preloadDynamicBridges')]:
            if reference.get(field) != dynamic_summary[source_field]: errors.append('动态桥静态未解析/运行时无界数量与源报告不符: ' + field)
        dynamic_warning = f'{reference["unresolved_dynamic_ipc"]} 处当前发布包动态invoke调用待解析；{dynamic_summary["rendererInvokeCallsites"]} 调用/{dynamic_summary["rendererLiteralChannels"]}字面通道已核；{reference["runtime_unbounded_dynamic_ipc"]} 个桥本身仍无白名单，运行时输入无界'
    else:
        dynamic_warning = f'{reference.get("unresolved_dynamic_ipc", "未登记数量的")} 处动态 IPC 未解析；未纳入字面通道覆盖分母'
    warnings = [f'{counts["flow_mapping"].get("命名线索待核",0)} 个接口只有命名域归类，尚非调用链确认', dynamic_warning, '校验确认当前文件符合本轮哈希基线，不证明建立基线前的内容、竞品契约或运行正确']
    validation = {'ledger_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'reference_version': ledger['reference']['version'], 'interface_count':len(items), 'flow_count':len(flows), 'historical_ipc_count':len(legacy), 'historical_ipc_missing':missing_legacy, 'unmapped_interfaces':[i['id'] for i in items if not i['flow_ids']], 'empty_evidence_interfaces':[i['id'] for i in items if not i['evidence']], 'evidence_reference_count':evidence_count, 'evidence_file_count':len(verified_files), 'evidence_baseline_at':snapshot.get('baseline_at'), 'evidence_baseline_note':snapshot.get('note'), 'evidence_files':dict(sorted(verified_files.items())), 'counts':counts, 'errors':errors, 'warnings':warnings}
    if errors:
        print(json.dumps(validation, ensure_ascii=False, indent=2)); return 1
    status = ledger['status_dictionary']
    views = {}
    views['接口台账.csv'] = csv_text(['稳定ID','种类','通道/入口','命名空间','版本','生命周期','静态深度','静态观察','运行状态','运行说明','链路ID','归属确认','我方实现状态','我方实现说明','源码证据','我方证据','待办'], [[i['id'],i['kind'],i['name'],i['namespace'],i['reference_version'],i['lifecycle'],i['static_depth']+' '+status['static_depth'][i['static_depth']],i['static_summary'],i['runtime_status'],i['runtime_note'],' | '.join(i['flow_ids']),i['flow_mapping'],i['implementation_status']+' '+status['implementation_status'][i['implementation_status']],i['implementation_note'],refs(i['evidence']),refs(i['implementation_evidence']),' | '.join(i['next_actions'])] for i in items])
    flow_rows=[]
    for f in flows:
        members=[i for i in items if f['id'] in i['flow_ids']]
        flow_rows.append([f['id'],f['name'],f['outline_status'],f['sequence_outline'],len(members),sum(i['flow_mapping']=='命名线索待核' for i in members),f['runtime_status'],f['implementation_summary'],f['acceptance_status'],refs(f['evidence']),' | '.join(i['id'] for i in members),' | '.join(f['next_actions'])])
    views['链路台账.csv']=csv_text(['链路ID','链路/工作队列','链路深度','流程框架','关联接口数','仅命名线索数','运行状态','我方实现','验收状态','依据','接口ID','待办'],flow_rows)
    views['待办清单.csv']=csv_text(['接口ID','入口','静态缺口','运行缺口','实现缺口','链路归属','下一步'],[[i['id'],i['name'],status['static_depth'][i['static_depth']],i['runtime_note'],status['implementation_status'][i['implementation_status']]+'：'+i['implementation_note'],i['flow_mapping'],' | '.join(i['next_actions'])] for i in items if i['static_depth']!='S3' or i['runtime_status']!='R2' or i['implementation_status'] not in ['I3','I4']])
    views['校验结果.json']=json.dumps(validation,ensure_ascii=False,indent=2)+'\n'
    lines=['# 接口与链路逆向台账','','唯一可编辑事实源：[ledger.json](ledger.json)。CSV、状态汇总和变更日志由 [maintain.py](maintain.py) 生成，禁止手工改派生视图。','','## 当前状态','',f'- 参考：{ledger["reference"]["product"]} {ledger["reference"]["version"]} / {ledger["reference"]["platform"]}；记录日期 {ledger["reference"]["snapshot_date"]}。',f'- 接口/入口 **{len(items)}** 条：'+ '、'.join(f'{k} {v}' for k,v in counts['kind'].items())+'。',f'- 链路或命名域工作队列 **{len(flows)}** 个；每条深度见下表，不由条目总数推断闭合程度。',f'- 静态：'+ '、'.join(f'{k} {v}' for k,v in counts['static_depth'].items())+f'；登记 S3 完整静态链路条目 {counts["static_depth"].get("S3",0)}。',f'- 竞品端到端运行登记 R2 **{counts["runtime_status"].get("R2",0)}**；仅入口观察 R1 {counts["runtime_status"].get("R1",0)}；未逐项运行 R0 {counts["runtime_status"].get("R0",0)}。全局启动观察不能自动提升某个入口。',f'- 我方：'+ '、'.join(f'{k} {v}' for k,v in counts['implementation_status'].items())+f'；登记 I4 实现及验证完成条目 {counts["implementation_status"].get("I4",0)}。',f'- 历史 IPC **{len(legacy_names)-len(missing_legacy)}/{len(legacy_names)}** 保留；重复ID、缺失历史通道、空证据、无链路引用校验通过。',f'- **{counts["flow_mapping"].get("命名线索待核",0)}** 条仍仅按命名线索归类；“无空链路ID”不代表所有调用关系已确认。','','## 检查入口','','| 文件 | 用途 |','|---|---|','| [接口台账.csv](接口台账.csv) | 每条稳定ID、通道、证据、静态/运行/我方状态、链路及待办 |','| [链路台账.csv](链路台账.csv) | 流程框架、局部追踪或仅命名域、成员ID和验收缺口 |','| [待办清单.csv](待办清单.csv) | 所有仍未闭合条目，避免未分析入口失踪 |','| [校验结果.json](校验结果.json) | 计数、去重证据文件SHA-256与本轮基线匹配、缺项与结构校验结果 |','| [台账校验回归.json](台账校验回归.json) | 只在内存中的等长内容漂移/漏哈希拒绝和动态汇总验证 |','| [变更日志.md](变更日志.md) | 每次迭代的新增、补证、状态改变及验证边界 |','| [维护规则.md](维护规则.md) | 追加、升级、淘汰和生成校验要求 |','','## 状态定义','']
    if entry_closure:
        position = lines.index('## 检查入口') - 1
        lines[position:position] = [f'- 原待核前端入口 **{entry_closure["reviewed"]}** 项已完成发布快照调查：**{entry_closure["renderer_located"]}** 有调用/生命周期入口，**{entry_closure["no_published_renderer_caller"]}** 在本发布包无前端调用，未分类 **{entry_closure["unclassified"]}**；不等于完整业务契约闭合。', '- “本发布包无前端调用”描述竞品0.5.9发布renderer未引用该端点，不是我方少做相同数量的页面；我方是否实现须单看implementation_status及其证据。', '- 动态桥：' + dynamic_warning + '。']
    for field, entries in status.items():
        lines += [f'### {field}',''] + [f'- `{code}`：{label}。' for code,label in entries.items()] + ['']
    lines += ['## 链路清单','','| ID | 链路/工作队列 | 已登记入口 | 仅命名线索 | 深度 |','|---|---|---:|---:|---|']
    lines += [f'| {r[0]} | {r[1]} | {r[4]} | {r[5]} | {r[2]} |' for r in flow_rows]
    lines += ['', '## 证据边界', '', ledger['reference']['coverage_note'], '', ledger['reference']['integrity_note'], '', '入口种类不代表分析深度：MCP声明、UI工作流、网站HTTP调用点与IPC分别按各条目的证据及状态判断，不互相充当运行证明。', '', 'I1只表示有已定位的独立相关实现，包含差异和未完成部分；历史整体测试通过记录不会自动把接口标为通过。', '', '无许可证且未运行的入口保持R0；不破解激活、不读取会话密钥、不把研究代码纳入部署。', '', '证据路径相对项目根目录。源码行列指保存的发布代码或readable副本；observation_id保存在JSON供回溯。研究目录需与台账一起保留，迁移机器后先运行校验。', '', '### 文件哈希基线', '', f'本轮基线建立于 {snapshot["baseline_at"]}，按实际文件路径去重核验 {len(verified_files)} 个文件。', '', snapshot['note'], '', '新增证据需登记文件SHA-256及字节数；已有文件变化须先复核变更、保存必要旧快照并追加事件，再显式更新对应基线。生成脚本不会自动接受变化。', '']
    views['README.md']='\n'.join(lines)
    history=['# 逆向台账变更日志','','从 ledger.json.events 生成。后续每次迭代追加事件，不覆盖旧事件。','']
    for event in ledger['events']:
        history += [f'## {event["date"]} · {event["id"]} · {event["action"]}','','- '+event['summary'],f'- 影响 {len(event["affected_ids"])} 个稳定ID；完整列表见 ledger.json 对应事件。','- 验证：'+event['verification'],'']
    views['变更日志.md']='\n'.join(history)
    stale=[]
    for name, content in views.items():
        path=HERE/name
        if args.check:
            if not path.exists() or path.read_text('utf-8') != content: stale.append(name)
        else:path.write_text(content,encoding='utf-8')
    if stale:print('派生视图过期：'+', '.join(stale));return 1
    print(json.dumps({'result':'passed','mode':'check' if args.check else 'generate','interfaces':len(items),'flows':len(flows),'counts':counts,'evidence_references':evidence_count,'evidence_files':len(verified_files),'errors':0,'warnings':warnings},ensure_ascii=False))
    return 0

if __name__=='__main__':sys.exit(main())
