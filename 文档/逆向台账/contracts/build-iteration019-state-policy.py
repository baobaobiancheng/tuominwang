#!/usr/bin/env python3
# coding: utf-8
"""ITER019 evidence compiler; lexes source text only. Never executes vendor code."""
from pathlib import Path
import json,re,hashlib,sys
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parent
P={'r':R/'.data/research/lawbot-2026-10-13/readable/renderer.js','m':R/'.data/research/lawbot-2026-10-13/readable/main.js','py':R/'.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/restore_pseudonym_docx.py'}
H=lambda b:hashlib.sha256(b).hexdigest();T={k:p.read_text() for k,p in P.items()}
assert H(P['r'].read_bytes())=='4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc'
assert H(P['m'].read_bytes())=='40542891ebcf0f880ff19f8232430b0d3cf49f5b2808b87591281ef9e0d621ba'
S=[]
def add(id,dep,title,claims,ranges,boundary):
 es=[]
 for k,a,b in ranges:
  ls=T[k].splitlines(keepends=True);assert 1<=a<=b<=len(ls)
  es.append({'path':str(P[k].relative_to(R)),'startLine':a,'endLine':b,'fileSha256':H(P[k].read_bytes()),'sliceSha256':H(''.join(ls[a-1:b]).encode())})
 S.append({'id':id,'dependency':dep,'title':title,'status':'S2','runtime':'R0','claims':claims,'evidence':es,'boundary':boundary})
add('SP01','DEP18','eV/Jm OCR进度所有字段与复制差分',[
 'renderer eV 内嵌校验器与main Jm在局部标识符映射后667个词法token完全相等；逐字段表见ocrProgressFieldMatrix。只比较这两个校验器，不证明完整workspace V1/V2 schema相同。',
 '两端 object 排除null和array但不检查prototype；schemaVersion===1，status限incomplete/complete，totalPages有限正整数；controlState先String再枚举，所以不另做原始string类型门。mode严格字符串分支。',
 'target/completed允许重复及乱序，彼此无子集约束；status complete不强制覆盖全部目标。repeatedImageGroups只要求组内页号唯一、id全组唯一，不拒不同组覆盖同页；updatedAt只string，不验证日期。',
 'eV与Xm都复制已知字段、丢弃未知字段；空repeatedImageGroups省略；target空数组仍保留；只有truthy controlState/mode被复制。重复/排序/coverage应由下游处理，不由schema保证。'],[('r',30502,30567),('m',18988,19007),('m',19024,19067)],'本小边界静态闭合：所有声明字段、原始类型门、嵌套组与复制。R0未执行畸形输入或恢复。')
add('SP02','DEP18','重开到批量/单份恢复的分流',[
 'Nd2先检查至少一文档，await旧任务清理后jc.set、profile。多文档或单DOCX recognitionProgress存在且非complete进入批量；逐文档Pd2，缺buffer/ref或不支持即clear失败；Nn2后释放非活动buffer。',
 '批量先写文件/文档数组再Ne2.applySnapshot；旧sharedMapping无default/custom字段时采用legacy custom迁移；fileOverrides无customConsumers则迁移消费关系，随后统一模式Um2。若有queued，增go2代际，启动Om2但不await。',
 '单PDF等待applyReviewDraft后触发Ed2但不await并返回true；单DOCX applyReviewDraft也无await。单Markdown源码fatal UTF8解码及sidecar坐标重建；单Image设置数据URL/框草稿。重开返回true仅表明该分支完成同步/已await步骤，不能认定续识别或所有子视图渲染完成。',
 'CV把user-cancel映射canceled，paused/skipped优先ready，其次recognition非complete且OCR非complete才queued。MV在ready且有页数且无target字段且非paused/skipped时推导全页完成，非逐页OCR结果证明。'],[('r',33248,33332),('r',30705,30729),('r',30154,30172)],'Pd2/WU/qU/lV/cV/bV及Nu2已有ITER018具体证据；此轮闭合Nd2分流和可见等待边界，不重算渲染几何/第三方组件。')
add('SP03','DEP18','Ed2→kd2恢复单份OCR及失效回执',[
 'Ed2只接PDF+PDFreview，recognition complete直接返回；既非scanned又无pdfOcrProgress则返回；paused/skipped不自动续跑。页数无有效保存值时最多约5秒、50ms轮询视图页数；此轮询不带项目代际检查。',
 'Ed2将保存completed与全部ocrCachePages页号合并去重，并以target非空数组或全页作为目标，空target会回退全页；覆盖即标complete，否则await kd2。这里缓存存在被当成完成，没有检查缓存文字非空或源hash。',
 'kd2生成新request，重装page listener；page回调比较当前pa2、可选request和filename，逐页保存OCR/缓存/实体，保留人工修订。最终回执合并completed并剔除failures，更新complete/paused和保存。',
 'kd2 await detectOnly回来后没有统一pa2/项目代际检查；finally只在同request时清pa2，却无条件清Gn2并调用当时全局ba2。静态存在旧回执写入新状态/误解绑后续监听条件；运行可达性未复现。'],[('r',33222,33247),('r',33040,33128),('r',32511,32525),('r',4245,4254)],'本轮补齐Ed2/kd2直接控制流。bO/bb/Qi2/Ji2实体保留与审查合并由既有UI报告界定；检测模型与时序R0。')
add('SP04','DEP18','Om2队列和Dm2递归处理',[
 'Om2遇yo2或xo2直接返回，实际worker数量1。bm2先取优先队列中的queued或可续跑paused/skipped PDF，再取首queued；wm2检查同类待处理项。循环限当前go2代际且无xo2。',
 'Dm2先检查代际/文档仍在，装协作profile/ruleset，取规则与源buffer；PDF只有已有target且剩余页非空才增量续跑，否则重置OCR缓存/完成页/模式。page监听和最终回执均检查代际/文档存在；Wn2返回STOP_UNCONFIRMED时记录xo2阻止下一个任务。',
 'Dm2结果PDF保留Qi2/Ji2人工状态并去重，DOCX走mc合并，Markdown按类型/原文/offset/region保持人工项，缺sidecar抛错；登记项目假名、保存草稿、完成视图更新。协作profile读取和Am2之后、注册request之前没有再次代际检查。',
 'Om2分类delete移出优先队列；STOP_UNCONFIRMED为stopping/canceled；pause/preempt仅PDF paused/skipped可作为ready续跑，否则preempt重新queued、usercancel为canceled、意外取消/error为error；印章停滞且已有内容可ready并要求人工。finally按当前代际/待办重启（不await），否则清进度并可能交协作自动导出。'],[('r',34353,34401),('r',33972,34002),('r',34142,34352),('r',27930,27944),('r',33582,33589),('r',34071,34081)],'闭合队列/重开续跑直接控制流；Wn2取消等待及source helpers引用既有专项。PDF/OCR模型与子视图渲染外部/R0，非所有异步交错验证。')
add('SP05','DEP30','jc.set全部外部调用和继承载入',[
 '完整renderer文本静态扫描只4个jc.set：Nd2 workspace继承、reset-home清空、reset-run-state清空、Zg2开始运行载入vl2或null。没有以词匹配直接判完成：四处父函数与gd2/zc门已回读。',
 'gd2经readReviewProfile，KEY_HIERARCHY_LOCKED可提示后重试；成功时写corrections/pseudonyms/conflicts，conflicts空才自动yl2=true；失败不会在catch清空此前有效vl2/选择。Zg2要求未在加载，继承开启时yl2和zc均通过，然后深复制给jc.set。',
 'UI修改kl2会将相同canonicalKey的token统一trim；_l2只调zc。zc不拒不同canonical共用token，且UI文案明确允许不同内容继续共用同一假名。这是产品选择而非遗漏一个唯一性校验就能证明等价。',
 'workspace重开Nd2直接jc.set已载入profile，不再执行zc；main zm对raw key唯一但不对Lc规范化后的key唯一，也不验证同canonical多token一致、token全局唯一、alias目标存在或环。'],[('r',32377,32389),('r',32997,33024),('r',36546,36560),('r',33248,33251),('r',36171,36175),('r',36445,36449),('m',18974,18987),('r',4404,4445)],'固定4调用及所列载入门静态闭合。授权/解密本身沿已审container/key层，不执行许可或密码流程。')
add('SP06','DEP30','主进程继承schema与ey归并生产',[
 'zm允许undefined，拒null；schema1且entries数组最多100000，reservedTokens若有最多200000且每项非空string；entries需key/canonicalKey字符串包含冒号、token非空，raw key不重复。未验证类型前缀有效、normalized key冲突、canonical可达或同canonical token一致。',
 'readReviewProfile按aw区分保护容器nw与旧archive.readV2，finally关闭reader；之后ey归并并记recent和复用数。IPC通过s2路径保护封装；新profile由可见程序生成，不等于zm再次验证ey输出。',
 'ey以Qg规范key，优先构造project mergedInto、继承alias、各review canonical的一跳Map；当前review首次遇canonical时清掉同族继承候选，收集锁定/默认/custom值，选择性模式只收假名动作。sharedMapping只补未见族。合并候选集后首值作为token，多值列conflicts。没有递归传递闭包。',
 'ey同时预留当前review auto/current旧值（便于避免重新编号），从人工记录/工作区修正规则构造继承corrections；不同canonical同token不会产生multiple-values冲突。'],[('m',18974,18987),('m',20106,20200),('m',22560,22584),('m',25648,25665)],'ey假名生产与profile返回静态闭合；correction的Yg/Kg/Jg/Zg语义见本报告SP14，不凭此宣称整个规则误报率闭合。')
add('SP07','DEP30','YK.applySnapshot的上游校验实际范围',[
 '唯一应用调用为Nd2批量分支。renderer vu._2/openRecovery/applyReceivedWorkspace直接存主进程snapshot，没有项目模式深校验。applySnapshot先reset，schema1才恢复new Map/Set；若嵌套形状异常，可在reset后部分赋值时抛错，无本函数事务回滚。',
 '旧archive读取验证checksum和tg/ig；保护容器nw V2组装Qb/ew后tg或ig，V3verifyAllEntries、计数/未完成状态门后ig。tg/ig都不验证projectModeSnapshot的映射pair、计数、documentId引用或alias环；不能把容器完整性等同业务结构完整性。',
 'V3 readProjectMode从段恢复collection，有额外mergeSnapshotEntries token/canonical和fileOverrideEntries token检查并重组；这只是两类增量entry，不是对sharedMapping/defaultMapping/customConsumers/entityOccurrences等完整语义验证。',
 '上游深验证并非未知黑盒：已确认上述显式空缺。碰撞或畸形数据是否实际产生、能否被外部合法保存路径带入仍未运行。'],[('r',3705,3731),('r',3817,3876),('r',30154,30172),('m',19156,19212),('m',19246,19292),('m',19438,19470),('m',22420,22533),('m',22175,22183),('m',22327,22359)],'本组静态闭合调用点及明确所列schema缺口；V3 segment通用字节/hash解析不是token业务校验，容器外部库依赖不在本组重审。')
add('SP08','DEP30','findTokenConflict全部调用与确认分支',[
 '唯一直接调用Gm2，Gm2的3个调用为Ym2全局编辑、Jm2当前文件编辑、tf2拆分token编辑。Gm2冲突对话框cancel返回cancel；确认则merge([冲突key,当前key],token)并update冲突key。',
 'Jm2先Mm2同步草稿；冲突确认merge后刷新，未冲突且跨多文件时再问全部/当前/取消；extra只setTokenForFile，否则updateToken；tf2未冲突走updateSplitToken。三条均刷新Hm2。直接Qm2合并不走findTokenConflict，导入/快照也不走。',
 '冲突UI提示还原时需要用户选择统一内容，但main Ad当前不使用restoreChoices且直接规范选原文（ITER018 RP09）。可见提示与实现承诺存在差距，未假设其它链路提供逐处消歧。'],[('r',34531,34592),('r',30068,30113),('m',14159,14198)],'所有当前静态直接调用及三父分支闭合；图形事件到这三函数可复用UI父链证据，真实确认/合并/撤销运行R0。')
add('SP09','DEP30','Markdown Td实际定位、替换和输出',[
 'Td读UTF8全文，过滤mappings非空string pair，按token长度倒序；字典另加入Markdown标点转义和HTML实体转义变体，用??=避免覆盖已有key。按长度及字典序构造转义后的正则alternation，全局一次replace，替换值不重新扫描。',
 '无AST/region/offset/上下文门：正文、代码、链接、HTML属性中任何命中字串都会替换。原文不再Markdown/HTML转义。tokens_in_doc只计原始token.includes，变体匹配可能实际替换但不计此统计。',
 'tokens_not_in_mapping与residual_tokens直接空数组，无残留扫描。默认writeFile覆盖路径；exclusive模式wx依次原名、_2…_9999，写失败close+rm补偿，耗尽抛错。函数内无cancelSignal。'],[('m',14229,14263)],'Td整个可见函数静态闭合；UTF8/磁盘故障及Markdown语义破坏概率R0，Node fs/RegExp外部边界。')
add('SP10','DEP30','Rp与Python bridge',[
 'Rp无legacy后缀时只接受.docx交preserver.restorePseudonym；legacy要求输出同后缀，临时目录导入DOCX→恢复→按原import engine偏好转回→写输出，finally递归移临时目录；失败转success:false及code，直接DOCX分支错误由bridge返回。',
 'bridge先查脚本存在和输入可读，再mkdir，mapping JSON经stdin；runGenericPythonScript设置离线env，使用uu spawn，120秒定时发SIGTERM并resolve TIMEOUT，不等待进程确已终止。close取stdout最后非空行JSON，不要求exitCode==0，也不验证返回对象schema；无取消signal参数。',
 'Python选择/legacy转换引擎完整性沿既有主处理和格式报告；本轮实际跟进还原脚本全部897行，不把返回success或注释的100%格式保持当证据。'],[('m',16241,16267),('m',13199,13245)],'Rp/bridge可见调用与错误路径闭合；uu平台终止、Python环境、Word/WPS/LibreOffice真实输出依赖/R0。')
add('SP11','DEP30','DOCX还原映射与run定位',[
 'parse_mapping_data支持mappings字典、details兜底及legacy数组；从entityMap/detail取type，occurrences按输入顺序入队。restoreStrategy=token-canonical时队列取fallback canonical，否则原original。替换顺序依token长度倒序，不使用occurrence offset/区域定位。',
 '_runs_including_hyperlinks收本段最近w:p祖先的run，防止嵌套文本框被外层段重复算。_find_note_token同时找exact与删除空白/零宽后的匹配，取起点更早者（相同优先exact），逐字符索引回映；不跨段。',
 'replace_in_runs先从左到右消耗队列，再分配XML edits；跨run只在首run插原文，其他run删除命中字串，按逆序改各run。普通替换run.text可能重写该run子节点；链接类型拆run、复制rPr、重建external hyperlink关系；不能宣称字节或全部格式100%不变。',
 '每token遍历时会更新full_text，再处理后续不同token；若恢复原文包含后续映射token，可能进一步替换。单token当轮匹配列表预收集，不无限自替换。'],[('py',62,151),('py',154,272),('py',273,378),('py',447,491)],'本体映射/run/标准化匹配静态闭合；python-docx/lxml行为、字体排版和恶意/畸形包输入运行未验证。')
add('SP12','DEP30','DOCX所有实际story、注释与修订文本',[
 '主流程按document.xml所有w:p XML顺序遍历正文/表格/文本框；页眉页脚包括default/first/even，按part去重排序；header/footer处理单part异常只warning继续。restore_text_boxes与_single_run旧helper虽定义，但主流程未调用，不能重复计覆盖。',
 'w:delText不由Run.text提供，主流程对body/header/footer所有w:del另用_restore_note_paragraph；保存后zip级重写footnotes/endnotes/comments，负id和separator/continuationSeparator跳过，WPS无type id0保留。note helper按w:t或delText拼接，跨node首处原文中段清空尾留suffix，移cursor避免当token无限重复。',
 'note写临时.notes.tmp并os.replace，finally移临时。preclean只移缺失header/footer内部关系并删除主document对应引用，异常warning后原输入；不是通用OOXML修复。',
 '脚本只初始scan_tokens_in_doc与note_parts以统计table-backed token；没有保存后的残留扫描，两个残留字段始终空。total_replacements==0且输入输出绝对路径不同会copy原始字节覆盖刚保存文件，依然success，连preclean修改也被覆盖。'],[('py',379,446),('py',492,631),('py',632,828),('py',829,897)],'可见还原脚本全部897行已读；此静态闭合是算法/边界已知，不是格式等价、恢复完整或授权运行已验。')
add('SP13','DEP30','V3项目段与记录键的实际验证',[
 'sb先校验manifest itemCount/uncompressedBytes为安全整数且不超Ty/Py；Uy绑定流取消。逐块计数/hash，按LF解析JSON，拒空行、超过Oy的单条、末尾无LF；最终字节数、记录数和SHA256必须一致。JSON值本身没有逐记录业务schema检查。',
 'fb按collection提取键：五类Map取array[0]；customConsumers/entityOccurrences取key；fileOverrides取documentId；mergeSnapshots取canonicalKey；detachedMergedKeys取值。最终仅要求非空string键。',
 'fileOverrideEntries另要求documentId/key非空string以及token为null或string；mergeSnapshotEntries组合canonicalKey/key且二者非空string，token另由readProjectMode检查。以上不验证sharedMapping第二项类型、计数范围、alias存在/环、引用文档存在等业务不变量。'],[('m',20767,20794),('m',21559,21600),('m',22327,22359)],'补闭合SP07的通用segment/record parser；外部流取消与V3索引存储实现引用容器报告，不把hash相符当业务语义有效。')
add('SP14','DEP30','ey correction叶规则与优先级',[
 'Kg以userAdded/meta.manual、manual/manual_batch source、user/manual/manual_batch/project-panel operationSource，或非显式userAdded=false时的user_added状态，或manual_input图片来源判断人工。Yg识别hiddenByType或精确隐藏note。',
 'Jg作NFKC、去空白/NBSP/全角空白与括号归一；Xg为FNV-1a 32位转base36的规则ID。Zg high含长度<=2、16个泛词、纯数字/标点/金额样式、替换字符/连续问号/下划线，以及ASCII字母数字结尾。最后正则[A-Za-z0-9]{1,2}$没有起点锚，长英文串也可high，不是只拒长度1–2英文。',
 'ey从当前active/deleted人工/隐藏状态及已有修正规则构造forceDetect/forceSkip；非显式forceDetect且high被滤，forceSkip保留；同normalizedPattern/type的当前候选先取所有forceDetect，只有没有forceDetect才选forceSkip；已有imported规则遇同向候选保留原属性并合并source IDs，遇反向候选只在反向有explicit时让当前候选优先，否则保留imported。此分支与假名token候选集独立。'],[('m',20092,20118),('m',20161,20200)],'这些可见叶条件已读；规则误报率、FNV碰撞和跨语料识别质量属R0，未运行规则引擎。')
add('SP15','DEP18','DOCX与PDF恢复实体合并叶',[
 'hc按归一type/text、offset、region、imagePath/imageBbox形成occurrence键；pc保留deleted/confirmed或oc人工标记/人工review。mc替换模式丢普通旧识别项，但保留人工旧项、匹配旧id及人工修改前occurrence键抑制；遇重复id按docx-offset-type生成递增后缀。',
 'bO按type+NFKC原文去空白+页号分组旧deleted/rejected；同组新旧若OCR归类不同必须bbox重叠，同类可span重叠或bbox重叠才抑制。不是单凭相同原文删除所有位置。',
 'Qy从抑制比较候选排除deleted/rejected/空原文，提取span/bbox和textAnchorStatus可靠度；bb最终仅从原数组移除suppressed keys，不自动清除全部deleted等项；Jy只要求页号有限且>0，未强制整数。qy去空白/零宽/软连字符及括号，不作NFKC；Gy另去人民币、括号附注、元/万元和逗号。',
 'bb相同类型同原文用同页和几何/相同span消重；包含关系优先72%覆盖或18%最小面积重叠，双可靠span+框需同时span包含，缺定位时可退化为原文包含。OCR来源、可靠range、bbox、confidence与原序构成选优分数。印章不参与；同表不同cell保护；有约束表格实体在匹配包含/重叠时优先。'],[('r',4188,4191),('r',4211,4243),('r',27850,27927),('r',10399,10577)],'mc/bO/bb可见定位/抑制算法读到叶；并不证明几何真实准确。Qi2/Ji2与子视图手动状态沿既有UI叶证据，第三方渲染R0。')
add('SP16','DEP18','Dm2新草稿、统一投影与批转单的等待',[
 'Xd2/Jd2/Qd2新草稿选择当前profile/mode、加入删除与假名动作。Zh2浅复制DOCX草稿并注入detect request/session；np2调用Af/Ef/Cf清除被选中的覆盖/冲突实体（np2无格式门，Xd2也用于DOCX等），具体条件链接同轮projection PA08。',
 'at2按规范type+原文聚合非deleted项，排除other，记录occurrences；每type从001递增，调用jc.tokenFor继承或分配token，默认current=auto、locked=false；选择模式用Wp附action（mask/partial_star/full_star保留，其余默认pseudonym）；tt2仅去空白和括号归一。这不是findTokenConflict入口。',
 'Hm2只有统一模式或已建coordinator才flush；Um2请求fullRebuild。jm2/Vm2逐份投影已有deep-ui-parents UI-339d8e53408d证据，不应把await Um2误称所有文件有事务性提交。',
 'Mv2只在batch中恰有一份ready时转单：先Ne2.reset，再可能await Am2（失败转空buffer），赋值当前文件/实体/路由/文档字段，await Cg2后清active id及batch。两个await后均无新代际/文档存在门。',
 'Cg2根据kg2的comment/image count（diagnostics.regionCounts、regionUnitCounts、units对应sourceRegion数量按truthy回退；非finite归0），两者均<=0则return；需要时显示对话框、await Vue tick后focus，再等待用户resolve。故批转单并非纯同步赋值；没有在此函数设置超时或自动确认。'],[('r',33424,33435),('r',33663,33679),('r',31005,31026),('r',5318,5327),('r',34458,34468),('r',35419,35433),('r',36213,36233)],'细粒度Markdown抑制叶精确复用iteration019-projection-audit PA08 renderer5560–5694；统一投影复用deep-ui-parents UI-339d8e53408d renderer34406–34527。不重新宣称整个Vue/文档布局静态闭合。')
# Explicit tokenized alpha-equivalence, not execution.
a=T['r'].split('function eV(e2) {\n  !(function(e3) {',1)[1].split('\n  })(e2);',1)[0]
b=T['m'].split('function Jm(e5) {',1)[1].split('\n}\nfunction Xm',1)[0]
mp={'e3':'e5','t3':'t2','a2':'r2','e4':'e6','i2':'a2','r2':'s2','s2':'o2','o2':'i2','l2':'c2','XU':'Wm','JU':'Hm','QU':'Km','ZU':'Ym'}
pat=r'"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]'
tok=lambda s:re.findall(pat,re.sub(r'/\*.*?\*/','',s))
at=[mp.get(x,x) for x in tok(a)];bt=tok(b);assert at==bt and len(at)==667
inv={}
for name,pattern,expected in [('jc.set',r'\bjc\.set\(',[33251,36173,36447,36559]),('YK.applySnapshot caller',r'\bNe2\.applySnapshot\(',[33269]),('findTokenConflict caller',r'\bNe2\.findTokenConflict\(',[34541]),('Gm2 callers',r'(?<!function )\bGm2\(',[34547,34564,34585])]:
 lines=[T['r'].count('\n',0,m.start())+1 for m in re.finditer(pattern,T['r'])];assert lines==expected,(name,lines);inv[name]=lines
F=[('object','非null非array object；不查prototype'),('schemaVersion','===1'),('status','incomplete或complete'),('totalPages','number、finite、integer、>0'),('controlState','可省略；String(value)∈running/paused/skipped/complete'),('mode','可省略；严格supplement/required'),('targetPageNumbers','可省略；array，项number正整数<=total，不去重/排序'),('completedPageNumbers','必需array，同页号约束，不要求target子集/状态coverage'),('repeatedImageGroups','可省略array，每组非null非arrayobject'),('group.id','必需string非空（不trim）且各组唯一'),('group.pageWidth/pageHeight','finite number且>0'),('group.pageNumbers','array至少2项，正整数<=total，组内唯一；不同组可重叠'),('group.representativePageNumber','finite integer，属于组pageNumbers'),('group.bbox','非null非arrayobject，x/y/width/height finite；x/y>=0，width/height>0，边界<=页尺寸'),('updatedAt','必需string，无日期格式验证'),('unknown fields','校验容许，eV/Xm返回时丢弃'),('copy','数组复制；group仅known fields；空repeated组省略；空target保留')]
D={'schemaVersion':1,'iteration':'ITER019','date':'2026-10-14','scopeIds':['DEP18','DEP30'],'status':'S2','runtime':'R0','candidateS3':False,'method':'逐段人工阅读可见应用源码；仅自编Python解析文本/哈希，不执行竞品代码。未修改ITER018、ledger或业务代码。','sections':S,'evidenceCount':sum(len(s['evidence']) for s in S),'ocrProgressFieldMatrix':[{'field':x,'renderer_eV':y,'main_Jm_Xm':y,'difference':'无可见校验差异；eV另返回副本，main对应Xm'} for x,y in F],'validatorLexicalComparison':{'equalAfterExplicitIdentifierMapping':True,'tokenCount':667,'mapping':mp},'rendererCallsiteInventory':inv,'staticClosure':{'DEP18':['eV/Jm字段与归一副本','Nd2到Ed2/kd2/Om2/Dm2调度和结束控制','bm2/wm2/CV/MV/gu2/yu2/bu2/yc直接帮助函数'],'DEP30':['jc.set全部4外部调用和继承profile生成/校验条件','YK.applySnapshot唯一调用及主tg/ig/nw/readProjectMode校验的实际缺口','findTokenConflict唯一调用及Gm2三个父调用分支','Rp/Td/restorePseudonym bridge和897行Python还原算法']},'remainingReadable':[],'externalBoundaries':['python-docx/lxml/zipfile/Node fs/RegExp及Vue渲染实际行为','legacy Word/WPS/LibreOffice转换和恢复后版式','密钥层/native授权与第三方OCR/NER模型行为，未绕过或运行'],'runtimeUnknown':['重开与旧请求交错、重复click、listener解绑、await后项目变化的真实可达性','假名碰撞/嵌套token/Unicode空白/超链接/修订/脚注及Markdown语法语料恢复结果','输出失败残留文件、SIGTERM后子进程继续写入及恢复后token残留'],'findings':[{'id':'SP-F01','severity':'P2-static','description':'DOCX/Markdown恢复stats残留字段无最终扫描，不能作为零残留验收。','sections':['SP09','SP12']},{'id':'SP-F02','severity':'P2-static','description':'Ed2/kd2部分await后无项目代际门，kd2 finally共享ba2无条件解绑。','sections':['SP03']},{'id':'SP-F03','severity':'P2-static','description':'projectModeSnapshot无完整业务深验证；applySnapshot先reset再逐字段Map重建，异常可留下部分状态。','sections':['SP07']},{'id':'SP-F04','severity':'P2-static','description':'UI冲突提示需选择统一原文，Ad却忽略restoreChoices；允许多原文共token但非逐处可逆。','sections':['SP08']}]}
md=['# ITER019：状态恢复与假名策略补读','','**DEP18 / DEP30，全部 S2 / R0；无 S3 候选。**',D['method'],f'共{len(S)}节、{D["evidenceCount"]}个范围；完整Python还原脚本897行已读。','', '## OCR字段全量差分','','|字段|两端约束|','|---|---|']+['|'+x+'|'+y+'|' for x,y in F]+['','eV内部校验与Jm显式变量映射后667个词法token完全相同；比较不执行源程序。','']
for s in S:md+=['## '+s['id']+' '+s['title'],'']+['- '+x for x in s['claims']]+['','证据：']+['- `'+e['path']+f':{e["startLine"]}–{e["endLine"]}`，SHA256 `'+e['sliceSha256']+'`' for e in s['evidence']]+['','边界：'+s['boundary'],'']
md+=['## 本组可读依赖','']+['- '+x['function']+'：'+x['reason'] for x in D['remainingReadable']]+(['本轮指定命名依赖已逐段读或通过SP16精确连接同轮/既有报告；remainingReadable为空不代表全产品逆向或R0完成。'] if not D['remainingReadable'] else [])+['','## 外部/运行边界','']+['- '+x for x in D['externalBoundaries']+D['runtimeUnknown']]+['']
outputs={O/'iteration019-state-policy.json':json.dumps(D,ensure_ascii=False,indent=2)+'\n',O/'iteration019-state-policy.md':'\n'.join(md)}
if '--check' in sys.argv:
 for p,s in outputs.items():assert p.read_text()==s,str(p)
 print(json.dumps({'ok':True,'sections':len(S),'ranges':D['evidenceCount'],'validatorTokens':667,'callsites':inv},ensure_ascii=False))
else:
 for p,s in outputs.items():p.write_text(s)
 print('generated',len(S),'sections',D['evidenceCount'],'ranges')
