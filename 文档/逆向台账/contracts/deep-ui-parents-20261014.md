# 六项 UI 父组件调用增补（2026-10-14）

作者静态分析；供 ITER018 使用，待其他 agent 独立审查。六项全部 S2/R0，S3 候选 0。未执行竞品代码。此文不替换原报告、应用或台账。

## 范围与证据

- 六个稳定 ID 与原 deep-ui 报告集合一致；59 个精确范围。
- hash/范围检查只证明所引用文件和切片一致，不证明完整业务链、真实保存或导出等价。
- renderer SHA-256: `4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc`
- groupCountByKey 文本命中行：[5041, 5068]；Wd2 标识符命中行：[33411, 34967, 35006, 35034]。仅限当前发布 renderer。

## UI-2c1712d35460 — entity-group-review

状态：S2/R0；完整业务闭合：否。

### 本次已读父链

- groupCountByKey 的 optional prop 在分组处取 max(实例ID数, override)。对当前发布 renderer 全文检索只命中声明与使用；三个实际 EntityTreeSidebar 调用点（DOCX/Markdown共享、PDF、Image）均不传该 prop。因此本快照没有可追溯的父级 override count producer。
- DOCX/Markdown tu2 的 group 删除由首个实体的规范化 type/text 扩展到 de2 中同 region 的全部实体ID；type 删除走 typeHidden 且禁用 FP计数/反馈。eu2 对部分用户添加实体直接移除，对其余标记 deleted；同时清选择、刷新并发出 review-entities-deleted 和 review-state-change。
- DOCX fl2 侧栏选择先选实体；Markdown 用 St2(startOffset)，DOCX优先 DOM data-id/最近 docxDomOffset，图片OCR退化按文字和图片尺寸匹配滚动。
- PDF Vo2 以 type/text/page/几何分组，用逗号拼接原实体索引；jo2→zo2 去重合法非deleted索引并发出 delete-entities。批量父 Qv2 用 zf 更新 detectedEntities，并同步已有 draft、计数和统一映射。
- Image Si2 将删除框写入 Z2/ee2，再从 G2 移除；type 记录 hiddenByType，跳过 Va2。Va2 只是更新本地集合，U2 是空 async 函数，不能据此宣称图片删除提交了反馈。

### 失败与并发

- DOCX Mo2 零延迟调用 Co2→feedback.addBatch；Co2先把去重key放入集合，catch为空，不会因反馈失败恢复实体或自动重试同key。
- PDF删除父处理依赖当前 wh2 且格式为pdf；传递值是索引，事件本身无文件revision。本文未动态构造切换竞态。

### 明确剩余依赖

- 未展开 DOCX Eo2 投影/惰性列表完整性（renderer:8820起）、Markdown St2 虚拟窗口定位（6333起）、Image Pa2 投影（26935附近）及 PDF Il2 完整滚动链。已读callsite不证明各格式侧栏显示全部实体。
- 未展开 zf/_c/er2 的所有调用者及 feedback.addBatch 主进程持久化；本项只读指定删除分支。

### 持久化边界

这些父级更新先进入内存。批量 review-state-change 由 Qu2 420ms 合并后 Ku2→Du2 更新 workspace snapshot；lc2 仅当 snapshot 且 isDirty 时延迟 2s 调 Ec2→Ie2.saveRecovery。renderer store 串行调用 workspace.saveRecovery 并检查 success；这不是磁盘写入、加密或恢复重开验收。

### 证据

- `group-count`：`.data/research/lawbot-2026-10-13/readable/renderer.js:5041-5100`；slice SHA-256 `6d30e92f05899dd9baef99b22d071ca9d0dc09f02ee3648a01e45b3a00f7fd6c`。
- `tree-docx-markdown-call`：`.data/research/lawbot-2026-10-13/readable/renderer.js:10343-10343`；slice SHA-256 `b380bcfec00e58299f7842f23366a638d218d5526473ff60aee6483f25896dea`。
- `tree-pdf-call`：`.data/research/lawbot-2026-10-13/readable/renderer.js:26033-26033`；slice SHA-256 `460c3e631a1163e6b4e79a4a637c6ca4e5c4d842a4f10ce77d76abc47d654bcf`。
- `tree-image-call`：`.data/research/lawbot-2026-10-13/readable/renderer.js:27425-27425`；slice SHA-256 `10d1edbfa6f1fbe4d4e91303b1aaae2186ae27b388fcd166502fbee2f3182df4`。
- `docx-select`：`.data/research/lawbot-2026-10-13/readable/renderer.js:9286-9318`；slice SHA-256 `23353932231c31a3fb29567d3ee210571866488807914d26c3c4a60de7700500`。
- `docx-delete`：`.data/research/lawbot-2026-10-13/readable/renderer.js:9643-9688`；slice SHA-256 `2c2ad968876587f12bac086d21fafaa43ea8aa2858d294caab3642410fbcf5fa`。
- `docx-feedback`：`.data/research/lawbot-2026-10-13/readable/renderer.js:8779-8795`；slice SHA-256 `48ab0391d735e9b2b2990f692ce40f0dc450c91cb7a29111aa7373ef1fce6350`。
- `pdf-tree-delete`：`.data/research/lawbot-2026-10-13/readable/renderer.js:24395-24438`；slice SHA-256 `8e5ce4af5e109d62c8c3c123fe9476c77995f84774cedde3eae460321bfa1bbe`。
- `pdf-parent-delete`：`.data/research/lawbot-2026-10-13/readable/renderer.js:35726-35731`；slice SHA-256 `c071705f9fc931225ea709c25d7b9e50d01e4699cc778f723f322c643537671d`。
- `image-delete`：`.data/research/lawbot-2026-10-13/readable/renderer.js:27303-27332`；slice SHA-256 `fb7db15e70336791ab088a81408fb31c2c2f3d5b408fbf107a36c6498c52e606`。
- `image-tombstones`：`.data/research/lawbot-2026-10-13/readable/renderer.js:26443-26451`；slice SHA-256 `f47c9d6027c669ff5bd495d8b676957d9610170a41b37b4a81fac2f06b82a48c`。
- `image-delete-local-feedback-state`：`.data/research/lawbot-2026-10-13/readable/renderer.js:27057-27062`；slice SHA-256 `10648aead2f4f9d54e09ec40966717f4b2f9b948cb8ba83505f2fda8e2bad53a`。
- `image-empty-U2`：`.data/research/lawbot-2026-10-13/readable/renderer.js:26272-26273`；slice SHA-256 `39749182b766f079757a875bd288c1c2bf03840de7545549a3dbe22e25a1c848`。
- `review-save-events`：`.data/research/lawbot-2026-10-13/readable/renderer.js:32675-32743`；slice SHA-256 `7fd5e053e4f3b84c4946d24125379e307e0455387517766a0af96f65de3d2012`。
- `parent-bindings`：`.data/research/lawbot-2026-10-13/readable/renderer.js:37517-37517`；slice SHA-256 `db604dee36d704b14ecedc799c9f30b2f7a98c87cfe4760dc9355a30591c0a1a`。

## UI-3f01047e6b59 — full-text-search-scopes

状态：S2/R0；完整业务闭合：否。

### 本次已读父链

- ReviewModeContainer 的 M2 由 documentKind===markdown 决定；共享 $r2 在当前渲染根遍历 DOM text nodes，以原textContent.length构造范围，lowercase字符串上找非重叠匹配，再逆向拆节点生成mark。范围为当前DOM，不能据此认定整份Markdown虚拟窗口均已搜索。
- DOCX OCR搜索按图片天然尺寸±2匹配未使用 img；Ir2按OCR行框和子串位置推矩形，Pr2用中心点±3及文本判断高亮内；Or2排除已校正且不再含查询的实体覆盖，Br2为校正实体补搜索框并去重。
- PDF原生 Vn2 分页 getTextContent/cache，交互请求用序号和当前查询判断再提交，失败页记录警告；非交互 t3=false 若有失败抛 PDF_TEXT_SEARCH_INCOMPLETE。OCR Fa2另用aa2序号+15s超时，过滤删除页并比较 checkedPageNumbers；all/in/out聚合原生和OCR范围。
- Image Ee2由te2 watcher延迟300ms触发；先显示本地实体匹配，再调用 batch-search，成功覆盖 de2。ve2排除与校正实体矛盾的OCR命中并补实体文本命中，按相交去重，scope及导航由当前合成列表推导。

### 失败与并发

- Image Ee2没有请求序号、query/cache身份复核或取消。若两次请求同时在途且旧响应后到，旧OCR results可覆盖新请求的de2；清空查询也不能阻止旧请求再次写入。catch为空，finally各自清busy。静态可达条件，未进行竞品运行复现。
- 共享DOM搜索在lowercase结果上产生UTF16索引，却用于原文本节点；大小写映射改变长度时存在范围不等价。PDF原生搜索则Array.from逐码点建矩形数组、join后用UTF16 indexOf结果slice数组，非BMP或大小写扩展可使索引与矩形错位；本增补不宣称全部Unicode输入必失败。

### 明确剩余依赖

- 未展开 Markdown虚拟窗口完整搜索 producer/窗口加载 St2(6333起) 和其他全文索引，只确认共享DOM搜索与scope消费者。
- PDF xa2/ka2 已读直接坐标组合；nr2(23449起)、Ji2/ar2/sl2/Ar2/rl2 全部旋转坐标转换尚未递归闭合。未读 pdf.js 的 getTextContent 实现，未运行Unicode/字体/分页用例。

### 持久化边界

搜索结果主要是组件临时状态；Markdown A2 watcher会触发草稿变更，PDF draft viewport可保存searchText，Mm2的图片 viewport主动写searchText为空。恢复结果还取决于各格式渲染/重搜过程。

### 证据

- `shared-kind`：`.data/research/lawbot-2026-10-13/readable/renderer.js:6142-6142`；slice SHA-256 `835476f7dbacfafd7674ec18a844185b3b3539d2384376f9ac70fedc7dbd70c2`。
- `shared-search-state`：`.data/research/lawbot-2026-10-13/readable/renderer.js:7160-7217`；slice SHA-256 `2754a12392fa41e5c7469cb4596f500ddea9c58315c27b9b8021ca269c48d49b`。
- `docx-search-geometry`：`.data/research/lawbot-2026-10-13/readable/renderer.js:7278-7341`；slice SHA-256 `3321b0bde9c89685b49a157c318ce0f840533e89615086c221bb7703d054dd98`。
- `shared-DOM-search`：`.data/research/lawbot-2026-10-13/readable/renderer.js:7342-7419`；slice SHA-256 `5f5e8dcd1349be3e2f4f52a841e2d1dda0d979b52c17a719ad558b116cf03136`。
- `pdf-native-search`：`.data/research/lawbot-2026-10-13/readable/renderer.js:22718-22832`；slice SHA-256 `6143cead487a370ac2475b6e27239f9ead82c74d99eb39f2af9fb1a91f72faae`。
- `pdf-search-scope-geometry`：`.data/research/lawbot-2026-10-13/readable/renderer.js:22833-22908`；slice SHA-256 `9839bd47aa4b2d76f1dc6053a4adf61a1c0989c021812cdf2eab3a56fd62942c`。
- `pdf-ocr-search`：`.data/research/lawbot-2026-10-13/readable/renderer.js:22979-23017`；slice SHA-256 `e79976bd951e91ff35fb9865dfae6f75791216e5199d1d3e71b0ef43f3ef1200`。
- `image-search`：`.data/research/lawbot-2026-10-13/readable/renderer.js:26285-26388`；slice SHA-256 `a2595e08e48d10425f39c023db0e02ffc79bf28c4afe8db3503ed8ad1f43703c`。
- `image-search-watch`：`.data/research/lawbot-2026-10-13/readable/renderer.js:26658-26669`；slice SHA-256 `b07ad6b277345e92344de978b53ed5777a7f42cf43f6f98737776b790df214ec`。
- `draft-snapshot`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34008-34069`；slice SHA-256 `15c1adfc00126b19eb960172f1942f788aeb53043b2ca7757e69c9e97c146341`。
- `pdf-apply`：`.data/research/lawbot-2026-10-13/readable/renderer.js:25927-25936`；slice SHA-256 `c6664e0a007b8f611526b2ec3805378a9cef285ff077e7f4da95ac3b4a84d256`。

## UI-339d8e53408d — review-preview-mode

状态：S2/R0；完整业务闭合：否。

### 本次已读父链

- Qo2在批量mo2分支只允许ready/partial活动文档；单文档分支直接调用child。进入批量统一预览先await Um2再调相应child.setPreviewMode。返回值不等目标值显示仍在加载，否则Mm2抓活动草稿并标state。
- Mm2按Markdown/Image/PDF/DOCX分别读取child draft/state；Sm2用JSON比较避免相同写入，Zh2只clone并补DOCX session字段。Cm2在统一假名开启时修style/selectedkeys并重建映射，均为内存操作。
- jm2协调器合并dirtyKeys/fileIds/fullRebuild，300ms延迟、单个运行Promise；Hm2 flush，Um2全量flush。Vm2只处理ready文件，非active且Qh2映射比较相同可跳过；先写每文件reviewDraft，再更新活动child并按耗时让出执行。
- DOCX/Markdown As2同步替换entities/settings/map，去重实体，nextTick用_i2保护解除恢复标记并恢复scroll；PDF/Image applyReviewDraft为async，会先赋值再等待DOM/重绘。PDF草稿含旋转/删除页，Image含active和deleted框。
- Du2用Mm2抓当前draft，重建schemaVersion2 snapshot、contentRevision及projectModeSnapshot，然后initialize/replaceContent；Jc2正式保存前await Hm2，失败不开始保存。Vc2检查保存期间仍dirty则留在页面。

### 失败与并发

- 协调器失败会把该批dirty请求放回待处理集合并保存错误；后台错误toast，错误状态不自动排下一轮；flush可再次处理。
- Vm2逐文件写内存和child，没有整个项目快照回滚，后段throw可留下前面已修改的草稿。dispose清待办/定时器，未取消已经运行的Promise。
- saveRecovery保护未初始化且参数不允许提示时返回false；主进程success=false/throw记录lastError，缺源文件错误可补源后再试一次。

### 明确剩余依赖

- 未展开 Nu2(32622调用)各格式snapshot序列化、workspace save/recovery preload及主进程加密/原子落盘/重开恢复；恢复正确性仍未动态验证。
- child内 gs2/zu2/forceRefreshReviewHighlights 等渲染算法和DOCX文档大型异步加载的所有取消/卸载路径尚未闭合。

### 持久化边界

这些父级更新先进入内存。批量 review-state-change 由 Qu2 420ms 合并后 Ku2→Du2 更新 workspace snapshot；lc2 仅当 snapshot 且 isDirty 时延迟 2s 调 Ec2→Ie2.saveRecovery。renderer store 串行调用 workspace.saveRecovery 并检查 success；这不是磁盘写入、加密或恢复重开验收。

### 证据

- `preview-parent`：`.data/research/lawbot-2026-10-13/readable/renderer.js:32342-32375`；slice SHA-256 `b073a9148d53d9d3cca9289b568cdf70a67f564fe2bdc49c5876e2a06bcacc9e`。
- `draft-normalizers`：`.data/research/lawbot-2026-10-13/readable/renderer.js:33648-33689`；slice SHA-256 `67eb7c75ca6f85efce7fcc88d2df3ef6fe5699b5fa1e5156fc1dda7b73c44664`。
- `draft-snapshot`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34008-34069`；slice SHA-256 `15c1adfc00126b19eb960172f1942f788aeb53043b2ca7757e69c9e97c146341`。
- `unified-coordinator`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34404-34463`；slice SHA-256 `963a765354a5cb6c069574f1c421d786bae5c4f6ba30f0307fbb80da488c9f0a`。
- `unified-apply`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34464-34527`；slice SHA-256 `0be07db95907b60a09b3c9a60d16066c809f5eaca80c5023b82c7fe3d2437559`。
- `docx-markdown-apply`：`.data/research/lawbot-2026-10-13/readable/renderer.js:8535-8567`；slice SHA-256 `4a648723c0914667f77c7b533df8999a31341744044c4b47d2db2aea3efbfe46`。
- `pdf-apply`：`.data/research/lawbot-2026-10-13/readable/renderer.js:25927-25936`；slice SHA-256 `c6664e0a007b8f611526b2ec3805378a9cef285ff077e7f4da95ac3b4a84d256`。
- `image-apply`：`.data/research/lawbot-2026-10-13/readable/renderer.js:26674-26675`；slice SHA-256 `7d7e39fe047f4f16b7780ee1c0fefdb481aa00ca01181cb5aabb0f53011e1751`。
- `workspace-snapshot`：`.data/research/lawbot-2026-10-13/readable/renderer.js:32610-32644`；slice SHA-256 `26dede67bc4a127c1cc9e133e99fd3fea23dcfd30a1a125571c7249caf7abd50`。
- `review-save-events`：`.data/research/lawbot-2026-10-13/readable/renderer.js:32675-32743`；slice SHA-256 `7fd5e053e4f3b84c4946d24125379e307e0455387517766a0af96f65de3d2012`。
- `recovery-debounce`：`.data/research/lawbot-2026-10-13/readable/renderer.js:32799-32808`；slice SHA-256 `131902a472548f5edc58196b5d2c71c06e7180ea45c766612dc2036629ead1d6`。
- `recovery-result`：`.data/research/lawbot-2026-10-13/readable/renderer.js:32839-32846`；slice SHA-256 `3413aca356647c129802c03dbd25bc721ea15b722ae1bcac0db14da1eea65e0d`。
- `recovery-store`：`.data/research/lawbot-2026-10-13/readable/renderer.js:3888-3924`；slice SHA-256 `a7e93f3732754294001b614deead6c3dd0a0a7e9eacc237ec17e0c153d63f50a`。
- `formal-save-guard`：`.data/research/lawbot-2026-10-13/readable/renderer.js:32884-32917`；slice SHA-256 `d4b919d2c7e801ed5b32bb0a2b219b5c49338be4f5694c12d9345b4f2b3d1f89`。

## UI-ad41d13c4a2d — preview-policy-hierarchy

状态：S2/R0；完整业务闭合：否。

### 本次已读父链

- 共享DOCX/Markdown Bi2、PDF kl2、Image R2把类型action写类型表并更新已有对应entries；单entry编辑保留该entry action；选择性预览调用qp(entry.action||pseudonym, type,原文,Hp解析值)。reset清类型表、currentValue回autoValue、unlock、选择性action回pseudonym，并可向父级发unified-reset-all。
- 非统一token重名时比较其他occurrences>0 entry，确认后关联canonicalKey；取消不执行本地patch。PDF映射重建保留已锁值/已有action，新action才取类型表；Image E2采用同类回退。
- 项目store buildPseudonymEntriesForFile先按UK分组，file override(原key) → file override(canonical) → customMapping(canonical) → default value，以nullish优先选择；entry locked取currentValue是否不同default。getTokenForFile另有consumer开关，不能等同该builder。
- updateToken会清该canonical族的file overrides，更新custom消费者；resetTokenToDefault删overrides及custom；setTokenForFile只写文件canonical override。findTokenConflict检查shared及file override中有活跃occurrence的其他canonical；父Gm2提示是否合并，Jm2对多文件出现提供all/current/cancel。

### 失败与并发

- token冲突确认之后Hm2失败可留下store mutation；没有整体回滚。cancel scope在父路径提前返回，但此前Mm2可能已抓取child草稿。
- 这里的优先级是所读renderer生成/预览路径。不是对主进程导出/LPM还原的完整优先级证明。

### 明确剩余依赖

- jc完整 inherited-profile/canonicalKey/tokenFor/apply实现（4418起）及UK规范化/机构简称关系（29843起）未递归展开；完整alias碰撞等价性仍未闭合。
- 未从这些entry逐一追到DOCX/PDF/Image/Markdown导出mask选择器、LPM生成及还原消费；不得把预览qp结果等同导出成品。

### 持久化边界

这些父级更新先进入内存。批量 review-state-change 由 Qu2 420ms 合并后 Ku2→Du2 更新 workspace snapshot；lc2 仅当 snapshot 且 isDirty 时延迟 2s 调 Ec2→Ie2.saveRecovery。renderer store 串行调用 workspace.saveRecovery 并检查 success；这不是磁盘写入、加密或恢复重开验收。

### 证据

- `shared-policy`：`.data/research/lawbot-2026-10-13/readable/renderer.js:7108-7152`；slice SHA-256 `2e536b57758261975ec176702805a38aad60c3db73ec8cc985930e73469b1141`。
- `pdf-policy`：`.data/research/lawbot-2026-10-13/readable/renderer.js:24557-24687`；slice SHA-256 `6d146e77aeb828dd7cf00659f7e0b024fed1b4fbd4694b393cca9fe58c1830fd`。
- `image-policy`：`.data/research/lawbot-2026-10-13/readable/renderer.js:26190-26269`；slice SHA-256 `f3c4554bd4034cccb3f6b037cbbac0464c776902098b167a287118f9bd06ea28`。
- `project-store-base`：`.data/research/lawbot-2026-10-13/readable/renderer.js:29870-29934`；slice SHA-256 `4d867673355c2c1c3f3dc0dbca6cd9940e3820f7fc88676751b5c0eda3b72d58`。
- `project-store-register`：`.data/research/lawbot-2026-10-13/readable/renderer.js:29972-30007`；slice SHA-256 `a6814e80e525a3b9bffddba701e4851f286e6f5d4040b7534ba37e58eaf41884`。
- `project-store-entry`：`.data/research/lawbot-2026-10-13/readable/renderer.js:30029-30060`；slice SHA-256 `a58ff2a1f9015575ad49d5ec7a0b7b87f791e1fcf6ffe9dbde6eb2dca4e33559`。
- `project-store-style-conflict`：`.data/research/lawbot-2026-10-13/readable/renderer.js:30061-30110`；slice SHA-256 `18a5945e2c7c9bd5234fa58390f658d855e3e43a91677d0f8fc5e3ad9b6324fc`。
- `unified-parent-edits`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34528-34574`；slice SHA-256 `404686b1ea0c8894b6ae6a0a2e23e54e58c0d11da7052af4122469f90bec766a`。
- `unified-apply`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34464-34527`；slice SHA-256 `0be07db95907b60a09b3c9a60d16066c809f5eaca80c5023b82c7fe3d2437559`。

## UI-67e30cf66ad0 — known-entity-audit

状态：S2/R0；完整业务闭合：否。

### 本次已读父链

- Rf2先Mm2再顺序遍历ready材料，非ready加入skipped；Pf2分别处理DOCX body及图片OCR、Markdown raw source、PDF native及scanned/hybrid OCR、Image OCR，最终按source/file/span/page/几何等去重并Tf2分类same/other/uncovered。
- PDF OCR成功比较checkedPageNumbers与未删页目标，缺页加入skipped；该Pf2分支并未像交互Fa2那样逐条过滤返回的deleted-page OCR命中。Image success:false或results非array没有增加skipped，仅throw/缺bridge分支记录失败。因此统计应解释为该实现实际产生的候选集。
- Tf2正文用范围相交、同type同text时要求完整覆盖；DOCX OCR用imagePath+行/occurrence或人工框重叠。PDF/Image先同页几何重叠面积/min(area)>.4；若无几何命中，按同页同文候选occurrence序号回退，优先same。这不是严格纯几何覆盖证明。
- Wf2正文补录要求有限正span，Markdown额外Qf精确且连续sourceMap覆盖；图片OCR先做同类型和路径/行/几何去重。qf2/Gf2转换候选后按同类型文本及几何去重。av2逐条校验file仍ready，替换异类先删后添；完成后重注册项目实体并Um2，iv2/sv2再刷新audit。

### 失败与并发

- Kf2/Uf2直接await Rf2结果写Hd2，所读路径无审计请求序号/材料revision复核。候选生成跨多个await读取可变材料状态。
- av2 replaceOther先Vf2删除；若随后Wf2因Markdown映射缺失/转换失败返回false，没有恢复已删旧实体的分支；补录计数只统计返回true。
- Um2失败或中途throw无跨文件原子回滚；Ud2 finally清busy。

### 明确剩余依赖

- vf2 PDF native全文抽取（34679起）、ff2/pf2/xv2候选几何转换（34673/34660/35294起）尚未递归展开；uf2与cf2直接算法已读，不等于整条geometry闭合。
- 未读所有gf2上游draft生成和重新识别并发版本门；需要动态覆盖删除页OCR、sourceMap缺口、失败返回与审计切换。

### 持久化边界

Wf2/qf2/Gf2写reviewDraft/detectedEntities/detectedBBoxes并刷新活动child；Um2及child事件可能继续快照更新，但av2/Rf2本身没有await持久化。这些父级更新先进入内存。批量 review-state-change 由 Qu2 420ms 合并后 Ku2→Du2 更新 workspace snapshot；lc2 仅当 snapshot 且 isDirty 时延迟 2s 调 Ec2→Ie2.saveRecovery。renderer store 串行调用 workspace.saveRecovery 并检查 success；这不是磁盘写入、加密或恢复重开验收。

### 证据

- `audit-geometry`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34629-34652`；slice SHA-256 `e748a08eccff038efaed5349f1a815ae899c6e48b2aa77061e384cb32a3706be`。
- `audit-entities-and-cover`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34744-34827`；slice SHA-256 `060772b690ebf5619bdad2f717428a20400b86724ef5d86543671e8344edd901`。
- `audit-matches`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34828-34927`；slice SHA-256 `c695f29a4f8c63c1b8dc58a7ac2833c439db4626ad66c85e76a42ff3a7c0c261`。
- `audit-open-refresh`：`.data/research/lawbot-2026-10-13/readable/renderer.js:35036-35046`；slice SHA-256 `cf4da3e19a9cb2fd42fd2fe72d1004abced112cb1d663c1307727c02f08f2433`。
- `audit-mutation`：`.data/research/lawbot-2026-10-13/readable/renderer.js:35047-35148`；slice SHA-256 `c16abb68c0807d81001e86199396f6cbc30edce0b5d0a815d7a23d8987e9d4de`。
- `markdown-map`：`.data/research/lawbot-2026-10-13/readable/renderer.js:5898-5920`；slice SHA-256 `beb066917a93819c3723812a386c316add641a47cd7c4bbadb29d1d6aa076532`。
- `draft-normalizers`：`.data/research/lawbot-2026-10-13/readable/renderer.js:33648-33689`；slice SHA-256 `67eb7c75ca6f85efce7fcc88d2df3ef6fe5699b5fa1e5156fc1dda7b73c44664`。
- `draft-snapshot`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34008-34069`；slice SHA-256 `15c1adfc00126b19eb960172f1942f788aeb53043b2ca7757e69c9e97c146341`。
- `parent-bindings`：`.data/research/lawbot-2026-10-13/readable/renderer.js:37517-37517`；slice SHA-256 `db604dee36d704b14ecedc799c9f30b2f7a98c87cfe4760dc9355a30591c0a1a`。

## UI-32ce2fb60c5f — manual-correction-scope

状态：S2/R0；完整业务闭合：否。

### 本次已读父链

- DOCX Xs2/Qs2、PDF zl2/Vl2、Image tt2/st2：preview清plan/summary后选择project handler或本地plan；apply可使用已有plan。manual本框先插入再执行project apply，本地则添加本框并处理计划未覆盖命中。finally只复位loading，无先前修改回滚。
- 本地DOCX Ys2只取image_ocr候选；PDF Ll2取OCR候选；Image et2请求OCR候选。三者将同实体目标与其他重叠实体冲突分开，人工当前区域可排除自身；PDF/Image manual不对计划的所有same targets统一改文，而走手工当前框与uncovered补录。
- 项目jf2缓存Wd2：Df2键只含recognizedText规范化值、correctedText.trim、targetType规范化、source、sourceFileName、sourceEntityId；不含sourceAnchor、文件ID集合、draft/contentRevision。相同键直接复用计划。apply按entityKey遍历当前实体；未覆盖/补录只检查文件存在且ready，然后重注册所有ready文件并await Um2，成功尾部才清Wd2。
- PDF Rs2同位置批量先规范化原框相对页宽高，逐页读取参数；取消序号gs2、每页循环开始检查已耗时>30s（不打断正在await的Es2）、deleted页、参数失败、兼容性和已覆盖>=.9分支分别记录。候选先积累，结束且序号仍有效才一次emit add-entities；支持按samePositionBatchId撤销。

### 失败与并发

- Wd2全文只有声明、读取、赋计划及成功尾部清空，没有材料/草稿变更watch失效。预览后同key、材料发生变化时仍复用旧命中/summary；apply部分就地检查不能等同重算。若Um2抛出，已修改实体可留下且Wd2仍保留。
- PDF区域批量相对位置采用Pb/Ib等helper。本文只确认父循环的防护和提交时机，不据此断言旋转/裁剪几何正确。
- manual项目路径当前框先写、后续project apply失败，没有事务撤回；UI提示/summary不证明成品导出。

### 明确剩余依赖

- PDF Es2/Pb/Ib/As2/Ts2/Is2完整相对坐标转换及DOCX同图批量路径未展开；本节只读PDF Rs2父控制流。
- DOCX sn2(6455起)所有本地匹配、PDF so2与Image Xe2搜索包装、manual hs2/Ul2/yi2建实体实现尚未完整递归闭合。
- 未动态验证关窗、切换文件、预览期间重新识别/删除实体、异步错误后重复apply、保存重开和导出；仍R0。

### 持久化边界

修正修改当前草稿/框和项目内存；部分local成功发review-state-change/ocr-text-corrected，Vd2抓Mm2并更新统一映射后Du2→lc2。jf2自身无workspace保存调用；正式保存仍需Jc2/保存链成功。

### 证据

- `docx-local-correction`：`.data/research/lawbot-2026-10-13/readable/renderer.js:8690-8743`；slice SHA-256 `c2ade3388fc6484c5ccc8779e76bd75349db92c550f936c98155415ae4cef423`。
- `pdf-local-correction`：`.data/research/lawbot-2026-10-13/readable/renderer.js:24735-24814`；slice SHA-256 `007955948e0158e15468755fe967bd01a1aed8879d28807970403536e5ed1b42`。
- `image-local-correction`：`.data/research/lawbot-2026-10-13/readable/renderer.js:26520-26589`；slice SHA-256 `1307732e7fa0b8b89c84bc63513f46042cca0c30ad091f3fb19070732fa2bb7d`。
- `correction-key`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34928-34964`；slice SHA-256 `943f91741168c805f46e32073c740b977d1c614fa1abe76cfd9b76ca471cd88c`。
- `correction-project-plan-apply`：`.data/research/lawbot-2026-10-13/readable/renderer.js:34965-35034`；slice SHA-256 `6d3c9666ca33fba7b2e4d5b5f36ebbd171d5ea23bdeca48c076695567e70d075`。
- `pdf-region-batch`：`.data/research/lawbot-2026-10-13/readable/renderer.js:23725-23794`；slice SHA-256 `5da3ca4e2e0532ad235e9c7cc71384c437c9d6993b4c39802089a70c619b8503`。
- `root-state-and-cache`：`.data/research/lawbot-2026-10-13/readable/renderer.js:33404-33424`；slice SHA-256 `3a53e68ccc6051c9779e483a69bacdc9ae17c17440358e0ee081dec89ad75669`。
- `parent-bindings`：`.data/research/lawbot-2026-10-13/readable/renderer.js:37517-37517`；slice SHA-256 `db604dee36d704b14ecedc799c9f30b2f7a98c87cfe4760dc9355a30591c0a1a`。

