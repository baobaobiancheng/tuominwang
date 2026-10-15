# 路由与文件夹输出独立审查（2026-10-15）

审查者 B，作者 A。发现 1 项 P1，修复后独立反例关闭；当前没有新增可复现缺陷。

| 检查 | 独立结果 |
|---|---|
| CFB 目录循环 | 合法合成加密 Word 修改目录环；路由返回 FILE_INVALID，CFB.read 调用 **0 次** |
| 700 KB 三帧真实流 | 解密内容与原始随机字节逐字节一致 |
| 首帧篡改 | 拒绝，已暴露明文 **0 字节** |
| 截断尾帧、错误总 SHA、换对象 ID | 全部拒绝 |
| 写入中断 | 未完成对象移除 |
| owner/tenant/权限 | 只读确认用户会话绑定、RLS、view_original/export、源与产物当前版本验证 |
| ZIP 安全 | 路径/重名/HTML 转义；HTTP 前完整总验证，再逐帧认证后输出 |

证据：`.data/research/lawbot-2026-10-15/iteration032/review-folder-stream-by-visual.{mjs,log}`。JSON 固定代码 SHA。

这次独立执行是存储/解析 helper 探针；A 的真实 API 权限/大于 50 MiB 聚合 ZIP 证据仅只读核对，不冒充 B 独立运行；也没有执行竞品原生 IPC 或系统文件夹选择框。
