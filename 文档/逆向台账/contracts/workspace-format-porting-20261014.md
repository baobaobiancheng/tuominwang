# 工程格式与审查记录互通（ITER027）

源版本0.5.9；竞品许可处理运行仍R0。本表每个入口均独立列证据，不能用native备份替代source格式互通。

| ID | 源入口 | 我方API | 实际行为与证明 |
|---|---|---|---|
| IPC-e6a8f1b41825 | workspace:create-transfer | POST /api/projects/:id/portable/export format=secure-v2／secure-v3 | 密码传输slot、AEAD整包、原件与完整native资产hash、source V2纯schema验证、三格式重新打开验真；tests/workspace-compat.integration.ts case1; tests/page-review-storage.integration.ts |
| IPC-70e09702200d | workspace:receive-transfer | POST /api/portable/import | 用户给定传输密码验证后另建项目；新AEAD域与新材料/映射ID，重新识别，旧approval/artifact不信任；native和真正foreign source输入均实际跑通；tests/workspace-compat.integration.ts case1/2/3 |
| IPC-f417c3628886 | workspace:migrate-v1-to-v2 | POST /api/portable/migrate | ZIP→V2→V3真实编码转换，全部sources逐bytes、全部snapshot归一后深等价，错密/篡改拒绝；tests/workspace-compat.test.ts case2; actual case1 |
| IPC-feb24aa50a4f | workspace:open | POST /api/portable/import; GET/POST /documents/:id/portable-draft | 旧native、source三格式完整导入；外部旧review按source/hash/新canonical anchor/context/sourceMap绑定恢复pending，歧义原条目完整保留并阻断导出直到逐项人工处理；tests/workspace-compat.integration.ts case1/2/3; tests/page-review-storage.integration.ts |
| IPC-c356082df625 | workspace:save | POST /api/projects/:id/portable/export | 当前工程全材料/原件/预览/字形map/文档策略/marks/raw类型/mapping/forms/源archive/state+历史snapshot完整编码；native extension无损封装源未知字段；.markdown大小写及sourceExtension真实源schema通过；tests/workspace-compat.test.ts all; tests/portable.integration.ts existing102docs; new private-region actual |
| IPC-ff1d1193dc22 | workspace:save-as | 同export浏览器附件另存，native .tmw或source .tmm | 真实重新生成、校验、下载完整备份。浏览器另存位置由用户控制，绝不返回伪造宿主绝对路径或覆盖不可变原件；actual case1 allformats; core codec roundtrip |
| IPC-1d575f4ee880 | workspace:read-review-profile | POST /api/portable/review-profile | 直接提取并调用源main20094-20202纯规则ey及全部依赖，完整corrections/pseudonyms/reserved/conflicts；不调用licensed engine；tests/workspace-compat.test.ts source profile cases; actual case1 |
| IPC-98cb505df8ea | workspace:select-review-profile | POST /api/projects/:id/portable/review-profile | project锁+双权限+CAS；冲突必须选择。真实active规则快照、immutable假名和reserved集合；source raw identity/forms/标准profile/旧路由scope继承；旧文档outdated必须重识别复核；actual case1 wrapper/plain × DOCX/MD, source policy unit; mapping-capacity actual |

## 验证记录

- **workspace**：.data/evals/workspace-compat-api.log: 3/3PASS, 22.85s+2.58s+4.16s; sourceformat/native/sourceprofile/all inherited MD+DOCX restoration fields; legacy rawMD→scan-safe pending→new export
- **privateMetadata**：.data/evals/page-review-private-api.log:1PASS10.17s; encrypted doc/snapshot+preview/export+native/TMM pendingconfirmation+legacybackfill+issuedlink
- **capacity**：.data/evals/mapping-capacity-api.log:1PASS4.21s; 1001st actual alias/1001 actual export-reimport/reserved+highcounter wrap/SQL100000-boundary
- **imageSearch**：.data/evals/image-batch-search-api.log:1PASS3.87s; actual2PDFpages/auth/CAS/sourcehash/hiddenmalformedglyph

## 明确边界

- Source licensed document engine remains R0; static schema/oracle and our runtime are separate evidence.
- Local CMK/keychain/biometric workspace slots remain device-bound; user must provide password-transfer container. No key bypass.
- No unsafe automatic coordinate trust: differing render geometry/ambiguous occurrences remain explicit unresolved items with complete original record and export-blocking coverage, user re-marks or explicitly discards.
- Native-only TXT/CSV/XLSX project documents project to inert Markdown for source application; immutable original formats and every native asset are retained in integrity-bound native extension.
- Browser save/open paths use user file selection and downloaded attachments; source local path strings/atomic host replacement are not fabricated.
- Source obsolete party_slots is normalized by source main25946 semantics, not a newly invented party-slot generator.
- Global final check/Edge/deployment and final immutable ledger pins are owned by root.

## 最后独立复证及绘字语义

- A 独立全3实际API PASS46.34s；source mode 定向回归1PASS28ms。
- 源光栅仅 `meta.pseudonym && masked` 绘字；可信 native bool、明确 meta bool 优先。整体 full/default 不绘星号，selective partial/full/custom/alias 绘字，mask 不绘；旧 usePseudonym 不能压过真实 selective renderer。未知模式原记录保留且导出阻断。
