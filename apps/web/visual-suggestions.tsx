import React, { useEffect, useRef, useState } from "react";
import type { ExcludedVisualCandidate } from "../../packages/core/visual-morphology.ts";
import type { VisualCandidate, VisualDetector } from "../../packages/core/visual-detection.ts";
const visualError=(e:unknown)=>({SIGNATURE_MODEL_REQUIRED:'签名识别模型未安装，请联系管理员。',SIGNATURE_MODEL_MISMATCH:'签名识别模型校验失败，请联系管理员。',SIGNATURE_CONFIGURATION_INVALID:'签名识别配置异常，请联系管理员。',SIGNATURE_OUTPUT_INVALID:'签名识别未能完成，请人工检查原图。',VISUAL_MODEL_REQUIRED:'人脸识别模型未安装，请联系管理员。',VISUAL_REQUEST_NOT_ACTIVE:'当前没有正在查找的印章任务。',PROCESSING_CANCELLED:'本次图像查找已停止。'}as Record<string,string>)[(e as Error).message]??'图像查找未完成，请重新载入或人工检查原图。';
export function VisualSuggestions({ page, revision, disabled, detect, accept, locate, pauseSeals }: {
  page: number; revision: number; disabled: boolean;
  detect: (page: number, detectors: VisualDetector[]) => Promise<{ candidates: VisualCandidate[]; excludedCandidates?: ExcludedVisualCandidate[];warnings?:string[];complete?:boolean;sealsPaused?:boolean }>;
  pauseSeals?: () => Promise<void>;
  accept: (candidate: VisualCandidate) => void; locate: (candidate: VisualCandidate) => void;
}) {
  const [candidates, setCandidates] = useState<VisualCandidate[]>([]), [pending, setPending] = useState(false), [error, setError] = useState(""), [ran, setRan] = useState(false);
  const [paused,setPaused]=useState(false);
  const [excluded, setExcluded] = useState<ExcludedVisualCandidate[]>([]);
  const [activeDetectors,setActiveDetectors]=useState<VisualDetector[]>([]);
  const [warnings,setWarnings]=useState<string[]>([]);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setCandidates([]); setExcluded([]); setError(""); setRan(false); setWarnings([]);setPaused(false);setPending(false); return () => { generation.current++; }; }, [page, revision]);
  async function scan(detectors: VisualDetector[]) {
    const current = ++generation.current;
    setPaused(false);setActiveDetectors(detectors);setPending(true); setError(""); setRan(false);setWarnings([]); setCandidates([]); setExcluded([]);
    try { const result = await detect(page, detectors); if (current !== generation.current) return; setCandidates(result.candidates); setExcluded(result.excludedCandidates ?? []); setWarnings(result.warnings??[]);setPaused(result.sealsPaused===true);setRan(true); } catch (e) { if (current === generation.current) setError(visualError(e)); } finally { if (current === generation.current) setPending(false); }
  }
  return <fieldset disabled={disabled}><legend>自动查找敏感图像</legend>
    <div className="actions"><button className="secondary" disabled={pending} onClick={() => void scan(["face"])}>查找本页人脸</button><button className="secondary" disabled={pending} onClick={() => void scan(["seal"])}>查找本页印章</button><button className="secondary" disabled={pending} onClick={() => void scan(["signature"])}>查找本页签名</button></div>
    <p className="muted">识别结果须确认后才加入清除区域。印章查找包括彩色印迹和黑白轮廓；签名模型可能把其他手写或印刷笔迹列为候选。请逐个核对候选并检查漏检区域。</p>
    {pending && <p role="status">正在识别本页…{pauseSeals&&activeDetectors.includes('seal')&&<button className="quiet" onClick={() => {const current=generation.current;void pauseSeals().then(()=>{if(current===generation.current)setPaused(true);}).catch(e=>{if(current===generation.current)setError(visualError(e));});}}>停止查找印章</button>}</p>}{error && <p role="alert">{error}</p>}{!!warnings.length&&<p role="alert">部分识别步骤未完成，请人工检查遗漏区域：{warnings.map(w=>w==='COLOR_SEGMENTATION_FAILED'?'颜色连通分析失败，已继续圆形印章查找':w).join('；')}</p>}
    {paused&&<p role="status">印章查找已停止，请人工检查未识别的区域。</p>}
    {ran && <p role="status">找到 {candidates.length} 个待确认区域{!candidates.length ? "，仍请人工检查原图。" : "。"}</p>}
    <ul className="region-list">{candidates.map((c, i) => <li key={`${c.reason}:${c.x}:${c.y}:${i}`}><span>{c.reason}候选 · 模型分数 {Math.round(c.score*100)} · 左 {Math.round(c.x)}，上 {Math.round(c.y)}，{Math.round(c.width)} × {Math.round(c.height)}</span><button className="quiet" onClick={() => locate(c)}>定位区域</button><button className="secondary" onClick={() => { accept(c); setCandidates(list => list.filter(item => item !== c)); }}>确认清除</button><button className="quiet" onClick={() => setCandidates(list => list.filter(item => item !== c))}>忽略候选</button></li>)}</ul>
    {!!excluded.length && <details><summary>核对 {excluded.length} 个证件排除区域</summary><p className="muted">证件图案可能与印章相似。请核对这些区域，确需清除时可手动确认。</p><ul className="region-list">{excluded.map((c, i) => <li key={`${c.x}:${c.y}:${i}`}><span>{c.exclusion} · 左 {Math.round(c.x)}，上 {Math.round(c.y)}</span><button className="quiet" onClick={() => locate(c)}>定位排除区域</button><button className="secondary" onClick={() => { accept(c); setExcluded(list => list.filter(item => item !== c)); }}>确认清除此区域</button><button className="quiet" onClick={() => setExcluded(list => list.filter(item => item !== c))}>保留此区域</button></li>)}</ul></details>}
  </fieldset>;
}
