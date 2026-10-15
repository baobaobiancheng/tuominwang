# 发布前只读对抗复核（2026-10-15）

审查对象为 `iteration036/release/{deploy-server.sh,verify-release.py,neighbor-state.py,compose-candidate.yaml}`。未运行部署、重测试或服务命令，未读取凭据。**当前复核结论：No findings。**当前四文件 SHA-256 依次为 `58f51bacc632f5e94d0df0b6df892a6ef240c32d9a24495d334734a2498079b8`、`6fe97f497d895b2fca9a946d417e232345c275ffeb30dd0675a7dcfb716b8a47`、`a2f3db04885f19f8855596ff307b23a5cd8dc83d3bb8c1b0aefaafdf8030462e`、`10e651c9c4503abe1ade2976b5072a02283f87f77048a1fdab563424a031850b`。

## 已修复的发现及复核

发现时 `verify-release.py` 和 `deploy-server.sh` 内嵌 Python 用 `assert` 实施 manifest hash、文件全集/安全路径/hash、schema 038、worker 镜像/稳定性、网页资产与邻居状态门禁。`PYTHONOPTIMIZE=1` 会删除这些检查；只读 `python3 -O -c 'assert False; print("ASSERT_SKIPPED")'` 实际输出 `ASSERT_SKIPPED`。发现时的独立报告原字节保存在 `.data/research/lawbot-2026-10-15/iteration037/team-sol-architecture-release-audit-before-explicit-checks.md`（SHA-256 `d2a388700f37bd453fe65c600d015d168cf53e2690353bb3bf2cf0b062b01a7f`），旧脚本由主审另存 `iteration037/deploy-before-explicit-checks/`。

当前 `verify-release.py:7–19` 全部改为显式 `if ...: raise RuntimeError`；`deploy-server.sh:70,74,95,98` 的 worker、网页资产和邻居比较亦为显式条件。`deploy-server.sh:76,83` 的 `raise AssertionError(...)` 是显式抛异常，不受 `-O` 移除。对三个目标脚本搜索 `\bassert\b` 无语句残留；本缺口在当前字节上已闭合。新 helper 尚未装入完整 release/manifest，最终包生成后须按新 SHA 再校验。

## 残余验证边界

- 宿主 Python 3.6 所需语法/API：本次三个目标 Python 脚本和 shell 内嵌 Python 未发现 `capture_output`、`text`、`Path.is_relative_to` 等不兼容调用；目标机 helper 的单次只读运行已有主审回执，但完整发布路径尚未运行。
- `deploy-server.sh:7–12,17,20–21,43–64` 只对 `/opt/tuominwang` 的固定 compose 名称 `tuominwang-aliyun` 操作；候选 compose 顶层名称相同，新增 converter 无公网端口、DB 网络或模型/材料挂载。`neighbor-state.py:6–14` 枚举所有非该 project 的容器，并比较 ID、重启次数、启动时刻、running、health；这不覆盖邻居网络连通性或应用级请求结果，须发布后另读回。
- 候选 compose 保留旧 API/worker 模型挂载、模型环境及现有资源设置；converter 无模型挂载，未加 CPU/内存 cap。此为配置静态结论；运行中模型加载峰值和邻项目影响须以最终门禁/发布读回为准。
- `scripts/migrate.ts:21–29` 明确按顺序执行至 038；`deploy-server.sh:18,59–60` 备份后运行迁移并核总数 38，失败路径 `:37–53` 恢复旧 compose/容器但保留增量 schema。这是预设的兼容回滚；目标持久库的 038 应用、旧终态 sweep、旧镜像兼容与实际回滚仍未验证。
- `verify-release.py:7–16` 在优化模式关闭时校验传入 manifest SHA、包文件全集与每文件 hash；运行容器的 `/app` 源文件在 `deploy-server.sh:87` 再核，网页产物在 `:91–95` 按实际 HTTP 响应再核。当前 release 目录尚无 `manifest.json`、runtime delta、html 和应用包，因而无法确认最终包的 expected SHA、镜像内容或线上 readback。`sourceGitHead` 和 `productFreezeSha256` 是 manifest 元数据，运行侧不独立验证；最终冻结仍须由主审将包 SHA 与本轮冻结回执明确配对。运行时 `node_modules` overlay 只经包 hash、Docker build 和少量 import smoke 间接约束，未逐文件在容器内复核。

在当前固定文件与静态候选范围内，未发现仍未修复的可证发布阻断缺陷。
