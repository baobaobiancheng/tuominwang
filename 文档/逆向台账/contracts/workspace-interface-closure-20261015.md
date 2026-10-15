# 工作区 17 个确切方法与保存回执

新增 3 个真实 API 测试全部通过（7.623s）；含非空人工更正 1 项/假名 1 项、重启中断、会话隔离、回执期限、撤权、hash 破坏、不可变下载及 21 项 MRU 淘汰。复用既有完整 TMM/V1/V2/V3、恢复与 catalog 测试证据；这些行不声称原生 OS 合同相同。

| 稳定 ID | 来源确切方法 | 当前核验 | 仍有边界 |
|---|---|---|---|
| IPC-e6a8f1b41825 | `workspace:create-transfer` | 受密码保护传输副本实际写入、重读、完整原件/状态/catalog保留；不覆盖旧文件 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-f53f8972c1a5 | `workspace:discard-recovery` | 真实owner+revision删除草稿，保留材料和已保存复核 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-3c8789ad9a8f | `workspace:forget-recent` | 仅移除本人最近索引，不删除工程 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-7e55b9d273b1 | `workspace:list-recent` | 20项MRU，lastSavedAt独立持久、加密显示名/材料数、原ey可复用数；未知明确known=false | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-be30d4526c26 | `workspace:list-recoveries` | 真实当前权限可读的本人恢复记录及版本 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-a80eb991f683 | `workspace:list-recovery-prompts` | 真实待恢复信息；不自动批准草稿 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-f417c3628886 | `workspace:migrate-v1-to-v2` | V1/V2/V3真实字节转换、重读完整比较、源字节保留 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-feb24aa50a4f | `workspace:open` | 完整原件/旧复核字段保留、重新识别、显式恢复人工草稿；自动recent | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-86a65aa5ca0e | `workspace:open-dialog` | 浏览器文件授权选择；非Electron本地对话框 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-8ed0acbb4144 | `workspace:open-recovery` | owner/当前权限/revision/源hash+映射重核，返回草稿不伪批准 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-1d575f4ee880 | `workspace:read-review-profile` | 原ey完整算法提取启用更正/假名冲突及保留token | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-70e09702200d | `workspace:receive-transfer` | 受密码保护副本真实打开；本地keychain包无合法跨设备密钥不能伪解锁 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-c356082df625 | `workspace:save` | owner+session+requestId幂等、payload冲突、snapshotCAS、真实running/completed/failed、不可变密文字节 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-ff1d1193dc22 | `workspace:save-as` | 真实受保护导出/另存下载；不读写用户原生绝对路径 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-9be2a0784913 | `workspace:save-recovery` | 真实加密draft、revisionCAS、完整人工标记/页图/映射权限；不改变正式复核 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-1ad8e879614a | `workspace:save-result` | 真实回执查询；1h/100缓存淘汰，重启遗留running明确interrupted，下载重新核当前权限/全部源hash/快照/byteshash | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
| IPC-98cb505df8ea | `workspace:select-review-profile` | 真实原ey更正及假名完整导入；冲突显式选择、项目旧复核失效并重识别 | 原生路径/OSkeychain/窗口sender不是云端合同；filePath/fileExists明确null/cloud-project；竞品R0 |
