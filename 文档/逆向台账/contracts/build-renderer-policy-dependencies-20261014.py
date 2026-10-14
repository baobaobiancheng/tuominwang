#!/usr/bin/env python3
# coding: utf-8
"""Static literal extraction and reproducible evidence packaging; never imports target JS."""
import hashlib,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
SOURCES={'renderer':ROOT/'.data/research/lawbot-2026-10-13/readable/renderer.js','main':ROOT/'.data/research/lawbot-2026-10-13/readable/main.js','preload':ROOT/'.data/research/lawbot-2026-10-13/extracted/dist/preload/index.js'}
EXPECTED={'renderer':'4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc','main':'40542891ebcf0f880ff19f8232430b0d3cf49f5b2808b87591281ef9e0d621ba'}
sha=lambda b:hashlib.sha256(b).hexdigest()
texts={k:p.read_text() for k,p in SOURCES.items()}
for k,v in EXPECTED.items(): assert sha(SOURCES[k].read_bytes())==v
sections=[]
def add(id,title,claims,ranges,remaining):
 ev=[]
 for source,start,end in ranges:
  lines=texts[source].splitlines(keepends=True); assert 1<=start<=end<=len(lines)
  ev.append({'path':str(SOURCES[source].relative_to(ROOT)),'startLine':start,'endLine':end,'fileSha256':sha(SOURCES[source].read_bytes()),'rangeSha256':sha(''.join(lines[start-1:end]).encode())})
 sections.append({'id':id,'title':title,'status':'S2','runtime':'R0','claims':claims,'evidence':ev,'remaining':remaining})
add('RP01','类型和键规范化并不全程相同',[
 'renderer cc 将 name/name_* 归 name_cn，landline/mobile 归 phone，passport 归 id_card；bank_account 落 other。main vr 将 bank_account 归 bank_card、hotline_400_800 归 phone，但 raw name 落 other。renderer seal/face 有专门类，vr 回 other。',
 'renderer HK/Lc 主要删除空白并将全角括号变半角；main Pr 依类型处理大小写、括号、电话前缀和标点。由同一文本得到相同 canonical key 不是跨层不变量。'],[('renderer',4204,4207),('renderer',4404,4417),('renderer',29836,29859),('main',2922,3036)],['全部类型真实语料碰撞矩阵尚无授权运行证据。'])
add('RP02','继承表 jc：一跳归并、保留和自动分配',[
 'zc 只验证 token.trim 非空，以及相同原始 canonicalKey 的 token 一致，不拒绝不同 canonicalKey 共用 token。Lc 标准化后 jc.set 的 Map 后写覆盖前写；非空 entries 才 enabled。',
 'jc canonicalKey 只查一跳；未做传递闭包或环检测。tokenFor 先找继承项，再找 canonical；新括号 token 使用保留序号和计数器避开 reserved，其他冲突值追加数字。已导入重复 token 不经这一生成冲突处理。',
 'apply 预留 locked 值，生成 auto，保留 locked current；alias 引用同一条目对象。它不是全局一对一 token/canonical 约束。'],[('renderer',4404,4482)],['继承文件上游所有载入/验证分支不在本次范围；不能将 zc 当作文件完整验证器。'])
add('RP03','组织简称 of/sf 与正文定义提取',[
 'af 清空白、边缘引号并统一括号。sf 要求 alias 长度2–20、不同于 fullName、非通用词、fullName非诉讼角色前缀且具有组织后缀并更长；不要求 alias 是 fullName 的子串或有词义关系。',
 'of 先从已知组织中找 fullName.endsWith(candidate) 且 sf 成立的最长候选，否则用 sf(alias,fullName)。uf 扫描括号定义与此前128字符；正则及 of 合格后按 offset 最近选定义，无 offset 时取最早。'],[('renderer',5476,5534)],['这些启发式不是组织实体语义等价证明；regex 在真实长文本的误归并率未运行。'])
add('RP04','YK 项目 token：分组、合并、拆分及快照',[
 'UK 按 cc 和 HK 分组，org 的 meta.fullName 经 of 才能替代 surface。registerFileEntities 按有效实体计数、接 jc canonical、迁移分组；detached 可阻止自动 alias。',
 'buildPseudonymEntriesForFile 用 original-key 文件 override ?? canonical override ?? 全局 custom ?? default；getTokenForFile 的 custom 分支使用 || default，空字符串语义不同。是否使用 custom 还受 customConsumers 控制。',
 'updateToken 预留 trim 后 token 但保存传入值，清理族内文件 override；merge/split/unmerge 更新 alias、计数和 undo。findTokenConflict 是查询助手，不能保证每条导入/快照链路强制调用。',
 'applySnapshot 清空再按 schema1 恢复 Map/Set 并重计数；这里不提供全部嵌套字段深验证，也不验证 alias 环。上游持久化 schema 验证另有边界。'],[('renderer',29836,30172)],['父级所有冲突确认、持久化 schema 与恢复生命周期未在本补充重审；已有 deep-ui-parents/deep-collaboration 报告只覆盖其明确范围。'])
add('RP05','DOCX/Markdown、PDF、图片预览的分组差异',[
 'DOCX/Markdown Ti2 对现有 canonical、缓存和 meta.fullName 逐一 of 验证，再使用 uf 正文定义；Ei2 按有效实体、类型顺序和首次出现编号、保留锁定项和旧零计数项并 jc.apply。',
 'PDF 按非删除实体及非删除页处理，使用 of(meta.fullName)，保持锁定、别名引用及 jc.apply。图片 A2/T2/E2 按 type/text 分组，没有同等 of/fullName 本地分组步骤；三者不能仅凭相同 token UI 认定策略相同。',
 'DOCX/Markdown selective 初始化中 Wp==mask 会转成 pseudonym；PDF/图片 action 使用 previous 或 Wp。该差异仅描述初始化分支，不推断用户最终动作。'],[('renderer',6973,7051),('renderer',24542,24589),('renderer',26190,26220)],['渲染布局及交互选择后所有状态组合未动态验证。'])
add('RP06','逐格式 renderer 导出消费和 IPC',[
 'Hp 选 auto/current；qp 将 mask 返回 null，partial_star 调 wd(cc(type),text)，full_star 按 Unicode code point 星号化。sr2 优先 projectPseudonymKeys，随后合格组织全称、restoreOriginal、surface；mh2 写 mixedAction/pseudonym 元数据。',
 '批量 lr2/ur2 按候选键查项目 token，selective 先走非假名动作；未解析项可触发主引擎补配。DOCX/Markdown 单份使用 Hp/sr2；PDF 同样处理，后续 PDF/DOCX/Markdown 多输出复用回执 matches 与 mapping-save 标记，各格式失败单独收集。',
 '图片单份 w4 只删空白，没有 A2 的全角括号规范化。非 selective 时，只要任一映射存在 b4=true，enablePseudonymization=false，即使部分或全部实际键未命中；未命中项保留 masked=*** 且无 pseudonym 标记。结合主进程图片分支，存在漏应用配置 token 而仅遮盖的静态风险。',
 'Gi2 结构化复制 matches/sourceRef/reviewSnapshot，经 preload 的 apply 原样 invoke；主 handler先授权，解构 enablePseudonymization、映射选项，禁用明文表导出。Xp2 处理请求回执和异常结果查询；取消覆盖不变量由独立报告负责。'],[('renderer',5314,5329),('renderer',32162,32238),('renderer',33470,33485),('renderer',36698,36729),('renderer',37237,37285),('renderer',37370,37391),('renderer',32063,32079),('renderer',33850,33866),('preload',171,171),('main',17409,17465)],['图片规范化漏配为源代码推导，未声称已动态复现；OCR实际文本、用户设置及有效bbox决定触发。'])
add('RP07','主进程 jr 的 token 及 alias 信任边界',[
 'Tr 新 token 依据类型计数并避开 reserved；jr 先预留所有显式 meta.pseudonym=true 且 masked.trim 非空项，再逐实体复用或生成。Or 对已有 key 只增 occurrences，不覆盖首 token；但显式实体仍保留自身 token，输入同 canonical 多 token 未统一拒绝。',
 'main 仅原始 type===org_name 的 fullName 只有满足 definedInDocument、abbrevAnchor 或 trusted source 条件，长度至少 max(surface.trim长度,6)、后缀与 Br 检查才用于 canonical。这比 renderer of/UK 的全称准入多了信任来源条件。',
 '因此 alias preview、主引擎补配和持久化映射可能依据不同规范化/可信度规则归并；本报告不把三者视为语义等价实现。'],[('main',2922,3105),('main',3123,3192)],['命名实体模型输出中的实际 meta 分布和跨文档预留 token 冲突未授权运行。'])
add('RP08','主处理各格式消费与失败边界',[
 'Markdown ap 对 default/custom_pseudonym 明确启用 jr，selective/default_star/full_star 明确不启用；默认/自定义假名模式必须全部匹配带 pseudonym 否则停止。LPM 保存失败在写文档前抛 MARKDOWN_MAPPING_SAVE_FAILED。',
 '图片、PDF、DOCX 的补配取决于 enablePseudonymization；图片已有部分 pseudonym 时绘制全部区域但仅带该标志的项绘 token，无任何标志时走普通遮盖。图片有效框和文本绘制由 applyMasksToImageWithPseudonyms 消费。',
 'PDF 经 secure writer，DOCX 将 masked/type/meta 和 pseudonym 描述传 Python；Markdown 最后以 masked 替换操作交 MarkdownSourceWriter。LPM 从假名项收集，mask/partial/full star 动作排除。底层像素、OOXML、Markdown映射算法使用先前独立处理报告界定。'],[('main',15675,15678),('main',17505,17553),('main',17634,17686),('main',6861,6885),('main',17796,17801)],['本补充未重新展开 D9V2C_Ir 全部 writer、PDF底层库、Pillow/font渲染；取消/回滚详见 export-cancel-invariants-20261014。'])
add('RP09','LPM 聚合和恢复消费',[
 'hm 先认 masked 中括号 token，随后 meta.pseudonym 字符串或 true+masked；pm 优先非全星 restoreOriginal，再 original/text。Mm 按 token 聚合不同原文 forms 并选择 canonical，不是遇到多个不同原文一律拒绝。',
 '混合星号动作排除；复合重叠 groups 使用 kd/Pd 的计划结果，存在局部组成冲突校验，不能外推为任意 token 全局唯一校验。同 token 聚合后仍无任何可用原文映射才抛错；单个空原文项会先跳过，另一同 token 实体可提供映射。保存输出 mappings/details/entityMap/occurrences 版本0.6。',
 'mf 持久化 .lpm 和索引，读回，失败尝试补偿；补偿本身仍可失败。pf 只检查根对象及 mappings 对象。本次仅跟随调用，不重新证明加密实现。',
 'Ad 从 mappings、details、occurrences、entityMap 收集原文，Nd 排序选规范值；当前函数未使用传入 restoreChoices，unresolved 为空。DOCX/Markdown restore handler调用Ad再交Rp/Td；inspect返回 ambiguities=[]。这不是人工消歧已完成的证据。'],[('main',16523,16631),('main',14199,14228),('main',15147,15263),('main',14159,14198),('main',18384,18427),('main',18473,18493)],['Rp/Td 下游所有定位/替换分支以 deep-formats 既有范围为准；本次未声明完整 LPM 互通运行或所有碰撞恢复正确。'])
add('RP10','半星号词表：相同内核与扩大组织策略',[
 'renderer fd/vd/gd/yd/bd 与 main It/St/Mt/Et/vt 五组有序数组完全相同，计数依次61/75/23/7/9；wd 与 Nt 对相同原始类型和输入的可见分支逐项对应。',
 'main An 使用 Mn101项组织后缀和 En179项前缀，比基础词表分别新增40/104且无删除。first-match顺序与regex前缀会影响命中，不能认为新增词必然生效。An 在 OfficialLetterStrategy 等检测结果 masked 的实际生成位置被调用。',
 'wd/Nt 姓名取 charAt(0) 但余长按展开字符串计数；其他默认星号分支按 UTF16长度，qp full_star 按 code point。电话号码、证件、组织、地址等分支不可用统一固定比例星号替代。',
 '原始 wd/Nt 对应不代表 partial_star 链等价，因为 qp 先 cc；如 landline 会变 phone、passport变id_card、bank_account落other。'],[('renderer',4792,4867),('main',1223,1298),('main',2241,2285),('renderer',5314,5329)],['实体识别的全部 An 调用上下文不在本补充覆盖；已确认至少 OfficialLetterStrategy 有真实消费，模型准确度仍R0。'])
def literal(source,name):
 m=re.search(r'\b'+name+r' = (?:/\* @__PURE__ \*/ new Set\()?(\[(?:"(?:[^"\\]|\\.)*"(?:, )?)*\])',texts[source]); assert m,name
 return json.loads(m[1])
arrays={name:literal(source,name) for source,names in [('renderer',['fd','vd','gd','yd','bd']),('main',['It','St','Mt','Et','vt','Mn','En'])] for name in names}
pairs=[]
for left,right,size in [('fd','It',61),('vd','St',75),('gd','Mt',23),('yd','Et',7),('bd','vt',9)]:
 assert arrays[left]==arrays[right] and len(arrays[left])==size
 pairs.append({'renderer':left,'main':right,'count':size,'orderedEqual':True})
diffs=[]
for base,expanded,size,added in [('It','Mn',101,40),('St','En',179,104)]:
 new=[x for x in arrays[expanded] if x not in arrays[base]]; removed=[x for x in arrays[base] if x not in arrays[expanded]]
 assert len(arrays[expanded])==size and len(new)==added and not removed
 diffs.append({'base':base,'expanded':expanded,'addedInExpandedOrder':new,'removed':removed})
report={'schemaVersion':1,'date':'2026-10-14','title':'Renderer/main 组织策略与 canonical/token/LPM 消费依赖补读','scopeIds':['DEP30','DEP40'],'status':'S2','runtime':'R0','candidateS3':False,'method':'人工逐分支静态阅读；Python仅解析字符串字面量和哈希，不导入/执行竞品代码。源码范围并不等于全部运行链闭合。','sections':sections,'literalEvidence':{'arrays':arrays,'equalPairs':pairs,'expandedDifferences':diffs},'staticExamples':[{'input':'蓝天职业技术学校','wd_Nt':'蓝天**学校','An':'**职业技术学校','qualification':'按可见first-match和严格fallback长度条件手工推导，未执行目标函数'},{'input':'中储粮甲有限公司','wd_Nt':'中储**有限公司','An':'中储粮**有限公司','qualification':'按词表和fallback手工推导，未执行目标函数'}],'remainingReadableBoundaries':['jc.set 的所有外部调用与全部继承文件 schema 验证路径；本次读取 jc 本体及所列消费入口，不声称上游全闭合。','YK.applySnapshot 上游所有深验证与所有 findTokenConflict 调用分支。','D9V2C_Ir writer、Rp/Td 恢复和 planReviewedTextEdits 未在本补充重新全展开，须结合旧报告具体范围而非函数名合并。'],'runtimeBoundaries':['授权产品实际导出、中文字体像素/OOXML/Markdown一致性、跨格式LPM互通与冲突语料全部未执行。']}
report['evidenceCount']=sum(len(s['evidence']) for s in sections)
md=['# '+report['title'],'','- 固定依赖：DEP30、DEP40；全部 **S2 / R0**，无 S3 候选。','- '+report['method'],f'- {len(sections)} 节，{report["evidenceCount"]} 个精确源码范围。','']
for s in sections:
 md += ['## '+s['id']+' '+s['title'],'']+['- '+x for x in s['claims']]+['','证据：']+['- `'+e['path']+f':{e["startLine"]}–{e["endLine"]}`；range SHA256 `'+e['rangeSha256']+'`' for e in s['evidence']]+['','剩余边界：']+['- '+x for x in s['remaining']]+['']
md+=['## 精确词表与静态示例','','完整数组、顺序比较及新增词见配套JSON literalEvidence。以下仅源码手工推导：','']+['- '+x['input']+'：wd/Nt → '+x['wd_Nt']+'；An → '+x['An']+'。' for x in report['staticExamples']]+['','## 明确仍未覆盖的边界','']+['- '+x for x in report['remainingReadableBoundaries']+report['runtimeBoundaries']]+['']
outputs={OUT/'renderer-policy-dependencies-20261014.json':json.dumps(report,ensure_ascii=False,indent=2)+'\n',OUT/'renderer-policy-dependencies-20261014.md':'\n'.join(md)}
if '--check' in sys.argv:
 for p,content in outputs.items(): assert p.read_text()==content, str(p)
 print(json.dumps({'ok':True,'scopeIds':report['scopeIds'],'sections':len(sections),'ranges':report['evidenceCount'],'orderedArrayComparisons':5},ensure_ascii=False))
else:
 for p,content in outputs.items():p.write_text(content)
 print('generated',len(sections),'sections',report['evidenceCount'],'ranges')
