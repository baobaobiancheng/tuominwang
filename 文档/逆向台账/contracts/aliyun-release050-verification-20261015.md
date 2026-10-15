# 阿里云050发布与验收

## 结果

2026-10-15 23:48北京时间，https://182.92.172.59/tuomin/ 实际返回2026.10.15-050。源提交c2cbeb3e67ac1e0a2793686a3c24dade74fbdee3。

|核验|实际结果|
|---|---|
|发布包|415个清单文件逐一SHA/大小核对，无AppleDouble；manifest SHA 141e8e8d042952f85008ba6d97a9a202adacb77f565a3c00caf9f073a81ab283|
|代码/资源|服务器384运行源码/脚本/许可证文件及全部包内web/guide资源HTTP字节哈希一致|
|迁移|schema_migrations数39，039新增任务作业归属；发布前自有Postgres自定义格式备份，保留原件与历史|
|服务|API/web/legacy-office健康，worker ready连续3次稳定检查，零重启；converter镜像不变|
|配置|Compose仅替换本项目runtime/web镜像tag；模型/读取方式、已有端口/网络和其他服务未改，不新增资源限制|
|相邻项目|本项目之外5容器部署前后最小状态JSON完全一致：ID、StartedAt、RestartCount、运行、健康状态|
|公网Edge|admin登录成功，项目列表0个，版本正确，pageerror为0；本次只读，未制造业务项目|
|指南|23节20图，公网Edge全部加载，无横向溢出；17历史与3新图来源分别归档|
|本地门禁|131文件764单元、Bend11/13、类型/构建，受影响API3文件10测试及Edge3文件3测试通过，源码792文件不变|

## 证据与限制

原始发布、只读验收和最小容器状态在`.data/deploy/aliyun-20261015/iteration050/`，本地失败、补丁、审查与门禁在`.data/research/lawbot-2026-10-15/iteration050/`。本次manifest首轮通过后部署成功；不抹去049打包失败及036历史OOM记录。public只读不能替代公网文档全流程，局部API/Edge不称全量，公开helper不等于已激活竞品IPC。

竞品258项R0，224S3/34S2及I级不升级；许可处理链、供应方私有服务、业务准确率、原生Word及未知schema边界保持。两处动态桥的静态字面入口已闭合，但任意运行时输入未证明穷尽。

[发布记录](../../发布记录-20261015-050.md) · [机器可读验收](reliability-050-verification.json) · [完整规则交接](../../脱敏规则完整技术交接-迭代023.md)
