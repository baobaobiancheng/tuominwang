# UI叶子依赖继续核验（2026-10-14）

**S2/R0**，仅以下命名helper静态语义补证。

## UL01 审计取源、页边过滤与框合并

- Am2依次使用originalBuffer、file.fileBuffer（移入originalBuffer并清fileBuffer）、In2登记后readSource；readSource等待30秒，失败抛错。Markdown缺source字符串时fatal UTF8解码。这里不会每次重读或重新比较来源hash，缓存优先。Tm2同样优先当前nh2缓存，再文件buffer，再readSource。
- mC直接使用pC页边启发式：矩形中心距上下边不足6.5%一律判header-footer；6.5%到15%之间对页码正则或靠中间的1–5位数字判页码。它不是文本异常模型，也没有调用fC的邻近正文消歧。
- af2只检查x/y有限、width/height>0，未要求宽高有限。rf2从bboxes或外层几何取框、默认页1再过滤；of2跨输入取联合矩形并使用首框页码，没有验证所有框同页。
- lf2接受矩形对象、至少4项的数值数组或多边形；数值数组取前4项优先解释xywh，宽高不正才试xyxy。uf2按去空白的码点记录charBoxes索引，用normalizedStart/End切片合框，否则回整行框。cf2使用交集面积/较小框面积，不是IoU。DOCX审计34838–34840确实将nv结果传给uf2：前者以UTF16位置、后者按码点索引映射charBoxes，非BMP位于命中之前时存在位置单位不一致条件，未经运行复现。

剩余：In2/readSource跨进程来源生命周期复用source专项；PDF.js字体/真实几何、在途读取与切换仍R0。

## UL02 DOCX审查序列化与恢复

- WU按固定字段组装schema1草稿，masked空值回退wd；源链数组map(String)，会把对象转为字符串。start/end用Number||0，不保证整数、有限或顺序；region将header_footer归header；UU仅保留选定图片/notes字段。HU允许零尺寸；UU对index/note字段取floor。
- VU将user-added转user_added；已知confirmed/rejected/pending优先，否则由deleted/confirmed推断。qU恢复时score固定1，header/footer统一回header_footer，pseudonym条目补occurrences0和autoUpgradedfalse。序列化是有损投影，不是全部实体meta原样保留。
- oc把userAdded、manual来源/操作、project-panel、manual_input等视为人工；dv只保留同时非空的recognized/correctedText及选定字段。hv优先识别前文字，mv按pdfType与来源字段推textSource。

剩余：与所有child本地状态的完整来回等价及真实恢复结果仍未运行；cc/wd规则依赖参照policy报告。

## UL03 PDF/Image序列化及恢复

- rV只从meta.bboxes/meta.bbox取几何，Number||0并过滤宽高>0，没有保留任意顶层bbox；iV规范化选定假名字段。PDF oV保存selected fields，普通非人工非deleted实体reviewState统一pending，即使输入confirmed也不沿用。text PDF使用hv原识别文字，去OCR校正状态。
- lV恢复PDF实体时masked固定***、confidence1、position0/0；selected meta回填，text PDF删除OCR校正。不能把这些固定恢复值当原识别精度或原始offset。
- uV保存image active/deleted框及选定meta；aV仅多框数量>1时保留数组。cV将userAdded恢复为manual/system来源，无法恢复所有原meta。Vp按四个action枚举与cc归一type；key归一碰撞按遍历后值覆盖。

剩余：PDF OCR进度eV另有校验，与main legacy Jm同族但这里不声称逐字段差分一致；DOM恢复和视觉输出仍R0。

## UL04 Markdown草稿实体与模式同步

- gV把default_pseudonym规范为custom_pseudonym，再同步exportState和review的mode/pseudonym/fullMask/style/tableName；vV是跨字段一致性谓词。
- wV实体offset按优先字段取Number并max边界；source位置可退到覆盖scan span的region。deleted/rejected优先，人工则user_added，其余pending；masked默认按UTF16长度星号；confidence用Number但此处不检查有限范围。sourceExact只接受true。
- bV先尝试sourceMap精确等长片段、覆盖连续且scan文字相等；否则沿给定scan span检查exact/连续性与允许的无换行Markdown符号gap，返回sourceExact条件值。返回false并非自动丢弃该实体。
- xV只在sourceSha/scanSha/sourceLength都匹配时复用persisted sidecar，否则JSON clone。blocker decisions只保存remove项；是否执行这些决定须按writer报告核对。

剩余：输入sourceMap来源来自已读Markdown parser；实际编码、损坏sidecar及跨版本互操作仍R0。

## UL05 文件后缀与重叠匹配小函数

- BU仅jpg/jpeg/png；FU标准化路径分隔符取basename末尾后缀并lowercase，点必须不在首字符。$U支持docx/doc/wps/pdf/上述图片/md/markdown，其余unsupported。它是后缀分类，不验证内容。
- xl2逐字indexOf后仅前进1，因此保留重叠；kl2对UTF16 code units去Uf空白/零宽并统一Hf破折号，保留normalizedToSource回映射，同样逐命中前进1并返回源span。仅当前documentText缓存该index。
- nv用Xf去空白/转全角括号后找非重叠匹配，前进整个query.length；Xf不做lowercase。qf把整个规范化查询一次spread给String.fromCharCode，源文本index则按32768分块，不能从源分块推断超长query同样分块。

剩余：这些匹配函数索引规则已列出；上层同图/跨页匹配策略与真实时序仍按UI报告剩余链处理。

精确源码范围与哈希见同名JSON；未运行竞品。
