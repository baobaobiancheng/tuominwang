# 处理规则、视觉识别和辅助接口静态增补

Public mac 0.5.9 project code; static supplement: rules/strategy/config/seal/face/report/source/legacy helpers/table semantics.

**本轮只读公开发布包中的可见代码，R0；没有宣称算法等价或全部业务链闭合。19/19 辅助 handler 及下述 helper 已实际补读；不等于 19 个完整 UI 生命周期已验证。**

## 范围

24 节，41 基础规则组，3 个 ASAR 配置，19 个接口。完整范围与 SHA256 见同名 JSON。哈希校验只证明证据未漂移。

## DPS01 基础规则调度、URL、地址清洗

- URL ut 规范化全角协议符号、去尾标点和不成对右括号，排除 @ 邻接；仅 http/https，裸域须点，端口 1–65535；40 个 TLD 白名单。协议/www/标签/裸域置信度分别 .995/.99/.97/.9；排序 start 升/end 降/conf 降，再与所有前序候选比较重叠，包括已被舍弃候选。
- pt 将 O/o/全角/〇○ 变 0，I/l/全角1/丨/竖线变 1。mt 提取街道门牌基址。gt 去标签和叙述前缀、财产尾词，截取至门牌/楼层/房间/场所，可延伸编码/括号；最短 6，返回 text 与 offset；无行政地址数据库验证。
- yt 输出 type/original/masked/position/confidence/pageNumber?/meta.source/ruleId；DEBUG 才补 reason/pattern/timestamp。按下列 41 规则组执行；末尾调整地址 original/end 而不重算 masked，先精确键去重再删除被包含地址，最后 xt 回单增强；没有全类型统一冲突消解。
- bt 去非数字后要求 12–19 位并做 Luhn。wt 仅检查 18 位字符集、前两位区间、局部数字与日期形状排除；没有统一社会信用代码加权校验。身份证基础正则只验证年/月/日范围，没有校验码或真实日历验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:567–659；.data/research/lawbot-2026-10-13/readable/main.js:1115–1174

## DPS02 回单场景增强、类型遮盖及国际规则

- xt 须微信号或截图提示且回单/时间、转账支付凭证、收付双方词组至少2组。付款人/收款人/申请人+微信5–20+姓名2–4配对，噪声及纯数字微信排除；.95，跨类型位置去重。时间戳旁姓名 .85，独立 __…__ 或含星小写微信须数字/字母且星/下划线 .95；已有星号保留。
- Nt 归一姓名/机构/地址别名；姓名首UTF16字符+按码点计星；机构按有序后缀和地域前缀保留，回退首2；地址保留省市；身份证/护照留后4、手机号3/4、银行卡4/4、USCC6/4、邮箱部分、车牌2；证书标签保留，未知类型****。
- Ct 英文 EIN .88；电话7–15数字有标签/排除上下文 .85，+开头归mobile，否则landline；护照数字8–9 .82/字母1–2+数字6–9 .88；national ID 排除合同订单发票等前24字符，Rt最多48字符/6组、紧凑6–20字母数字，须有数字，拒日期/单字符重复 .86。
- 英文重叠优先 passport/id4 > ein3 > mobile2 > landline1；$t 合并中文与英文，交集/较短跨度 >.7 才冲突，同类高置信替换。

证据：.data/research/lawbot-2026-10-13/readable/main.js:1175–1363；.data/research/lawbot-2026-10-13/readable/main.js:390–399

## DPS03 YAML 黑名单加载和实际生效集合

- Lt 将 name_blacklist.yaml 与 ner_fp_blacklist.yaml 所有数组中的字符串并入姓名集合；非字符串忽略。ner_fp.regex_patterns 是字符串集合，不在此类中编译正则。
- 机构通用集合排除 announcement_generic_orgs_round3 与 disclosure_legal_opinion_and_charter_generic_orgs；这两组进入独立非诉讼集合。partylist 单独有集合。普通方法精确匹配；strictName 还做噪声、角色子串及含指定语义正则的长度>=2黑名单条目子串检查。
- 读取/解析失败吞掉并保留空集合；reload重建单例。Ft日志创建userData并追加JSON，任何写失败吞掉。ASAR抽取记录和配置类别/条目计数见configInventory；完整原始YAML及解析JSON作为证据，不把类别名推定为调用策略。

证据：.data/research/lawbot-2026-10-13/readable/main.js:1364–1463

## DPS04 策略路由、去重和姓名验证

- NER_DIRECT != "0" 默认直接模式。ln 同步只有$t+金额；异步再加on；直接模式不调用策略applyTypeSpecificRules。on分块450/步400，仅姓名机构地址并走黑名单/rn/an/Yt/Zt，Kt不可用抛错，predict失败终止，取消/进度取消重抛；一般进度回调异常吞掉。上游Kt及模型初始化见主报告DP03/DP04。
- sn按start稳定排序，与已接受候选逆序比，遇之前end<=当前start即停；交集/当前长度>.7抑制，跨类先到保留，同类高分替换，非对称。
- un姓名2–4中文、黑名单精确及>=2条目子串，角色/语法/财务/地点排除；默认首字常见姓，第三参数放宽姓氏。xn是另一套较弱2–4字验证；_n三字姓名保留首尾，中间*，其他路径hn/kl首字后全*；并非所有策略同一遮盖。
- mn合同策略target .9/balanced/redactMust；applyTypeSpecificRules、确认引用、当事人、签名、简称添加/查找、标题、机构判定等为空数组/false/no-op。yn叙述器prewarm=false、增强空；bn法律策略target.95/strict但apply空、processAsync走基类、entitiesToMatches空、prefilter恒等、maskAddress恒等。On NameDetector多数检测/采集为no-op，仅委派un/dn/hn。
- Tn公文使用Sn角色姓名边界和冒号回退减.02，签发.9、收件.85、签署.88、证书主体.96、头部机构.98、尾部.97、收件政府银行.96、工作人员.95、案涉人员.96、占位机构.95；同值同位去重。An长机构后缀有序、地域+En前缀、回退2字符。
- Kn先放行Hn品牌再执行大量机构噪声排除。Yn短机构<=4须后缀或可信来源；银行法院最低.55、可信.6、普通.95，定义简称.6快捷通过；排除证券产品/监管通称/治理角色/语法前缀。Gn处理24个复姓。置信阈值是分支条件，不能代表准确率。

证据：.data/research/lawbot-2026-10-13/readable/main.js:1742–1749；.data/research/lawbot-2026-10-13/readable/main.js:1799–1919；.data/research/lawbot-2026-10-13/readable/main.js:1920–1973；.data/research/lawbot-2026-10-13/readable/main.js:2135–2433

## DPS05 金额识别各分支

- 金额标签覆盖合同价、工程款、支付、押金、租金、借贷、工资、诉讼费用等。修整值、删除含百分比括号、在非股份/面积上下文延伸币种单位；排除百分比/bps/时间年份/利率LPR/多小数/面积，已有重叠先到保留，windowOffset加回定位。
- 分支及置信度：labeled .93；currency .92/.90；uppercase .91；standalone .82；table_summary .84；labeled_bare .88；post_yuan .89；conversation_payment .89；standalone_yuan .80；per_share_price .92；thousand_sep .85；standalone_uppercase .82。
- 大小写括号金额可拆为独立实体；masked保留货币/单位与[金额]占位；规则匹配形状与上下文，不做金额加总或币种一致性验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:1974–2134

## DPS06 一般文档与OCR表单交易增强

- Qn仅NER_DIRECT=0使用旧策略NER：yt+显式姓名机构.96+金额，最多等ready3秒，失败退规则；姓名>=.88且un，四字须复姓；机构>=.9且Yn/黑名单；地址>=.92且长度5。验证finite跨度但trim实体文本不改start；同类重叠规则优先。
- sr为姓名/机构/地址/身份证/电话/银行/USCC/金额8组标签，长度上限4/60/80/18/20/25/18/24。cr须>=3不同表单标签，lr至少一组交易社保语义。
- ur无表单/交易场景原样返回；先删>=3换行地址。表单采值到换行/制表和长度上限，最短2；姓名中文前缀2，机构须机构词，地址>=6，银行OCR8–25且数字比例>=.5；身份证/电话/USCC/金额在此分支没有对应格式校验，统一.95。
- 交易商户机构置信默认.75/有限公司.92/连锁.85/商店.78，行业加省略号.85；交易人名2–10中文拉丁中点.88，排除2数字/泛称/平台商户。社保姓名.92，9位社保号.95留3/3，公司跟8位数.9。
- 去重把mobile归phone，同类重叠优先更长再高分，跨类型同时保留。OCR纠错 ar 与普通正则的数字验证不相同。

证据：.data/research/lawbot-2026-10-13/readable/main.js:2434–2655

## DPS07 OCR与canonical文档偏移构造

- fr OCR行按中心Y与left排序，同行容忍max(2,.6*较小高度)，无效bbox变0。文本规范化删除常见中文词内部空白、拉丁数字与中文间空白及公司/身份证上下文空白，保留字符映射。
- fromOCR跳过失败页但保留原pageIndex；行间距在[-.3,.8)*最大行高加空格，否则换行；输出charOffsets/charBoxes及归一化映射、bbox范围，页置信为行算术均值。getLine按成功pages数组索引，可能与跳过前的pageIndex不同。save递归mkdir写JSON；load缺失/错误/版本不符返回null。
- Sr DOCX units用换行拼接，重复unitID映射最后一个；记录missing/approximate锚点与unsupported警告。图片全文页间两个换行但offsetMap只串联原映射，没有相应分隔符映射。
- PDF native按块在原全文顺序indexOf，否则用近似偏移。PDF OCR缺ocrText时unit用fallbacklines，但返回text仅ocrText||空，可能出现unit位置指向空doctext；页间两个换行同样不补offsetMap条目。此处是构造分支风险，未以运行样本确认触发频率。

证据：.data/research/lawbot-2026-10-13/readable/main.js:2656–2921

## DPS08 假名键、导入和保留逻辑

- vr统一18个基础类型，未知归other。Nr归一中文空格/括号，Ar按类型格式归一，kr唯一后字典序。Pr姓名lower/compact、机构去括号、电话去86和分隔、邮箱和URL全部小写、身份证大写、银行卡去空格短横、地址去标点、金额去货币单位但保留中文大写。因此不同币种同数值可能同键，URL大小写路径可能合并。
- Tr按类型计数生成【类别001】，避开预留；>=1000不截断。Or map键type:normalized，已有项只增occurrences不替假名；JSON_meta版本.5，支持details或旧数组；JSON.parse在clear前，语法错保留旧表，但解析成功后形状错误可已清空旧表，details无深入形状校验。
- Br可信机构简称长度2–20、全称>=4且有机构后缀、全称更长、不泛称/诉讼噪声；不要求简称为全称子序列。jr第一遍预留已有pseudonym，再应用遍set一次，保留条目可能两次累计occurrences；restoreOriginal优先；全称锚仅精确org_name且可信来源/definedInDocument/abbrevAnchor。未知类型映射other而被Er接收。

证据：.data/research/lawbot-2026-10-13/readable/main.js:2923–3192

## DPS09 实体粒度后处理与修补

- splitGranular直接保留table_engine_docx及有bbox的visualTable；地址长法律叙述>100拒绝，>30保留，按标点切地址段>=4，定位于原span，Jn重遮。合同品牌/app/社交上下文去掉，律师函pattern机构走专门重遮。
- 机构剥序号、数字向、叙述前缀，延伸律师/会计事务所有限公司，清公司部/分部，允许前置中文+ASCII公司重建；可信简称先原位或±500搜索，找不到仍保留原锚。普通机构按标点/长后缀切割，合同后缀更严格且最短5，其他最短4。
- 含特定补字：京→北京、国证券→中国证券、央→中央、济贸易→经济贸易、龙考试场→九龙考试场。多机构顺序搜再±500；单候选找不到可清空，多个全失败可保留原实体。
- 姓名只2–4中文，经角色/语法/数字地点噪声修整；判决/诉状/答辩可放宽二字姓，合同须常见姓。最终机构原文与跨度不一致先±500，再全局前20次出现选最近，失败删除；未处理非机构保留。补字与全局定位是启发式，不能视为几何真值。

证据：.data/research/lawbot-2026-10-13/readable/main.js:12481–12727；.data/research/lawbot-2026-10-13/readable/main.js:8489–8492

## DPS10 报告模板及保证声明的来源

- generateReport按调用者results/meta计成功、实体类型、启用规则名，时间生成ds-ID；zero_upload_guarantee直接true，network_bytes缺省0、manual_operations0、复制/页检查unknown；checksum仅透传调用者数据，无本函数测量。
- HTML插入fileName/规则名/meta等未经转义；与folder manifest使用Hf转义不同。logo本地8路径找图、异常忽略；读假名seed/OCR等字段即使generateReport未填也可能由后来调用方补入。
- Markdown证明模板固定宣称DPAPI/离线/审计，与实际OS/网络测量不绑定，规则仅前10；HTML零上传声明同样固定。已闭合的是模板生成分支，未证明声明真实，不可据此生成我方合规承诺。

证据：.data/research/lawbot-2026-10-13/readable/main.js:12728–12898

## DPS11 印章颜色、PDF图片与Python分支

- el RGB转色相条件max>=70、饱和>=60/255，红h/2<=20或>=170、蓝95–135。hasPossibleInk按buffer WeakMap缓存Promise，sharp SRGB去alpha取raw，8个彩色像素即true；异常或异常通道数返回true。
- 像素detector仅底部35%，采样步长floor(dim/2000)至少1，红R>150差>35/蓝B>120差>30，alpha>=32。至少180采样色点，框面积>=max(.0015页,4000)且<=.12页，上边>=.5H、高<=.22H；行列>=max2,floor(6%采样宽)再收紧，padding=max12,.007最大边；最终上边>=.45H，高<=.22H，宽高比.55–1.7；错误[]。
- Hough在darwin立即[]；其他平台读scripts/ocr/seal_detector.py经OCR Python，临时PNG，stdout JSON，DEBUG stderr，30秒SIGTERM并返回空，close/error返回空、finally删临时文件，无AbortSignal。当前mac包该脚本缺失，不能推断Windows脚本算法。
- detectSealsBatch仅像素fallback，confidence.65，dpi150转点，页间取消/回调；PDF buffer通过PDF.js图片operator和transform查候选，中心x5–95%、从底部中心<55%、尺寸>=max18,.03短边)、宽<=45%高<=35%、比.5–2；canvas存在则渲染1.5、彩色比例默认.015（环境可改），crop/过滤异常保留候选；否则不筛色；confidence.8，finally清理PDF。
- 文本PDF先原生图片候选标完成，余页ink筛选及72dpi预览（有人脸96）再150dpi像素；seal错误降级，人脸错误中止。扫描页Hough即使空也标已完成；图片路径Hough局部未见sealDetectionEnabled条件，身份证抑所有章、营业执照仅下右(.55W/.48H)并排页眉/过大/边缘；不等于所有平台均实际调用成功。

剩余边界：
- mac发布资产不包含seal_detector.py；其他平台实现未获得。PDF.js/Sharp/canvas库与OS渲染执行、阈值实测均R0。

证据：.data/research/lawbot-2026-10-13/readable/main.js:8035–8276；.data/research/lawbot-2026-10-13/readable/main.js:10957–11021；.data/research/lawbot-2026-10-13/readable/main.js:12250–12305；.data/research/lawbot-2026-10-13/readable/main.js:12420–12480

## DPS12 人脸模型验证、输入、推理与NMS

- cl要求相邻model_metadata.json.models["face_yunet.onnx"]的fileSizeBytes正安全整数及64hex SHA，stat普通文件、大小和整文件hash一致，否则FACE_MODEL_UNAVAILABLE。路径优先显式或LAWBOT_FACE_MODEL，否则resources/support与mac共享目录/应用support首存在项。
- onnxruntime-node失败尝试web。init缓存Promise；mac或ONNX_FORCE_CPU非空选CPU，其他DML+CPU失败再CPU；输入名第一个，inputMetadata.shape[3]可改默认640。失败Promise一直拒绝直到dispose；release异常忽略。
- 检测默认confidence .6，padding .05，NMS .3。sharp取尺寸、缺尺寸[]；等比contain方形黑底居中、去alpha，BGR CHW float32，数值0–255未均值归一。stride8/16/32读cls,obj,bbox，缺输出跳过；分数sqrt(clamp(cls)*clamp(obj))，网格中心偏移、exp宽高，反letterbox加padding裁剪/round；输出长度/NaN无独立严格校验。
- 按分数降序NMS，IoU<.3才保留；.3恰相等被抑制。face匹配original人脸、masked█、position0、bbox和noReplace；未使用landmark。DOCX只枚举word/media受支持图片且>=5000bytes，eu可读尺寸才推理，图片间检查取消，session.run期间无中止；错误包装上抛。

剩余边界：
- 模型文件hash/元数据可静态核对；ONNX图各算子、权重语义和runtime CPU/DML/web输出一致性未执行验证，准确率与平台差异R0。

证据：.data/research/lawbot-2026-10-13/readable/main.js:8277–8412；.data/research/lawbot-2026-10-13/readable/main.js:10365–10384；.data/research/lawbot-2026-10-13/readable/main.js:11364–11385

## DPS13 旧图片遮盖helper的非安全降级

- mergeMaskRegions同类（address别名合并）在横向阈值内且竖向重叠/短边>=.35合并；第二遍包含删除不看类型，跨类相等矩形可能互相删除。
- su.applyMasksToImage用RGBA黑色alpha .95 overlay，经sharp composite转PNG，宽高/坐标没有完整上界裁剪；任何异常catch返回原始buffer。扫描/图片旧处理12293/12434/12442可达此helper。它不同于当前apply handler调用的Sc.applyMasksToImage（main6838起），本结论不泛化全部导出路径。

证据：.data/research/lawbot-2026-10-13/readable/main.js:10161–10211

## DPS14 ns PDF overlay及helper

- Qa页码finite正值取floor，否则1；Xa按框宽分配假名码点，无效宽按1。es展开meta.bboxes并按page分组，仅拒绝Za定义的approximate且原因含回退默认框且无用户修正/范围；不是拒所有missing anchor。
- ns通过pdf-lib ignoreEncryption加载、画圆/矩形opacity1；black/white/purple/lightgray，白色边.9。校验有限框和裁剪后面积<=25%页，转换OCR像素→crop PDF点和Y方向，但实际绘制仍使用变换后原框的一部分字段，不能视为完整页面裁剪。
- 这是追加绘图operator，不删除底层文字。假名字体从打包Noto及OS路径查找，失败静默省略文字；字号6–24拟合，多框无fragment选最大；单框drawPseudonymOnMask进入要求>1框的分割helper可不绘字。旋转就近90取模。Mosaic和TextReplacement方法直接抛未实现；watermarkHelvetica中文字形能力未测试。

剩余边界：
- PDF-lib/字体/Sharp底层实现和输出文本可提取性没有运行验证；当前安全导出器另有主报告与PDF增补，不能混同本旧类。

证据：.data/research/lawbot-2026-10-13/readable/main.js:4260–4484

## DPS15 sourceRef注册、读取、恢复及释放

- dp全进程refs/path maps，handler未按sender绑定所有权。注册filePath优先于buffer；已有path复用ref并更新name/legacy，不重新读取；新path stat后复制受管temp快照（stat跟随链接）。buffer支持Buffer/ArrayBuffer/view/array，需非空；path分支hash延后，buffer分支注册时即计算SHA256。provider要求name、safeint size>=0、openReadStream函数，可无managedPath。
- requireRecord更新lastUsed。managed快照缺失ENOENT可从原路径恢复，只检查当前普通文件，未比较原hash；恢复清缓存hash；并发release后删除刚恢复快照并报错。resolve按sourceRef.id，provider流累积限声明size且最终相等；managed整文件读，hash ||=已有值，未校验受管文件变化。
- readRange验证安全整数与声明范围，provider直读须等长或流累积/销毁；managed循环读finally close。openReadStream不验证声明长度。release先删map再await provider.close，close失败可跳过文件删除与已释放结果；rm失败只warn。dispose close不等待而rm根目录清map。
- S2创建成功才复制文件名OCR缓存到source:id；M2直接h2.resolve。释放另删canonical/legacy/original路径、OCR/J2；最后同名ref消失才删name缓存；su.clearOcrCache无bufferHash时接收{}，该函数不会因此全清。OCR缓存上限50文件/128MiB估算，FIFO插入，估算256+2text+192line+96charbox，非真实内存测量。

证据：.data/research/lawbot-2026-10-13/readable/main.js:15335–15369；.data/research/lawbot-2026-10-13/readable/main.js:15679–15912；.data/research/lawbot-2026-10-13/readable/main.js:16693–16766；.data/research/lawbot-2026-10-13/readable/main.js:9052–9064

## DPS16 目录扫描、输出与manifest

- 扫描root lstat普通目录非符号链接后realpath；递归visited/containment、中文排序，跳过隐藏/系统/链接/临时/不支持/不可读/空目录并计数，无文件大小上限。扫描函数有signal检查，但_2调用未传选项，IPC未注册取消任务。
- scan/output会话12小时惰性过期，不绑定sender。扫描结果先入map再逐文件lstat核size/mtime容忍1ms后S2；中途失败不回滚已建refs。validate仅size/mtime与普通文件/非符号链接，不核hash或inode。
- Uf规范化相对路径，拒绝空/NUL/绝对路径/drive/空或点段/Windows保留名和非法字符，字符串包含检查；未对输出子路径逐段realpath或拒中间symlink。Wf父目录lstat/realpath，源与目标互祖先均拒；sanitize根名100字+已脱敏，mkdir非recursive，EEXIST时间戳计数至999。
- create-folder-output可用调用者sourceRootName而没有有效scanSession，此时缺sourceRootPath导致祖先保护无参；resolve只返回路径不写文件。manifest只验entries数组/源相对路径string及输出相对路径Uf，status无枚举校验，未知状态累计NaN；所有HTML字段Hf转义，固定文件名wx写一次，再次失败；不核验实际输出存在及调用方成功声明。

证据：.data/research/lawbot-2026-10-13/readable/main.js:15385–15438；.data/research/lawbot-2026-10-13/readable/main.js:16633–16749；.data/research/lawbot-2026-10-13/readable/main.js:16876–16975

## DPS17 picker、读写及默认路径handler

- select-files系统dialog后Promise.all stat，任一stat失败整体reject；只给路径/元信息不注册source。select-output-dir取消返回null；select-save-path按扩展设过滤器，但最终n3.defaultFileName非optional，参数缺失会抛；dialog异常未统一catch。
- read-source只转发sourceRef给M2并复制Uint8Array；read-file直接按调用者路径整读、给name/ext。save-file先正常激活校验，再join(outputDir,已脱敏,fileName)交A2写内容，没有本handler内路径包含校验或脱敏结果验证；保存成功不等于已脱敏。
- A2 mkdir父目录后writeFile默认覆盖；EPERM/EACCES/EBUSY才尝试(1)..(5)再时间戳名；无wx/rename/fsync/事务，不是atomic write。save-report同一写入helper且无HTML校验。process-files旧handler激活后只建时间戳目录并读取各文件buffer，不执行识别或遮盖。
- open-output-dir shell.openPath非空错误字符串或异常都返回false；get-default-output-dir mkdir Documents/脱敏猫输出，失败返回false+homedir备用。部分辅助接口不校验激活，这不构成授权绕过方案，本轮未执行。

证据：.data/research/lawbot-2026-10-13/readable/main.js:16767–16789；.data/research/lawbot-2026-10-13/readable/main.js:16975–17157

## DPS18 legacy Office规范化、转换队列与回环

- Sp解析DOCX XML document/header/footer/notes/comments，单v:shape+v:imagedata、有关系r:id且无textbox/group、非absolute/relative定位才转inline DrawingML；宽高支持pt/in/cm/mm/px，回退432x243pt，EMU12700，crop f/65536和百分比钳制，旋转*60000/flip、属性转义、docPr递增；仅有转换才重打ZIP。Ep需PK及DOCX两个ZIP成员；vp看CFB8字节魔数。
- Dp以queue tail/finally串行转换。已有DOCX走Sp，结果engine仍写libreoffice但duration0，不能据字段推断执行过LO。Mac用soffice；WindowsWord→WPS/偏好，.wps只WPS。import120秒/export180秒；Mac .wps导出不支持。
- 导出legacy后要求CFB，再转回DOCX，Op/Tp对body/header/footer/notes/comments规范化文本及表格/textbox/image数量作JSON相等检查；NFKC去空白控制符，忽略PAGE/NUMPAGES/SECTIONPAGES域，非布局一致性。临时目录只一次清>24h旧job，清理最多3次、150/300ms后吞错。
- LO headless spawn，abort前/中、超时kill+reject，stderr限32k，stdout设pipe但未消费，非进程树kill；rename失败read/write后access。WindowsPowerShell bridge stdout/stderr限32k，超时/abort kill再调用清理脚本最多5s，最后JSON对象解析无完整schema/exitcode验证，由success字段判断；Windows脚本未见于本mac发布包，外部Office应用与脚本行为不可推出。
- register-source按文件名.doc/.wps走legacy：可复用内部DOCX；加密探测异常按false；加密返回needsPassword；其他转换后建新buffer ref+legacy映射。失败包success:false,errorCode，不对先前中间工作事务回滚。

剩余边界：
- LibreOffice/Word/WPS可执行程序、Windows bridge脚本与实际格式保真度不可由本mac公开源码闭合；本轮不执行任何转换。

证据：.data/research/lawbot-2026-10-13/readable/main.js:15913–16240；.data/research/lawbot-2026-10-13/readable/main.js:16981–17047

## DPS19 用户口令解密桥

- sourceRef.id必存在，password为非空string且<=4096，扩展仅docx/pdf/doc/wps；先resolve。DOCX F.decrypt后Buffer且PK，legacy须CFB，均<=262144000 bytes；旧格式再Dp转换。成功先建新ref、保存原路径/legacy再释放旧ref，释放异常可使成功解密后返回失败但新ref已存在。
- PDF lp寻找unlock_protected_pdf.py和打包或环境Python；shell:false，口令stdin；stdout二进制上限262144000超则kill，90秒kill等待close；stderr每chunk取200但无整体限；exit3/PASSWORD_INVALID→口令错，4/UNSUPPORTED→不支持，其他非0/超限/<5bytes失败；成功stdout没有PDF魔数验证。
- 公开发布包中的Python脚本仅在提供口令后用PyMuPDF authenticate，拒口令无效/仍加密，tobytes(encryption=PDF_ENCRYPT_NONE)；import失败UNSUPPORTED_RUNTIME，不猜测口令。本轮只读脚本。

剩余边界：
- officecrypto/PyMuPDF库解密内部与运行兼容性是第三方边界，R0。

证据：.data/research/lawbot-2026-10-13/readable/main.js:15679–15717；.data/research/lawbot-2026-10-13/readable/main.js:17009–17047

## DPS20 图像标注及训练标签写入

- image:save-annotations在图片旁basename.json写原bboxes、imageSize={}、版本1.0；没有数组/坐标schema校验，默认覆盖，成功entityCount=r3.length。写已成功后读取length仍可能抛而返回false。
- export-labels固定home/脱敏猫标注数据/datasets/images/labels/basename.json；除imageWidth/Height无正值验证，0可产生Infinity并JSON化null；confidence||1把0变1，source||manual。不同目录同名图片会覆盖；没有拷贝图片或训练动作。
- ce包装负责mac backgroundThrottling/TaskPowerLeases，start/stop等包装异常可越过handler内catch；内部业务finally与包装语义见既有formats审查，不能把success:false涵盖全部IPC拒绝。

证据：.data/research/lawbot-2026-10-13/readable/main.js:26985–27002；.data/research/lawbot-2026-10-13/readable/main.js:14–26

## DPS30 表格解析、金融金额与标签验证

- ps规范化Unicode空白、中点/横线/括号/标点，中文间空格最多4遍。Is从DOCX ZIP解析表格含嵌套，取前3段<=600上下文；合并继续格沿用owner文本且不检测，rowSpan主要作为2标记，colSpan保留数。
- Ns金融词分类权重：普通金额4、资产3、负债3、权益3、损益3、现金流3、变动注释2、估值交易3、每股4。Us金额形状允许±/括号/币种/至6位小数，排百分比/数量/日期；Zs括号或任一负号作负，去币种和尾单位。
- ro推表头到数据行，按colspan继承表头；ao最近左非金额，co前12行首语义>=2，to表内单位先于上下文。lo至少2数值+语义/币种/单位/上下文，或1数值+币种+语义。so末列至少3小整数、多数递增1–2且其他数值足够时判序号；io首列或层级数字序号，Js强表头例外；Hs/Ks面积排除，uo记录非金额排除。
- ho扩展8标签。To标签精确/斜线顿号拆分、括号单位→金额、尾缀fallback。Oo值验证姓名2–4中文/机构2–60含中文/地址4–80有标记/身份证15或18形状无checksum/电话常见形状/银行OCR8–25比例.5/USCC任意字母数字18/金额去比例日期股份；Do机构An/地址Jn，其他全星。
- Lo复姓/常见姓或中点；Jo冒号行内标签排序长优先、非重叠采值至下标签最大3倍长度。Xo/Zo/Qo/ei/ti处理指/系指等释义、泛称排除、全称机构后缀、简称子串或顺序子序列。
- ai列值类型优先身份证→USCC→电话→银行→金额→地址→姓名→机构；si最少2有效值及类别比例.34/.4/.5，ni特意不包括name，所以纯列统计不推姓名。Ko/Go/Yo结构数值优先，去多行无结构数字与相同手机号/金额重叠、机构标签/包含/人名冲突、地址>=.5重叠；保留金融金额例外。

证据：.data/research/lawbot-2026-10-13/readable/main.js:4755–5100；.data/research/lawbot-2026-10-13/readable/main.js:5240–5410

## DPS31 表格NER上下文与跨行地址

- Vo Kt不可用直接[]；构造行上下文上限420但单大cell不截断，加邻近左/上标签或机构简称/全称提示。跳过全标签行和泛称释义别名行，已确认cells在候选过滤排除。候选需可能标签值、机构后缀/地址或2–6个合格人名。
- 主contexts两个并发predict，跨行地址的后续预测为串行；内部不catch，进度回调可抛。仅姓名/机构/地址，实体必须完整位于cell跨度；机构后延伸<=16至标点，并阻止证/银/保/基和相邻券/行/险/金被错误拼接。执行类别验证、标签与姓名/机构黑名单，按cell跨度去重；直接使用NER score，无额外统一阈值。
- 相邻行同地址列可续接：首格尾地址标记，次格非省市开头且像门牌详情，合并<=100；predict覆盖双方才分别形成两个实体。Kt与模型实现引用主报告DP03/DP04；本节没有把模型效果当作已验证。

证据：.data/research/lawbot-2026-10-13/readable/main.js:5100–5240

## DPS32 oi表格规则、NER融合与锚点

- oi要求非空cells，需文本锚时还要body text。sr+ho标签，唯一table/row/col/type/original，规则置信.96；跳合并继续格，Oo/No值检查，金额排非金额上下文，长值保留左右锚提示。
- 金融候选货币标记+5、行列语义取max、父级+2、单位+3；拒无币种的非金额上下文、序号，必须币种/语义/单位/分数>=3；4–6位无语义数字拒。单字签名行至少2个且>=70%短格，合并全姓名、中点或两两配对，table_signature在后融合保留。
- 释义全称/简称.97，ASCII别名2–16可入；纯多标签表头跳，单标签向右、多标签相邻值、第一行垂直标签、交易人名分割、行内值、可选列推断分别执行。
- NER融合先去结构姓名/机构/地址（签名除外）；严格释义保留并升.99，NER获结构支持+.015上限.99，NER确认释义保留；pdf_native/pdf_ocr/image未确认释义可pendingConfirmation保留。
- 按table/row/col排序；锚定位按后文提示80、前文lastIndexOf近游标分支160、标签、顺序再全局首个；前文提示随后indexOf→original回退无160限制；签名允许空白，找不到drop，金额Ro延伸数字单位。最后按类型/span/原文或cell键去重，max confidence合并glossary/structural/source metadata；不证明全局首出现为正确单元格。

证据：.data/research/lawbot-2026-10-13/readable/main.js:5411–5655

## DPS33 Ei关系图检测及文字坐标去重

- ci为表格金额排除项，仅indexOf(cellText,cursor)顺序锚，失败continue，无全局回退，再uo，confidence1但masked原文，属于非金额保护。Ei使用8类持股/组织关系标题、百分比正则、编号段落、机构后缀和泛角色词；gi去空格，bi规范化文本保留原索引。
- xi优先校验已知原文span，失败在±max(512,8*len)归一文本找最近，否则position0并bbox-only。_i机构后缀放行；姓名2–4中文中点需下方百分比，纵距[-12,95]，横距<=max46,.8姓名宽,1.5百分比宽；strict黑名单及un或<=3字非泛称宽松分支。
- Mi合并水平标题碎片，横距<=max8,高度，Y中心<=max3,.45短高；区域从标题bottom-4到min(+460,下个距>80编号段)，节点横向合并max4,.65H，至少2百分比。Si无标题回退须至少4百分比成行、跨度>=160，区域Y-120至+240且至少4有效节点。
- Ei去百分比/标题/编号/含任一逗号句号分号冒号叹号问号的文本/长>40，机构.95/姓名.93，全星，visualTable bbox及textAnchorStatus。Ii按半像素取整bbox分组，同文高分；冲突框没有可靠文字锚时全删，否则exact>normalized>confidence；页/类型/文本/x/y再去重。无连线/股权数值语义模型，不证明完整关系图理解。

证据：.data/research/lawbot-2026-10-13/readable/main.js:5656–5827

## 41 组基础规则顺序

|序号|类别|置信度|字段、上下文与限制|
|---|---|---|---|
|1|id_card|.98|18 位、年份 18/19/20、月 1–12 日 1–31；出生/地址 ±50 上下文全遮，否则留后4|
|2|mobile|.95|可选86和分隔；取11位；排除前邻1–6字母及合同编号…号；留3/4|
|3|wechat_labeled|.97|标签后6–20位字母/下划线开头；拒全下划线/短横线；同位置去重，长于6留两端2|
|4|wechat_wxid|.96|wxid_ 后2–15字符，留两端2|
|5|bank|.92/.85|12–22候选或4位分组；小数/顿号前末位修整；13位时间戳排除；Luhn或银行上下文；留4/4|
|6|bank_labeled|.84/.85|OCR8–25或非OCR分组12–22；非OCR禁止换行且组数1–6；排除时间戳/身份证；3位起点距离及包含替换|
|7|email|.97|基础邮箱；前缀被已识别手机覆盖则剥离；本地留2域留1|
|8|email_ocr|.9|电子邮件/邮箱/E-mail 后去空白，保留原始偏移；删除被包含旧候选|
|9|url|.9–.995|调用ut，逐候选输出|
|10|uscc|.94|18位允许字符；身份证/当事人上下文排除；wt非校验码验证；留6/4|
|11|tax_labeled|.91|10–20或空格至25位；最多3换行；拒身份证形状；距3内同起点取长；留4/4|
|12|landline|.88|中国区号/可选86、0、括号、分机；相邻数字排除，至少10位|
|13|local_phone|.9|标签后7–8位2–9开头；无已识别座机重叠；后4遮|
|14|contact_name|.88|2–4中文中点，末尾/手机/邮箱边界；词黑名单与任何重叠排除；此分支无pageNumber|
|15|transcript_name|.99|嫌疑/被询问标签2–4字后需性别出生身份证住所|
|16|officer_names|.97|最多5个2–4字姓名加工作单位；中文数字开头与姓名重叠排除|
|17|self_name|.98|我叫/本人叫等2–4字|
|18|address_labeled_door|.98|2–120混合字符；清理标签、gt、英文场所/括号/门牌延伸；至少10且门牌或A区|
|19|address_labeled_no_door|.95|6–100候选；至少8、行政及道路乡村标记；编号门牌走其他分支|
|20|venue_labeled|.9|会议/活动/听证地点3–80至换行；拒日期时间和人数|
|21|address_unlabeled|.98|省市区+道路编号小区；排除机关文件、房产证、面积、股票LPR、银行公司等前缀；工业区无号/短楼无房拒绝；包含少数物业专名修补；最短10|
|22|garage|.98|街道门牌+车库|
|23|property_base|.97|路号后24字内车库/负层/住宅|
|24|attached_door|.98|路号附号|
|25|context_place|.97|位置租赁+楼宇场所；至少7，拒医院政府公积金时间动作|
|26|unit_range|.98|小区号+单元至单元|
|27|plate|.93|省份+非I/O字母+5–6字母数字|
|28|securities_account|.89|标签+6–20数字/空格/*/-且至少6数字；original包含标签|
|29|case_no|.96|括号年份+案件代码流水号|
|30|admin_no|.95|中文前缀+括号年份+第流水号|
|31|realty_cert|.96|省份(年)不动产权第编号号|
|32|patent|.94|ZL/CN/PCT/WO/US/EP/JP形状，无校验码|
|33|patent_labeled|.9|标签+8–14字母数字，已包含跳过；包含标签|
|34|icp|.95|省ICP备数字号后缀|
|35|filing_beizi|.9|中文备字第编号号|
|36|filing_labeled|.88|标签+6–24字母数字第号短横线，包含跳过|
|37|land_cert|.95|国用/集用/集建/他项年份字第编号|
|38|housing_permit|.93|房权证/地建字第编号|
|39|realty_unit|.94|12数字+[GJ][A-Z]+5数字+F+8数字|
|40|certificate_labeled|.9|物业许可标签+5–30ASCII括号短横；右括号修整，cert重叠跳过，至少8位数字删除被包含银行号；masked含标签而original仅值|
|41|parcel|.88|(年)第编号号地块/宗地|

## 配置资产

- name_blacklist.yaml：82 类，2524 项，2260 个唯一字符串。逐类别生效集合及被忽略非字符串在 JSON。
- ner_fp_blacklist.yaml：9 类，125 项，125 个唯一字符串。逐类别生效集合及被忽略非字符串在 JSON。
- org_name_blacklist.yaml：17 类，363 项，341 个唯一字符串。逐类别生效集合及被忽略非字符串在 JSON。

## 19/19 辅助接口实读映射

|稳定ID|通道|增补章节|合同|
|---|---|---|---|
|IPC-102f9010076c|desensitization:select-output-dir|DPS17|Dialog openDirectory/createDirectory → canceled/outputDir.|
|IPC-3211d99d0f20|desensitization:open-output-dir|DPS17|shell.openPath error string/throw → generic false; otherwise true.|
|IPC-3bea45842355|desensitization:resolve-folder-output-path|DPS16|12h session + Uf lexical path validation → outputPath; no write.|
|IPC-523337153cab|desensitization:select-folder|DPS16|Dialog directory → _2 scan/register; cancel vs caught scan error.|
|IPC-5569a4344615|image:save-annotations|DPS20|Adjacent JSON overwrite of raw annotations; wrapper ce.|
|IPC-7f07e8bd74ee|desensitization:select-save-path|DPS17|Extension filter/dialog; missing payload can reject.|
|IPC-8f1caa190dda|desensitization:register-source|DPS15,DPS18|Nonlegacy S2; legacy ZIP/encryption/conversion branches; errorCode.|
|IPC-95d4f752bfb1|desensitization:select-files|DPS17|Dialog+Promise.all stat; any stat failure rejects.|
|IPC-96ccc7c0ce76|desensitization:validate-folder-source|DPS16|Session/file membership/lstat size+mtime validation; no hash.|
|IPC-9a8232e44fb9|desensitization:get-default-output-dir|DPS17|mkdir default; homedir fallback with false.|
|IPC-a07c3fdcbe45|desensitization:read-file|DPS17|Whole read arbitrary caller path to copied Uint8Array; catch.|
|IPC-d3864dc80560|image:export-labels|DPS20|Normalize bboxes and overwrite basename labels; zero dimensions unguarded.|
|IPC-d7d18b241f88|desensitization:unlock-source|DPS15,DPS18,DPS19|User password validation/decrypt/new ref/release old; no transaction.|
|IPC-d9b14aa97589|desensitization:release-sources|DPS15|Release refs and related caches; provider close can reject mid cleanup.|
|IPC-e29b03465bc3|desensitization:scan-dropped-folder|DPS16|Nonempty dropped folder path → _2; scan error result.|
|IPC-e84cabdffc27|desensitization:write-folder-manifest|DPS16|Entries validation/escaped HTML/wx manifest; no actual output verification.|
|IPC-e8dcb4d0e8b3|desensitization:create-folder-output|DPS16|Root name+dialog/Wf/session; optional missing scan bypasses ancestry parameter.|
|IPC-f071ce7c965b|desensitization:read-source|DPS15|sourceRef → M2.resolve → copied byte array, catch error.|
|IPC-f1f713df2b98|desensitization:save-file|DPS17|Activated gate + join + A2 direct overwrite/retry; no redaction quality check.|

## 仍未由本轮证明

- ONNX model operators/weights and onnxruntime CPU/DML/web numerical parity; actual detection accuracy, model timing/cancellation during inference; no vendor execution.
- Current mac package lacks seal_detector.py and Windows Office bridge/cleanup scripts; Windows behavior cannot be closed from method names.
- Sharp/canvas/PDF.js/pdf-lib/ZIP/XML parsers/Office crypto/PyMuPDF/LibreOffice/Word/WPS semantics outside explicitly read project wrappers.
- Kt/NER DP03/DP04, learning/runtime rule propagation DP02, task/export orchestration and secure current PDF/image renderers in main/PDF/formats reports; this supplement does not independently re-review all those ranges.
- 19/19 auxiliary handlers freshly read does not prove all renderer producers, temporal UI state, license-enabled full run or own-product equivalence. Remain S2/R0; no whole-business S3 promotion.
