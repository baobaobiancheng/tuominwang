# Linux 私有部署

此发行方式包含本地规则、中文 NER、OCR、桌面网页、API、独立任务进程和 PostgreSQL。私有 AI 模型按用户要求另行确认，不包含在镜像或模型包中。Codex CLI 和个人账号凭据不进入发行包。

## 构建与首次启动

构建机需要 Docker、Node 24+、pnpm，以及已校验的本地 NER/OCR 资源。开发源码先执行 `pnpm check`（包括 Bend 法律、证明、变异、类型、单元和构建），再执行隔离数据库与桌面浏览器测试。容器运行的是同一个 Bend 生成模块，不在容器中另写策略或在线调用证明器。

```sh
pnpm check
pnpm test:isolated
pnpm test:e2e:isolated
node scripts/package-models.ts
node scripts/setup-release.ts
docker compose --env-file .data/releases/linux.env -f deploy/compose.yaml build
docker compose --env-file .data/releases/linux.env -f deploy/compose.yaml up -d db
docker compose --env-file .data/releases/linux.env -f deploy/compose.yaml run --rm migrate
docker compose --env-file .data/releases/linux.env -f deploy/compose.yaml run --rm admin
docker compose --env-file .data/releases/linux.env -f deploy/compose.yaml up -d --wait --wait-timeout 60 api worker web
```

两个准备脚本拒绝覆盖已有配置/模型文件；升级时不重新执行。首次账号与随机密码保存在 `.data/releases/本地容器登录.json`，不要提交、分享或复制进镜像。原开发 `.env`、数据库卷与 5178 端口不变。容器工作台默认仅绑定 `http://127.0.0.1:5188`。首次管理员创建一次即可，重复执行会因账号已存在而拒绝。

API/worker 使用非 root 用户、只读根文件系统、丢弃 Linux capabilities，并且只接收运行所需密钥与非超级用户数据库连接。迁移与初始账号是单独的维护命令，业务进程不接收数据库 owner 密码。数据库/API/worker 仅连接 internal 网络，数据库/API 不映射宿主端口。只有 Nginx 另接入口网络，以支持宿主机的 127.0.0.1 端口映射；它仅代理固定内部 API，不接受用户指定上游。处理进程不会下载模型或自动向外网派发材料。

在原生库初始化前强制设置 `ORT_DISABLE_TELEMETRY=1`，覆盖容器和本机任务进程，依据 [ONNX Runtime 官方隐私说明](https://github.com/microsoft/onnxruntime/blob/main/docs/Privacy.md)。内部网络隔离仍保留，关闭遥测不能代替出口控制。镜像文件白名单排除开发 CLI 适配器、个人配置与凭据，只保留断网检查需要的公开 PDF 夹具。

内部网发布时由运维配置 TLS 反向代理、可信入口和防火墙，同时把 `APP_ORIGIN` 改成用户实际浏览的完整源（不带结尾 `/`），仅在明确需要时更改监听地址。未经配置不应公开绑定 0.0.0.0。生产下载令牌是临时凭证，不记录 URL；Nginx 访问日志关闭。

## 离线部署和核验

联网构建机导出两个应用镜像和锁定摘要的 PostgreSQL 镜像；复制镜像归档、`deploy/`、NER/OCR 模型包及许可到离线主机。密钥在目标环境单独生成与保管，不随通用发行包分发。`docker load` 后使用 `up --no-build`，禁止重新拉取浮动标签。模型锁定清单由 `scripts/ner-runtime-lock.json` 与 `scripts/ocr-lock.json` 定义；启动时校验全部文件哈希，缺失或不匹配直接失败。

离线模型检查命令（只产生公开合成材料，不连接业务库）：

```sh
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,size=256m,mode=1777 \
  --tmpfs /data:rw,size=256m,uid=1000,gid=1000 \
  --mount type=bind,src="$(pwd)/.data/releases/models",dst=/models,readonly \
  -e DATA_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  tuominwang-runtime:local node scripts/check-offline.ts
```

上面的固定密钥只用于随容器销毁的合成测试 `/data`，不得用于实际材料。检查网络不可达、真实中文 NER 推理、PDF/OCR、像素清除和副本核验。它不是私有 AI 验收，也不是人工标注的识别准确率验收。

本机发行实例启动后，`node scripts/check-release.ts` 使用独立合成测试账号做电脑网页闭环，并检查安全响应头、非 root/只读/能力限制、网络隔离和镜像文件白名单；结果与截图写入 `.data/evals/linux-release/`。该脚本只接受本机默认 5188 地址，不读取原业务账号。不要把合成测试账号当作真实用户账号。

## 数据、容量与删除

- 默认每组织原始数据计量 10 GiB、10,000 份材料；组织管理员可调整。并发上传在数据库内原子计量，不会因超额删除既有文件。派生副本、页面资源和模型不计入这一逻辑配额，运维必须另外监控磁盘空间。
- 原件、页面资源、副本、映射和名称加密保存；DATA_KEY 丢失后无法恢复。不要随意更换密钥。
- 删除必须由有“删除材料”权限的用户明确确认，绑定当前版本。删除材料与复核快照后，保留不含原文的操作记录。项目共享假名和词表不随单份材料删除。
- 已签发链接按既定规则到期前可用，相关加密文件延后清除。新文件写入前记录所属材料，取消/崩溃产生的关联对象也在明确删除时清理。迁移前已签发链接保守保留最多一天；不能定位所属材料的历史孤立文件不会被自动删除。
- 后台中断后，待清理队列保留并自动续接。保留文件的默认行为不变；只有用户明确删除的对象进入清理队列。不提供备份恢复能力。

## 升级与兼容性

1. 先在隔离数据库执行新版本迁移和全量验收，保留旧镜像摘要及运维数据副本。备份不是本产品的恢复功能。
2. 停止本应用 API/worker，保留数据库和 materials 卷。运行新镜像的 migrate；迁移失败会回滚事务，不启动新业务进程。
3. 启动新镜像，验证 health、登录、历史材料、旧复核及仍未到期的下载链接。新 API 的权限字段默认拒绝，不与旧网页混用。
4. 不自动回退数据库 schema；已应用迁移后，旧镜像是否可回退需先验证，不承诺任意版本降级。不要执行 `down -v`，那会删除数据卷。

兼容目标为 Linux arm64 与 amd64，CPU 推理，Node 24，PostgreSQL 17。每种架构需分别构建与验收原生 ONNX/sharp 依赖；在一种架构通过不等于另一种已验证。单个重任务并发仍为 1，worker 容器限制 3 GiB/2 CPU，API 2 GiB。300 页 PDF 的内存、处理时间和 OCR 质量依材料而异；超限明确拒绝，不截断内容。

## 文件能力边界

PDF 必须由用户确认转换为图片型 PDF，图片输出 PNG；不能宣称保留原 PDF 可选文字结构。DOCX 内嵌 PNG/JPEG 支持单独确认的像素清除；未知对象继续阻断。XLSX 输出文字/值快照，不执行公式。识别候选都需人工复核；下载检查不等于自动发现了所有敏感内容。

Bend 归属与 Apache-2.0 许可见 `licenses/Bend-Apache-2.0.txt`；随 NER/OCR 模型包保留对应许可、来源与哈希。依赖版本保存在 pnpm lockfile，第三方许可随依赖目录保留。
