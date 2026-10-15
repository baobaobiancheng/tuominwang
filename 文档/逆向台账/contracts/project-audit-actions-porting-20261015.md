# 项目实体逐项查漏：实现与验收记录

依据脱敏猫 0.5.9 公开前端 Kf2/Rf2/Pf2/Tf2/av2 有限调用链补齐已有项目查漏面板。精确范围、哈希和边界见[根 UI 合图](root-ui-six-semantic-join-20261015.md)。竞品许可运行保持 R0。

| 操作 | 当前实现 |
|---|---|
| 分类 | 逐位置列同类、异类、尚未标记、人工保留和冲突；部分忽略交叠列冲突 |
| 单处添加或异类替换 | 全项目版本 CAS；原子事务保存；新标记待确认 |
| 定位 | 长文本精确选区；页图定位到对应页面与实体 |
| 未就绪材料 | 单列跳过，处理后重新核对 |
| 几何保留 | 仅清理被替换实体认证 ID 的绑定，保留其他实体位置、ID 与审批 |
| 反馈 | single-delete FP、audit-add FN；仅活跃授权任务接收文件范围临时规则 |
| 读图 | 单请求、同一锁定文档只验证原件/预览/map 一次；不跨请求缓存 |

## 独立审查及当前门禁

- 交叉审查修复：批量计数与写入不一致、部分忽略误归类、文本未选区、源比较大小写/NFKC 差异、重复读图、替换后几何绑定残留。
- 11 文件已应用，447 项产品源码冻结。完整 pnpm check 通过：128 文件、733 单元测试，Bend 11 条法律、13 个反向变异、类型检查与构建均通过。
- 39 个受影响和剩余 API 文件正在独立数据库串行运行。项目查漏 3 项通过；新双页 PDF 1 项通过（68.43 秒），检查只删目标绑定、其他 ID/几何保留、FP/FN、待确认拦截及实际下载第二页的像素：调整框内且默认 glyph 外扩 2 单位之外为黑色，原预览同处为白色。
- 新增 3 个 Edge 场景、七类操作尚未运行；独立静读不能代替运行。
- 服务器尚未更新。本报告不声明部署完成或竞品等价。

## 当前文件指纹

| 文件 | SHA-256 |
|---|---|
| `apps/api/project-entities.ts` | `5a85aa8d9aacd24749ec57b67298adc8937079f9f118b984e8b2bd2ed5dda8b4` |
| `apps/api/review-feedback.ts` | `8184395e2e8d56a0ca4b38a8f691f7850bfaa9a3e20056982ca218473a9aea01` |
| `apps/api/review-feedback-entities.ts` | `b70bb67474b585aff6b89f7b21c04d0d28c397634f04d994095ff012355ff8f5` |
| `apps/web/main.tsx` | `302fdbcfe58c93acf4bcddf62320c27c844aadc292c4a9d83f285bcf5501c4be` |
| `apps/web/project-entities.tsx` | `9e5d28b7d0aff89528ab8e04c29202d7512d78a6f1605a8b668a9c4fbe51fd75` |
| `packages/adapters/project-entity-corrections.ts` | `8142069c928b3118d23c35479e1cea0abd3435863701b1f4bc9482a6c4519137` |
| `tests/project-search.integration.ts` | `f7cddba619729d461f9e8bb413d782ece19ec00baa84af59f7fd31075e4e7b0a` |
| `tests/project-audit-normalization.test.ts` | `5a8e038de41464fa74c5ceb3bcf05651fe595dcfc2e86f19a3c4cd1dc45dc2e6` |
| `tests/project-audit-batch-facts.test.ts` | `f51090ca762dfa6d27193cd301a2aef8532007a64892655645b6be69662f5d0a` |
| `tests/project-audit-geometry.integration.ts` | `aef3b33a9b43a51c5c1c5d3d07fd747daad3cf7cb959bbba8b2b2758bbc43b06` |
| `tests/e2e/project-entities.spec.ts` | `e1832e7ab609531c4153f63811e9b14902021134f1e89155431d8cd2cc8983a9` |

本地 iteration039 保存应用清单、修改前字节、预飞失败和后续修正记录；原失败不会被后续通过覆盖。
