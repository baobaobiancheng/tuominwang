#!/usr/bin/env python3
"""Generate a complete, version-bound rules handoff; never omit list entries."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[3]
read=lambda p:json.loads((root/p).read_text())
sha=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
activation=read('文档/逆向台账/contracts/rule-runtime-activation-20261014.json')
sections=['''# 脱敏规则完整技术交接 · 迭代 030

适用对象：技术负责人、其他工具／skill 的开发者。基于脱敏猫 **0.5.9 macOS／Windows** 静态证据和我方当前代码；所有竞品处理链仍为 **R0：未经正版激活运行验证**。本文完整列出已获得的规则与配置，不能据此宣称未知服务端、其他版本、平台原生组件全部等价。

## 1. 怎样复用

```mermaid
flowchart TD
  A[原件：仅本地或私有存储] --> B{文件是否加密}
  B -->|已知合法密码| C[内存解锁＋完整性核验]
  C --> D[独立不可变派生对象<br/>保存原件及两份哈希，不保存密码]
  B -->|未加密| E[格式解析]
  D --> E
  E --> F[规范文本＋UTF-16 anchors＋coverage<br/>页面字框与图像帧]
  F --> G[41基础组＋12金额族／17正则分支]
  F --> H[场景／实际表格／PDF几何／关系图]
  F --> I[可选 NER＋来源过滤]
  G --> J[候选合并：全部 pending]
  H --> J
  I --> J
  J --> K[按格式与方案产生遮罩／假名]
  K --> L[人工确认、保存版本]
  L --> M[导出核验：原值残留／原件哈希／版本／像素]
  M --> N[已验证副本与不可变签发链接]
```

|复用层|入口|关键责任|
|---|---|---|
|纯规则|`detectComplete`／`detectReferenceRules`|UTF-16 半开区间；跨对象候选禁止；不自动通过复核|
|格式与上下文|`contextualDocumentMarks`|Word／Markdown／CSV／Excel 真实单元格；PDF 路径与实际 glyph，不猜偏移|
|NER|`createNer`＋`filterCompleteNer`|同一会话复用；固定权重；不是可靠的英语通用识别器|
|默认遮罩|`referenceDetectedMask`|按 provenance 重算 `entity.masked`；text-final 与 raster-final 有真实差别|
|选择性部分星号|`referencePartialMask`|对应源 Nt；不能冒充所有默认 `entity.masked`|
|替换／假名|`replacementFor`／`applyReplacementPolicies`|预览与导出共用；保留显式人工例外；假名映射不可变|
|视觉候选|`detectVisual`／`detectOfficeImageFaces`|人脸／印章／签名全部待确认；GIF／TIFF 每帧，不只首帧|
|复核与导出|`validateFileMarks`／`assertExportable`|pending、重叠、coverage 阻断、版本变化必须阻止签发|
|文件密码|`unlockPdfDocument`／`unlockWordDocument`|用户已知密码；原件不覆盖；不提供密码猜测或竞品许可证绕过|
|跨工具|`scripts/mcp-stdio.ts`／12 MCP工具|实际 HTTP／stdio；云端不能读取客户端任意绝对路径；需人工授权|
|逐协议方法|25 AI协作＋14 gateway＋4连接器|43独立ID真实合成工作流；外部桌面安装与竞品授权runtime不包含|

### 1.1 给其他工具／skill 的推荐调用契约

```json
{"input":{"text":"规范文本","anchors":[],"sourceHash":"sha256","format":"docx","revision":0},"candidate":{"start":0,"end":2,"kind":"姓名","decision":"pending","sources":[{"layer":"rules","code":"稳定ID"}]}}
```

位置单位为 JavaScript UTF-16，`[start,end)`；拒绝半个代理对、超范围、跨单元格／跨图片对象的标记。不得用字节下标或 Unicode code point 下标替代。每个候选保留来源，不把不同类型的重叠项静默丢弃。实际脱敏输出只取人工确认的 `redact`。

## 2. 完整范围与激活

|类别|数量与口径|注意|
|---|---:|---|
|基础组|41|不是全部算法的总数|
|金额族／正则分支|12／17|上下文排除和金融表格还有独立分支|
|来源计算遮罩oracle|253例／75个来源code|完整sourcecomputed默认遮罩与Nt另表；纯函数零差异不冒称正版运行|
|配置类别／数组项|108／3012|3009字符串＋3非字符串；附录不去重、不挑选；运行按原调用图消费|
|默认实体类型|19|signature 是源可选第20项；另6项是我方显式类型扩展|
|接口／业务链|258／37|每项证据在台账；不能用一个 family 测试代替258项契约验收|

```mermaid
flowchart LR
  A[标准识别：默认] --> B[全部基础、金额、场景]
  B --> C[按格式运行实际表格／几何]
  C --> D[现代 PDF 汇总 Ll／jl]
  E[兼容识别：显式选择] --> F[源 NER_DIRECT=0 对应 party callers]
  F --> G{姓名碎片重组开关}
  G -->|启用且非other文书| H[重组至多150项，保留源上下文守卫]
  G -->|未启用| I[不重组]
  J[配置中没有源caller的54词项方法] --> K[完整保存／可供评估<br/>不假装默认算法消费]
```

配置“完整移植”是保存所有来源条目及其真实调用条件；把源未调用的数据强行全局激活会改变误报行为。兼容策略和碎片开关在材料设置中明确选择。标准与兼容均保持人工复核。

## 3. 关键遮罩对照

|情形|源默认计算值／我方默认|选择性 partial_star|
|---|---|---|
|税号|前4字＋4星＋后4字|Nt 按信用代码家族保前6／后4|
|9位社保号|前3＋3星＋后3|Nt 全部固定遮盖|
|19位银行卡|按源长度计算星段，保前4后4|Nt 的独立部分遮盖规则|
|表格姓名／手机号／金额|表格 Do 全字符星号|Nt 类型规则|
|3字表单姓名|3星|源 Nt 姓名部分遮盖|
|机构|文字最终 An；图像普通 NER 常为3星|Nt 机构规则|
|金额|保留源货币／单位的金额模板|Nt 金额部分规则|
|回单已遮盖原值|原值不得原样输出，安全回退全星|同样检查原值残留|

人工自定义替换、clear／full、类型占位、假名都有独立契约；不能把它们混为相同能力。默认19类型的信用代码、身份证、案号选项分别覆盖源税号／EIN、护照／国际ID／社保、公文编号；子类型显式设置优先。

### 3.1 图像输出不会仅因 masked 字段存在而绘字

```mermaid
flowchart TD
 A[已复核图像／PDF／Word嵌图] --> B{整体默认／视觉full模式}
 B -->|是| C[仅填色清原像素]
 B -->|否| D{逐项pseudonym标志与非空替换}
 D -->|无| C
 D -->|部分星／全星／假名| E[先清原像素再绘指定文字]
 C --> F[人工clear区域最终有效]
 E --> F
 F --> G[实际像素核验与原件hash]
```

**253例／75个来源code验证的是computed masked字符串，不能据此让图像默认重新绘字。** 源整体default_star、image/PDF归一化full_star与Word普通嵌图默认均纯清除；selective里的partial_star／full_star才设置逐项pseudonym标志绘星；手工明确custom／type／alias按其选择绘字。Word正文与Markdown仍按字符串替换。手工画框／搜索清除必须最后有效，不能被自动派生文字重新覆盖。逐行来源与40个真实源码caller隔离控制流oracle见 [图像模式矩阵](逆向台账/contracts/raster-source-mode-matrix-20261014.md)；像素修正验收独立记录。

### 3.2 自定义替换协议：保留原值的完整字符串语义

```mermaid
flowchart LR
 A[人工／TMM替换字符串] --> B{完整Unicode且无NUL}
 B -->|否| X[整体拒绝，不截断／不替换非法字符]
 B -->|是| C[保留空串／首尾空白／多行／长字／特殊符号]
 C --> D{输出格式}
 D -->|TXT| E[UTF8原字符串]
 D -->|Markdown| F[按region转义；必要安全纯文本围栏]
 D -->|Word| G[XML字符合法性检查；非法则明确拒导出]
 D -->|Excel| H[ST_Xstring编码控制字符与字面_x序列]
 E --> I[签发前重验副本＋原件hash不变]
 F --> I
 G --> I
 H --> I
```

|契约点|完整行为及源码依据|
|---|---|
|长度与字符|源后端main19208／19281只要求string，未设100上限或<>【】禁令；源renderer5381的maxlength30只约束那个UI入口，不能反推TMM/backend上限|
|空串与空白|源Markdown Writer接受空串删除和全空白；我方明确custom空串删除，clear仍为独立视觉清除；旧TMM未设置的空custom字段按其上下文处理，不能统一变成删除|
|多行与特殊符号|保留首尾空白、换行、tab、长Unicode、<>【】；Markdown根据普通文本／代码／frontmatter等region做转义，不渲染任意HTML|
|非法值|NUL、不完整Unicode整体拒绝；原值仍完整包含在替换结果也被安全契约拒绝；不悄悄截断或清洗|
|Word限制|XML 1.0不合法控制字符／U+FFFE／U+FFFF明确OFFICE_XML_VALUE_INVALID，不生成损坏或悄悄丢字符的Word副本|
|Excel无损|控制字符用_xHHHH_；字面_xHHHH_的下划线先编码为_x005F_，只解码一遍，避免把字面字符串误变控制字符|
|Markdown核验|actual Writer字节保空白；canonical解析忽略部分布局空白是Markdown语法，并非应用trim；隐私降级产品围栏不写固定info=text，避免选中原值text重复到语法侧|

源纯Writer的**10例**原结果均保存，不选择性只报告成功：空串、三空格、字面反斜杠t／n（非真实tab／换行）、U+0001、NUL、200汉字、【标签】、HTML样式字符串、真实多行tab、首尾空白。结果9成功／NUL 1明确invalid-operation。证据：`iteration029/custom-replacement-source-oracle.json`。这属于可独立执行的源码纯函数证据，不升级为竞品正版授权处理链验证。

独立真实接口核验：4格式×8类共32组合，4 tests PASS107.11s；30签发下载，Word非法XML2类明确拒绝且无artifact。TXT／Markdown空白和多行字节、Office重新解析、Excel控制字符与字面_xHHHH_无损、全部原件hash不变均实际断言；8次NUL／不完整Unicode保存整体拒绝。详见[自定义替换核验](逆向台账/contracts/custom-replacement-porting-20261014.md)。

## 4. 格式、版式与解锁

|输入|处理与复核|输出核验／已知边界|
|---|---|---|
|Word|分页预览、样式／表头页脚／表格／VML文本框；规范anchors用于标记|不是 Microsoft Word 像素等价排版；复杂freeform／OLE／altChunk明确阻断或提示|
|Word图像|PNG/JPEG/GIF/BMP/TIFF与VML imagedata；每帧OCR＋人脸|帧hash／媒体hash／规范坐标验证；统一生成无原值PNG|
|PDF|原生文本＋OCR，矢量表格路径＋Form变换|真实删除敏感像素、输出无旧文本层；再OCR与逐页RGB验证|
|图像|glyph／OCR改字、框选、4种遮盖颜色|OCR改字保存派生文本与坐标，不伪造原件改字|
|Markdown|GFM／YAML／HTML表格完整source-map；BOM／换行／markup保留；原件不变|图片／原始HTML逐项确认后移除；非安全结构降级纯文字围栏；独立canonical与隐藏原始语法残留验真|
|CSV／Excel|原单元格／表头／金融金额上下文|保原格式结构，跨cell标记拒绝；公式缓存／外部对象可阻断|
|加密PDF|RC4／AES，提供已知密码，PDFium无密码重载验全文／页形|保留原encryptedbytes；独立derived对象；不保存密码|
|加密Word／Excel|OOXML Agile／Standard；密码verifier／HMAC或ZIP CRC＋结构|旧DOC/XLS转换仍明确要求；未知算法不返回假成功|
|工作区备份|原件、文本、页图／字框、方案、词表、映射、OCR派生稿|新UUID、重新识别；旧approval不信；解锁derived须本机签名验证或重新输入密码|

## 5. 准确率：全量真实语料与范围

|语料|全量gold范围|严格P／R／F1|不能外推|
|---|---|---|---|
|UNER Chinese-GSD|500繁体百科句子，767个PER/ORG/LOC|71.754%／69.883%／70.806%|中文合同、号码、金额、签名、印章|
|CrossNER|2506英语跨领域句子，7926个PER/ORG/LOC|33.333%／0.03785%／0.07561%|不能宣称英语NER达标|
|签名真实框|完整35张官方validation，非独立test；143train仅比较阈值|默认P50.9%／R80.0%／F1 62.2%，TP28／FP27／FN7，IoU≥.5|中文合同、严格IoU.75；训练域重叠不能排除|
|签名RF100原test|37张完整，数据族可能参与训练|P61.6%／R83.3%／F1 70.9%|不能称未见泛化|
|人脸公开全量|Open Images V7 Human face全部5749图，3124正／2625人工核验负；5594框含153 GroupOf|IoU≥.5：P75.85%／R76.25%／F1 76.05%，TP4149／FP1321／FN1292|原尺寸5748推理＋1张>25MP明确拒绝，拒绝不计TN；非合同、非官方mAP，训练重叠不能独立排除|
|人脸统一1024次评估|同5749图全量统一长边≤1024、不放大|5745相同输入字节复用预测＋4张真实新推理，全5749完成，P／R／F1同上|这是另列的统一预处理评估，不覆盖原尺寸拒绝事实|
|印章合成例|彩色章源码纯函数26项＋真实WASM|合成回归与源码数值对照；黑白章为我方扩展|没有真实黑白／商业扫描章专门gold，不宣称业务准确率|

中文语料为[作者公开Chinese-GSD](https://github.com/UniversalNER/UNER_Chinese-GSD)，CC-BY-SA 4.0；英文CrossNER由作者MIT发布。逐条结果、模型／语料／代码SHA在真实语料报告。源竞品无许可证，不运行其处理链；离线纯函数oracle相同不等于已激活产品端到端等价。

### 5.1 识别质量怎样判读

```mermaid
flowchart TD
 A[公开全量评估] --> B[中文500句／767实体<br/>F1 70.806%]
 A --> C[英语2506句／7926实体<br/>F1 0.07561%：不能称英语NER达标]
 A --> D[人脸5749图／5441独立框<br/>F1 76.05%]
 A --> E[签名35验证＋37原test<br/>F1 62.2%／70.9%]
 D --> F[原尺寸1图拒绝另计；统一1024全量另列]
 D --> G[GroupOf只作忽略区与辅助覆盖<br/>142／153，不当独立人脸个数]
 B --> H[法律业务材料另建人工gold]
 C --> H
 E --> H
 F --> H
 G --> H
 H --> I[候选全部待确认；人工复核和副本残留核验独立]
```

人脸固定生产confidence=.6／NMS=.3，未按此validation调参。重叠GroupOf辅助计数原141被独立审查修正为142／153；全部5749原始预测与gold保留，TP／FP／FN及ignored计数逐条不变，修正前后结果和代码hash另存。不能把GroupOf当人脸个数、把输入拒绝当真阴性、把固定阈值F1称官方Open Images mAP。全量原图／标注／模型／预处理路径指纹验证见[人脸评估](逆向台账/contracts/public-face-validation-20261014.md)。图片逐项CC BY2.0、标注CC BY4.0，原归属完整保留，不重发布原图；模型MIT与训练重叠不确定性明确列出。

## 6. 技术负责人验收清单

1. 在自己的材料类型建立人工gold，标注类型与UTF-16边界；区分候选精度和最终泄露率。
2. 每个配置类别按下表的真实调用条件验收；对未消费数据另立扩展规则，不能默认为现成功能。
3. 测试重复原值、跨run／table、错字、合并cell、表头单位、面积／金额歧义、图片多帧。
4. 复核全部pending／冲突，下载副本后搜索敏感原值并检查原件／派生hash。
5. 跨工具只返回最小必要字段，使用MCP授权、版本、scope；不把映射明文发送到外部模型。
6. 单独评估英语、真实签名／黑白印章、平台原生模块与未激活竞品运行链。

### 6.1 Markdown 可移植链及安全差异

```mermaid
flowchart TD
 A[不可变原始 MD／markdown 字节＋SHA] --> B[GFM／YAML／HTML表格解析]
 B --> C[扫描文本＋UTF16对象anchors＋完整sourceMap]
 C --> D[AEAD私有sidecar<br/>recognition仅保存ID／哈希／parseVersion2]
 C --> E[规则＋真实NER窗口＋上下文识别事件]
 E --> F[人工确认敏感标记]
 B --> G[图片／原始HTML逐项确认移除]
 F --> H[版本／source／scan／sidecar／snapshot强绑定]
 G --> H
 H --> I[保原markup Writer三次确定性检验]
 I --> J{独立隐私验证}
 J -->|安全| K[保格式副本]
 J -->|结构语法仍含选中原值| L[安全纯文字围栏降级后重新验真]
 J -->|原文／版本／语义不一致| M[拒绝签发]
```

|项目|来源实际行为|我方运行与差异|
|---|---|---|
|YAML数字／布尔／null|源仅字符串scalar进入scan，数字手机号可能未扫描|产品保原raw scalar字节文本进入scan，避免Number精度丢失；纯sourceCompatibility测试保原行为，禁止产品导出使用|
|YAML注释／锚点／alias名称|不进入source scan，原Writer可能保留选中原值|独立检查输出sourceMap未覆盖语法；发现原值安全降级，仍保人工明确保留的正文同值|
|图片／非表格HTML|源UI逐项remove确认，Writer自身会移除全部|真实GET／PUT确认，AEAD记录source／scan哈希并创建新snapshot；未全部确认阻止导出|
|仅图片／HTML、scan为0|可remove后输出0字节|仅新MD2经source／sidecar／完整inventory与ACK验证允许；空TXT、旧rawMD及原件空文件不放宽|
|旧Markdown坐标|旧项目raw source与新scan不同|parseVersion2与source/scan指纹屏障，必须重新识别，不套用旧offset；已签发旧副本维持原认证链|
|source-ready／matches|按首次、25k已完成文字、250ms或末尾刷新|实际parser／规则／NER126-token窗口／上下文完成回调；matches标provisional，最终仍待人工确认|
|精确可复核证据|27完整parser字段、103Writer操作／输出源码golden|同版本源码纯函数oracle全字段核验；不等同正版产品实际处理链|

### 6.2 任意类型、规则作用范围与互操作

|概念|完整保留方式|必须验证|
|---|---|---|
|未知原始类型|`kind: 自定义`＋`rawEntityType`，不猜测name_/org_动态前缀；__proto__等合法标签也保留|同span不同raw类型、预览、假名、LPM／XLSX、TMM、恢复与筛选不合并丢失|
|来源集合|无专用8项截断，保稳定source code；受整体运输／文件限额约束|第9来源加入仍合法，不静默丢证据|
|个人名单|源whitelist是forceDetect、blacklist是forceSkip；迁入规则库默认未启用|主动选择方案规则库、重新识别；forceSkip最终优先于runtime whitelist|
|继承文书范围|旧规则库materialTypes继承为每条`materialRouteKeys`|匹配实际文书route才运行，不把非诉／披露专用规则全局启用|
|Excel名单与映射|源18类型三列兼容，隐藏D保任意raw；ST_Xstring单次编解码|控制符、CR、FFFE／FFFF、literal `_xHHHH_`、中文／emoji无损往返|
|金额|12族17正则＋实际表格金额单元／金融排除／空间单位场景|面积／注册资本排除和人工／项目词表来源区分；默认computed mask与选择性Nt不混用|
|手工Markdown稿|独立双CAS不可变AEAD版本、风险提示下载|不是已验证脱敏副本，不自动批准、不计入签发安全结果|

协作协议43方法及实际恢复／重试逐项证据见 [逐方法验收](逆向台账/contracts/mcp-exact-method-runtime-20261014.md)。源绝对磁盘路径采用授权document ID适配；连接器只确认真实protocol session与配置，不冒称外部OS客户端可用。

真实识别指标见 [全量NER报告](逆向台账/contracts/real-porting-evaluation-result-20261014.md) 与 [签名真实框评估](逆向台账/contracts/signature-model-porting-20261014.md)。NER的繁体百科和英语跨域结果不外推至中文合同；源码／模型hash一致不消除训练数据重叠。签名模型是合法Apache2独立扩展，未发现竞品同类模型不能声称复制等价。真实黑白章业务gold与许可证运行边界继续保留。

### 6.3 还原容量、顺序与编码歧义

```mermaid
flowchart TD
 A[授权映射LPM／JSON：至多100000条] --> B[认证／完整Unicode／原值与类型完整保留]
 B --> C{文档表示}
 C -->|Word包装token| D[完整包装单元扫描＋规范化Map]
 C -->|Word原样token| E[压缩radix字面匹配]
 C -->|Markdown| F[原样／转义／实体变体表]
 F --> G{同表示对应不同原值或非恒定occurrence队列}
 G -->|是| X[明确RESTORE_NORMALIZED_TOKEN_COLLISION]
 G -->|否| E
 D --> H[原文位置优先、同起点最长；跨run绑定]
 E --> H
 H --> I[单遍插入原值，不递归再还原]
 I --> J[immutable派生副本＋原件hash＋权限下载]
```

源main18978允许100000条继承映射；原独立还原器5000上限、Word包装token的巨大空白正则、100000个205字符多样plain别名约23MB导致的V8 native fatal均已修复，未新增别名字符上限或调大原512MiB worker预算。Word包装扫描与原样压缩radix、Markdown变体及shared `restoreText`共用字面匹配语义：原始位置最左、同起点最长、不递归重扫插入原值；未知编号／损坏包装拒绝，普通【标签】保留；Map／own-property处理__proto__等原样别名。

Markdown中A&B与A&amp;B、A-B与A\\-B等编码后碰撞，若原值不同或occurrence队列不是相同恒定值则明确拒绝，不依赖JSON顺序猜选；Word按精确字面可独立还原。300字符别名选择与200000+字符原值沿现有文件／HTTP整体预算处理，不用旧256／200000专用字段上限截断。真实100000条包装及205字符多样plain映射，经LPM→原512MiB worker→MD／跨run DOCX→不可变副本下载已核验；作者与C独立4API PASS7.587s、A独立核心容量／小字典oracle／Word旧回归均通过。详见[容量最终报告](逆向台账/contracts/restoration-capacity-final-20261014.md)及[独立审查](逆向台账/contracts/review-restoration-final-by-inventory-20261014.md)。

视觉自定义空串／纯空白／Default-Ignorable仅清除原像素，不请求Sharp绘空字；多行按真实字框分片，空片不绘字且推进偏移，长字与<>【】按字面安全绘制。PNG／PDF／DOCX共18真实自定义导出及原件immutable已通过；人工clear区域永远最后有效，自动派生文字不能覆盖清除决定。

### 6.4 发布前证据分层与历史维护

本地全库最终门禁由root汇总：82文件568单测、11条法则／13变异与构建通过；39个真实API文件71测试无失败，shared mappings2／MCP3补跑通过；完整Edge50测试6.3分钟通过。Word预览开始两次真实busy返回后短重试进入实际render／复核保存／导出下载，独立18.5秒与完整Edge均通过。A只读补核26项核心测试（含100000长别名、编码碰撞、小字典oracle、face group、视觉空字及旧Word回归）通过。逐项接口状态以机器台账为准，最终I4 38／I1 148／I3 60／I2 12，合计258；这些等级不升级竞品授权runtime R0或OS原生组件实测。

旧迭代023完整交接按当时原generator和恢复的ITER023输入精确重建，301670bytes，SHA256 `bd2f702eff04d44ff39b2d63b1bdfc55aa59370392ffa17b9196e18ccf671980`，与历史pin完全相同，保存在`.data/research/lawbot-2026-10-14/iteration030/history/文档/脱敏规则完整技术交接-迭代023.md`。最新文档沿旧路径供既有链接使用，但不能直接覆盖旧pin；归档输入与receipt另存。部署与GitHub同步由root独立完成，此文档生成不代表线上已更新。

## 7. 逐项规则、金额、场景、配置激活表
''']
def esc(v):return str(v).replace('|','\\|').replace('\n','<br/>')
for group in ['baseline','amountBranches','scenarios','filters','yamlCategories','masks','options']:
 entries=activation[group];sections.append('\n### '+group+'\n\n')
 cols=[k for k in ['id','source','file','category','arrayItems','implementation','activation','runtime','status','reason','notes'] if any(k in e for e in entries)]
 sections.append('|'+ '|'.join(cols)+'|\n|'+ '|'.join('---' for _ in cols)+'|\n')
 for e in entries:sections.append('|'+ '|'.join(esc(e.get(k,'')) for k in cols)+'|\n')
sections.append('\n## 8. 完整数据附录（全部条目，不抽样）\n\n下列结构保留来源regex／flags／行号与全部配置数组；重复项与非字符串也保留供审核，执行层使用源守卫。\n')
files=['rule-data.json','blacklists.json','reference-mask-data.json','table-rule-data.json','fragment-rule-data.json']
for name in files:
 p='packages/core/reference/'+name;sections.append('\n### '+name+'\n\nSHA256：`'+sha(p)+'`\n\n```json\n'+json.dumps(read(p),ensure_ascii=False,indent=2)+'\n```\n')
sections.append('\n## 9. 来源、实现与模型固定版本\n\n')
for p in ['packages/core/reference/source-manifest.json','scripts/ner-lock.json','scripts/visual-lock.json','scripts/render-font-lock.json']:
 if(root/p).exists():sections.append('### '+p+'\n\nSHA256：`'+sha(p)+'`\n\n```json\n'+json.dumps(read(p),ensure_ascii=False,indent=2)+'\n```\n')
sections.append('\n## 10. 当前仍不能宣称的内容\n\n未获得正版许可的处理链保持R0；未知私有服务端／其他版本规则未被穷尽。真实业务视觉gold、跨平台原生模块、Microsoft Word原生排版及第三方桌面AI客户端实际安装互操作不能用纯函数或合成测试替代。接口逐项状态以 [完整接口核验清单](逆向台账/contracts/full-porting-inventory-20261014.md) 和 [逆向台账](逆向台账/README.md) 为准。部署状态独立记录，不用本文件生成成功冒充线上更新。\n')
out=root/'文档/脱敏规则完整技术交接-迭代023.md';out.write_text(''.join(sections));print('HANDOFF_WRITTEN',out.stat().st_size,'bytes',len(out.read_text().splitlines()),'lines')
