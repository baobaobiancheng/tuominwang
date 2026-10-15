# 037 发布交付只读独立复核（Luna3）

日期：2026-10-15  
范围：`.data/deploy/aliyun-20261015/iteration036/` 当前脚本与候选、`scripts/037.sql`、旧 B 复核 pin。只读；未构建/执行发布、未连接服务器、未读取凭据值、未启动或停止服务。

## 结论

当前交付材料不是可验证的 037 发布包。`release/` 只有 Dockerfile、compose 和部署脚本，没有 `manifest.json`、打包的 `apps/`、`packages/`、`scripts/`、`html/` 或 runtime delta，因此 `verify-release.py` 没有可校验输入，部署脚本也没有可执行的 manifest pin。当前没有 037 镜像构建、服务器部署、镜像 ID、schema 读回、served asset hash、worker ready 或邻居服务前后状态证据。线上状态仍以计划所述 023 为基线，需由主审另行核实。

静态检查显示 compose 候选将 app/worker/migrate/admin 切换到 iteration036 标签；API/worker 新增 legacy 内网；converter 仅加入 legacy 网络，无 host port、数据库网络、模型/材料挂载或 DATA_KEY/SESSION_KEY；`init: true` 存在于生成器、两个候选和仓库 fragment。现有 web loopback 发布端口、现有 networks/volumes 以及模型只读挂载沿用 iteration032 基线；未见新增 CPU/内存上限，模型启动配置未在候选中改变。上述是文件静态比较，不是 Compose 在目标主机上的解析/运行证据。

## 可证实的问题与限制

| ID | 结论 | 证据与复现 |
|---|---|---|
| REL-037-001 | **发布包不完整，尚不可校验/部署。** 刷新器行 6–13 才会复制代码、HTML 和 runtime delta；当前 `release/` 清单不存在这些目录和 `manifest.json`。验证器行 7–19 强制读取 manifest；部署脚本行 5、10 依赖 manifest SHA 与验证器。 | 当前 `find .data/deploy/aliyun-20261015/iteration036/release -maxdepth 2 -type f` 仅列 5 个文件；`test -e .../release/manifest.json` 为 false。不可将代码中计划执行的门禁写成已执行。刷新器本身要求 `freeze-product.py check release-complete` 通过（refresh 第5行），该前置也未在此复核执行。 |
| REL-037-002 | **旧 B 哈希 pin 已失效，不能作为当前实现证据。** 当前 deployment / verify / refresh 脚本哈希与旧 review JSON 的 pin 不同。compose 与 Dockerfile runtime/web 哈希仍相同。 | 旧 pin 在 `review-release-isolation-by-visual-20261015.json` 的 `proofHashes`；当前 `sha256sum`：deploy `a3727016…f1b3faf89`（旧 `28ab6f1f…967dc7c87`）；verify `820e7ea0…c50056ab9`（旧 `e2f9de17…c22c7f925`）；refresh `142a7441…0b780b3e`（旧 `9716799a…45c75d3`）。相同项：compose `10e651c9…a031850b`、Dockerfile.runtime `63ee9697…774c68f5a`、Dockerfile.web `7a743063…2408dfd`。复现：`sha256sum` 对应路径。 |
| REL-037-003 | **邻居服务“未改变”的部署读回范围有限。** 脚本仅以名称过滤器 `weknora-semantica-` 枚举部署前容器（deploy 第20行），之后对捕获到的 ID 比较状态（第95–100行）；它不能证明未被该过滤器命中的其他邻居容器状态未变。 | 静态读取该命令即可复现范围边界。候选未触碰邻居服务定义；但不能将 readback JSON 的 `neighborsUnchanged` 扩大解释为“所有邻居服务”。目标机上完整容器清单及邻居状态依然待主审 readback。 |

## 关键静态核对

- 读取文件 SHA256：
  - `refresh-release.py`: `142a744121e43b42eb6db0c3d66706c9b5485c89a8ae0bfdcfec1fe60b780b3e`
  - `prepare-compose.mts`: `a0fdcf138115f34299b0408dfce92649fb3c57671470c4f5d7e22dff33004618`
  - `release/deploy-server.sh`: `a3727016383cc285da21e42ad95bf1e995f27ea910e7c729e29e4aaf1b3faf89`
  - `release/verify-release.py`: `820e7ea02f38d2b1f0213e265f7f591a8073b53c73ffaa2eb134080c50056ab9`
  - 候选 compose（根目录与 release 副本一致）: `10e651c9c4503abe1ade2976b5072a02283f87f77048a1fdab563424a031850b`
  - `compose-candidate-proof.json`: `ce0eaae7ce57dd4d5d49683cc608f4b230119cc13870f316c25959d232b2b596`
  - `scripts/037.sql`: `1be899fa1587f71ec29c180b6ed368a36fabe7452c57417fc340c003af6ee566`
  - `services/legacy-office/compose.fragment.yml`: `172f9db0ecaf45fd1c54fd31b8e3d01323bb26bc70611de0c47d451469ffe2d0`
- 当前 `git rev-parse HEAD` 为 `5cee048dd637aeac69fc30b5350c5494d9386c00`；工作树含大量本轮未提交源码。刷新器生成 manifest 时会把该 HEAD 写为 `sourceGitHead`，并同时对复制入包的逐文件散列建表（refresh 第16、20行）。在真正刷新后，应核对文件表覆盖完整且所有 037 源文件都来自当前工作树；HEAD 本身不能单独代表这些未提交变更。
- compose 生成器在第20–24行对旧服务作语义等价断言，候选哈希可与 iteration032 基线确认；第9行给 migrate 追加既有 DATA_KEY，候选中 API/worker/runtime 仍沿用其本来需要的 DATA_KEY，converter 环境仅从 `legacy-office.env` 读令牌。compose `legacy-office` 第223行 `init: true` 与服务 fragment 一致。
- 037 SQL 新增 accepting 列、临时投递表/RLS、重写 `claim_job()` 并添加按租户/用户受限的 SECURITY DEFINER 清理函数。SQL 静态结构可读；没有实际数据库迁移、并发/权限验证。本报告不把脚本中的 schema count=37 当作已达成事实。
- 部署脚本有主机本地 `pg_dump`、复制旧 compose、停 web/worker、迁移后保留 additive schema 并恢复旧 compose 的失败分支（第16–59行）。这是代码路径审阅，不是 rollback 实演；迁移中断、旧代码在 schema 037 下兼容、队列/租约恢复和数据库恢复策略仍需演练及验证。
- worker 门禁同一容器检查预期 image ID、running、restart count 与连续 ready 日志（第64–83行）；但没有真实 worker 运行证据。api 版本、包内 source 哈希和本机 HTTP served asset 检查定义在第85–102行，均未执行。

## 上线前仍需主审完成

1. 生成冻结后的 037 release，记录 manifest SHA、逐文件源 hash、schema 列表和镜像 ID；确认源文件、镜像内容与工作树逐项闭环。
2. 做离线 Docker 构建与 Compose 解析；核实生成后的最终 compose 中公网绑定、旧网络/卷、限制、模型挂载与初始化策略。检查应用收到 DATA_KEY 的既有需求和 migration 专用差异，converter 保持无密钥/数据库/模型/材料。
3. 在授权部署窗口由主审执行发布和读回：schema 37、API version/source、web served hash、worker ready 稳定与镜像 ID、restart count、完整邻居服务状态和模型 hash。
4. 在隔离环境验证迁移失败/中断、服务启动失败、旧镜像回切、额外 schema 保留与退出码；检查队列租约及旧代码兼容性。
5. 明确在线状态并补齐真实 evidence pin。当前 B 报告的 iteration036 hash 只保留为历史证据，不覆盖 037。

离线复核命令（本轮已执行只读项）：

```sh
sha256sum .data/deploy/aliyun-20261015/iteration036/{refresh-release.py,prepare-compose.mts,release/deploy-server.sh,release/verify-release.py,compose-candidate.yaml,compose-candidate-proof.json} scripts/037.sql
find .data/deploy/aliyun-20261015/iteration036/release -maxdepth 2 -type f -print | sort
git rev-parse HEAD
```
