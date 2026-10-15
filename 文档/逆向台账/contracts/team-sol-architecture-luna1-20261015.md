# C 组独立静态复核（Luna1，2026-10-15）

## 结论

独立重算支持 C 报告的计数与 hash 声明。196 个 C 稳定 ID 唯一；72 个新增/重联节点唯一且所有引用均能解析；835 个旧精确证据片段全部通过；ASAR 原包中 87 个 updater 文件按记录偏移提取后全部通过。未发现可复现差异。所有竞品行为保持 R0，未执行授权、购买、恢复、签发或安装链路。

| 核验项 | 声明 | 独立复算 |
|---|---:|---:|
| C 稳定 ID | 196 | 196 个，196 唯一 |
| 委托给 A/B/root | 62 | 62 |
| 新增/重联节点 | 72 | 72 个，72 唯一；引用均落在节点集合内 |
| 旧精确证据片段 | 835 | 835 通过，0 差异 |
| ASAR updater 文件 | 87 | 原包偏移字节与提取文件均 87/87 匹配 |
| C 声明的未读公开节点 | 0 | 0（限 C 声明范围；格式与外部系统 leaf 仍保留） |
| 竞品运行 | R0 | R0 |

逐 ID 记录、逐片段期望/复算 hash、新节点范围以及全部 87 个 ASAR 文件的 archive offset/hash 在 [独立复核 JSON](team-sol-architecture-luna1-20261015.json) 中。

## 重点语义复核

| 范围 | 复核结果 | 精确依据 |
|---|---|---|
| 协作 producer/consumer | `IPC-540edc231d28` 与 `IPC-0e93232c5223` 的链从受限 IPC producer、consume-once open-job slot 到 `le2` 消费者，包含忙碌延期、restore queue、授权/配置分支、导入注册、自动导出，以及完成/取消处理。格式导入、识别、恢复、导出和外部助手执行仍是明确 leaf。 | `C037-COLLAB-PRODUCER`：`readable/main.js` 24375–24448，range SHA256 `f47b3508ba1f1fe6f4d7afe9b78b70e82b38aaf3c3ead2ade47c60255635dafa`；`C037-COLLAB-LE2`：`readable/renderer.js` 30810–30945，`878dde8bb185b3916e117fcb128a0524a7dffec61d0f96730d7650d0cf911c0a`；延期/队列节点见 JSON。 |
| 关闭与取消 | close coordinator 等待 prepare-close；脏文档路径执行 batch 同步、buffer 读取、snapshot/recovery 保存，失败时阻止退出；主进程 close FSM 与 native window lifecycle 接续，取消只作用于对应 sender 的工作。 | `C037-CLOSE-RENDERER`：`renderer.js` 3994–4033，`9abcb252e1ca62d4753bc8a698e86c5ffb458c6db7845d8a1186c80becd809b4`；`C037-CLOSE-SNAPSHOT`：32744–32824，`cdbd6d470d3877a8b42b86dabfad8c8278a0f014ef3bd307e096d375bcd69c6`；`C037-CLOSE-FSM`：`main.js` 25783–25802，`3aac2ecb1e9cf59cca6fce8df694f30554637c936f692785525b72865811a7e2`；native close 与取消范围见 JSON。 |
| 机器标识 | 公开客户端代码读取了 Windows WMI/CIM、MachineGuid registry、CPU/磁盘/主板/BIOS/系统 UUID/网卡及名称/域输入，并含 hash、缓存、旧算法迁移和 Darwin IORegistry → system_profiler → MAC 后备路径。实际 OS 输出未执行；私有签发端仍缺失。 | `C037-MACHINE-HELPERS`：`main.js` 13463–13590，`f1ae5825227fde6f5a2ebe38d2c49bfc8ecef8441835fb26ccebb2ee2570d78e`；`C037-MACHINE-ID`：13591–13669，`abd4569bc743865af592926640b382c7eae1ba4d29adca4567d47ce28caa36f1`。 |
| auth helper | helper 是随公开 app bundle 提供的 Mach-O 文件，不应标成私有或不可取得。静态反汇编包含 `_main`、错误映射、JSON response、LAContext policy reply 业务指令。真实 LocalAuthentication 成功/拒绝、entitlement 与系统调用结果未执行；私有 credential issuer 与其无关，仍是签发服务边界。 | 原二进制 `.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/auth/lawbot_auth_helper`，137,984 bytes，SHA256 `855db52f8519da63f60449f8f50889adb3c6b85fe0df97ebc977d69c67370c4b`；反汇编 `auth-helper-disassembly.txt` 2135–3013，range SHA256 `9f0f681e4e56b3b1f66743357b7324914839e122f103ba533347cd82cb1a7af5`。地址范围见 JSON `focusReview.authHelper`。 |
| updater / ASAR | 配置路径可达 generic/Mac updater 及公共 HTTP、缓存、签名校验、差分/多段、取消依赖；原包归档中记录的 87 个文件偏移和内容 hash 全匹配。系统签名验证与安装结果、live feed 保持 R0；`latest-mac.yml` 的 404 作为独立外部观察，不构成安装验证。 | 原 ASAR SHA256 `3a6ed78d23959ab310e56b83e412f0616e1d402767dcdbf910270a4c1aa3c9ae`，154,754,075 bytes；manifest `asar-updater/manifest.json` SHA256 `6c1f2854558c5488d12c81fae6fc39bdba34359a83f8c6d612a4823a6b0a613b`；全部文件和 offset 在 JSON `asarManifest.entries`。 |
| learner 分类 | 六个 learner handler 为公开源中的 retired/constant response；`get-stats` 单独指向既有统计逻辑。未发现可支撑“自动训练”的调用链。 | 六个对应 ID 均为 `retired_exact_handler_read_no_hidden_learning`，逐 ID 路径及 source ranges 见 JSON `rows`。 |

## 复算方法与复现

JavaScript `start/end` 按 UTF-16 code-unit 半开区间解释；切片解码为文本后以 UTF-8 字节求 SHA256。行范围按 1-based inclusive 行并保留原始换行。ASAR offset 对应原 archive 的绝对字节偏移。哈希确认来源与范围，不单独证明行为；上述调用边由静态阅读核对。

从仓库根目录执行以下命令可复核本报告中的新节点文件/范围 hash、835 个旧片段和 87 个 ASAR 文件：

```bash
python3 - <<'PY'
import json, hashlib, pathlib
r=json.load(open('文档/逆向台账/contracts/team-sol-architecture-luna1-20261015.json'))
sha=lambda b: hashlib.sha256(b).hexdigest()
root=pathlib.Path('.')
for n in r['newNodes']:
    b=(root/n['path']).read_bytes()
    if n['startLine'] is not None:
        s=b''.join(b.splitlines(keepends=True)[n['startLine']-1:n['endLine']])
    else:
        s=b.decode().encode('utf-16-le')[n['startUtf16']*2:n['endUtf16']*2].decode('utf-16-le').encode()
    assert sha(b)==n['expectedFileSha256'] and sha(s)==n['expectedRangeSha256'], n['id']
for e in r['oldExactEvidenceSlices']:
    b=(root/e['path']).read_bytes()
    if e['coordinateUnit']=='UTF-16 half-open':
        s=b.decode().encode('utf-16-le')[e['start']*2:e['end']*2].decode('utf-16-le').encode()
    else:
        s=b''.join(b.splitlines(keepends=True)[e['startLine']-1:e['endLine']])
    assert sha(s)==e['expectedSha256'], e
m=r['asarManifest']; a=pathlib.Path(m['sourceArchive']).read_bytes()
assert sha(a)==m['sourceAsarSha256Expected']
for e in m['entries']:
    s=a[e['absoluteOffset']:e['absoluteOffset']+e['size']]
    out=(root/e['path']).read_bytes()
    assert len(s)==e['size'] and sha(s)==e['expectedSha256']==sha(out), e['asarEntry']
print('new nodes:',len(r['newNodes']),'old slices:',len(r['oldExactEvidenceSlices']),'ASAR files:',len(m['entries']),'all hashes pass')
PY
```

## 差异与边界

差异表为空（JSON `findings: []`）。若需要交叉合并，按稳定 ID 与 A/B/root 的 62 个委托项去重；C 复核本身没有把任何竞品运行状态从 R0 提升，也没有将系统结果、私有签发服务或外部 AI 宿主推断为已读/已运行。
