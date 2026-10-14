# 自定义替换完整协议与真实导出核验（迭代029）

## 实际结果

| 格式 | 8类替换 | 下载与格式检查 |
|---|---|---|
| TXT | 全8成功 | 原UTF8字节精确保留空白、多行、长字与控制字符 |
| Markdown | 全8成功 | 按region转义；实际字节保空白和多行；独立重新解析与源hash核验 |
| Word | 6成功；2明确拒绝 | U+0001、U+FFFE/U+FFFF等非法XML值返回OFFICE_XML_VALUE_INVALID，不产生artifact或下载；其余重解析无损 |
| Excel | 全8成功 | 控制字符ST_Xstring编码；字面_xHHHH_先转义下划线，重新解析精确还原 |

**4 tests PASS，107.11s；32格式／值组合，30真实签发下载＋2预期Word格式拒绝。** 每个组合都验证原件bytes／SHA不变。另8次NUL／非法Unicode复核写入均整体拒绝且revision不变。下载链接真实执行独立副本verify，download_verified审计已保存。

## 源码边界

源main19208/19281后端要求string，没有100字或<>【】禁令；renderer5381某UI输入是maxlength30，不能据此限制TMM／后端协议。纯源Markdown Writer10例9成功、NUL明确invalid-operation；包含空串、全空白、200汉字、真实多行tab、首尾空白、U+0001、字面\t\n及特殊符号。空TMM字段在部分renderer上下文是未设置，不能统一变成删除。

当前协议保完整字符串，不trim、不截断；不完整Unicode、NUL与原值完整残留另由安全契约整体拒绝。Word合法XML门与TXT/Markdown/Excel字符能力分开，无悄悄丢字符。

证据：iteration029/custom-replacement-actual.{json,log}、custom-replacement-source-oracle.json、custom-replacement-typecheck.log；文件hash见同名JSON。首轮自己的审计表名写错后已修测试重跑，只有最终4PASS计入验收。本报告不升级竞品授权runtime（仍R0），不替代root全站门禁与部署核验。
