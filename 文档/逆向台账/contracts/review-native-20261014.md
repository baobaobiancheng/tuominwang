# 原生文件完整性对抗审查 · 2026-10-14

## 结果

7份原件基线通过，93个纯内存变异：72个非允许修改被拒绝，21个签名区不透明变异按预期只通过normalize。原包未修改，未运行原生模块。

- 7份现存发布原件与已验证npm制品的非签名前缀比对成立，ASAR原始SHA256不一致仍保留。
- 代码字节/签名前最后字节、LC计数/末尾范围、签名起点、EOF、LINKEDIT大小/任意vmsize修改均被拒绝；8字节补齐样本非零补齐与多16字节补齐均拒绝。
- x64允许4KiB或16KiB精确上取整，仅对LINKEDIT.vmsize字段放宽；任意其他值失败，该有限例外不掩盖代码字节。
- 签名blob不透明：损坏magic、尾部附加任意数据以及零长度blob可通过normalize。该函数仅定位差异，不证明签名有效。
- 父线程已增加codesign verify/display非零拒绝产报告与allCodesignVerified；当前7原件记录均为0。未为内存变异调用codesign，不把其预期失败冒称实测。

## 边界

- normalize未独立核Mach-O所有load-command结构（例如唯一LINKEDIT/最终遍历offset、完整签名SuperBlob结构）；固定可信上游逐字节比较与系统验签共同约束当前7对，不是通用恶意Mach-O验证器。
- codesign证明磁盘签名有效，不证明第三方算法正确、软件运行安全、签名历史流程或ASAR重打包步骤。

## 可重跑

`python3 文档/逆向台账/contracts/review-native-probes.py`

此脚本只从己方verify-native.py提取normalize函数AST，在内存解析原文件副本；不执行被分析二进制、不改原包。7份签名状态引用并核验父线程当前结果SHA256，变异数据未写磁盘也未送codesign。
