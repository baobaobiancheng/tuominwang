# DOCX 与 Markdown 深层补证（2026-10-14）

11组应用链仍为S2/R0；逐段补读不代表第三方解析实现、全部renderer和合法运行已完成。

## PSF01 DOCX接受修订、内容控件与批注

- 先递归处理子节点：ins/moveTo解包保留子内容，del/moveFrom和段落/run/表格/节属性Change节点删除；sdt只提取sdtContent子节点。
- clear_comments删除四个指定comments部件、对应关系及Content_Types项，并从正文/页眉页脚/脚注尾注清除批注位置标记；people.xml不在四项删除列表。
- anonymize在comments.xml替换author/initials，在people.xml替换author/userId/email，不是清除所有OOXML元数据。
- 预处理重打zip到临时文件；若无变化则删临时文件返回原路径。单部件XML/关系/匿名化错误可警告后继续；外层异常才清临时并抛出。

剩余：lxml与python-docx库行为及损坏ZIP/XML的实际输出未运行；此段预处理不是全部导出链。

证据：.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py:270–554

## PSF02 DOCX保留包部件和悬空页眉页脚关系

- 先用python-docx生成内存ZIP，再挑选document.xml、变更的word关系、已有页眉页脚及变化的已有media等内容；其它原始部件优先保留。
- 自动新增但原包不存在的header/footer XML不写入；计算最终部件集合，找出指向缺失story部件的非External关系，删除对应关系与document header/footerReference。
- 关系XML解析失败会跳过；lxml不可用时修复helper不能保证清除悬空引用。该helper直接写目标ZIP，独立边界内未提供原子替换。
- 保真函数保留未知原包部件，不等于做过所有元数据脱敏；是否上游另有处理须按导出分支核对。

剩余：ZIP/python-docx序列化兼容性与Office打开效果仍R0；不能由保留部件推断全链有/无元数据泄露。

证据：.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py:1491–1683

## PSF03 脚注尾注匹配与超链接处理

- 只处理footnotes/endnotes；region为空或匹配才纳入，separator/continuationSeparator及负ID跳过，ID解析失败默认1。可用noteId与noteOccurrenceIndex限制落点。
- 传入替换helper的是整个note元素，连接其所有w:t，因此扫描可跨段落；使用归一化文本映射原run，在受影响run写替换。
- 计划只按完全相同(start,end)去重，再按start倒序处理；该helper没有拒绝部分重叠计划。上游是否排除冲突是独立条件。
- 解包触及的超链接，收集关系ID，仅删本note部件已无引用的关系；通过.notes.tmp写入后替换，helper无通用finally清理临时文件。

剩余：含跨段与重叠实体时的实际Word结构、上游冲突约束仍需合法运行验证；不将静态路径推断成已发生损坏。

证据：.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py:1684–1923

## PSF04 删除图片的对象层和包层

- 对象层对正文及已有页眉页脚删除包含blip/imagedata的drawing/pict/object；访问页眉页脚失败可跳过。
- 包层删除word/media和docProps/thumbnail文件，XML发现blip/imagedata时向上删除最近drawing/pict/object或该标记；关系层删除image/metadata/thumbnail类型。
- XML解析失败仅在原字节含特定图片标记时抛错，否则保留；关系同样按字节标记判断。不能概括为扫描所有任意嵌入二进制。
- 包层.strip-images.tmp替换有finally清理；此函数未同步重建所有Content_Types项目。

剩余：全部嵌入资源格式和Office兼容性未运行；对象层、包层及调用开关需结合主导出契约。

证据：.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py:1924–2038

## PSF05 Markdown输入约束与节点扫描

- 只接受.md/.markdown，最多10MiB；UTF-8 fatal解码、记录/去除BOM、拒绝NUL。sidecar记录UTF16 code-unit坐标、原字节SHA、scanText SHA、换行与尾换行。
- 遍历GFM/YAML AST：普通文本/代码/链接标签与目标、表格单元格以及有效YAML字符串标量；无效YAML记录错误但原frontmatter仍纳入扫描。
- image/imageReference变成blocker并扫描alt；非表格原始HTML成为blocker。HTML表格只重建已识别行列/caption，危险标签不收文本，rowspan/colspan正整数上限1000。
- 精确唯一原文优先；转义/CRLF映射可建立逐段坐标；无法唯一匹配时保留整个源区间并标exact=false。不是把任何扫描坐标当作可直接回填。

剩余：micromark/GFM、YAML、entities、parse5外部内部语义和所有畸形语法未穷举；应用节点处理已读，库实现不是自动闭合。

证据：.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:1504–1731

## PSF06 Markdown补丁、链接和图片行为

- 先核sourceBuffer SHA及source长度；每项要求整数scan范围、原文字面相等、非空ID及original、替换不含NUL。重复ID加后缀；重叠实体按lo合组，同类型包含子实体可省重复替换，fullStar按码点计数。
- $o的blocker集合由sidecar全部blocker IDs自建，迭代时has检查恒成立；该实现没有读取blockerDecisions。sidecar已列出的图片/rawHTML blocker均产生删除补丁；可解析HTML表格走独立重建逻辑。
- 所有link_destination均进入去链接分支，不要求有敏感命中。引用式链接移除definition并保留处理后的标签；自动链接以code形式保护标签，避免再自动变链接。
- HTML表格重建为安全HTML；跨单元格实体给mapping-missing。其它实体按精确坐标、转义映射、唯一原文字面回退；不能安全跨节点则报mapping-missing，补丁部分重叠报冲突。

剩余：这些是该写入器的保守产品行为，不表示保持所有原文排版/外链；UI是否提示全部移除需另追renderer。

证据：.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:1798–1804；.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:1960–2153

## PSF07 Markdown降级与验证的真实含义

- invalid-operation直接失败；其它映射/补丁错误可退化为已审查scanText的fenced纯文本，清issue并把所有有效操作记为applied。
- 重新解析输出，比去空白scanText与预期已审查文本；残留blocker、frontmatter变坏或文本不同可再次降级。若降级重新解析一致则清错。
- 残留校验比较输出与预期已审查文本的原值出现数；允许未选择的原值仍在，不能表述成文档所有敏感原值清零。链接目标另查。
- write运行$o三次并比较哈希，同时要求applied数量等于operations数量；返回format=plain-text或preserved、removedAssetCount为原blockers长度。三次写入器一致不等于三次外部转换。

剩余：仅应用层静态契约；Unicode/复杂Markdown回填和格式退化的实际样本结果未运行。

证据：.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:2140–2177

## PSF08 Markdown文件保存与冲突

- 先mkdir/statfs至少需求字节、wx probe+sync；正式wx临时文件write+sync后优先hardlink，部分系统错误改COPYFILE_EXCL。
- 存在目标时可stable-suffix重试，或await onConflict；replace仅在stat的mtime/size/inode未变后rename，变化则循环重新确认。取消抛MARKDOWN_SAVE_CANCELLED。
- 错误可onWriteError改路径重试；finally尽力清临时。writeFile要求保留原扩展名。

剩余：跨文件系统copy可见性及电源中断持久性未实际验证；stat后rename仍不是外部写者互斥锁。

证据：.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:1805–1830；.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:1863–1926；.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js:2173–2177

## PSF09 多页Markdown导出的锚点策略

- 默认anchor-first，只有LAWBOT_MARKDOWN_LEGACY_ROUTER=1走legacy候选；PDF坐标先normalizeReviewedMatchCoordinates。
- bt剔除seal/signature_seal/no_text_replace及无原值/替换的实体；同类型同位置同替换去重、同类型包含关系省子操作。
- canonical覆盖低于0.98时可用originalText单页构造；定位按source-offset、bbox、页文本、全文顺序，重复候选用上下文独胜或组数=出现数的顺序匹配；保守扩展需allowExpandedRedaction。
- 锚点编辑按unit倒序合组，记录unresolved/not-present/visual-only等账目；允许扩展时最多3轮残留scrub。complete以操作覆盖数量及无unresolved判断。

剩余：0.98 canonical覆盖度由启发式canonicalDocumentTextCoverage计算，不是字符级证明；ONNX/OCR生成的上游units是否正确另见核心/几何专项。

证据：.data/research/lawbot-2026-10-14/deep-processing/markdown-worker.readable.js:541–575；.data/research/lawbot-2026-10-14/deep-processing/markdown-worker.readable.js:649–850；.data/research/lawbot-2026-10-14/deep-processing/markdown-worker.readable.js:1105–1109

## PSF10 候选评分、页覆盖与降级

- legacy对同一候选做3次映射，选通过安全门槛后结构分最高者。anchor-first优先canonical及可用DOCX已脱敏buffer，失败块可改literal code块。
- 安全门槛包含空输出、标题壳、内容覆盖、操作覆盖、missing/ambiguous/conflict、链接目标、残留和页范围；相应归一化后JS字符串length<2（UTF-16单位）的原值跳过这两处残留循环，不能说所有单字符原值都检查。
- anchor模式deterministicSha256仅当前一个候选hash；最后MarkdownSourceWriter再做3次重写哈希，不是外部MarkItDown三次转换。
- safe-flat可以从视觉重建退回reviewed units code块；PDF按页重新构造source回退要求页/offset/原文严格一致。失败可带draftMarkdown和需扩展审查提示，草稿不是成功输出。
- 结构评分同时关注正文单元、标题、表格、列表与假标题/硬换行/独立页码等扣分；通过脱敏门槛仍可能format简化或plain-text。

剩余：视觉布局helper由PDF/OCR补充单独分析；有限启发式分数和字符串出现数不能证明与竞品所有版式等价。

证据：.data/research/lawbot-2026-10-14/deep-processing/markdown-worker.readable.js:411–539；.data/research/lawbot-2026-10-14/deep-processing/markdown-worker.readable.js:851–930；.data/research/lawbot-2026-10-14/deep-processing/markdown-worker.readable.js:943–1147

## PSF11 worker与MarkItDown桥的超时、取消和离线边界

- Gf串行FIFO排队；等待时可abort移出。每任务安全temp、SharedArrayBuffer取消标志，500ms发送电源状态，abort3秒后杀登记子进程并terminate，finally删temp并释放队列。
- 转换bridge使用shell=false的Python本地输入；DOCX/PDF限定、MarkItDown(enable_plugins=False)。超时60秒；超过5MiB的部分每额外1MiB（向上取整）增加3秒，上限180秒，输出64MiB、内存250MiB。
- Windows父进程tasklist每100ms采样；Python有psutil时每50ms累计自己及递归子进程RSS，超额os._exit(137)；非Windows缺psutil直接失败。
- Python替换socket.create_connection/socket.socket.connect并设置offline环境；这是Python进程内连接拦截及配置，不能称系统防火墙级隔离。
- worker捕获未处理异常只上报TASK_CANCELLED或MARKDOWN_WORKER_FAILED，父进程直到exit再决算；第三方转换内存/耗时仍未合法运行测量。

剩余：MarkItDown 0.1.6以及PDF/DOCX第三方转换依赖内部实现未全部展开；没有许可运行证据，R0。

证据：.data/research/lawbot-2026-10-13/readable/main.js:15416–15518；.data/research/lawbot-2026-10-14/deep-processing/markdown-worker.readable.js:350–374；.data/research/lawbot-2026-10-14/deep-processing/markdown-worker.readable.js:1100–1175；.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/markdown/convert_markitdown.py:1–104

