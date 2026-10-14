#!/usr/bin/env python3
# coding: utf-8
"""Static author notes generator; source is read as bytes, never executed."""
from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[3]; C=Path(__file__).parent
source='.data/research/lawbot-2026-10-13/readable/renderer.js'
expected='4517cb61dcb7c5bc4771ccbe6655f3cf6303fb44c282e0d06f73bd859fd32cdc'
sha=lambda b:hashlib.sha256(b).hexdigest()
b=(R/source).read_bytes();assert sha(b)==expected
ls=b.splitlines(keepends=True)
ranges={'vml-wrapper':(4913,4984),'measure-width':(10683,10694),'ocr-page-flags':(22550,22575),'operation-source':(23357,23363),'bbox-scale-heuristic':(23396,23419),'blank-sampling':(23610,23626),'text-visible-ops':(24019,24031),'refine-native':(24217,24266),'text-match-items':(24267,24327),'native-items-boxes':(25333,25386),'reversefind':(25387,25549),'render-caller':(25735,25799),'ocr-measure-caller':(25627,25649)}
ev=[dict(id=k,path=source,startLine=a,endLine=z,fileSha256=expected,rangeSha256=sha(b''.join(ls[a-1:z])))for k,(a,z)in ranges.items()]
S=[]
def add(id,title,claims,risks,refs):S.append(dict(id=id,title=title,dependencyIds=['DEP28','DEP29','DEP32'],staticDepth='S2',runtime='R0',completeBusinessContract=False,observations=claims,conditionalRisks=risks,evidenceIds=refs))
add('LH01','Bb批量测宽与取消粒度',[
'Bb将batchSize夹在1..120，每批先批量读取offsetWidth，再按targetWidth/offsetWidth设置scaleX，比例严格处于min/max之间才写；默认0.1..20，toFixed(4)。批间await yieldWork或setTimeout(0)。',
'cancelled只在每批开始检查；同步map/forEach内部没有逐项检查。native调用还在await后检查渲染代际，OCR调用使用代际或!isConnected，OCR参数70条/0.05..30。'
],['宽度为0或比例等于阈值不改transform；本体不主动还原既有transform，也不证明字体真实排版宽度。'],['measure-width','render-caller','ocr-measure-caller'])
add('LH02','Ir2空白采样与lo2原生文本可见fallback',[
'Ir2步长为max(10,floor(width/120))与max(10,floor(height/120))，逐采样行getImageData，每个采样像素alpha>8且任一RGB<248才计非白；非白占比<0.001判空白，读取异常返回false。',
'lo2读取operatorList，以setTextRenderingMode更新当前mode，统计4种showText类operator；mode3或7记不可见，其余记可见。当不可见为0或不多于可见时允许fallback，异常false。它按operator数量比较，不是逐字/像素覆盖。',
'Xu2仅位图失败或Ir2判空时调用lo2并切textLayer--visible；之后文字span按该结果设置可见色或transparent。位图失败不保证fallback文字可见。'
],['稀疏采样可能漏掉未采样细线或小字；lo2模式计数不等于真实PDF绘图顺序/可见性证明，无竞品运行。'],['blank-sampling','text-visible-ops','render-caller'])
add('LH03','To2原生实体框精修',[
'Ft2仅当保留页中有scanned类别、OCR尺寸实体或垃圾文本标记页才真；To2要求Ft2、未deleted、严格同pageNumber、有效单bbox、非user来源、未rangeAdjusted/userAdjusted且无number型OCR尺寸。caller另要求本页文本未判垃圾及en2旋转为0。',
'viewport乘item.transform生成候选矩形，ascent或1+descent夹0.6..0.95；在旧框外扩24显示像素内按top（差>2）/left排序，经Eo2寻找文字。Qi2用viewport与缩放阈值猜旧框是否已在显示像素空间，并非明确单位标签。',
'匹配item矩形取并集；新宽>旧宽+10或y移动>旧高+20则拒绝。面积比0..0.9、x右移>2或宽缩小>2任一满足时原地写meta.bbox与textLayerRefined=true；catch返回false。caller累积成功后提升Je2。'
],['Xi2只排NaN而非所有Infinity；Qi2有额外finite门。精修本体不触发保存、未更新meta.bboxes等其他框列表；不能把本次bbox变更称全链同步。'],['ocr-page-flags','operation-source','bbox-scale-heuristic','refine-native','render-caller'])
add('LH04','Eo2/No2与xu2/ku2文字到框',[
'Eo2从每个item起最多拼max(100,5*query.length)项，去空白完全相等即返回；包含query先尝试No2收窄，失败才允许query/拼文长>=0.5的最佳候选。超过4倍query长度停止当前拼接。',
'No2取首indexOf命中，先保留重叠>=该item文字长度一半的范围；没有则保留所有正重叠。最多20轮左右扩展，返回包含query的连续item子数组或空；不切item内部几何。',
'xu2按viewport变换和字体ascent建立__rectPx并按top/left排序。ku2在这些item拼文中首indexOf，按每item宽度/去空白UTF16长度等比分摊命中宽，按y差<=4合并首行组，再取union。'
],['匹配与宽度分配均用UTF16及等字符宽假设，不能由源码保证非BMP、比例字体、竖排或复杂脚本定位准确；这里是应用启发式，不执行字体渲染器。'],['text-match-items','native-items-boxes'])
add('LH05','_u2 OCR优先、原生与LCS回退',[
'_u2先要求当前PDF对象和非空原始query；有IPC和fileName先batch-search，可选pageIndex。成功结果按requested page过滤，构造框并经Xi2，按OCR y/ocrImageHeight与approxY*zoom/pageHeight距离排序，立即返回最邻近；缺尺寸距离为0。该OCR分支没有deleted页集合过滤。',
'OCR失败或无结果再按指定页、其后页、前页的顺序遍历，过滤deleted页。优先xu2→Eo2→ku2，指定页有approxY时先查中心±80区域再全页；否则依PDF原始item顺序拼文字、局部等比分割宽、按y差<=4合并。',
'若原生精确候选仍无结果且指定页非null，再在该页每起点最多20item的串上算LCS，匹配长度/query.length>=0.7列候选、串超3倍query停止。优先LCS最高；有approxY且多个候选在最高差2以内，按y距离选；返回单union框。该最终指定页分支没有再次检查deleted页。',
'各层catch可吞失败，最终null；没有自有timeout、revision/代际检查。读取Ee2.value、props和布局发生跨await，单函数不能保证切文档后仍指同材料。Zs2当前仅返回多框才采用_u2结果，单框LCS结果在该caller不会替换用户框。'
],['删除页过滤只覆盖原生主循环；OCR与最终指定页LCS另有条件，不能宣称_u2所有分支排除已删页。no local generation不等于已经复现跨文档错误，外围锁定/卸载仍需合法运行。'],['reversefind','native-items-boxes','text-match-items','bbox-scale-heuristic'])
add('LH06','DOCX VML应用包装与资源边界',[
'Ad只接受恰好两项有限数，其他值用默认coordsize/origin；Td解析样式，group裸数按父坐标原点/尺寸转百分比，无父裸数用pt。CSS单位仅pt/px/in/cm/mm/%，rotation需finite，flip可x/y，z-index要求整数字符串。',
'Ed解析f单位除65536、百分号除100或直接Number，非finite变0但不夹到0..1。Nd递归group要求coordsize正数；image crop剩余宽高比例<=0报错，否则生成裁剪百分比容器。',
'imageHref.id缺失时委托renderElement；有id必须imagePath可得，并将loadImage→赋src→decode Promise登记给宿主waitFor。含foreignObject再加renderTextBox覆盖层。无本地代际/timeout；宿主Yr2既有取消与等待上限不能当该包装内部已主动终止decode。'
],['负crop比例可能导致向外扩展；应用只拒绝剩余比例非正。真实VML解析、资源decode及复杂排版由外部renderer/浏览器决定，本体静态已读。'],['vml-wrapper'])
D=dict(schemaVersion=1,date='2026-10-14',iteration='ITER-019',scope=['DEP28','DEP29','DEP32'],staticDepth='S2',runtime='R0',executedVendor=False,candidateS3=0,completeBusinessContracts=0,supersedesRemainingOnly=dict(report='iteration019-layout-manual.json',functions=['To2 PDF','_u2 PDF','Ir2 PDF','lo2 PDF','Bb','Nd VML wrapper'],note='本补充读完五函数本体及Eo2/No2/xu2/ku2直接应用辅助。旧报告为当时快照，未改。'),sections=S,evidence=ev,evidenceCount=len(ev),remaining=[dict(kind='cross-report',detail='DOCX qh/df/Nf/_2/v2见同轮projection PA09及PA01；PDF wb/yb/gb/Qy见同轮state-policy SP15，非本作者重复审查。'),dict(kind='external-runtime',detail='PDF.js getPage/getTextContent/getOperatorList/render、动态DOCX模块、真实DOM/font/canvas、合法竞品材料保存导出及取消切换均未由静态应用代码验证。')],verificationMeaning='--check只验证生成一致性和固定source/range hash；独立语义审查由另一agent。')
md=['# ITER019 布局直接依赖补读','','6节13范围；S2/R0，未执行竞品；不宣称业务全链闭合。','本稿承接layout-manual留下的五函数，并读取Eo2/No2/xu2/ku2及Nd VML应用包装。','']
for s in S:
 md+=['## '+s['id']+' '+s['title'],'']+['- '+x for x in s['observations']]+['','条件与边界：']+['- '+x for x in s['conditionalRisks']]+['','证据：']+[f'- renderer.js:{ranges[k][0]}–{ranges[k][1]}，`{k}`，SHA256 `{next(x["rangeSha256"] for x in ev if x["id"]==k)}`。'for k in s['evidenceIds']]+['']
md+=['## 剩余','']+['- '+x['kind']+'：'+x['detail']for x in D['remaining']]+['']
out={C/'iteration019-layout-helpers.json':json.dumps(D,ensure_ascii=False,indent=2)+'\n',C/'iteration019-layout-helpers.md':'\n'.join(md)}
for p,t in out.items():
 if '--check' in sys.argv:assert p.read_text()==t,p
 else:p.write_text(t)
print(json.dumps(dict(result='passed' if '--check' in sys.argv else 'written',sections=len(S),ranges=len(ev),mode='structure-hash-only')))
