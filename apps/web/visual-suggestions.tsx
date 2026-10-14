import React, { useEffect, useState } from "react";
import type { VisualCandidate } from "../../packages/core/visual-detection.ts";
export function VisualSuggestions({ page, revision, disabled, detect, accept, locate }: {
  page: number; revision: number; disabled: boolean;
  detect: (page: number, detectors: ("face" | "seal")[]) => Promise<{ candidates: VisualCandidate[] }>;
  accept: (candidate: VisualCandidate) => void; locate: (candidate: VisualCandidate) => void;
}) {
  const [candidates, setCandidates] = useState<VisualCandidate[]>([]), [pending, setPending] = useState(false), [error, setError] = useState(""), [ran, setRan] = useState(false);
  useEffect(() => { setCandidates([]); setError(""); setRan(false); }, [page, revision]);
  async function scan(detectors: ("face" | "seal")[]) {
    setPending(true); setError(""); setRan(false); setCandidates([]);
    try { const result = await detect(page, detectors); setCandidates(result.candidates); setRan(true); } catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  return <fieldset disabled={disabled || pending}><legend>自动查找敏感图像</legend>
    <div className="actions"><button className="secondary" onClick={() => void scan(["face"])}>查找本页人脸</button><button className="secondary" onClick={() => void scan(["seal"])}>查找本页印章</button></div>
    <p className="muted">识别结果须确认后才加入清除区域。印章查找针对红色、蓝色印迹；请人工检查黑白章、签名和漏检区域。</p>
    {pending && <p role="status">正在识别本页…</p>}{error && <p role="alert">{error}</p>}
    {ran && <p role="status">找到 {candidates.length} 个待确认区域{!candidates.length ? "，仍请人工检查原图。" : "。"}</p>}
    <ul className="region-list">{candidates.map((c, i) => <li key={`${c.reason}:${c.x}:${c.y}:${i}`}><span>{c.reason}候选 · 左 {Math.round(c.x)}，上 {Math.round(c.y)}，{Math.round(c.width)} × {Math.round(c.height)}</span><button className="quiet" onClick={() => locate(c)}>定位区域</button><button className="secondary" onClick={() => { accept(c); setCandidates(list => list.filter(item => item !== c)); }}>确认清除</button><button className="quiet" onClick={() => setCandidates(list => list.filter(item => item !== c))}>忽略候选</button></li>)}</ul>
  </fieldset>;
}
