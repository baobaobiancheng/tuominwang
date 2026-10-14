"""Build-time only: export the reviewed BertSpan checkpoint to ONNX. No Python service.

BertSpan heads/decoding follow shibing624/nerpy, Apache-2.0, commit
30ff7bfef453b332e41fc25c24e5110842bd646e (copyright Xu Ming).
This script never fetches files, executes checkpoint pickle code, or reads user materials.
"""
import hashlib
import json
import os
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
import torch
from torch import nn
from transformers import BertConfig, BertModel, BertTokenizer

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".data/models/ner-source"
TARGET = ROOT / ".data/models/ner"
lock = json.loads((ROOT / "scripts/ner-source-lock.json").read_text())
for name, expected in lock["files"].items():
    if hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() != expected:
        raise RuntimeError("NER_MODEL_MISMATCH")


class Start(nn.Module):
    def __init__(self, hidden, labels):
        super().__init__()
        self.dense = nn.Linear(hidden, labels)

    def forward(self, hidden):
        return self.dense(hidden)


class End(nn.Module):
    def __init__(self, hidden, labels):
        super().__init__()
        self.dense_0 = nn.Linear(hidden, hidden)
        self.LayerNorm = nn.LayerNorm(hidden)
        self.dense_1 = nn.Linear(hidden, labels)

    def forward(self, hidden, start):
        return self.dense_1(self.LayerNorm(torch.tanh(self.dense_0(torch.cat([hidden, start], dim=-1)))))


class BertSpan(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.bert = BertModel(config)
        self.start_fc = Start(config.hidden_size, config.num_labels)
        self.end_fc = End(config.hidden_size + config.num_labels, config.num_labels)

    def forward(self, input_ids, attention_mask, token_type_ids):
        hidden = self.bert(input_ids=input_ids, attention_mask=attention_mask, token_type_ids=token_type_ids)[0]
        start = self.start_fc(hidden)
        return start, self.end_fc(hidden, torch.softmax(start, dim=-1))


torch.set_num_threads(2)
config = BertConfig.from_json_file(str(SOURCE / "config.json"))
config._attn_implementation = "eager"
model = BertSpan(config)
state = torch.load(SOURCE / "pytorch_model.bin", map_location="cpu", weights_only=True)
# Older Transformers persisted this deterministic non-weight buffer; check before excluding it.
position_ids = state.pop("bert.embeddings.position_ids", None)
if position_ids is not None and not torch.equal(position_ids, torch.arange(config.max_position_embeddings).unsqueeze(0)):
    raise RuntimeError("Unexpected position buffer")
model.load_state_dict(state, strict=True)
model.eval()
tokenizer = BertTokenizer.from_pretrained(str(SOURCE), local_files_only=True, do_lower_case=False)


def encode(text):
    tokens = [tokenizer.cls_token]
    for char in text:
        parts = tokenizer.tokenize(char) or [tokenizer.unk_token]
        if len(parts) != 1:
            raise RuntimeError("Character produced multiple wordpieces")
        tokens.extend(parts)
    tokens.append(tokenizer.sep_token)
    return tokenizer.convert_tokens_to_ids(tokens)


samples = [
    "常建良，男，1963年出生，工科学士，高级工程师",
    "张三在北京工作，李四在上海工作。",
    "北京甲乙科技有限公司与上海丙丁贸易有限公司签订合同。",
    "中国银行向华为技术有限公司发出通知。",
    "😀张三\t北京\nABC abc é É Ａ 𠀀\u200e",
    "律师王明接受委托，代理深圳市南山区的合同纠纷。",
]
TARGET.mkdir(parents=True, exist_ok=True, mode=0o700)
ids = torch.tensor([encode(samples[0])], dtype=torch.long)
with torch.no_grad():
    torch.onnx.export(model, (ids, torch.ones_like(ids), torch.zeros_like(ids)), str(TARGET / "model.onnx"),
                      input_names=["input_ids", "attention_mask", "token_type_ids"], output_names=["start_logits", "end_logits"],
                      dynamic_axes={name: {1: "sequence"} for name in ["input_ids", "attention_mask", "token_type_ids", "start_logits", "end_logits"]},
                      opset_version=17, dynamo=False)
    reference = []
    for text in samples:
        token_ids = encode(text)
        tensor = torch.tensor([token_ids], dtype=torch.long)
        start, end = model(tensor, torch.ones_like(tensor), torch.zeros_like(tensor))
        reference.append({"text": text, "ids": token_ids, "start": start[0].tolist(), "end": end[0].tolist()})
(TARGET / "reference.json").write_text(json.dumps(reference, ensure_ascii=False), encoding="utf8")
for name in ["vocab.txt", "config.json", "LICENSE", "README.md"]:
    (TARGET / name).write_bytes((SOURCE / name).read_bytes())
manifest = {"model": lock["model"], "revision": lock["revision"], "license": lock["license"], "maxTokens": 128,
            "files": {name: hashlib.sha256((TARGET / name).read_bytes()).hexdigest()
                      for name in ["model.onnx", "vocab.txt", "config.json", "reference.json", "LICENSE", "README.md"]}}
(TARGET / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
print(json.dumps(manifest, indent=2))
