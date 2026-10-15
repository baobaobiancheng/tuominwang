# 印章额外模型候选与真实验证（2026-10-15）

现有候选在混合786test的F1仅20.21%，不足以声明实用自动印章完成。SourceOpenCV保留原样；以下是独立研究，尚未接入产品或改启动/资源策略。

| 模型主源 | 权重/许可 | 实际进度与边界 |
|---|---|---|
| [Ooredoo YOLOS-small](https://huggingface.co/Ooredoo-Group/ooredoo-stamp-detection) | 122.6MB Safetensors；模型卡/base均Apache2；rev4576990… | 自导动态ONNX；3shape与PyTorch对齐通过。原官方640/960比例预处理和默认0.5阈值跑全部786中；训练350图/711框源仅笼统Kaggle+HF，重叠/图授权未知。Node parity峰值863MiB，不能当小内存上线成功 |
| [官方PP-DocLayout-S](https://huggingface.co/PaddlePaddle/PP-DocLayout-S) | 4.8MB；Apache2；rev8ac289e… | 23布局类含seal16，原权重/config已下载。准备自行导出并Paddle/ORT对齐；官方interp2是BICUBIC而非第三方示例bilinear。混合中英文训练集原图/重叠未公开 |
| [Digital Inspector](https://huggingface.co/AlihanSDev/digital-inspector) | 3.2M nano；卡标Apache2但YOLOv8上游需核 | 私有俄/哈业务训练图，数据不可复验；未把不明继承许可权重直接上线 |
| [nospotfer RT-DETR](https://github.com/nospotfer/stamp-detection) | Apache2代码 | 公开训练/导出recipe，没有取得已训练权重；7Roboflow源许可逐项待核，不用代码许可替代图片许可 |
| [Sri Lankan album](https://huggingface.co/nethsith/sri-lankan-album-stamp-detector-yolo) / [date stamp](https://huggingface.co/pike00/yolo-date-stamp-detector) | 分别MIT声明/AGPL3 | 邮票/照片日期，不是文件印章，排除错误任务 |
| [mahmodKhaled](https://github.com/mahmodKhaled/Stamp-Detection) | 代码/数据授权分开 | HSV自动标注排除灰黑白，不能作为黑白独立gold |
| [第三方Paddle ONNX](https://huggingface.co/stefanj0/PP-DocLayout-S-ONNX) | Apache2继承声明 | 仅发现入口，优先官方原权重自行导出；不盲信不同预处理的使用示例 |

全部固定rev、文件哈希、主源下载metadata、官方预处理源代码、资源/输出parity证据在同名JSON。没有上传私有文档、绕授权、训练或用786test调阈值。新候选质量未完成前不填造指标。


## Paddle 完整786候选实测

官方自转换4.92MB／Paddle-ONNX三输入一致性通过。全786无失败，单模型P87.61%／R7.53%／F1 13.87%；与原算法合并F1 22.69%，原20.21%。仅有限改善，未接产品，不能据此称黑白章自动能力完成。详见 `paddle-stamp-validation-20261015.json/.md`。


## Ooredoo完整786实测

模型IoU0.5 P28.43%／R41.60%／F1 33.78%；合并source算法F1 28.28%。严格IoU0.75仅9.26%，仍不足实用完整。模型122.83MB、独立Node parity峰863MiB，未接产品，不能据此称容量安全。逐图全量／唯一性／图和labelhash已验真，暂停时间只影响延时统计。详见 `ooredoo-stamp-validation-20261015.json/.md`。
