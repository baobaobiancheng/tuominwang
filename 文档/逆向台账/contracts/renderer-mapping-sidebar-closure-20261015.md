# 统一假名与原文侧栏：逐分支移植证据（2026-10-15）

> 有限静态S3候选：仅两个原稳定UI入口及列明依赖，待父级逐ID采纳；R0：未运行授权竞品处理链。53个同伴范围独立hash复核与静态边界见 renderer-finite-static-closure-20261015。纯函数oracle、我方API、真实浏览器分别记录。

## 调用链

```mermaid
flowchart LR
  detect[实际识别 / 显式组织释义 / OCR语义纠正] --> registry[jc继承注册 + UK键]
  registry --> state[YK项目/文件统一假名]
  state --> plan[只读语义变化分析]
  plan --> persist[AEAD状态 + 不可变组版本]
  persist --> review[真正变更标记转待确认]
  review --> approve[人工复核]
  approve --> flush[出口独立事务flush + CAS]
  flush --> artifact[不可变签发副本]
  artifact --> restore[完整当前occurrence计划还原]
  source[认证原件+Markdown sidecar] --> graph[Af/Ef/Nf/_2参考呈现图]
  graph --> sidebar[query/type/rounded score + UTF16定位]
  source --> all[所有候选：保持真实index可复核]
```

## 逐分支与证据

|源码链|范围|我方实现|
|---|---|---|
|cc/Lc/jc|4204–4207；SHA `ec97314e9c03`|packages/core/reference-alias-lifecycle.ts；完整类型族归一；未知raw在我方canonical仍保命名空间|
|jc lifecycle|4404–4490；SHA `f8b747f1df5e`|packages/core/reference-alias-lifecycle.ts；enabled/max/reserve/set/snapshot/canonicalKey/tokenFor/apply；继承reserved、旧locked与别名映射|
|organization af/rf/sf/of/uf|5476–5547；SHA `582b41750fd0`|packages/core/reference-alias-lifecycle.ts；64泛化词、合法后缀、当事人过滤、最长检测后缀、显式括号释义与最近位置|
|Mf/Af/Ef/Nf dependencies|5558–5713；SHA `88fd47bd05b9`|packages/core/reference-entity-conflicts.ts；归一重复、组织全简称/语义位置容差、金额规范、手动/table优先、合成跨类型冲突图|
|Kf|5800–5868；SHA `056700e77ef3`|packages/core/reference-sidebar.ts；4096块、2048换行、CRLF/代理对、连续protected ranges、实测块高、binary索引与overscan|
|ReviewModeContainer v2/_2/S2|6107–6141；SHA `446f924dacdf`|packages/core/reference-entity-conflicts.ts；排除deleted/invalid、人工图片保留例外，依Af/Ef输出参考可见候选；canonical全候选不删|
|V2 Canvas/protected link caller|6164–6169；SHA `587f95878084`|apps/web/source-review.tsx；实际Canvas字体13px Consolas/MSYaHei/monospace，tab四空格；全部Ho2链接跨度加入Kf保护；虚拟门100000且无表格/查询|
|Ho2/Uo2 source links index|8961–9021；SHA `50648ab6ebd1`|packages/core/reference-markdown-links.ts；inline/reference labels、定义、容器范围、去重、prefixEnds binary区间定位；这里只索引不冒称Pf处理预览|
|xt2/kt2/St2|6300–6361；SHA `c988a239f999`|apps/web/source-review.tsx；同cell gap-free段映射、UTF16精确选区、唯一有界定位、虚拟块跳转/DOMRange定位|
|Ti2/Ei2 fullName actual producer|6988–7051；SHA `4fa64b943265`|packages/adapters/unified-aliases.ts；docx/Markdown显式括号释义生成meta.fullName；不猜PDF/image未有fullname|
|Ao2/To2/Eo2|8795–8832；SHA `a8b8fd42755f`|packages/core/reference-sidebar.ts；手动呈现优先、containment窗口、精确类型、query trim/lower、Math.round后置信区间|
|UK/VK/YK|29843–30188；SHA `1da2e7cce6ce`|packages/core/reference-unified-aliases.ts；完整键/分组、default/custom/consumer、合并历史、文件override、split/unsplit/style、register/unregister、snapshot全字段|
|jm2/Km2/Hm2/Um2/Vm2|34411–34539；SHA `1f23bec83dbe`|packages/core/reference-alias-sync.ts;apps/api/unified-alias-materialization.ts；300ms去抖、串行busy、dirty/full覆盖、失败整批requeue、导出前flush、ready/affectedfiles、4格式renderer apply|
|conflict/change/reset/scope/merge/split callbacks|34540–34590；SHA `acfdbd870148`|apps/api/unified-aliases.ts;apps/web/unified-aliases.tsx；同token冲突、全部/当前文件scope、reset、merge、splitMerged、splitFile、splitToken、flush与autosave|

## 已运行验收

- jc/YK：56次真实方法调用，每步完整snapshot/rows/inheritance与提取纯源码一致。
- 冲突图：114组完整重复/合成/交叠记录及呈现候选逐输出一致，输入证据保持不变。
- Kf/To2/Eo2：4类长文块、8类筛选；补94.95%与95.01%均先round95、缺失置信度为0的边界。
- 隔离API：最新3项完整流程52.559s通过；追加inherit/selective/splitMerged/恶意循环合并拒绝且不增版本已真实闭合。
- 完整原值筛选：1项真实API6.734s通过；7000字以后TAIL命中、raw类型/原序号、可信分数、租户/版本/原件hash、只读不保存均核。
- 浏览器：统一假名第四轮1PASS38.3s并自然退出，包含真实TXT下载与逐处还原；原文长文定位新spec等待共享端口写窗，未冒称已运行。

## 明确差异与边界

- All originals, old v1 rows, immutable group versions and signed artifacts retained; no latest version substitution.
- Group state/forms/history are AEAD sealed. Version SELECT uses existing project access for backend verification; public listing still view_mapping.
- Token/state semantic changes commit actual pending revisions before export REVIEW_REQUIRED; forms-only expansion retains legal old approval refs.
- Multi-form/mixed-version restoration requires authenticated exact full current output occurrence plan. Arbitrary shortened text is rejected; single-valued legacy arbitrary restoration unchanged.
- Graph affects reference renderer only; all candidates remain reviewable, hidden pending are not auto-approved.
- Counter bigint avoids source JS overflow Infinity collisions. Portable malformed graph cycles fail before persistence.
- Cloud durable all-document flush is atomic; source Vm2 may partially mutate in-memory draft before later renderer failure.
- Opaque entity IDs are transport only and validated one-to-one against current server frame; absent identity for ambiguous duplicate histories fails closed; fresh IDs reserve all existing/tombstone identities.
- Whole-record/span slot indexes process a 20,000-row legitimate bulk decision update without global pairwise matching.
- Whole canonical worker filter keeps raw namespaces and real indexes; incoming score/source discarded by reviewMarks, human additions score0, immutable file anchor validation enforced.

- Licensed competitor processing remains R0.
- Unified aliases actual Edge PASS38.3s; source Markdown long-source Canvas/link/selection spec still awaits serialized actual Edge window; no pixel-identical Vue presentation claim.
- Reference graph raw_ literal names now follow exact source cc(other); canonical raw identity remains fully distinct and available through all-candidate review.
- Organization fullName is from explicit source Ti2/gv producers, not global abbreviation inference.
- Source graph normalizes unknown type families for reference presentation; canonical raw identities and all-candidate path remain separate.

完整方法、调用点范围hash、文件hash、实际日志路径见同名JSON。
