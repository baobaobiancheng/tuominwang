# 指定模型团队发现、合并与根验收

## 调度

用户指定的 3 名主 agent 均使用 `gpt-6-sol`，每名带 3 名 `gpt-6-luna`。9 个子任务均已实际建立并完成首审，3 个主审已交叉复核；因会话总并发 4，按组和可用槽分波执行。模型分工及报告见 [团队调度](团队调度与交叉审查-20261015.md)。静态报告与实际运行分开记录，竞品 258 项仍保持 R0。

## 确认差异与修复

|发现|合并内容|实际证据与边界|
|---|---|---|
|命名 RuleSet/profile 合法扩展与缺省归一遗漏|规则集／entry、源保存的 profile 子对象兼容扩展；applicability 整体归一；API wrapper 和 action map 保持各自合同。源 signature 归一与自有签名能力显式区分。|命名输入 4 项 API、源 helper VM 通过；根 TypeScript 首检发现合成无效输入的类型表达错误，已仅改测试 raw VM 对象类型，未删输入／断言，随后 typecheck 通过。|
|图片 OCR 选字未通知活跃任务|PageEditor 回调接入 manual-add dispatcher；ignore／hidden 旧槽不阻止新 pending 补录。|新增 Edge 实际 HTTP 请求、保存、忽略后再补录断言纳入最终运行。|
|右侧实体不跳 PDF 页面|逐条 quote、实体组、查找的规范范围映射当前 page/image anchor；重复点击重新定位；图片原文不夺走原件页焦点。|两页 PDF 定位断言首轮通过；所在文件 6 PASS/1 fail，失败是 11 万字仍在处理中而测试只等 5 秒，现场归档后等待识别结果改为30秒，业务断言保留；最终整库 Edge 待完成。|
|分组删除按钮挤入16px复选框列|保留原功能，将按钮占满单独一行，避免中文逐字竖排。|根实际查看首轮 PDF 截图发现；新截图待最终 Edge，未重新设计界面。|
|进程消失后终态遗留临时密文|独立038增量迁移：同一任务行锁事务内关窗口、删全代投递；兼容037已存在终态的升级一次性清理。保留037已应用字节。|真实API密文→四终态→0行、生产调度器缺finally恢复、两种双事务锁序、已有终态升级清理且活跃投递保持，3 PASS/6.50秒；不是生产worker实际SIGKILL。回执附执行前源码hash。|
|隐藏实体已有位置调整的复合链未实测|不变更语义；补真实DOCX输入和像素导出组合验证。|实际API 1 PASS/27.10秒：隐藏时嵌图像素不变、恢复pending阻导出、人工重新确认后按调整几何输出、原件hash不变。|
|发布邻居观测仅匹配一个项目前缀|改为build前／成功后枚举全部非本Compose项目Docker容器，比较ID/restarts/started/running/health，不读env。|helper本地实际smoke过；完整包、目标机版本／源文件／web资产／worker及邻居readback仍待最终发布。|

## 验收记录

- `iteration037/type-hide-geometry-api-first.log`：1 PASS。
- `iteration037/automatic-runtime-terminal-schema038-sweep.log`：3 PASS。
- `iteration037/edge-navigation-first.log`：6 PASS / 1 fail；失败现场和当前版本PDF截图已完整保留在 `edge-navigation-first-artifacts/`，不把整文件当通过。
- `iteration037/typecheck-navigation-repaired.log`：0错误。
- `iteration036/final-check-release-team.log`：728 PASS / 2 fail，转换控制代理14320不在监听；不作为产品门禁通过。恢复独立会话代理后，`iteration037/legacy-control-restored-targeted.log` 3 PASS。
- 最终固定源码 `product-freeze-release-team-final.json` 共446个产品文件；`final-check/api/edge-release-team-final` 顺序执行，遇失败停止，结果另录。

## 不扩大结论

公开196个ID／72新节点／835旧片段和87个ASAR文件hash独立重算通过，不代替逐ID业务caller语义；公开图证据合并与S3建议仍单独审核。9名子代理完成任务不等于产品或线上已验收。私有签发／付款、原生OS执行、合法激活后的竞品处理和真实业务金标准确率仍有明确证据边界。


## 当前门禁与环境补充

固定446产品文件的 `final-check-release-team-final` 已PASS：126文件、730单元、零跳过、Bend11法则/13变异、类型及构建。全量API首命令在`custom-visual`一个18导出总用例180秒超时，前8文件16测试都成功，原日志未改。测试改成PNG/PDF/DOCX各自独立180秒、保留全部18种操作与所有原断言；单独3 PASS/156.42秒，各格式约46–54秒，未改变任何产品超时或资源配置。余73文件逐文件新隔离库顺序继续，最终按源码freeze和文件hash检查累计完整性，而不把旧失败命令说成通过。

目标机SSH只读预检：Compose基线未变，schema023，6个任务均succeeded，9个容器在运行；没有目标目录Git元数据。部署以release manifest/source文件hash绑定Git提交，不能声称服务器工作树已git pull。宿主Python为3.6，已将部署辅助的text/capture_output/is_relative_to改成兼容表达；neighbor-state已在真实目标机执行并记录5个非本项目容器，尚未部署。


## 项目查漏合入后的新固定版本

原 446 文件／730 单元的记录保留为历史。项目查漏 11 文件已应用，产品固定为 447 文件；`final-check-project-audit-final` 完整通过：128 文件、733 单元、Bend 11／13、类型及构建。最终 API 依据每次实际产品 variant、运行前后测试 SHA 和日志 SHA 记录；旧失败命令不改称成功。新 API／Edge 与服务器发布仍在验收。

项目查漏首轮失败定位为测试边界：纯预览候选不包含 `userAdded`，正式可信保存显式写 `userAdded:false`。两者分别做完整精确断言，保留 revision／内容／来源／CAS 检查；原失败日志保留。随后项目 API 三场景通过，另有双页 PDF 几何及实际下载像素门禁继续。
