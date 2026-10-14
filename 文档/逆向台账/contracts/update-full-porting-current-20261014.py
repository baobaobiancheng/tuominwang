import json,hashlib,collections
from pathlib import Path
root=Path.cwd();folder=root/'文档/逆向台账/contracts';p=folder/'full-porting-inventory-20261014.json';data=json.loads(p.read_text());activation=json.loads((folder/'rule-runtime-activation-20261014.json').read_text());ledger=json.loads((root/'文档/逆向台账/ledger.json').read_text());byledger={r['id']:r for r in ledger['interfaces']}
sha=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
proofs={}
for family,source,ui,test in [('profile','apps/api/presets.ts','apps/web/presets.tsx','tests/presets.integration.ts'),('preference','apps/api/presets.ts','apps/web/presets.tsx','tests/presets.integration.ts'),('ruleset','apps/api/presets.ts','apps/web/presets.tsx','tests/presets.integration.ts')]:
 proofs[family]={'status':'implemented_api_contract_with_integration_evidence','sources':[source],'frontend':[ui],'tests':[test],'remaining':['源运行R0：未获正版许可证逐项执行对照','当前页面逐入口浏览器验收仍需单列，不以同域页面存在代替']}
protocol={'status':'implemented_protocol_individual_contract_review_required','sources':['packages/core/mcp-tools.ts','apps/api/mcp.ts','scripts/mcp-stdio.ts'],'frontend':['apps/web/ai-collab.tsx'],'tests':['tests/mcp-tools.test.ts','tests/mcp.integration.ts'],'remaining':['源码12tools/14gateway/26actions逐字段已编写，集成全流程不等于每方法全异常矩阵','默认automatic源链适配为必须人工复核快照，属于明确行为差异','外部provider未配置/未获外发授权，未运行任何外部AI能力','源运行R0；桌面磁盘路径改documentId上传映射，目录/OS进程不可声称兼容']}
for e in data['interfaces']:
 if 'baseline_phase_021' not in e:e['baseline_phase_021']={k:e[k] for k in ['implementation_assessment','own_candidate_sources','frontend_entry_proof','missing_or_unverified'] if k in e}
 family=e['family'];name=e['name'];current=proofs.get(family)
 if family in ['ai-collab','local-gateway'] or family=='mcp-connectors' and ':' not in name:current=protocol
 if family=='mcp-connectors' and ':' in name:
  method=name.split(':',1)[1];blocked=method in ['choose-folder','open'];current={**protocol,'status':'blocked_cloud_desktop_dependency' if blocked else 'implemented_web_connector_adapter_not_installed','remaining':(['桌面选择目录/OS打开不能在云服务执行；明确拒绝并保留完整入口'] if blocked else ['配置可复制/状态可查询/重试可触发；无OS安装/活客户端联通证明'])+protocol['remaining']}
 if name=='ai-collab:change-restore-directory':current={**protocol,'status':'blocked_cloud_directory_override','remaining':['不可任意写云宿主目录，云受保护对象存储交付适配；不是原磁盘契约互通']}
 if name=='ai-collab:repair-task-storage':current={**protocol,'status':'diagnostics_implemented_repair_requires_valid_backup','remaining':['可真实校验AES和存储；无可用备份不返回伪修复成功，未实现凭空恢复损坏私有数据']}
 if name=='desensitization:unlock-source':current={'status':'missing_user_password_unlock_pipeline','sources':['packages/core/pdf-reader.ts'],'frontend':[],'tests':[],'remaining':['当前PDF空密码加载ENCRYPTED_PDF失败；Word密码容器同样无授权解密接口','源main.js17008–17051: sourceRef.id/password<=4096，支持docx/pdf/doc/wps，解密→新sourceRef，原先临时source释放','需用户输入已知密码→内存解密→新派生sourcehash→重新识别/复核/export；禁止猜密码，不改原件']}
 if current is None:
  l=byledger.get(e['id'],{});current={'status':'per_interface_current_proof_missing','sources':e.get('own_candidate_sources',[]),'frontend':e.get('frontend_candidate_sources',[]),'tests':e.get('existing_related_tests',[]),'remaining':['须按此稳定ID提供当前真实handler/字段/持久化/权限/异常/恢复及验收证据；同域实现不得算闭合'],'current_ledger_status':l.get('implementation_status'),'current_ledger_note':l.get('implementation_note')}
 e['current_phase_023']={**current,'source_sha256':{s:sha(s) for s in current['sources'] if (root/s).exists()},'reference_runtime':'R0'}
 e['implementation_assessment']=current['status'];e['missing_or_unverified']='；'.join(current['remaining'])
for f in data['flows']:
 rows=[e for e in data['interfaces'] if e['id'] in f['interface_ids']];f['baseline_phase_021']=f.get('baseline_phase_021',{'implementation':f.get('implementation'),'remaining':f.get('remaining')});f['current_phase_023']={'status':'current_member_contracts_required','interface_statuses':{e['id']:e['current_phase_023']['status'] for e in rows},'remaining':['完整正常/失败/恢复端到端流程及浏览器展示，不能凭成员同域实现标链路完成','源运行R0未授权执行'],'reference_runtime':'R0'}
for r in data['basic_rules']:
 r['baseline_phase_021']=r.get('baseline_phase_021',{'own_baseline':r.get('own_baseline'),'status':r.get('status')});row=next(x for x in activation['baseline'] if x['id']=='REF41-'+r['category']);r['current_phase_023']={**row,'activation_report':'rule-runtime-activation-20261014.json','scope':'当前真实default detectComplete全部运行，静态正反测试不等于真实业务准确率或竞品licensed运行'};r['status']=row['status'];r['own_baseline']='已归档于baseline_phase_021；当前见current_phase_023'
for r in data['amount_branches']:
 r['baseline_phase_021']=r.get('baseline_phase_021',{'baseline':r.get('baseline')});r['current_phase_023']={'status':'active','runtime':'detectComplete→detectReferenceRules→all 17 amountSpecs migrated regex branches, unconditional','family':r['id'],'all_branch_evidence':activation['amountBranches'],'test':'tests/reference-rules.test.ts','activation_report':'rule-runtime-activation-20261014.json'};r['baseline']='已归档，当前12家族/17分支真实运行'
for r in data['yaml_categories']:
 r['baseline_phase_021']=r.get('baseline_phase_021',{'own_status':r.get('own_status')});row=next((x for x in activation['yamlCategories'] if x['file']==r['file'].replace('.yaml','') and x['category']==r['category']),None);r['current_phase_023']=row or {'status':'mapping_requires_recheck'};r['own_status']=r['current_phase_023']['status']
remaining=[{'id':e['id'],'name':e['name'],'family':e['family'],**e['current_phase_023']} for e in data['interfaces']]+[{'id':f['id'],'name':f['name'],**f['current_phase_023']} for f in data['flows']]
data['current_phase_023']={'source':'independent exact-ID implementation inventory; family presence never closes an interface','ruleActivationReport':{'path':'rule-runtime-activation-20261014.json','sha256':sha('文档/逆向台账/contracts/rule-runtime-activation-20261014.json')},'interface_counts':dict(collections.Counter(e['current_phase_023']['status'] for e in data['interfaces'])),'remaining_count':len(remaining),'remaining':remaining,'product_complete':False,'licensed_reference_execution':'R0'};p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
md=['# 全量移植独立盘点：当前阶段 ITER-023','', '当前状态优先展示；旧 ITER-021 缺失描述完整保存在 JSON 的 `baseline_phase_021`，不作为当前结论。258 接口和 37 链路逐项保留。**全部移植完成：不能宣称。** 规则默认静态运行闭合与接口/浏览器/正版运行验收分别记录。','', '## 当前数量','', '| 项目 | 数量/边界 |','|---|---|','| 基础规则 | 41 全部默认调用 |','| 金额 | 12 家族、17 正则支路全部默认调用 |','| YAML | 108 类逐消费者记录；源无 caller 的方法不伪造默认激活 |','| 接口 | 258，逐ID状态如下 |','| 链路 | 37，端到端验收未一概闭合 |','| 竞品运行 | R0，许可证阻断保留 |','', '## 258 接口当前状态','', '| ID | 源入口 | 当前实现状态 | 真实实现证据 | 必需剩余核验 |','|---|---|---|---|---|']
escape=lambda s:str(s).replace('|','\\|').replace('\n',' ')
for e in data['interfaces']:
 c=e['current_phase_023'];md.append('| '+' | '.join(escape(v) for v in [e['id'],e['name'],c['status'],','.join(c['sources']),';'.join(c['remaining'])])+' |')
md+=['','## 37 链路当前状态','','| ID | 链路 | 状态 | 剩余 |','|---|---|---|---|']
for f in data['flows']:c=f['current_phase_023'];md.append('| '+' | '.join(escape(v) for v in [f['id'],f['name'],c['status'],';'.join(c['remaining'])])+' |')
md+=['','## 41 基础规则当前消费','','| ID | 当前状态 | 实际消费 | 测试 |','|---|---|---|---|']
for r in data['basic_rules']:c=r['current_phase_023'];md.append('| '+' | '.join(escape(v) for v in [r['id'],c['status'],c['runtime'],c['test']])+' |')
md+=['','## 金额及 YAML','', '[全量金额17支路、108类、5options消费矩阵](rule-runtime-activation-20261014.md)。本文件JSON也逐原ID包含当前状态，旧快照完整保留。','', '## 全量剩余清单','', 'JSON `current_phase_023.remaining` 包含全部258接口及37链路的真实剩余验证/阻断，既未忽略无前端调用，也未把同域已有功能当成已兼容。规则业务域gold/视觉gold/合法密码解锁/源许可运行对照仍须独立关闭。']
(folder/'full-porting-inventory-20261014.md').write_text('\n'.join(md)+'\n');print(json.dumps(data['current_phase_023']['interface_counts'],ensure_ascii=False))
