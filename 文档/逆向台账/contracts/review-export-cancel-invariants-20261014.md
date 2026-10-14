# review-export-cancel-invariants

独立只读人工重点范围；不执行竞品。全部证据hash校验不等于全量语义重审。

目标 SHA256：619a0cfd16e175a9804348cec7f5810ac10bbcef050911b07215e78e813dce32；全部 9 证据hash；人工 7 范围；S2/R0。

- EC02条件反例成立：显式目标未统一拒绝同源，A2默认覆盖，成功后v2登记再Gp；finally仅看abort逐路径rm，没有源路径保护判断。未声称正常UI每条路径都能选择同源。
- EC03/06区分正确：成功receipt preserveOnCancel只约束后续cleanup-paths；末尾await日志/读文件可让abort晚到，receipt已记success而finally仍删除，receipt不证明文件仍存在。
- EC04 Markdown替换目标ue2/me2排除清理，非交互拒绝既有目标；原Markdown提交后无相同Gp，不同writer取消点不能归为同一保证。
- EC05异常时部分文件不保证回滚，cancel handler没有同sender判断；getApplyResult/cleanup-paths有独立sender检查，不能互相替代。
- 本审查发现非Markdown Ee2.success=false早退绕过completed写入；作者已将EC06与范围17784修正，当前回读通过。
- 前端Xp2/Pp2、tm2和四次查询语义支持EC07；没有全批次事务保证。

## 发现

- {'id': 'REC01', 'priority': 'P2', 'status': 'fixed', 'detail': '非Markdown失败早退留下running回执，已补EC06并前移证据起点17784；不是自动把r2置completed。'}

## 人工范围

- .data/research/lawbot-2026-10-13/readable/main.js:16750–16787
- .data/research/lawbot-2026-10-13/readable/main.js:17154–17182
- .data/research/lawbot-2026-10-13/readable/main.js:17409–17513
- .data/research/lawbot-2026-10-13/readable/main.js:17784–17935
- .data/research/lawbot-2026-10-13/readable/renderer.js:31626–31641
- .data/research/lawbot-2026-10-13/readable/renderer.js:32063–32082
- .data/research/lawbot-2026-10-13/readable/renderer.js:33795–33909
