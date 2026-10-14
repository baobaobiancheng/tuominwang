# 工程迁移与文件还原：完整证据矩阵（2026-10-14）

本产品 `.tmw` 与参考 `.tmm` 分开标识；完整保存状态不等于参考状态在本产品已执行。没有许可证的对标处理链仍为 R0。

|ID|分支|当前状态|证据／边界|
|---|---|---|---|
|P01|安全容器头/逐块AAD认证|implemented-tested|LBTSC001、固定头、DEK、nonce/tag、完整块认证；损坏块/头/长度均拒绝|
|P02|密码 transfer wrap slot|implemented-tested|自有password包/已知transfer槽；未知local-CMK需要合法DEK，未解锁不猜测|
|P03|TMM V1 schema1/2|implemented-tested|真实lawbot-tmm manifest/workspace/checksums/source兼容codec，不冒用native工程格式|
|P04|TMM V2 segmented|implemented-tested|index/profile/rules/project mode/decisions/audit/source/state/OCR JSONL完整读取和生成|
|P05|TMM V3 payload chunks|implemented-tested|documentText UTF16 logical ranges、canonicalDocument、docxStructuredInput、MDsidecar、hash/size/chunk验证|
|P06|TMM V3 collections|implemented-tested|10个文档集合、12个project集合、全部segments、mergeSnapshots/fileOverrides重建|
|P07|V3 index/声明/lookup|implemented-tested|ID/顺序/name/kind/count/size一致；lookup bucket hash校验保留，不具竞品lazy查找执行|
|P08|Markdown source binding|implemented-tested|sourceSha256/sidecar一致；未复刻完整MarkdownInputAdapter sourceMap语义|
|P09|自有工程 native tmw|implemented-tested|独立manifest并明确格式名，完整原件/正文/复核草稿/词表/方案/规则/映射/分页/assets/snapshot原始元数据保存|
|P10|完整项目分页|implemented-api-tested|实际102材料：100小文本+132000字节TXT+真实OCR PNG；导出跨100分页，无截断|
|P11|材料独立方案/batch|implemented-api-tested|document_policy解密/校验/新AAD重封/revision1，is_batch完整沿用；project模板不覆盖材料方案|
|P12|安全导入新工程|implemented-api-tested|new project/doc/mapping IDs、current tenant/owner；不导入账号权限成员；fresh worker解析，旧签发副本/snapshot不可信|
|P13|旧native正文/OCR继续|implemented-api-tested|source hash+fresh预览逐像素/尺寸/旋转/part/完整anchors/UTF16 glyph/全text校验；保留freshpreview，保守重建map；实际0→1改字恢复；旧migration002合法TXT规范anchor恢复实测通过|
|P14|旧native标记/alias|implemented-api-tested|全部pending，alias按token+value+kind检查映射改newID；fresh识别和旧manual合并；当前revision无已验收snapshot；模板禁用类型也不丢旧人工标记，实测alias恢复|
|P15|旧区域/删除页继续|implemented-api-tested|所有旧区域/删除页为候选；confirm/discard显式动作、新regionID、revision CAS、project/document锁；实际区域确认通过|
|P16|伪造草稿/预览|implemented-api-tested|即使archive内部hash正确，预览像素改变仍400 PORTABLE_DRAFT_PREVIEW_MISMATCH；原件及revision不变|
|P17|LPM0.5/0.6与旧表|implemented-tested|mappings/details/forms/occurrences/entityMap/legacy数组，canonical排序、occurrence队列保留；歧义主动让用户选择|
|P18|Markdown还原|implemented-tested|raw/转义/HTML三套单次最长token替换；未知token/0替换明确失败，不复制失败原件|
|P19|DOCX全已知story还原|implemented-tested|body/table/textbox/default-first-even headers/footers/footnotes/endnotes/comments/delText/cross-run；保首run格式|
|P20|DOCX email/URL/same-run|implemented-tested|重建安全mailto/https关系；同run多w:t所有节点一次修改，序列化文本逐段验真；邮件+姓名/邮件+邮件反例通过|
|P21|token normalize|implemented-tested|DOCX空白/zero width/FEFF规范化一致；歧义key碰撞拒绝，MD不宽松接受无法替换的变体|
|P22|派生还原API/权限|implemented-api-tested|restore权限+owner/RLS+new artifact hash；独立derived_restorations，不覆写原件，不进入旧签发artifact；foreign tenant404|
|P23|前端入口|implemented-await-browser|WorkspacePortable、RestorationFiles、ImportedPortableDraft真实组件/密码输入/选择冲突/下载/恢复确认；root挂main并做真实浏览器验收|
|G01|reference TMM旧review转本产品继续|open|raw完整保留+fresh识别可用，参考canonical/entities/BBoxes/decisions不同格式尚未逐字段转换；明确PORTABLE_REFERENCE_DRAFT_CONVERSION_REQUIRED，不能宣称完整互通工作流|
|G02|对标本机CMK/native safeStorage|requires-owned-key|有合法DEK核心可解包；未获取用户CMK不解锁。不是授权绕过，也不是所有真实保护工程都能打开|
|G03|超大工程/磁盘lazy协议|open|现有50MiB文件/256MiB解包预算内；完整buffer codec不是竞品32GiB磁盘lazy/random-read等价，高成本KDF明确拒绝|
|G04|legacy DOC/WPS转换|open|还原入口明确支持DOCX/MD/TXT；DOC/WPS需合法可用Office/LibreOffice转换与保真验证，未伪造正常输出|
|G05|外部互通与保真|requires-licensed-validation|没有合法对标产品生成/回读的真实TMM/LPM处理样本；自合成roundtrip不证明native互通成功；9story合成OOXML不等于所有Word版本版式保真|

## 本轮实测

- 23 项定向 core 单测通过；密码头/中间块损坏、ID/计数不符、DOCX多 text节点、zero-width、冲突映射等真实反例。
- 真实隔离数据库/存储 API 流程：102 材料导出全部分页、解密导入新工程、worker 从不可变 PNG 原件重新识别、OCR 最后一位 0 改 1 草稿恢复、全部标记 pending、freshpreview保持、旧区域手动确认、伪造预览拒绝且 revision 不变。原文件、映射和每材料方案跨新AAD恢复；foreign tenant404。
- 保存和签发门未绕过：导入不创建旧 trusted snapshots，恢复新 revision 无验收快照；旧签发artifact不导入。
- 两项文本跨对象 P2 已独立复跑关闭，见 `review-rules-by-visual-20261014.md`。C审查提出的100KiB正文导入上限、同run多w:t假成功、zero-width预扫描不一致已修；最新草稿和材料方案增量待C最终回读。

代码和来源完整 SHA256、来源行区间、日志地址在同名 JSON。前端真实浏览器及整体 `pnpm check` 由 root 统一完成。开放项 G01–G05 不应改写成“全部等价/完全互通已完成”。

## 还原标签补充复证

普通正文标签 `【重要】` 不再冒充假名；已知家族、真实数字counter、破损wrapper和歧义仍严格拒绝。共享 `inspectRestorationTokens` 仅返回未知候选，不泄露原值。Word/Markdown 正例与未知/zero-width负例追加后，portable+restore共14项通过。
