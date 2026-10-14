# ITER019 布局、渲染生命周期与人工建框补读

DEP28/29/32；全部S2/R0，0 S3候选，0完整业务闭合声明。
12节、41段精确范围。人工阅读应用代码；未运行竞品。旧ITER018快照不变。

## LM01 PDF原始页集合、旋转和删除投影

关联：DEP28, DEP32。

### 已读结论

- gC将有限数四舍五入到90度再归一到0/90/180/270；yC把删除页转正整数去重排序，并在已知总页时截界。bC从1..floor(total)排除删除页。总页Pe2来自已加载PDF.numPages。
- Be2是保留原始页码数组，不重新编号实体pageNumber；un2选择不小于目标的首保留页，无则末页。cn2禁止删除全部：从删除集合移除首项以至少保留一页。
- en2叠加待重识别ft2与已提交vt2；tn2再加PDF自身page.rotate。手动90度旋转将该页现有实体deleted并标rotationInvalidated；保留旋转人工审查把ft2迁入vt2、记录manualOnlyPages并emit。
- hn2修改删除页、清选中、过滤当前搜索结果、提升搜索代际并重新搜索/渲染；initial旋转/删除props有deep watcher。原文实体数组并未因删页被整体移除。

### 条件性风险与失败


### 仍缺边界

- 源PDF内部rotate/getViewport数值、导出端如何使用pageRotations/删除页以既有处理报告及运行样本为准。

### 精确范围

- `pdf-page-utils`：renderer.js:22301–22313；SHA256 `37981a7e354b674e2f53009606ce77e875d02b97fca7d3752f9ccf5ca71b8564`。
- `pdf-page-state`：renderer.js:22481–22484；SHA256 `a17778aa39b36275b1d3b964b598dd6d90c9f2cd7b13fe70ca5af151e6eabcbd`。
- `pdf-rotation`：renderer.js:22595–22650；SHA256 `858c2edc3ff8889e48b406ea428cc7213109f3e47377d6fd37dd6ad6942e8476`。
- `pdf-page-delete`：renderer.js:22653–22718；SHA256 `00dbc4ebbad04d8873250d69fb11ef399625be8e7e70a06b41183dc5a4e1ea7e`。
- `pdf-load`：renderer.js:25820–25877；SHA256 `cbe3cbc83b06b259833db3b64a1ae74916ff0ed55cb82f7e4f73143bb76cc4c6`。

## LM02 PDF页布局生产者与原生框修正

关联：DEP28。

### 已读结论

- pt2由Xu2/Yu2写入pageNumber、四舍五入viewport width/height和累积offsetY；mt2按原始pageNumber映射且保留首项。大于12页时未知页先沿用首保留页尺寸，实际页加载发现尺寸变化会重算全部offsetY。
- Yi2优先当前微任务Map缓存，否则查询该页pdf-viewer-container或canvas的DOM矩形，减容器矩形再加scroll。queueMicrotask清缓存；它不是长生命周期页面坐标cache。
- Li2仅无数值OCR尺寸、非page-top且rangeAdjusted或userAdjusted=true时启用原生修正；vE固定-17.5，ar2/ir2此前已读乘sx/sy的-2/-17.5修正。缺DOM时相关转换可回退pt2.offsetY，布局间距未由Yu2额外加入。

### 条件性风险与失败

- 虚拟模式未加载页尺寸只是首页面估算，实际尺寸重算可移动后续页offset；静态不能将它描述为所有页起始就精确定位。

### 仍缺边界

- 浏览器CSS间距、设备缩放、字体与实际PDF.js viewport真值仍R0。

### 精确范围

- `pdf-page-map`：renderer.js:22527–22549；SHA256 `131f65a0d3990e3068810b323aaaec4dec1761b2e8fcd71233a0f96c49389780`。
- `pdf-offset`：renderer.js:23355–23397；SHA256 `7632387b5ff4c99a503e4e6157dc000aa4f56551022dae8e3bfa00043f2498f8`。
- `pdf-native-shift-constant`：renderer.js:22340–22340；SHA256 `c16d0beef8ade8a2cff30051bc8a9bc593c31551c0d9178fb30db828b7350be7`。
- `pdf-eviction-layout`：renderer.js:25661–25684；SHA256 `2bf7b83585b06134d0a216a4ff279951efbb919561e02e8c6766723f9f9ea39a`。
- `pdf-render-layout`：renderer.js:25685–25734；SHA256 `50c9730aa3c69e99d7cf5a0471afeccc3b3e6e982fdc776f9ef9dc455332f059`。

## LM03 PDF预览统一行高的样本门

关联：DEP28。

### 已读结论

- al2按meta.bboxes优先、_splitBboxes其次、单bbox最后计算框数量。il2只从Xo2当前投影中取单框且Ji2有效的实体，经Tr2转换后高度10..42之间，按页求中位数。
- rl2仅预览且单框时考虑中位数；原高<10、>1.8倍中位数或差值>0.45倍中位数仍保留原高，否则替成中位数。sl2以高度差的一半补y使中心不变。

### 条件性风险与失败


### 仍缺边界

- Xo2投影生产者由DEP27关联阅读；此处只闭合行高计算本体，未证明文字真实baseline。

### 精确范围

- `pdf-height`：renderer.js:24500–24536；SHA256 `3b638c9686173bf805eaeb8934a60c61c1730f68d7dd3a3553718016aa3cc2ed`。

## LM04 PDF虚拟窗口、渲染队列和代际

关联：DEP29。

### 已读结论

- Bu2以总页数>12启用虚拟化；Fu2在保留页数组上选择当前页前后各2项，最多5页。滚动RAF由Mu2用elementsFromPoint和已渲染DOM定位当前页，100ms调度缺页重绘。
- zu2提升Eu2并cancel在途render，串行Tu2排队；virtual在full/其他渲染busy时复用旧Promise。Xu2的virtual快速路径还要求缩放、页集合长度与首保留页尺寸cache匹配。
- Xu2先按当前页距离排序待渲染页；若窗口已移开当前候选则break，finally解除busy后可再次调度。Gu2只保留目标窗口的canvas/textLayer，canvas尺寸归零再移除。
- 页render以Ri2设置20s等待上限，超时主动cancel该render；取消/过期退出，普通错误删canvas并显示该页warning，继续尝试文本fallback。整个Xu2失败写Ye2，不等同抛给所有caller。

### 条件性风险与失败

- 完成状态可达到100%同时存在单页bitmap失败；await zu2成功不证明每页视觉正确。

### 仍缺边界

- PDF.js render/getPage本体、浏览器canvas和第三方线程不可由应用队列代码证明；Ir2/lo2/To2等应用子路径见剩余清单；Ri2超时包装器已在旧UIR报告读取。

### 精确范围

- `pdf-window`：renderer.js:25553–25623；SHA256 `e54d687ba1346d0905313142eebb6ec986527fa3a208cf6bf65a6f8eb50cca82`。
- `pdf-eviction-layout`：renderer.js:25661–25684；SHA256 `2bf7b83585b06134d0a216a4ff279951efbb919561e02e8c6766723f9f9ea39a`。
- `pdf-render-layout`：renderer.js:25685–25734；SHA256 `50c9730aa3c69e99d7cf5a0471afeccc3b3e6e982fdc776f9ef9dc455332f059`。
- `pdf-render-canvas`：renderer.js:25735–25771；SHA256 `be399422a46b5e18c5a72dcffd51a88f549005b2ff2abbfb9656d679ce5ec86c`。
- `pdf-render-text`：renderer.js:25772–25819；SHA256 `f56f1672a9e41db4d17cd155c970f3b35e1e4d7d188b6a1884b93d23a35f76d2`。

## LM05 PDF文本层/OCR fallback、加载与卸载

关联：DEP29。

### 已读结论

- 位图成功后仍取getTextContent；Tt2按16页/估算32MiB上限逐出文本cache。垃圾比例Pt2标页后可取OCR页，Uu2按page防并发，回执后检查代际和isConnected才写透明span。
- 文本span以viewport*item.transform、字体ascent或1+descent并clamp0.6..0.95定位；按Lu2批次append并yield，再Bb缩放文字宽度。getTextContent/实体To2更新局部错误可被吞，文本层失败不自动令位图失败。
- Ju2加载代际Ie2和渲染代际Eu2独立；旧loadingTask销毁等待最多3s，getDocument等待45s超时触发destroy；晚到document如代际/任务不符则destroy。首屏自动缩放0.5..3，initialViewport可覆盖。
- PDF卸载提升两代际，取消render并清定时器、缓存、监听、canvas/textLayer；把loadingTask/document引用取出后异步cleanup/destroy。清理不声明所有底层任务已同步停止。

### 条件性风险与失败

- OCR加载失败返回false但可保留已存在位图；该路径没有把失败提升为全面导出禁用。

### 仍缺边界

- lo2原生文本可信fallback、Ir2位图空白判断、To2实体定位、Bb字体测宽批处理未本轮递归读完；各自位置写入projectReadableRemaining。

### 精确范围

- `pdf-page-map`：renderer.js:22527–22549；SHA256 `131f65a0d3990e3068810b323aaaec4dec1761b2e8fcd71233a0f96c49389780`。
- `pdf-ocr-layer`：renderer.js:25627–25660；SHA256 `3707883d411b45c6403d60dc3db8e9aa44e9747a110ee82a4a47b87b1c74dfe4`。
- `pdf-window`：renderer.js:25553–25623；SHA256 `e54d687ba1346d0905313142eebb6ec986527fa3a208cf6bf65a6f8eb50cca82`。
- `pdf-render-text`：renderer.js:25772–25819；SHA256 `f56f1672a9e41db4d17cd155c970f3b35e1e4d7d188b6a1884b93d23a35f76d2`。
- `pdf-load`：renderer.js:25820–25877；SHA256 `cbe3cbc83b06b259833db3b64a1ae74916ff0ed55cb82f7e4f73143bb76cc4c6`。
- `pdf-unmount`：renderer.js:25973–25995；SHA256 `6985ab467fc189ecd9a3ef9ea92bd1b763985c84ce9a23238772380e65ec230a`。

## LM06 DOCX动态加载、超时与卸载

关联：DEP29。

### 已读结论

- Yr2每次++Ze2，先dispose旧coordinator，动态导入CpyDD6WX.js并缓存renderAsync包装器，追加renderVmlImage:Nd。缺预览buffer报告错误；加载后及batch回调都检查Ze2。
- 文长>12000或buffer>2MiB启用md增量coordinator；首batch即可挂DOM并显示。renderAsync使用useBase64URL=true、包含页眉页脚脚注尾注、isRenderCancelled及yieldRender；15s提示，hard wait= min(120s,max(45s,45s+10s*ceil(bytes/5MiB)+5s*ceil(chars/10000)))。
- 成功后contentVisibility处理大页，插分页分隔，缺失后续页header/footer时clone首页并标data-cloned-hf，调整溢出浮动图片；多个后处理/高亮错误被吞。
- 失败当前代际++Ze2、dispose、清DOM并切纯文字审查；timeout通过Promise.race拒绝及isRenderCancelled协作，不能当成任意第三方代码硬中断。10336卸载++Ze2、dispose、移画框/监听/observer/RAF/timers；docxBuffer watcher仅byteLength改变才尝试重开且已就绪时跳过。

### 条件性风险与失败

- 仅相同byteLength的buffer替换不触发该watch分支；是否由父组件key重建保护须结合parent，不能断言全部换文档路径都漏刷。

### 仍缺边界

- 本轮未深入动态模块CpyDD6WX.js和VML Nd的全部解析/渲染；纯文字降级的最终导出语义复用处理报告。

### 精确范围

- `docx-load`：renderer.js:7467–7508；SHA256 `1666f831a71c5ab06d816f9abff2f8c9e9bfbb619f3ae1e2f98ec5ea47bb2409`。
- `docx-postprocess`：renderer.js:7509–7594；SHA256 `0bbdb8fe63c092592ade21f1eb536d7944e29ce59597f15447ac468a730078d9`。
- `docx-unmount`：renderer.js:10336–10342；SHA256 `90224ef01951ba39889ffb0871b15dba538e0d5965c11a941ff50e6f63753738`。
- `docx-body-watch`：renderer.js:6606–6630；SHA256 `07fd147456be4d1926d2b21c81729a71f0b1eeadc449aefb98580f740b359f60`。

## LM07 DOCX增量段落锚点与调度

关联：DEP29。

### 已读结论

- hd将正文按cd去空白/不可见字符、统一标点形成compact及原始offset；追加文本保留cursor，非前缀变更重建。按正文/页眉页脚/脚注尾注及noteId查找，body顺序推进cursor。pd排除sup/overlay且mark读data-original。
- md只登记未注册p且排除克隆页眉脚和嵌套p；IntersectionObserver根scroll容器、rootMargin600px。实体signature只含type/text/deleted/start/end，二分索引找重叠段落，region必须一致。
- 可见pending按每轮约8ms预算绘制；当前选区/编辑defer的块推迟，50ms重调度。focus可同步paint，needsConservativePass发现未锚定段或未覆盖实体时允许Xr2从增量转全文。dispose断observer、timer并清集合。

### 条件性风险与失败

- md签名不含masked/meta/confirmed等其他字段；这些改变是否走外部refresh需看具体caller，不能仅据signature证明所有预览状态自动重绘。

### 仍缺边界

- 动态renderer批次p结构及region标记真实生成由外部模块决定；此处应用coordinator和hd本体已读。

### 精确范围

- `docx-anchor`：renderer.js:4620–4668；SHA256 `0a36d4b4d3f9edef89b71d29832f6f11169d8fe514152ec4cfc3566136cda3b7`。
- `docx-coordinator`：renderer.js:4669–4791；SHA256 `f6c59b080ea67c2bc4dea630034cf53f2c9a75a0b892f748331e3c63f3334344`。
- `docx-text-inventory`：renderer.js:7595–7699；SHA256 `a3d65ce90b25ef8949083cad5f3483a98b7661d4b5981a7021c4b9ef2476b58c`。

## LM08 DOCX Xr2全文匹配、DOM标记及冲突层

关联：DEP29。

### 已读结论

- Xr2先尝试md增量，需conservative时dispose回全文；移旧mark并恢复original文本，排除image_ocr，先把候选标failed，再由Nf拆重叠组。TreeWalker跳过旧mark与克隆页眉脚，跨段插FDD0分隔。
- 按文本长度降序匹配；中文/金额允许受限空白及标点变化并经df边界检查，结合context和docxDomOffset/文长比例选位置。4个以上非特殊组可按排序配对；候选不足时存在复用最近位置的分支。
- O3逆序splitText加mark，跨run记录first/mid/last并在成功挂mark后写resolved；异常吞掉。后续保守扫描与Range定位补漏，分段矩形经qh合并成overlay，重叠组单独conflict层和warning并标conflict-only。
- 最终未找到DOM且非冲突组的候选仍failed；函数是启发式映射，不证明sourceOffset与DOM一一对应。

### 条件性风险与失败

- 多个实体可映到同DOM位置，resolved只是找到mark；不能当作导出位置正确或所有敏感内容已覆盖证明。

### 仍缺边界

- Nf重叠分组、df词边界、qh矩形合并和_2/v2过滤器需结合DEP27/既有leaf具体范围；本节不重复声称这些children本体已全读。

### 精确范围

- `docx-text-inventory`：renderer.js:7595–7699；SHA256 `a3d65ce90b25ef8949083cad5f3483a98b7661d4b5981a7021c4b9ef2476b58c`。
- `docx-text-match`：renderer.js:7700–7827；SHA256 `198286bf24f97ef34629786c5ebc49fbc77a2549f1b43713ff5aa472514ebbb3`。
- `docx-text-mark`：renderer.js:7828–7896；SHA256 `1f44c2219a0736fb871339d5bbbb213d65a7d6733592c9ffa795198a4e384250`。
- `docx-text-overlay`：renderer.js:7897–8031；SHA256 `b56e9d96bf4cdcf4bbd93c8403987573ecb9107caecd3de85b723f34ee7195a5`。
- `docx-text-end-image-index`：renderer.js:8032–8050；SHA256 `d49dfa37825368947011c6dbd635166cb7c414105bfed9f60eb8dcdaf92b2d32`。

## LM09 DOCX图片定位、overlay与延迟回调

关联：DEP29, DEP32。

### 已读结论

- Qr2优先已有imagePath/space标签，否则按自然尺寸±2像素匹配尚未使用img并赋domId/path；同尺寸不能作为像素身份的保证。ps2清overlay，等待未完成img的load/error一次回调或5s timer，再fs2。
- fs2每OCR图片优先path、回退尺寸找DOM；ms2按parent和scale建立overflow:hidden百分比overlay。非imageBbox的OCR实体按文本包含关系匹配每行再vs2找第occurrence框，此循环没有额外比对该实体imagePath/ocrLineIndex。
- 显式imageBbox实体优先domId、DOM索引、path，优先已给displayRatioBbox否则除自然尺寸。vs2优先charBoxes索引归并，回退行框按规范文本索引等比例切分；无命中回退整行。

### 条件性风险与失败

- 同文本分布在多图/多行而实体缺imageBbox时，fs2可以将同实体ID画到多个行/图片；这是条件性静态路径，不代表导出也会使用这些DOM框。
- ps2的5s timer和load/error回调没有Ze2/ct2/isConnected门，也未将timer存入卸载清理；调用可在卸载或重绘后操作捕获旧DOM并读取当前局部实体状态。实际可见后果未运行。
- vs2 charBoxes循环按码点建index map但indexOf和query.length是UTF16，非BMP可影响切框；尚未动态验证。

### 仍缺边界

- 第三方DOCX图像尺寸和路径标记生成、CSS缩放真实结果仍未运行；不把尺寸匹配视为内容hash。

### 精确范围

- `docx-text-end-image-index`：renderer.js:8032–8050；SHA256 `d49dfa37825368947011c6dbd635166cb7c414105bfed9f60eb8dcdaf92b2d32`。
- `docx-image-refresh`：renderer.js:8152–8193；SHA256 `beaf71108c274465818a7c330dddad80b485965aa4e0d35827c2d7e09c6fee9a`。
- `docx-image-paint`：renderer.js:8194–8254；SHA256 `c8f63875680eaffc2ddd3e1f9944d6bdc4c62c9f7e58b6548f25762fc85c95fa`。
- `docx-image-position`：renderer.js:8255–8286；SHA256 `795d94a0c0f45c0145d70bad3aaeefb17003d3ef5a11f791c2f01c123861826e`。
- `docx-unmount`：renderer.js:10336–10342；SHA256 `90224ef01951ba39889ffb0871b15dba538e0d5965c11a941ff50e6f63753738`。

## LM10 DOCX人工框与同路径重复图片批量

关联：DEP32。

### 已读结论

- 框选ts2把offsetX/Y转0..1比例，mouse-up尺寸需至少5显示像素，bbox转自然图尺寸并保存DOM身份与displayRatio。hs2直接加入image_ocr实体，offset按正文长度+实体数合成，emit/保存由外围承担。
- El2/Nl2按相同imagePath且非克隆页眉脚找到重复DOM图。Il2 UI入口只在manual且seal或other+directRegion时调用Nl2；它不是任意文字批量API的已证前端入口。
- Nl2确认后对每图用同相对比例乘自然尺寸建框；同DOM已有任意未deleted实体且ratio框相交即跳过，不核类型/文字或90%覆盖。逐项push并记录repeatedImageBatchId，末尾emit review-state-change、gs2，0新增仍可能显示完成0处。
- OCR修订另经Ys2找同实体/未覆盖匹配；Qs2可复用预览plan，manual先插入再await项目apply，无局部事务回滚。该路径与重复图印章入口分开记录。

### 条件性风险与失败

- Nl2确认前捕获图列表与t3，await确认后没有局部文档revision/连接性检查；可触发的父组件锁定/换文档条件还需运行或parent证明。
- 批量相交去重会跳过不同类型或文字的已有框；同路径表示同资产引用，不等同按像素搜索相似图。

### 仍缺边界

- 最终应用的review-state-change持久化与DOCX图片asset多引用写回须结合已审父链/处理报告；此报告不宣称逐实例导出等价。

### 精确范围

- `docx-image-manual`：renderer.js:8068–8151；SHA256 `e2ff101e2998ad3678a480526ffa169bc2733d2e81487bcae28a64e96d6f1e80`。
- `docx-image-repeat`：renderer.js:9425–9450；SHA256 `9088d780b9c8d2c54d97e88090abf9ccd296bb65ec5642e57c9ed21deaebca14`。
- `docx-image-correct`：renderer.js:8676–8743；SHA256 `59fc8c144fe1a434076f5cc0b0402d3b1a24d518120299df9a52d47b7e620fe5`。
- `docx-audit-insert`：renderer.js:6538–6577；SHA256 `510b8c7c10862fb0b743439d30df3d4376e0845ee2ef016d0cc2bca0db7d6ea6`。

## LM11 PDF Ul2到Zs2及页范围批量

关联：DEP32。

### 已读结论

- Ul2取当前drawRect/多框、other+directRegion生成regionOnly；Zs2按vr2反向转页框，多个框按页/y/x排序。普通非seal/other文字可await _u2重找多行框，只有返回>1框才替代；失败保留手动画框。
- 新实体position固定0..0、page-top、manual，OCR尺寸齐备才标pdf_image_ocr，否则pdf_native_text；regionOnly另标manual_region。wb认为candidate已被覆盖时只提示，不emit；正常emit add-entity并触发文本反馈。
- Vl2 occurrence路径await Ul2后把affectedCount设1，无论Ul2早退或wb跳过；成功toast不等同新增1实体回执。Zs2 await _u2后本体没有捕获/复核文档revision或绘制代际。
- _s2从指定页数组去重范围约束或start/end生成原始页列表；Rs2每次循环再跳deleted页、Es2尺寸失败/旋转不兼容分列，覆盖率>=0.9跳过，其余收集后一次emit。取消代际检查在emit前，30s预算在每页开始检查，正在await不被它中断。

### 条件性风险与失败

- Zs2的跨await无局部revision门需结合父组件换文档与取消条件验证，不能与Rs2批量代际门混写成全部同等安全。

### 仍缺边界

- _u2 PDF文本/OCR反查完整候选选择、wb→yb/gb/Qy覆盖冲突内部仍需具体范围；原始页集合与Rs2本体本轮已读。

### 精确范围

- `pdf-manual-build`：renderer.js:23883–23997；SHA256 `8a154f821db47afca967f73c677c9e811812447036b2fa362c3a9083f678919b`。
- `pdf-manual-call`：renderer.js:24789–24816；SHA256 `25a2e9263bd897c57b0a5463a045c922817839ef26da712d9f3570ec53bb1e72`。
- `pdf-batch-pages`：renderer.js:23686–23699；SHA256 `484d99201cf6c3530a0f2bf96bebf07f5d838299eaed7247efa1b775d3fad88b`。
- `pdf-batch`：renderer.js:23726–23790；SHA256 `34ad8ea83ebe0d4f392d39cfb63f4f9366896b76bbba0b0860ba56d7097c09d4`。
- `pdf-candidate-dedupe-call`：renderer.js:10571–10579；SHA256 `656b41e629cba283257e886640ff85a6aa2dfa7841031ff9ea7e3f1704a9501f`。

## LM12 Image手动有效框与PDF命中几何去重

关联：DEP32。

### 已读结论

- Image mi2保留用户rect，但非seal/other且有ocrBbox时以OCR框作effectiveRect；继续多框fi2保存该组合并恢复drawing。关闭vi2提升dn2并清框数组。
- Image Ye2将bboxes或单框Number化，要求x/y finite、width/height>0后取union；未显式finite检查宽高，Infinity可保留。Xe2只在OCR成功且结果非空时走该union，其他情况回退已有实体文本框。
- PDF ro2要求同page，取marks或displayRect，io2按交面积/两框较小面积>=0.6判断；一侧所有rect各被另一侧任一rect覆盖即视同。so2先入native后OCR，按这个几何条件保留首次命中，无文字相等门。

### 条件性风险与失败

- 几何去重按较小面积而非IoU，包含关系容易去重；Image union未完整排非有限尺寸，后续main坐标门可能拒绝。报告不将辅助函数通过称完整有效框。

### 仍缺边界

- 图像OCR实际回执、最终边界夹取及完整图像导出以main报告和运行样本另验。

### 精确范围

- `image-union`：renderer.js:26469–26496；SHA256 `76d86e9d224fb2b73e2fdfc7a10c5f5cec28c4e86da99fdd3f0d4064a40e6563`。
- `image-manual-choice`：renderer.js:27226–27244；SHA256 `d2b90c17804d0d506b084e06974e42d48ac08c4f678f52f55aa0ed96621c6ccf`。
- `pdf-manual-build`：renderer.js:23883–23997；SHA256 `8a154f821db47afca967f73c677c9e811812447036b2fa362c3a9083f678919b`。

## 剩余依赖分层

- project-readable：PDF To2 (24217起), PDF _u2 (25387起), PDF Ir2 (23610起), PDF lo2 (24019起), Bb (10684起)。Xu2/Zs2主体已读，文字到实体框更新、fallback可见文本与测宽children未在本补充全部递归。
- project-readable-cross-report：DOCX Nf (5696起), df (5550起), qh (5026起), _2/v2过滤器, PDF wb→yb/gb/Qy (10577及上游)。本文读caller/用途，须与DEP27和旧报告已读范围对账；不默认列为本体未读或全闭合。
- external-module-readable-boundary：CpyDD6WX.js renderAsync, Nd (4950起) VML包装, PDF.js getPage/getTextContent/render, canvas/DOM字体/Resize行为。应用传参/取消回调已读，不扩成整个第三方库重实现等价。动态模块是否继续读由具体项目修改范围判断。
- runtime：合法激活产品, 混合尺寸/旋转/非BMP, 重复图片/DOM迟到回调, 取消/换文档/保存重开/最终导出。全部R0，无竞品动态运行或我方等价验收。
