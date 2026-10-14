# ITER019 projection-audit 独立审查

结论：复核当前稿后，无未解决行动项。5项发现已修并回读；仍为S2/R0。

## 范围

人工核读9节全部核心结论；30范围hash独立通过，36个reviewDraft赋值定位与独立文字检索一致。计数不证明36条全调用链。

## 已修发现

- RPA19-01 P2 S2手工图片框豁免条件被反写：这类框绕过Af/Ef集合及v2的Mf检查；普通实体才须不在集合。仍保留deleted等外层门。 源renderer.js:[6107, 6139]。
- RPA19-02 P3 ce2空函数定义缺少精确证据：作者已加入6192–6193定义范围；gf2也在PA04直接关联。 源renderer.js:[6192, 6193]。
- RPA19-03 P3 Markdown赋值语法不等于可达OCR修正：明确Of2先排除Markdown，实体目标筛选不进入该分支。 源renderer.js:[34931, 34933]。
- RPA19-04 P2 $o2抑制扩展集合误称人工已占位置：同region/type/text组rejected位置跳过；Oo2人工fixed为另一门。已补o2/c2定义。 源renderer.js:[6085, 6087, 8871, 8924]。
- RPA19-05 P3 df标点百分号条件过宽：邻接仅[.,，]；后8字符必须以允许空白后紧接%/％开头。 源renderer.js:[5550, 5559]。

## 当前快照

- 文档/逆向台账/contracts/iteration019-projection-audit.json：`9feded81f92ba0996a90af2dfb9d55c68ffd14d2bcbd9d70c2b8e4dca522a7b7`。
- 文档/逆向台账/contracts/iteration019-projection-audit.md：`72730efadd2003ec15f8136313112c2274ec744855e1d161a1afc5d2516cf24d`。
- 文档/逆向台账/contracts/build-iteration019-projection-audit.py：`766931902b5a28eb121bc46031cb3fefe11c6cf341b07bb20bd80205ec0f470d`。

## 边界

- 未执行竞品/绕激活。
- 30范围hash与36定位计数是结构核验，不能替代真实保存、导出、几何和race运行。
- 仅审当前报告，不把应用本身标成通过验收。
