#!/usr/bin/env python3
"""Rebuild evidence metadata only; never imports or executes competitor code."""
import json,hashlib,collections,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
P=ROOT/'文档/逆向台账/contracts'; MAIN='.data/research/lawbot-2026-10-13/readable/main.js'
PYDOC='.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/restore_pseudonym_docx.py'
CHUNK='.data/research/lawbot-2026-10-13/manual-collaboration-evidence/'
def sha(b):return hashlib.sha256(b).hexdigest()
def ev(path,a,b):
 data=(ROOT/path).read_bytes();lines=data.splitlines(keepends=True)
 assert 1<=a<=b<=len(lines),(path,a,b,len(lines))
 return dict(path=path,startLine=a,endLine=b,coordinateSystem='1-based inclusive lines; slice includes original line terminators',fileSha256=sha(data),sliceSha256=sha(b''.join(lines[a-1:b])))
modules=[]
def mod(id,title,ranges,logic,effects,recovery,unknown,closed=False,extra=[]):
 modules.append(dict(id=id,title=title,implementationEvidence=[ev(MAIN,*r) for r in ranges]+[ev(*r) for r in extra],inputOutputAndBranches=logic,persistence=effects,failureRecovery=recovery,remainingUnknown=unknown,localStaticClosureCandidate=closed))
mod('secure','安全容器与受保护对象',[(14846,15145)],
 ['LBTSC001 前8字节；固定16字节前缀+65536字节头预留；JSON头格式 lawbot-secure-container/version1/AES-256-GCM/chunkSize4194304；文件长度65552+plaintextLength+28*chunkCount。','32字节DEK，12字节nonce+16字节tag；头部canonical JSON AAD认证，块AAD绑定format/version/objectType/objectId/index/明文长度；范围单次<=64MiB。','df要求对象类型/可选objectId一致且唯一local-cmk槽；普通读必须解锁，protected-write走专用CMK访问；readBuffer默认256MiB，LPM64MiB，index16MiB。'],
 ['cf以wx创建随机临时文件，逐块加密，写头，文件sync；只自读首尾字节后rename，3次重试。df每次写新DEK，finally清零。','读取逐块GCM认证；close清零key；流end/close/error关闭底层reader。'],
 ['失败关闭handle、best-effort删除tmp、清零key；没有目录fsync；首尾自检不能称全文件内容复核。'],['密钥层/native safeStorage运行、磁盘断电/rename跨平台行为未验证；本报告不绕过身份验证。'])
mod('lpm','LPM假名表及索引事务',[(15146,15266),(16586,16635)],
 ['pf只检查根object/mappings object；保存提取映射key为approvedTokens；记录UUID.lpm、schemaVersion1 index.lsi。','list按ts倒序，handler将project范围同名记录只保留首项；readByPath只接受root直接子路径.lpm及36字符hex/hyphen ID。','approvedTokens读取要求1..5000项且每项非空<=256字符；保存时本身未对5000上限约束。','旧JSON迁移逐文件，legacyMigrationSourceName用于幂等辨认，读取已有新表后才删旧文件；各失败单独汇总。'],
 ['先写新LPM，再读索引追加并写index，再完整readForProtectedWrite验证表。','Mm排除mask/partial_star/full_star，从实体/forms/occurrences构造canonical映射；组合token对应不同原文或缺原文则停止导出。'],
 ['索引提交后readback失败：尝试删索引行，再删LPM；补偿均可能失败，非跨文件原子事务。索引访问任何错误被初始access catch当不存在，后续read错误另报损坏。'],['Mm调用的实体格式化kr/Ar/Fr及文本重叠计划planReviewedTextEdits需引擎专项交叉引用；身份密钥层运行未验。'])
mod('restore','DOCX/MD恢复与能力边界',[(17,45),(13199,13245),(14159,14263),(16241,16267),(18342,18535)],
 ['sender绑定15分钟一次性token；inspect消费token、读LPM后返回新token/ambiguities:[]；restoreChoices传入Ad但未使用。','Ad汇总mappings/details/forms/occurrences/entityMap，Nd按无空白、全角比例、无标点、长度排序选择单一原文，策略token-canonical；并非让用户消歧。','实际选择器只支持doc/docx/wps/md/markdown；无PDF恢复handler。PDF像素遮盖不能由这组API恢复。','MD生成原token/Markdown转义/HTML实体三套替换表，长token先，单次正则替换；stats.residual_tokens与tokens_not_in_mapping固定[]。','DOCX Python从stdin读mapping；支持新mappings/旧details/数组；主进程120秒超时SIGTERM，取stdout最后一行JSON；结果不因exit非零必然失败，只要末行JSON可解析。','DOCX脚本按XML顺序遍历正文/嵌套表/文本框，唯一默认/首页/偶数页页眉页脚，跨run保首run格式；email/URL重建超链接；脚注/尾注/批注及删除修订delText直接XML替换；兼容token内空白。','DOCX只有预扫描；residual_tokens和tokens_not_in_mapping初始化[]后从未复扫更新。0替换为成功，input!=output时复制原字节。','DOC/WPS先导入为DOCX、恢复、按原扩展输出并转换验证；非DOCX/legacy直接unsupported。'],
 ['DOCX doc.save直接写目标，notes改写到.notes.tmp后os.replace。MD单文件直接writeFile；MD批量以wx原子占名，_2.._9999。','DOCX batch采用stat+进程内Set占名，存在跨进程TOCTOU窗口；逐文件成功保留，失败删除该输出，整体可partial:false/true。'],
 ['单DOCX处理失败可能留下已写目标；页眉页脚异常只warning而继续；notes失败清临时文件但不恢复doc.save前目标；legacy temp目录finally删。','MD批量写失败close+删新文件；单文件无回滚。batch残留总表也固定[]。'],['DOCX python-docx/lxml/Office/LibreOffice跨版本保真需正版运行；不能据源码断言所有OOXML区域均保留。','Iu.checkDependency/getPythonSpecForDocx与legacyOfficeService转换实现需处理引擎专项闭合。'],extra=[(PYDOC,1,897)])
mod('rules','规则集校验、CRUD、迁移与Excel',[(14264,14447),(25796,25927)],
 ['schemaVersion1；source system/user/migrated；kind forceDetect/forceSkip；schema可接受contains/materialTypes，但validate保存强制description空、适用all、matchMode exact。','entry key=entityType+NUL+normalizedPattern+NUL+matchMode；normalized=trim+空白压成一个空格。相同kind重复报DUPLICATE，反向kind报CONFLICT；名称按zh-CN小写去边空去重。','旧dictionary whitelist→forceDetect、blacklist→forceSkip；同键冲突保forceSkip；backup/conflicts文件；迁移默认不启用；migrationVersion置1。','初始化normalizeStored逐表将contains/适用范围改all/exact，冲突保forceSkip，revision+1；每表异常吞掉。','create写表再index；update只改表且要求revision一致/非readonly；delete先删表再index，active删除重置；system_empty不能激活。','importExcel只读sheet1/sharedStrings；A内容B类型C黑白D启用（旧D匹配表则E启用），返回preview clean/conflicts/errors，不直接持久化；文件内重复与相反均报错。','export写两sheet（名单及信息），inlineStr；template三列样例与下拉，取消均success/data:null；previewPromotion只分accepted/duplicates/conflicts，不写。'],
 ['userData/rulesets/id.json和index.json，perfile临时+rename；无全局锁、fsync、多文件事务。'],
 ['写失败可能遗留tmp；create/delete迁移跨文件失败无统一回滚；normalize吞错所以initialize成功不代表每表已升级。'],['Excel ZIP/XML第三方库边界及OS对话框/文件系统故障需运行验证。'],True)
mod('profile','方案与偏好迁移',[(18928,18974),(25928,26081),(26881,26932)],
 ['固定system-default；schema1，非空去重enabledEntityTypeIds，动作mask/pseudonym/partial_star/full_star，docx/pdf/image/batch结构检查；不把配置支持等同像素处理支持。','旧case_number自动补cert_no并记preference；缺markdown补batch默认；default_pseudonym→custom_pseudonym；party_slots强制standard且selective降default_star；移除signature（空则恢复默认类型）。','create/duplicate复制系统或用户方案，随机ID；update仅userIds内用户方案，保createdAt，无revision冲突检查。default不可删；其他system以hiddenSystemIds隐藏。','preferences:set-default要求exists；record-successful-export仅检查state.kind==kind，然后保存调用者state，不验证是否真的导出。','初始化丢弃读坏的userIds；失效default回system-default；返回deep JSON clone。'],
 ['profiles/items/id.json、index.json、preferences.json；create/update/delete/default按多文件顺序写。'],
 ['writeJsonAtomic first rename失败会rm原目标再rename，因此不能称严格保留旧文件；无补偿、目录fsync、并发修订控制。初始化读错被吞并重建索引状态。'],['系统safeStorage不涉及本组方案文件；OS写故障和并发行为未运行。'],True)
mod('feedback','反馈、旧词典共享持久化',[(13332,13485),(18091,18178),(18535,18666),(16789,16878)],
 ['单例Mu：feedbacks按id，memories按rule_type:entity_type:pattern。batch仅FP→false_positive，其余→false_negative；documentName回退字段；不自动updateMemoryFromFeedback。','用户词典confidence1、100年expires、source user_dictionary；重复添加把旧memory升用户词典；import仅加入原key不存在项，不升级已有自动memory。','旧词典whitelist强制识别、blacklist跳过，与新UI的黑/白命名不同；当前renderer无这些旧API调用不意味着缺12页面。','hint同action/entity/pattern第2次且全局未提示才shouldPrompt；clear清feedback+memory+hint，不清deprecated archives。','getAllMemories删除过期非用户条目，仅内存删；query文档名小写精确，stats/delete文档名区分大小写；report以ISO字符串时间过滤前1000条，byDocument前20、detail仅<=50。','JSON文件选择只解析entries或数组；Excel导入第一sheet、去重同rule/type/pattern并报反向冲突；旧模板属性下拉固定A1:A14但D2类型已有18项。'],
 ['feedback_json.dat同步直接writeFile；默认encrypt:true但无encryption_key则明文JSON；只有传key才SHA256(key)循环XOR再base64，并非安全容器。','addFeedbackBatch先save再addAuditLog，batch审计延后到后续save才落盘；export()添加审计但不save。'],
 ['内存先变更再写失败，无rollback；load异常吞掉；delete-by-document逐条save可部分删除；报告写文件直接覆盖无回滚。'],['外部fs/ZIP/XML/许可getStatus与assertActivated运行未验；报告license gate为显式边界。'],True,extra=[(CHUNK+'DK2pJCiu.js',12,40)])
mod('review','旧审核导出与伪证明字段',[(18778,18922)],
 ['review与feedback共用Mu。Dm导出csv/json/jsonl；exportProofLite jsonl首行metadata后feedback/memory；rulesetHash混入小时，非稳定规则版本hash。','network_out_bytes固定0，includeAuditLogs没有对应输出实现；不能把报告称网络测量证据。','review:export-* handler将服务整个{success,filePath,...}对象塞进外层filePath，并无条件outer success:true，服务返回success:false也被包成成功。','CSV只部分字段转义（entity_text/context/note），file_name等直接join；按源码记录，不推断符合完整CSV或防公式规范。'],
 ['默认userData/exports目录constructor mkdir；自定义outputDir不自动mkdir；writeFileSync直接落地后stat；exportAll Promise.all各自结果。'],
 ['服务catch转success:false，handler外层不传播；无文件回滚。','ce公共包装在macOS调用TaskPowerLeases；blocker.start/stop及背景节流API抛错可越过业务handler catch，finally异常可覆盖原业务异常。'],['外部文件系统与消费者如何解释嵌套结果需运行验证。'],True,extra=[(MAIN,14,26),('.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js',2178,2188)])
mod('learner','已下线学习接口与残留实现',[(18179,18186)],
 ['6个handler为常量：高置信count全0；update-rules success/stats:null/hash空；get-snapshots []；3种rollback失败固定提示。','只有get-stats lazy require Cw24Yh6r，创建snapshot目录/读取snapshot_history，返回stats clone。','chunk中updateRules、applyToStrategy、snapshot/rollback实现仍存在，但IPC不会调用；不能误判对用户提供自动训练能力。','残留规则hash含ISO当前时间；snapshot保10条；saveLearnedRules/history写错被吞；get-stats可返回上次hash但total_updates/rollback_count初始化0。'],
 ['get-stats构造器mkdir并读历史；6常量handler无存储副作用。'],['get-stats import/读目录错误转success:false；load历史JSON错误吞。'],['有效许可运行未做；常量语义不依赖外部服务。'],True,extra=[(CHUNK+'Cw24Yh6r.js',12,95)])
mod('workspace-schema','工作区快照、旧ZIP与沿用审查规则',[(19156,19568),(20092,20203)],
 ['snapshotV1只docx/pdf/image，V2增加Markdown sidecar/UTF16 offset与来源hash、blockers、实体anchor范围；cg转换schema字段并复制。','旧裸ZIP .tmm的manifest schema1或2，不等于secure TMM V2/V3；旧writer写schema2，readV2方法名也不代表安全容器版本。','旧ZIP entry<=2000/单entry256MiB/总1GiB；路径穿越/重复拒绝，manifest2所有非manifest条目必须checksum，所有声明sha256逐项核验；Markdown重新parse sidecar精确JSON一致。','旧ZIP write容量溢出抛WORKSPACE_V1_REQUIRES_V2，外层切secure保存。','ey沿用审查：类型key归一化、mergedInto映射，当前文档mapping优先继承，返回multiple-values冲突；高风险短词/数字/泛称不自动forceDetect，用户显式仍可；forceDetect优先同组forceSkip，导入修正可覆盖非显式相反项。'],
 ['旧ZIP聚合全内存、临时wx+sync+rename3次；recents受保护索引最多20条，访问不到路径移除。'],
 ['recents读保护失败可回退旧JSON，最终空索引，后续remember可能覆盖；旧ZIP失败清tmp；不承诺断电恢复。'],['MarkdownInputAdapter具体语法与所有legacy snapshot review schema子验证器需引擎/审查专项交叉闭合。'])
mod('tmm-v2','安全TMM V2写读与V1迁移',[(24460,24742),(25081,25188)],
 ['v2 manifest/indexschema2，固定project七entry；doc source STORE，meta/state JSON，OCR segment JSONL。10k文档/100kentry/4GiB source/32GiB total/64MiB JSON/100页16MiB OCR段/8MiB OCR行/zip ratio200。','严格entry路径、重复ID、未声明项、counts/activeId/manifestobjectId匹配；Tx open只读目录和manifest/index；source/state/OCR读取按需再认证解析。','vx写archive→cf(.v2tmp)→Tx.open验projectID/doccount→beforeReplace→rename（10次对指定锁错误退避）；并未全量读每个source/state。','R_迁移要求源目标不同.tmm，只支持旧manifest.schemaVersion1；流式读取workspace与sources校验checksum，额外声明entry也校验，tg验snapshot，vx写新文件。旧裸ZIPschema2可普通打开，但该迁移入口拒绝schema2。'],
 ['原目标到最终rename前保留；source provider只在归档流被消费时读取。'],
 ['abort archiver/等待cf/删除v2tmp；迁移finally关zip。初始源目标用lowercase比较，POSIX也拒仅大小写差异。'],['archiver/yauzl/stream库异常调度、跨进程写竞争/崩溃未运行。V2格式/实现不等于具备V3全payload验证。'])
mod('tmm-v3','V3分段、加密暂存、磁盘索引、写后复核',[(20528,20818),(20819,21558),(21559,22064),(22065,22415)],
 ['shell/base/payload/collections分离；4MiB payload块，JSON或UTF8字符串（逻辑范围为UTF16），每块sha256；segment JSONL <=20000项/8MiB，一项<=8MiB。声明文档source8GiB、总128GiB、payload16GiB、25万entry、ratio4096；外层cf仍总明文32GiB，因此不能宣称整个文件可实际保存128GiB。','Qy串行JSON拒BigInt/循环，unsupported数组值null/对象值省略；payload临时AES256GCM随机32key，nonce/tag/AADentry，清buffer。Hy直接filehandle.write未循环处理short write；最终读取认证失败能中止归档。','db把namespace/key映射HMAC排序键；有限run外排序，fanin<=8；bucket加密AAD文件名，sha/count/bytes/排序验证；LRU清零；query分页/结果bytes上限。','db.putMany先写新bucket，commitState成功才切files/retire旧文件；失败删新bucket；snapshot lease活跃时不删retired；close遇lease busy失败，dispose先close再删root。','lazy/partial必须fallback来源fileKind/fileName/projectId一致；未同步overlay/双权威/mergeSnapshotEntries/fileOverrideEntries分支拒保存；删除优先于upsert，重建索引，指纹相同可重用lookup。','Lb预估容量+5%+64MiB，statfs失败跳过检查。Fb写v3tmp后Yb.verifyAllEntries：segment SHA/计数、payloadSHA、lookupSHA，其他条目stream长度；再beforeReplace/rename3次。','Yb读全量或defer collections/payload；source range/JSON/段范围检查。Kb版本探测finally关闭zip/random/secure，openTransferCopy的两次open无遗漏probe关闭。'],
 ['加密payload暂存目录和db临时索引目录；snapshot lease保旧bucket；最终TMM文件是加密ZIP。'],
 ['Fb所有分支finally清payloadkey/tmp/租约；清理错误吞。cf32GiB总上限会在V3较高声明限内先失败；未出现全局跨文件原子恢复。'],['JSON streaming parser bundled实现与Node/libs边界未逐第三方内部审计；运行/崩溃、超大数据、第三方压缩库兼容未验证。'])
mod('workspace-lifecycle','保存回执、来源注册、恢复与传输入口',[(19861,20091),(22416,22694),(25190,25346),(25585,25784)],
 ['save请求projectId/revision必须等snapshot；requestId去重且sender必须同，Map仅内存回执，最多100/1小时淘汰逻辑；rI仅active计数，不是互斥锁。','saveV2 sources优先inline→旧archive→registry；原路径裸ZIP要求另存，V2升级V3要求另存；beforeReplace释放旧sourceRefs/关reader；保存后重新打开注册sources。','nw.openReader V3 verifyAllEntries后hydrate/count校验，未完成disk project状态拒绝；V2hydrate state/OCR后schema校验。registerSources在provider close引用计数归零关reader；失败释放已注册refs。','恢复snapshot/source分别.lrs，版本schema2；inline源指纹仅长度+前后64KiB，sourceRef指纹id+size，不是完整内容hash；相同指纹复用source文件。保存先各source再snapshot再删多余源/prune20。','旧revision直接stale=true；同revision可写；beginSession记录上一未清会话；提示包括上一异常session及PDF OCR incomplete。锁定记录以匿名占位列出。','恢复open对source长度检查，MD<=16MiB重parse sidecar，其他类型源流实际读取时再GCM认证；discard先释放refs写.discarded再尽力删目录。','create-transfer源已保存workspace，经openCompatible检格式，随机密码SCRYPT包装新DEK，cf写tmm-transfer。receive-transfer IPC仅打开transfer并注册临时sourceRefs，没有直接调用receiveTransferCopy写新本地副本；后续另存才本机化。','V_.receiveTransferCopy是服务方法而非本IPC可达分支；openTransferCopy probe后重开；新source provider持有reader直到release。'],
 ['save正式文件成功后recents失败吞；重新打开/注册失败仍可能正式文件已替换。recovery多文件非事务；session marker明文小JSON0600。'],
 ['同路径保存beforeReplace已释放旧refs后rename失败，旧文件仍在但旧来源句柄不自动恢复。recovery写source后snapshot失败可留下新source/旧snapshot组合；discard删不了保marker供下次清理。','transfer cf已rename后selfcheck失败没有删除target；password和派生key finally清零；回执进程重启丢失，missing不能证明未保存。'],['sourceRegistry实现/全部provider所有权及全局renderer保存生命周期需会话/来源专项；密钥层/native认证未在此独立审完，保持外部边界。'])

idx=json.loads((P/'ipc-contract-index.json').read_text())['channels']
selected=[x for x in idx if x['channel'].split(':')[0] in ['pseudonym','workspace','ruleset','profile','preference','dictionary','feedback','review','learner']]
assert len(selected)==88
families=json.loads((P/'manual-collaboration-contracts.json').read_text())['families']
prior={}
for fn,key in [('manual-workflow-contracts.json','contracts'),('manual-collaboration-contracts.json','interfaces'),('manual-system-contracts.json','contracts')]:
 for x in json.loads((P/fn).read_text())[key]:prior[x['channel']]=(fn,x)
ui={}
for fn in ['ui-closure-a.json','ui-closure-b.json']:
 d=json.loads((P/fn).read_text())
 for v in d.values():
  if isinstance(v,list):
   for x in v:
    if isinstance(x,dict) and 'channel' in x:ui[x['channel']]=x
mapmods={'dictionary':['feedback'],'feedback':['feedback'],'review':['feedback','review'],'ruleset':['rules'],'profile':['profile'],'preference':['profile'],'learner':['learner'],'pseudonym':['secure','lpm','restore'],'workspace':['secure','workspace-schema','tmm-v2','tmm-v3','workspace-lifecycle']}
constants={'learner:get-high-confidence-memory-count','learner:get-snapshots','learner:update-rules','learner:rollback','learner:rollback-previous','learner:rollback-to-previous'}
interfaces=[]
for x in selected:
 ch=x['channel'];fn,p=prior[ch]; mods=mapmods[ch.split(':')[0]]
 isconstant=ch in constants
 family=families.get(ch.split(':')[0],{})
 interfaces.append(dict(id=x['id'],channel=ch,input=p.get('input_contract',p.get('inputAndFiltering',p.get('input'))),output=p.get('success_contract',p.get('outputContract',p.get('returns'))),previousManualContract=dict(path='文档/逆向台账/contracts/'+fn,channel=ch,scope='先前逐handler记录，deepModuleRefs为本轮递归展开与纠错'),priorBranchSummary=p.get('semantic_observation',p.get('persistentAndMemoryEffects',p.get('effects'))),priorFailureSummary=p.get('failureAndCancellation',p.get('failures',family.get('errors','见handlerEvidence返回/throw及deepModuleRefs'))),effects=p.get('persistentAndMemoryEffects',p.get('effects',family.get('store','见deepModuleRefs.persistence'))),preconditions=p.get('preconditions',family.get('gate','见handlerEvidence')),rendererEntry=ui.get(ch,{}).get('trigger','见已有manual/UI闭合台账'),rendererEvidence=ui.get(ch,{}).get('rendererEvidence',[]),deepModuleRefs=mods,handlerEvidence=[{**h['evidence'],'fileSha256':sha((ROOT/h['evidence']['path']).read_bytes()),'coordinateSystem':'UTF16 offsets [start,end)'} for h in x['handlers']],preloadExposures=x['preloadExposures'],eventEvidence=x['eventEmissions'],staticClosureCandidate='literal-handler-closed' if isconstant else 'reviewed-application-boundary-candidate' if ch.split(':')[0] in ['dictionary','feedback','review','ruleset','profile','preference','learner'] else 'deepened-with-open-project-dependencies',runtimeState='R0',completeBusinessContract=False,remainingUnknown=['未持有正版激活，未执行竞品处理链。']+([] if isconstant else ['参见deepModuleRefs.remainingUnknown；依赖边界不是删除待核项的理由。']),uiClassification=ui.get(ch,{}).get('entryDisposition',ui.get(ch,{}).get('classification','use-existing-ui-ledger'))))
# Pin expected scope in generated artifact; checker independently compares with namespace-filtered source inventory.
report=dict(schemaVersion=1,date='2026-10-14',referenceVersion='0.5.9 public distribution',mode='static inspection only; no competitor execution; no license bypass',scopeNamespaces=list(mapmods),scopeCount=len(interfaces),summary=dict(interfaces=88,literalHandlerClosedCandidates=6,reviewedApplicationBoundaryCandidates=sum(x['staticClosureCandidate']=='reviewed-application-boundary-candidate' for x in interfaces),deepenedWithOpenProjectDependencies=sum(x['staticClosureCandidate']=='deepened-with-open-project-dependencies' for x in interfaces),runtimeVerified=0,completeBusinessContracts=0),interpretation=['公开发布包静态可见实现，不等于原始开发仓库、云端源码或原产品成功运行。','接口输入输出继承已人工逐handler契约，本轮模块段递归补全格式/分支/失败恢复并纠正夸大表述。','71无renderer引用是历史暴露/程序或通知入口的分类，不是我方缺71个页面。','6常量handler真静态闭合；其余候选只表示到声明外部边界已阅读，须独立审查后才能提级，不能自动修改ledger。'],modules=modules,interfaces=interfaces)
def output():
 lines=['# 0.5.9 格式、持久化与规则递归分析（2026-10-14）','',f"本组 **88 个 IPC**：6 个常量 handler 静态闭合候选、{report['summary']['reviewedApplicationBoundaryCandidates']} 个应用边界候选、{report['summary']['deepenedWithOpenProjectDependencies']} 个仍有项目依赖的深化项。竞品运行验证 **0**，完整业务契约 **0**。",'',*['- '+x for x in report['interpretation']],'']
 for m in modules:
  lines+=['## '+m['id']+' — '+m['title'],'','### 输入、输出与分支','',*['- '+x for x in m['inputOutputAndBranches']],'','### 持久化与失败恢复','',*['- '+x for x in m['persistence']+m['failureRecovery']],'','### 仍未知','',*['- '+x for x in m['remainingUnknown']],'','### 源码定位','']
  for e in m['implementationEvidence']:lines+=['- `'+e['path']+f"` L{e['startLine']}–L{e['endLine']}；file SHA256 `{e['fileSha256']}`；slice `{e['sliceSha256']}`。"]
  lines+=['']
 lines+=['## 逐接口索引','','每项输入输出、原 handler 的 UTF16 精确范围与 hash、preload、事件、旧契约出处及新增模块关联均在同名 JSON。以下不把“实现有缺陷”误写成“没有实现”。','','|接口|本轮深读模块|候选状态|','|---|---|---|']
 for x in interfaces:lines+=['|'+x['channel']+'|'+', '.join(x['deepModuleRefs'])+'|'+x['staticClosureCandidate']+'|']
 lines+=['','## 复核方式','','`python3 文档/逆向台账/contracts/build-deep-formats-20261014.py --check` 只读取文件与重建记录，不执行发布包。line slice 包含原换行；raw handler 使用 UTF16 offset。校验器验证集合、分类和源码hash，不是自然语言语义正确性证明；语义仍需独立审查。外部依赖、动态认证、跨进程并发、断电及许可运行仍需单独验收。','']
 return json.dumps(report,ensure_ascii=False,indent=2)+'\n','\n'.join(lines)
a,b=output()
for suffix,data in [('.json',a),('.md',b)]:
 path=P/('deep-formats-20261014'+suffix)
 if '--check' in sys.argv:assert path.read_text()==data,str(path)+' differs'
 else:path.write_text(data)
print(json.dumps(report['summary'],ensure_ascii=False))
