from pathlib import Path
import hashlib,json,sys
R=Path(__file__).resolve().parents[3];C=R/'文档/逆向台账/contracts'
refs=[]
for file,ranges in [('main.js',[(15817,15838),(16317,16337),(16750,16787),(17154,17185),(17409,17513),(17784,17935)]),('renderer.js',[(31626,31641),(32063,32082),(33795,33909)])]:
 p='.data/research/lawbot-2026-10-13/readable/'+file;b=(R/p).read_bytes();ls=b.splitlines(keepends=True)
 for a,z in ranges:refs.append(dict(path=p,line_start=a,line_end=z,sha256=hashlib.sha256(b''.join(ls[a-1:z])).hexdigest(),file_sha256=hashlib.sha256(b).hexdigest()))
claims=[
('EC01','输入与输出身份','M2/sourceRegistry.resolve 读取登记来源并返回原始 filePath；apply另计算 le2原路径。显式 outputPath 非空则直接用，默认名加已脱敏后缀。所读 apply 提交路径没有普遍的源目标同一文件拒绝；最终 preserveOnCancel 用 resolve(...).toLowerCase() 字符串相等，未以 realpath/inode 判同。'),
('EC02','非Markdown覆盖和取消','A2 使用默认 writeFile 写目标，可覆盖现有文件；仅EPERM/EACCES/EBUSY改名重试，无备份/事务回滚。图片/PDF/DOCX写后执行 v2(cleanupPaths.add) 再 Gp(signal)。若在写入期间已abort，Gp抛取消，finally逐个rm cleanupPaths。finally未检查 le2，也不读取最终receipt.preserveOnCancel。因此条件成立时（目标等于来源、写成功、返回前abort）可能删掉覆盖后的原路径；这是静态反例，不是已运行复现。'),
('EC03','成功回执保护范围','preserveOnCancel 只在成功结果构造时计算；renderer Xp2 不将受保护的成功输出加入Pp2，cleanup-paths也检查同sender、completed/success、15分钟、未使用、preserveOnCancel!=true和路径大小写归一匹配。它不检查当前文件hash/inode，成功后路径内容被替换时仍可能删除当前文件；成功回执保护不能回溯保护apply内部finally。'),
('EC04','Markdown显式替换','交互冲突选择覆盖会先把resolve目标放ue2，me2不把该目标加入cleanupPaths；非交互保存设置existingDestination=reject。Markdown提交器冲突/临时提交另见PSF08与DP19。新建Markdown写成功后加入cleanup集合，转换输出紧接Gp；Markdown源码写分支则在提交与日志后直接发done，无同位置Gp。不同格式对晚到取消的检查点不一致。'),
('EC05','取消、失败与中间产物','cancel按requestId查任务并abort，没有该分支sender比较；Gp只在检查点抛，Kp把AbortError/TASK_CANCELLED/MARKDOWN_SAVE_CANCELLED/特定消息视为取消。finally只在signal.aborted时删除cleanupPaths，非取消异常不会通用删除已写输出。临时T3无条件尽力删除，rm失败吞掉。若A2写入途中失败，v2还没登记该路径，不能宣称部分文件自动回滚。'),
('EC06','回执与取消时序','apply按requestId与sender去重并记录running；完成success与catch记录completed；但17784–17788的非Markdown失败直接return跳过completed写入，finally移除任务后回执仍可能停在running。最终成功路径包含异步日志/读取，最后没有统一Gp：若晚到abort发生于最后检查点后，可能先生成成功receipt再在finally清理输出。renderer遇特定IPC错误最多查询4次回执，仍未知则阻止重复导出并保留审查；回执不是文件仍存在的证明。'),
('EC07','前端清理链','Gi2把sourceRef与显式outputPath交给apply，失败转Error；Xp2只把不保留的成功路径加入Pp2。tm2遇取消清空Pp2后调cleanupPaths，失败返回cleaned0并让用户核对。它不把所有失败路径纳入清理，也没有跨多文件事务；Jp2的批量返回与Xp2单文件收集行为不应合并推断。')]
d=dict(schemaVersion=1,date='2026-10-14',scope='DEP43取消、覆盖与落盘组合的应用代码静态核验',staticDepth='S2',runtime='R0',executedVendor=False,observations=[dict(id=a,title=b,detail=c) for a,b,c in claims],evidence=refs,remaining=['真实文件系统故障、链接/大小写、晚到取消时序尚未运行；没有删除或覆盖用户/竞品文件。','第三方writer的原子性、平台权限与子进程停止行为仍按原报告边界；此报告不会把全apply升S3。'],counterexampleMeaning='条件化源码推导，非实际触发；不保证每个UI正常选择都可构造同源目标。')
md='# 导出、取消与覆盖不变量（2026-10-14）\n\n**S2/R0**。只读公开发布源码，未触发文件覆盖或运行竞品。条件化反例不等于实际复现。\n'
for a,b,c in claims:md+='\n## '+a+' '+b+'\n\n'+c+'\n'
md+='\n## 边界\n\n'+'\n'.join('- '+s for s in d['remaining'])+'\n\n精确9条源码范围与SHA见同名JSON。\n'
for p,b in [(C/'export-cancel-invariants-20261014.json',(json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode()),(C/'export-cancel-invariants-20261014.md',md.encode())]:
 if '--check' in sys.argv:assert p.read_bytes()==b,p
 else:p.write_bytes(b)
print('7 observations / 9 ranges; S2/R0')
