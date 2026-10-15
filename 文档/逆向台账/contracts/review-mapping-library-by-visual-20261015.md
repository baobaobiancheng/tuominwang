# 映射表目录独立审查（2026-10-15）

B 审 C。发现两项 P2，均已修复；当前没有新增可复现缺陷。

| 发现 | 修复与复证 |
|---|---|
| 跨时区默认表名导致自身备份无法导入 | 固定已保存表名，仍重新编译校验完整 raw；B 独立 Asia/Shanghai → UTC 探针通过，0830 名称和原 raw 均保留 |
| 权限禁用后短暂显示旧文件名 | enabled=false 立即不渲染，project/权限同步 ref 阻止迟到结果；静态确认 |

只读核对强制用户/租户 RLS、项目授权、完整 raw 的 AAD 加密、导入重新编译/哈希校验。原生 IPC 未运行。C 的实际 API 结果是作者证据，不伪作 B 执行。

独立探针：`.data/research/lawbot-2026-10-15/iteration032/review-mapping-timezone-recheck.{mjs,log}`；同名 JSON 固定审查代码 SHA。
