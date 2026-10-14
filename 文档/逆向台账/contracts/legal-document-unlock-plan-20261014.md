# 已知文档密码解锁：来源与实现计划

**PDF独立 helper 已实测；用户界面、完整API／worker／portable链仍在接线，尚不能宣称解锁流程完成。** 源 `desensitization:unlock-source`（readable/main.js 17008–17051）接收 `sourceRef.id` 与非空、≤4096字符的密码，支持 DOCX/PDF/DOC/WPS。DOCX 使用 officecrypto-tool 解密并验证 ZIP；PDF通过 stdin 传已知密码给 Python，验证后产生无加密副本；旧 Word/WPS 解密 OLE 后再转换为 DOCX。源返回新 sourceRef，释放旧临时引用。我方当前 PDFium 总传空密码，遇加密 PDF 直接 `ENCRYPTED_PDF`，无输入密码的 API/UI。

```mermaid
flowchart LR
 A[已授权材料<br/>不可变加密原件 hash] --> B[用户提供已知密码<br/>权限及 revision CAS]
 B --> C[内存解密<br/>新派生 bytes/hash]
 C --> D[解析与 coverage 验证]
 D --> E[新版本识别与人工复核]
 E --> F[绑定双 hash 导出脱敏副本]
```

| 项目 | 实现要求 | 当前证据 |
|---|---|---|
| PDF | 已装 PDFium password 参数，bounded writer 保存去加密副本；必须重载验证 | [官方加载接口](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/public/fpdfview.h)、[官方保存接口](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/public/fpdf_save.h)；本地 pinned PDFium 实测 RC4-128、AES-256 Unicode 两个自建2页fixture通过，错误密码拒绝，原件hash不变；去保护副本无密码重载且每页文字/几何相等 |
| Word | 独立、许可明确的 Office 解密依赖，正确／错误密码及模式矩阵 | [msoffcrypto 官方文档](https://msoffcrypto-tool.readthedocs.io/en/latest/)；不能把所有 WPS 加密当 OOXML |
| 原件 | 原始 ciphertext 完整保留；新 derivedSourceId/hash 与 parentCipherHash | 已由 root API／016 migration／worker／portable 共同接线；保留原件并验证派生对象hash |
| 密码 | 仅请求内存，绝不持久化密码；另存AEAD静态加密的不可变明文派生对象，绑定原件cipherHash和derivedHash；后续只验证并读取派生对象，不再重复解密，不向前端返回密码，不写URL、argv、日志或环境变量 | 输入密码正常打开，不猜密码、不绕授权 |
| 复核 | CAS 新revision、重新识别、旧快照不得导出新版 | 旧未加密材料、旧复核、签发链接保持各自版本 |

全部字段、失败码、源分支、能力和验收矩阵见同名 JSON。原文解密与检测会重新绑定来源，不能只给解析器加 password 后继续用旧加密字节的 hash。


helper返回`{bytes,sourceHash,derivedHash,pages,format:pdf}`，调用者承担项目权限、CAS、派生对象存取和全链路hash绑定。3个单元测试已通过，不把纯helper测试当真实API验收或逐像素等价。
