# ITER025–026 规则更新、文件字典、报告及 Markdown 人工稿

精确当前文件 SHA256 见同名 JSON；旧 ITER024 manifest 为历史证据，不重新标为当前文件。竞品正版完整流程未运行（R0），下列为独立实现与我方验收，不能表述为已证明竞品运行等价。

| 稳定 ID | 源分支 | 当前运行路径 | 验证 |
|---|---|---|---|
| A-025-runtime-rules | main17183–17197/9296/9439 | 项目/文件、用户私有规则 → 全文原文 literal variants → 工作任务及 OCR 重检 → 新版本待审；任意 raw 类型保留 | 实际 API、raw **** 输出；6 单测 |
| A-025-dictionary-files | D2/R2/j2/W2/main18634 | 18 属性、2 动作 XLSX → 完整行错误预览 → 个人词条 → 显式迁入未启用规则库 → 选择后识别 | 5 单测、真实模板/导入预览/第二次一次性提示 API |
| A-025-processing-reports | main18044–18086 | 当前全部材料快照与真实原件/副本 hash → 私有 AEAD → JSON/HTML/MD/CSV/ZIP | 权限撤销/owner/真实导出 hash API；5 单测 |
| A-025-markdown-stats | Zf/main15528–15566 | 成功 MD 主/副产物 commit、最终失败、真实取消、人工稿实际保存 → AEAD 事件 → 实际计数 | 480 源纯函数 oracle 零差异；真实 success1/failure1/cancel1；drafts2 |
| A-025-resources | main17066 开发诊断 | 原生 registry/cache 字段及不可用原因 + 独立真实服务端资源统计；模型 OCR 健康由 B 模块提供 | 实际授权统计 API；不杜撰原生 cache 命中数据 |
| A-026-manual-markdown | main17117–17129，renderer31953/37175 | 原始 MD/已生成 MD 副本/明确转换文字 → 编辑 → 双 CAS → 不可变 AEAD 人工稿 → 带风险警示下载/再次编辑 | 实际 API 2 通过；C 独立复证 2 通过 |

## 完整性与兼容差异

- Runtime 源更新现存原生引擎；云端返回 `appliedToTasks:0` 并真实排新 revision 重识别。源 blacklist deprecated 与 spot immediateOnly 的无操作分支保留真实 receipt，不伪报执行。
- Raw 类型从 mark/规则/同 span 去重/策略/映射/导出到 UI 保留。动态 name_/org_ 前缀不猜成已知类型；源仅 `org_name`、`address`/`address_label`/`address_inline` 计算特殊 mask，exact provenance 标记区分中文兼容 alias 与 raw 类型。
- XLSX 可见源三列不变；我方隐藏 D 列记录原始实体类型，避免源 W2 将未知类型导出为 other 的不可逆损失。无 D 文件仍按源类型兼容导入；有 D 时校验可见类型族一致。源下拉范围只列前 14 的错误改为完整 18。公式样式内容写为文本，不执行。
- 白名单为强制识别，黑名单为强制跳过。个人旧名单先迁入规则库且未自动启用，不提示“保存后立即生效”。
- 报告默认不含原文；含原文需要生成和每次下载均有 view_mapping。规则 hash 依据每份材料保存的 recognition snapshot，不把新方案倒算为旧识别结果。不会把固定 OCR 分数、上传零字节或离线率当实测。
- 人工稿只生成独立待处理文件，不创建批准复核或 verified artifact。双 CAS、首次并发、idempotency、源码与编辑/输出 hash、owner、撤销权限、原件删除级联均真实验证。打开旧稿返回原编辑内容，不重复插入警示；下载才添加源固定两行警示。
- 原生 resource diagnostic 的 sourceRefs/canonicalDocuments/managedSourcePaths/engineOcrCache/ocrDataCache 均有字段与不可用原因；实际云端统计另列，服务端路径不外泄。

## 验收证据与未完成

- 当前 5 个定向单测文件共 20 通过；人工 MD 实际接口 2 通过 4.36 秒，C 独立 2 通过 1.633 秒；处理可观察性实际 API 4 通过 12.03 秒。
- B 独立 Edge 已关闭浏览器 Node 依赖导致白屏的 P1：实际登录、项目、批量文件、ZIP 和刷新查回 1 通过 14.8 秒，pageerrors 为空。证据 `iteration022/restoration-batch-edge.log`。
- 21 份材料真实 Edge 验收 1 通过 10.9 秒：全量分页、项目 scope 请求包含 21 份、首屏外最早材料实际 raw 候选、报告/资源均 21、pageerrors 为空；截图 iteration025/all21-project-rules-report-edge.png。早期 locator 精确匹配嵌套 select 选项、display:contents 截图、开发热刷新干扰均保留失败运行，不混作成功。
- progress/page-processed/release-sources/cleanup-paths 在 ITER027 独立继续；未用 queued/running 通用状态冒逐页事件。
- 最终全量门禁、当前生产部署由 root 完成；竞品许可运行 R0 保持明确。
