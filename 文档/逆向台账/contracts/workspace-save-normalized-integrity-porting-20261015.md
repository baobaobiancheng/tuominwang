# 工程保存回执归一化副本校验

**P2已关闭**：作者和独立审查者各1条真实隔离接口测试通过。下载当前工程备份时，归一化DOC/WPS副本与解密副本一样复核完整来源绑定。

- Real source-supported ZIP-labelled DOC normalize→worker→actual save receipt completed→authenticated download200
- Change only normalized object ciphertext to a valid AEAD of wrong bytes; DB source/derived hashes untouched
- Current download returns409 SOURCE_MISMATCH, original source bytes unchanged, persisted completed receipt payload/hash unchanged
- Restore exact previous normalized ciphertext; same receipt returns byte-for-byte identical saved backup
- No private material or source/model limits altered

首次新门拒绝数据但返回500的日志保留；现精确返回409。没有改变保存副本或原件。逐文件和运行SHA见同名JSON，许可运行仍R0。
