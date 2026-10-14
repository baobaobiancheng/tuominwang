from pathlib import Path
import json
from collections import Counter

root=Path(__file__).resolve().parent
report=json.loads((root/'feedback-memory-support-porting-20261014.json').read_text())
overrides={r['sourceName']:r for r in report['rows'] if r['id'].startswith('IPC-')}

def current(r):
 return r.get('current_phase_024',r.get('current_phase_023',{}))

def apply(rows):
 for row in rows:
  proof=overrides.get(row['name'])
  if not proof: continue
  inactive=proof['sourceState']=='inactive_return_adapter'
  row['current_phase_024']={
   'status':'source_inactive_stub_adapted' if inactive else 'implemented_adapted_static_proven',
   'classification':'source_inactive_stub_adapted' if inactive else 'implemented_adapted_static_proven',
   'ownLevel':'I2-adapted','phase':'ITER024','reference_runtime':'R0',
   'source_handler':proof['sourceHandler'],'route':proof['ownRoute'],
   'source_state':proof['sourceState'],'reason':proof['semantics'],
   'proof_report':'feedback-memory-support-porting-20261014.json',
   'sources':['packages/contracts/feedback.ts','packages/core/feedback.ts','packages/core/user-memory-rules.ts','packages/adapters/feedback-store.ts','apps/api/feedback.ts'] if not row['name'].startswith(('app:','log:')) else ['packages/core/support.ts','apps/api/support.ts','scripts/020.sql'],
   'frontend':['apps/web/feedback.tsx'] if not row['name'].startswith(('app:','log:')) else ['apps/web/support.tsx'],
   'tests':proof['ownEvidence'],
   'remaining':['最终主任务 Edge 浏览器验收；Electron保存/选文件采用明确浏览器适配，非桌面线协议兼容；竞品许可证处理运行R0'],
   'source_pin_policy':'Preserve historical phase source hashes; exact current owned-file hashes live in proof report. Root final phase event pins metadata.'
  }

fullpath=root/'full-porting-inventory-20261014.json'
full=json.loads(fullpath.read_text());apply(full['interfaces'])
counts=Counter(current(r).get('classification',current(r).get('status','unclassified')) for r in full['interfaces'])
full['current_phase_024']={
 'scope':'Partial latest overlay: exact feedback/review/memory/learner/support rows updated; other source interfaces retain explicit ITER023 provenance until their owner merges fresh proof.',
 'updated_interface_count':sum('current_phase_024'in r for r in full['interfaces']),
 'total_interfaces':len(full['interfaces']),'latest_mixed_stage_counts':dict(counts),
 'all_porting_complete':False,'reference_runtime':'R0',
 'remaining':[{'id':r['id'],'name':r['name'],'phase':'ITER024' if 'current_phase_024'in r else 'ITER023','status':current(r).get('status'), 'remaining':current(r).get('remaining',r.get('missing_or_unverified',[]))}for r in full['interfaces']],
 'flows_policy':'All37 flows retained, no family-level workflow upgrade from interface-only proof.',
 'report':'feedback-memory-support-porting-20261014.json'
}
fullpath.write_text(json.dumps(full,ensure_ascii=False,indent=2)+'\n')
individualpath=root/'individual-interface-closure-20261014.json'
individual=json.loads(individualpath.read_text());apply(individual['rows'])
individual['latest_phase']='ITER024 partial overlay; all older classification retained as history'
individual['current_categories']=dict(Counter(current(r).get('classification','unclassified')for r in individual['rows']))
individual['source_inactive_correction']='Learner6 are released-source inactive constants/failures; get-stats only reads legacy history. None is an unimplemented active training algorithm.'
individualpath.write_text(json.dumps(individual,ensure_ascii=False,indent=2)+'\n')

def cell(value):return str(value).replace('|','\\|').replace('\n',' ')
md=['# 逐接口当前分类：ITER024 最新覆盖与 ITER023 历史来源','','每项保留旧阶段记录。当前只有逐ID存在源码／handler／权限／持久化／实际测试对应才更新；未使用同family升级。竞品处理运行R0。','','本轮6个自学习入口改正为源码已停用，不再作为缺失训练算法。另1个只读旧历史统计。个人词条迁入规则库默认未启用。','','| ID | 源入口 | 最新阶段 | 分类 | own level | 具体语义／证明 |','|---|---|---|---|---|---|']
for r in individual['rows']:
 c=current(r);md.append('| '+' | '.join(map(cell,[r['id'],r['name'],'ITER024' if 'current_phase_024'in r else 'ITER023',c.get('classification'),c.get('ownLevel'),c.get('reason')]))+' |')
md+=['','## 完成边界','','- 本文件更新了反馈、个人名单、停用自学习与支持接口；其他模块保留原逐ID来源，待其负责人合并新证据。','- 11个纯函数测试、反馈2项真实DB／worker测试、支持1项真实DB测试通过，详见反馈报告。','- 未将竞品受许可证限制的处理链升级为已运行；未将接口闭合当作37个工作流全部闭合。']
(root/'individual-interface-closure-20261014.md').write_text('\n'.join(md)+'\n')
oldmd=(root/'full-porting-inventory-20261014.md').read_text()
marker='<!-- ITER024-EXACT-OVERLAY -->'
if marker in oldmd:oldmd=oldmd.split('<!-- /ITER024-EXACT-OVERLAY -->',1)[1].lstrip()
intro=[marker,'# ITER024 最新逐项覆盖','','本节优先于后文 ITER023 快照。当前35个源码接口以独立证据更新，其他接口与37链路保留原阶段，等待各负责人最新证明；不能宣称全部移植完成。','','- [最新逐ID分类](individual-interface-closure-20261014.md)；[本轮真实handler／规则／权限／测试矩阵](feedback-memory-support-porting-20261014.md)。','- 自学习6入口源码已停用，已按固定返回/明确失败适配；get-stats只读旧history。未创建源码调用链不存在的学习/回滚。','- 个人词条真实保存／导入／导出／迁入规则库，默认未启用。激活规则库的forceSkip与forceDetect经实际worker验证。','- 支持4接口已实际数据库验收，法律资料为自有未发布草稿、体验材料全部合成、错误日志只保存时间与固定类别。','- A/B审查的中文类型丢失、报告筛选计数两个P2已修并独立复证。竞品处理运行仍R0。','','<!-- /ITER024-EXACT-OVERLAY -->','','## ITER023 原始阶段视图（保留历史）','']
(root/'full-porting-inventory-20261014.md').write_text('\n'.join(intro)+oldmd)
print(json.dumps({'updated':len(overrides),'interfaces':len(full['interfaces']),'flows':len(full['flows']),'current_categories':individual['current_categories']},ensure_ascii=False))
