# 真实印章标注集检索与使用边界（2026-10-15）

已取得可用的**混合公开 test 全 786 张 / 1315 个印章框**并完成全部评估；尚未取得可独立核实授权、明确黑白商业印章分层的专门 gold。两者不能互相替代。

| 一手来源 | 标签/入口 | 许可与实际处理 |
|---|---|---|
| [mapo80/stamps](https://huggingface.co/datasets/mapo80/stamps) | 固定 revision `998243bd…`，786 test/661正/125负/1315框 | 发布者声明 CC BY4；上游逐图授权链和黑白分层未核。仅本地全量评估、不训练、不重分发原图 |
| [Stampa v1](https://universe.roboflow.com/stampa/stamp-detection-4jhgg/dataset/1) | 官方列1113训练/106验证/52测试 | 页面列 CC BY4；本地下载 HTTP403，未绕过，未声称已测 |
| [Kaggle Signatures and stamps](https://www.kaggle.com/datasets/igorkarayman/signatures-and-stamps) | 官方匿名 metadata200 | 官方 licenseName=Unknown，不把代码 MIT 当图片许可；未下载 |
| [CHSAD](https://github.com/usefulbbs/CHSAD) | 605印章裁图/18390真伪对 | 真伪任务而非整页定位，README未给明确数据许可，未作为 bboxgold |
| [M6Doc](https://github.com/HCIILAB/M6Doc) | 9080页/74类；完整集申请，test可公开取得 | 主源 CC BY-NC-ND4，非专门商业黑白印章任务；未下载。明确未把免费 test 误说成全部受限 |
| [ybli](https://huggingface.co/datasets/ybli/yolo-stamp-segmentation-detection) | 空数据集，转会员网站 | 没有可核实授权与标注分割，不登录或购买 |
| [nospotfer](https://github.com/nospotfer/stamp-detection) | 7个 Roboflow 发现入口 | 索引不是整集许可；各自 API/许可待核，不绕门 |
| [FUNSD 原始下载](https://guillaumejaume.github.io/FUNSD/download/) | ZIP200，仅内存检查许可文件 | ZIP无许可条目、repo/LICENSE404；网页主题许可不等于图片许可，保留 mapo80 上游来源边界 |

## 验证规则

固定 test ZIP SHA `c3942fd1dc8037649885c7cec7d5e1c8399b131fe75605083c39d50b674d5f4b`。全部 786 唯一文件及 GT/候选/hash/失败单列，使用现有 detector 原图运行，不训练、不改阈值、不用 test 拟合。不将 source 合成 26 例零差异当真实质量。逐请求状态、原始卡片和 SHA 见同名 JSON；全部评估已完成：IoU.5 TP316/FP1496/FN999，精确率17.44%、召回率24.03%、F1 20.21%。当前候选质量不足，不得宣称实用自动印章已完成；见 `public-stamp-validation-20261015.md`。
