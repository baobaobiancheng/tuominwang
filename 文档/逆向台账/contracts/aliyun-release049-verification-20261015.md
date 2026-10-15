# 阿里云049发布与验收

## 已完成

|核验|实际结果|
|---|---|
|发布|2026-10-15 22:40北京时间，https://182.92.172.59/tuomin/ 显示2026.10.15-049|
|源码|2f14b7b488a966b0eb97edeefd60af757e2bc0f4；服务器382个运行源码/脚本/许可证文件逐一核对，全部前端资源HTTP字节哈希匹配|
|仓库|baobaobiancheng/tuominwang private，main及complete-porting-20261014同步2f14b7b；发布后文档另提交，运行源码不变|
|数据库/worker|迁移数38；API/web/converter健康，worker ready连续稳定检查通过；原件和数据库保留，发布前自有库备份|
|相邻项目|部署前后本项目之外5个Docker容器JSON完全相同，含ID、StartedAt及RestartCount；WeKnora/Semantica未因本次部署重启|
|生产配置|Compose只更新本项目runtime/web镜像tag；模型挂载/模型读取方式/网络/端口/其它服务未改，不新增CPU/内存限制|
|公网Edge|实际admin/admin123登录、读取当前版本及项目列表，零pageerror；当前admin项目0个，所以不能声称公网已打开用户此前两个项目或重跑文档处理|
|指南|公网23节17图，全部静态资源与发布包一致；截图均合成材料，不外发业务材料|
|本地门禁|最终修订B同源130文件758单元、Bend11/13、类型/构建通过；同源5文件8项受影响Edge通过；本地开发5178/4318已恢复|
|API分层|048完整同源90文件175项通过；049实际单件1/batch4/真实CFB DOC1/MCP1/矩阵3，363运行文件candidate等于主树；不称049单次全90API或完整73Edge重跑|

## 失败与恢复如实保留

首次发布包带428个macOS AppleDouble元数据文件，被服务器manifest校验在修改线上服务之前拒绝；没有执行迁移、停服或回滚。采用COPYFILE_DISABLE和无xattrs打包，411个文件（410清单+manifest）验证后第二次成功。原失败日志和差异清单保留。036历史部署曾有Semantica OOM，此事实仍保留；049本次部署前后相邻5容器未变，不能拿本次结果抹去历史影响。

048全量Edge69过2失败及049最后身份等待竞态，均有原始失败/独立审查/修复与正式回归；此前检查点作为历史保留。竞品258R0、224S3/34S2不升级。私有授权服务、合法激活后运行、真实业务准确率、原生Word逐像素排版及真实WPS转换边界继续保留。

## 证据入口

- `.data/deploy/aliyun-20261015/iteration049/`：manifest、两次部署日志、server-readback、online-readonly-proof、私有工作台截图及脚本。
- `.data/research/lawbot-2026-10-15/iteration049/`：分组/交叉审查、每版源测试哈希、最终check/8Edge及旧pin归档。
- [完整规则交接](../../脱敏规则完整技术交接-迭代023.md)；[用户指南](../../使用指南/公开功能补齐操作-20261015.md)。
