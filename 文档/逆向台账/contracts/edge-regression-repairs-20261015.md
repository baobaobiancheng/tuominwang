# 真实 Edge 回归与修复记录

首轮在 447 个产品文件固定快照上运行 66 项实际 Microsoft Edge：40 通过、26 失败，22.6 分钟。完整日志、失败 trace 和输入哈希已保留；这不是通过结论。

## 已合入，等待重新运行

| 类别 | 修复 | 验证边界 |
|---|---|---|
| 详情页 OCR 纠错入口 | 在真实材料详情分支挂载已有纠错组件，保留权限、脏草稿及冲突保护 | 独立静态审查通过；待同一完整 UI 操作 |
| 未就绪材料筛选 | API queued/outdated 返回明确 409；前端仅在 review 请求完整筛选 | 新增真实隔离数据库状态与无写回断言 |
| 忙碌错误码 | PROCESSING_BUSY 统一映射为 409 | 新增不同 PostgreSQL 连接持有真实全局 advisory lock、拒绝、释放后成功与无写回检查 |
| 创建／保存／导出等待 | 对应精确 POST/PUT 返回、真实任务成功后再检查；失败与取消直接报错 | 不删除原导出、下载、像素或安全断言，不以固定 sleep 伪造成功 |
| 选择器与测试输入 | 直接 summary、成功文件行 checkbox、保存后重设新增标注原始类型 | 保留原功能断言；真实 trace 支持具体修正 |
| 并发测试 transport fixture | 补当前新增软件更新只读 GET 的确切 web 合同 | 其他未知路径继续报错，原竞态断言保留 |
| 限流响应 | 测试自身 GET 遇到 429 按真实 Retry-After 有界重试一次 | 产品限流及全部写请求保持不变，第二次仍须成功 |

本轮仅 4 个产品文件改变，另 14 个测试文件修正/增补。每个旧字节与新字节哈希保存在 `iteration039/edge-fixes-application-result.json`；旧字节位于 `edge-fixes-applied-before/`。产品源码重新固定为 `product-freeze-release-edge-fixes.json`。先前 39 文件/83 项 API 属于修复前产品快照，不冒称自动验证新快照。

独立审查报告、原始失败时序与暂存差异位于 `iteration039/edge-fixes-staged/`。尚需完整检查、针对性 API 和修复后的 Edge；服务器未切换，竞品运行等级仍全部 R0。
