import {ImageBatchSearch} from "./image-batch-search.tsx";
import type {ImageSearchHit} from "../../packages/core/image-batch-search.ts";
import {entityLabels} from "./entity-labels.ts";
import {entityTypeIds} from "../../packages/contracts/presets.ts";
import { ImageUtilityActions } from "./image-utilities.tsx";
import { OcrTextEditor } from "./ocr-text-editor.tsx";
import type { OcrCorrectionInput, OcrTextView } from "../../packages/contracts/ocr.ts";
import { VisualSuggestions } from "./visual-suggestions.tsx";
import type { VisualCandidate } from "../../packages/core/visual-detection.ts";
import React, { useState, useEffect } from "react";
import { appUrl } from "./urls.ts";
import type { DocumentView, PageReview, Mark } from "../../packages/contracts/index.ts";

export const emptyPageReview = (): PageReview => ({ mode: "unselected", regions: [], deletedPages: [] });
export function PageEditor({ doc, value, marks, change, disabled, previewPage, run, detectVisual, ocr, imageUtility, pauseVisualSeals, imageSearch }: { doc: DocumentView; value: PageReview; marks: Mark[]; change: (value: PageReview) => void; disabled: boolean; previewPage: (index: number) => Promise<Blob>; run: (action: () => Promise<void>) => Promise<void>; ocr: { disabled: boolean; load: (page: number, revision: number) => Promise<OcrTextView>; save: (page: number, input: OcrCorrectionInput) => Promise<{ revision: number; changed: boolean }>; onSaved: (revision: number) => Promise<void> }; imageSearch?: (query:string,pageIndex?:number)=>Promise<{results:ImageSearchHit[];checkedPageNumbers:number[]}>; imageUtility?: (page: number, operation: 'region'|'rerun'|'clear-cache'|'labels'|'annotations', payload: unknown) => Promise<any>; pauseVisualSeals?: (page:number)=>Promise<void>; detectVisual: (page: number, detectors: ("face" | "seal" | "signature")[]) => Promise<{ candidates: VisualCandidate[]; warnings?: string[]; complete?: boolean }> }) {
  const [index, setIndex] = useState(0), [history, setHistory] = useState<PageReview[]>([]);
  const [shape,setShape]=useState<"rect"|"circle">("rect"),[entityType,setEntityType]=useState("other"),[annotationText,setAnnotationText]=useState(""),[regionError,setRegionError]=useState("");
  const [reason, setReason] = useState<PageReview["regions"][number]["reason"]>("敏感区域");
  const [start, setStart] = useState<{ x: number; y: number } | null>(null), [box, setBox] = useState({ x: 0, y: 0, width: 30, height: 30 });
  const [from, setFrom] = useState(1), [to, setTo] = useState(1);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { setPreview(null); }, [value, marks, index]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pages = doc.pages!, page = pages[index], deleted = value.deletedPages.includes(index);
  const embedded = doc.format === "docx", unit = embedded ? "张图片" : "页";
  function update(next: PageReview) { if (disabled) return; setHistory(h => [...h.slice(-9), value]); change(next); }
  function position(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(page.width, (e.clientX - rect.left) / rect.width * page.width)), y: Math.max(0, Math.min(page.height, (e.clientY - rect.top) / rect.height * page.height)) };
  }
  const annotationValid=!!entityType.trim()&&entityType.isWellFormed()&&!entityType.includes("\0")&&annotationText.isWellFormed()&&!annotationText.includes("\0");
  function add(first = index, last = index) {
    if(!annotationValid){setRegionError("请填写有效的标注信息类型和文字后再添加区域。");return;}
    if (first < 0 || last >= pages.length || first > last || ![first, last].every(Number.isInteger) || value.regions.length + last - first + 1 > 3000) return;
    setRegionError("");
    const regions = Array.from({ length: last - first + 1 }, (_, i) => {
      const target = pages[first + i];
      // Repeat the same proportional area, including mixed-size and rotated pages.
      return { ...box, x: box.x / page.width * target.width, y: box.y / page.height * target.height, width: box.width / page.width * target.width, height: box.height / page.height * target.height, page: target.index, id: crypto.randomUUID(), reason, shape, entityType, meta:{userAdjusted:true,operationSource:'user'}, ...annotationText?{text:annotationText}:{} };
    });
    update({ ...value, regions: [...value.regions, ...regions] });
  }
  const valid = [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 && box.x + box.width <= page.width && box.y + box.height <= page.height;
  return <section className="page-preview" aria-label="页面预览">
    <div className="pagination"><button className="secondary" disabled={index === 0} onClick={() => { setIndex(i => i - 1); setStart(null); }}>{embedded ? "上一张内嵌图片" : "上一页原件"}</button><span>第 {index + 1} / {pages.length} {unit}</span><button className="secondary" disabled={index === pages.length - 1} onClick={() => { setIndex(i => i + 1); setStart(null); }}>{embedded ? "下一张内嵌图片" : "下一页原件"}</button></div>
    {embedded && <p className="muted">内嵌图片按资源顺序展示，不是文档页码；同一图片多处复用时，处理同时生效。</p>}
    <div className={`page-canvas${deleted ? " deleted-page" : ""}`} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
      <img alt={`原件第 ${index + 1} ${unit}`} src={appUrl(`/api/documents/${doc.id}/pages/${page.index}?revision=${doc.revision}`)} draggable={false} />
      <svg aria-label="区域框选画布" viewBox={`0 0 ${page.width} ${page.height}`} onPointerDown={e => { if (disabled || deleted || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); const p = position(e); setStart(p); setBox({ ...p, width: 0, height: 0 }); }} onPointerMove={e => { if (!start) return; const end = position(e), x = Math.floor(Math.min(start.x, end.x) * 10) / 10, y = Math.floor(Math.min(start.y, end.y) * 10) / 10; setBox({ x, y, width: Number((Math.min(page.width, Math.ceil(Math.max(start.x, end.x) * 10) / 10) - x).toFixed(1)), height: Number((Math.min(page.height, Math.ceil(Math.max(start.y, end.y) * 10) / 10) - y).toFixed(1)) }); }} onPointerUp={e => { setStart(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => setStart(null)}>
        {value.regions.filter(r => r.page === index).map(r => r.shape==='circle'?<ellipse key={r.id} cx={r.x+r.width/2} cy={r.y+r.height/2} rx={r.width/2} ry={r.height/2} className="saved-region"/>:<rect key={r.id} {...{ x: r.x, y: r.y, width: r.width, height: r.height }} className="saved-region" />)}
        {!deleted && valid && (shape==='circle'?<ellipse cx={box.x+box.width/2} cy={box.y+box.height/2} rx={box.width/2} ry={box.height/2} className="draft-region"/>:<rect {...box} className="draft-region" />)}
      </svg>
      {deleted && <strong className="page-removed">此页不包含在副本中</strong>}
    </div>
    <p className="muted">拖动框选后添加区域，也可输入坐标。蓝框是待添加范围，黑框是已添加区域；原件不变。</p>
    <OcrTextEditor key={`ocr:${doc.id}:${doc.revision}:${index}`} documentId={doc.id} revision={doc.revision} page={page.index} disabled={disabled || deleted || ocr.disabled} run={run} load={ocr.load} save={ocr.save} onSaved={ocr.onSaved} />
    {ocr.disabled && <p className="muted">请先保存当前复核修改，再纠正识别文字。</p>}
    {imageUtility && <ImageUtilityActions key={`utilities:${doc.id}:${doc.revision}:${index}`} page={page.index} revision={doc.revision} width={page.width} height={page.height} selectedRegion={valid ? box : null} labels={value.regions.filter(r=>r.page===page.index).map(r=>({x:r.x,y:r.y,width:r.width,height:r.height,type:r.entityType??r.reason,source:'manual',id:r.id,shape:r.shape??'rect',...r.text!==undefined?{text:r.text}:{},...r.meta!==undefined?{meta:r.meta}:{}}))} disabled={disabled || deleted} run={(operation,payload)=>imageUtility(page.index,operation,operation==='labels'||operation==='annotations'?{...(payload as object),marks}:payload)} onRegionText={async text=>{await navigator.clipboard.writeText(text);}} />}
    {imageUtility && <p className="muted">“复制区域文字”会复制文字到剪贴板。纠错时，请选择本页对应的连续原文后粘贴到“纠正为”，再保存。</p>}
    <VisualSuggestions pauseSeals={pauseVisualSeals ? ()=>pauseVisualSeals(page.index) : undefined} key={`${doc.id}:${doc.revision}:${index}`} page={index} revision={doc.revision} disabled={disabled || deleted || value.regions.length >= 3000} detect={detectVisual} locate={c => setBox({ x: c.x, y: c.y, width: c.width, height: c.height })} accept={c => update({ ...value, regions: [...value.regions, { id: crypto.randomUUID(), page: page.index, x: c.x, y: c.y, width: c.width, height: c.height, reason: c.reason }] })} />
    {imageSearch && <ImageBatchSearch revision={doc.revision} page={page.index} disabled={disabled||deleted} search={imageSearch} locate={hit=>{const p=pages.findIndex(p=>p.index===hit.pageNumber-1);if(p<0)return;setIndex(p);const target=pages[p],b=hit.bboxes?.[0]??hit;setBox({x:Math.min(b.x,target.width-1),y:Math.min(b.y,target.height-1),width:Math.min(b.width,target.width-b.x),height:Math.min(b.height,target.height-b.y)});setStart(null);}} accept={hits=>{if(!annotationValid){setRegionError("请填写有效的标注信息类型和文字后再添加区域。");return;}const boxes=hits.flatMap(hit=>(hit.bboxes??[hit]).map(b=>({hit,b})));if(boxes.some(({hit,b})=>{const target=pages.find(p=>p.index===hit.pageNumber-1);return !target||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>target.width||b.y+b.height>target.height;})){setRegionError('查找结果的页面坐标无效；请重新读取材料后再试。');return;}if(boxes.length+value.regions.length>3000){setRegionError('清除区域数量超过本次复核可保存的范围；没有添加部分结果，请减少选择。');return;}setRegionError('');const regions=boxes.map(({hit,b})=>{const target=pages.find(p=>p.index===hit.pageNumber-1)!;return{id:crypto.randomUUID(),page:target.index,x:Math.max(0,b.x),y:Math.max(0,b.y),width:Math.min(b.width,target.width-Math.max(0,b.x)),height:Math.min(b.height,target.height-Math.max(0,b.y)),reason,shape:'rect' as const,entityType,text:hit.matchedLine,meta:{bboxes:hit.bboxes??[{x:hit.x,y:hit.y,width:hit.width,height:hit.height}],matchedLineSearchStart:hit.matchedLineSearchStart,matchedLineSearchEnd:hit.matchedLineSearchEnd}};});update({...value,regions:[...value.regions,...regions]});}} />}
    {regionError&&<p role="alert">{regionError}</p>}
    <fieldset disabled={disabled || deleted} className="region-editor"><legend>区域处理</legend>
      <label>清除区域颜色<select aria-label="清除区域颜色" value={value.maskStyle ?? "black"} onChange={e => update({ ...value, maskStyle: e.target.value as PageReview["maskStyle"] })}><option value="black">黑色</option><option value="white">白色描边</option><option value="purple">紫色</option><option value="lightGray">浅灰色</option></select></label>
      <label>区域用途<select aria-label="区域用途" value={reason} onChange={e => {setReason(e.target.value as typeof reason);setEntityType(({印章:"seal",签名:"signature",人脸:"face",敏感区域:"other"} as Record<string,string>)[e.target.value]);}}>{["敏感区域", "印章", "签名", "人脸"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>区域形状<select aria-label="区域形状" value={shape} onChange={e=>setShape(e.target.value as typeof shape)}><option value="rect">矩形</option><option value="circle">圆形／椭圆</option></select></label>
      <label>标注信息类型<input aria-label="标注信息类型" list="image-annotation-types" value={entityType} onChange={e=>setEntityType(e.target.value)}/><datalist id="image-annotation-types">{entityTypeIds.map(type=><option key={type} value={type}>{Object.hasOwn(entityLabels,type)?entityLabels[type]:type}</option>)}</datalist></label>
      <label>标注文字（可选）<input aria-label="标注文字" value={annotationText} onChange={e=>setAnnotationText(e.target.value)}/></label>
      <div className="region-numbers">{([['x', '左侧坐标'], ['y', '顶部坐标'], ['width', '区域宽度'], ['height', '区域高度']] as const).map(([key, label]) => <label key={key}>{label}<input aria-label={label} type="number" min={0} step="0.1" value={box[key]} onChange={e => setBox({ ...box, [key]: Number(e.target.value) })} /></label>)}</div>
      <button className="secondary" disabled={!valid || !annotationValid || value.regions.length >= 3000} onClick={() => add()}>添加本页区域</button>
      {pages.length > 1 && <div className="repeat-region"><label>起始页<input type="number" min={1} max={pages.length} value={from} onChange={e => setFrom(Number(e.target.value))} /></label><label>结束页<input type="number" min={from} max={pages.length} value={to} onChange={e => setTo(Number(e.target.value))} /></label><button className="quiet" disabled={!valid || !annotationValid || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > pages.length || value.regions.length + to - from + 1 > 3000} onClick={() => { add(from - 1, to - 1); }}>应用到指定页</button></div>}
    </fieldset>
    <ul className="region-list">{value.regions.filter(r => r.page === index).map((r, i) => <li key={r.id}><span>{r.entityType?(Object.hasOwn(entityLabels,r.entityType)?entityLabels[r.entityType]:r.entityType):r.reason} · {r.shape==='circle'?'椭圆':'矩形'}区域 {i + 1}</span><button className="quiet" disabled={disabled} onClick={() => update({ ...value, regions: value.regions.filter(v => v.id !== r.id) })}>移除区域 {i + 1}</button></li>)}</ul>
    <div className="actions"><button className="secondary" disabled={disabled || !history.length} onClick={() => { change(history.at(-1)!); setHistory(h => h.slice(0, -1)); }}>撤销页面修改</button>{!embedded && pages.length > 1 && <button className="quiet" disabled={disabled || !deleted && value.deletedPages.length >= pages.length - 1} onClick={() => { update({ ...value, deletedPages: deleted ? value.deletedPages.filter(p => p !== index) : [...value.deletedPages, index] }); }}>{deleted ? "恢复此页" : "从副本移除此页"}</button>}</div>
    <label className="check-label conversion-choice"><input type="checkbox" checked={value.mode === "raster"} disabled={disabled} onChange={e => update({ ...value, mode: e.target.checked ? "raster" : "unselected" })} />{embedded ? "清除内嵌图片选区像素，生成 DOCX 副本" : doc.format === "pdf" ? "转换为不可选字的图片型 PDF 副本" : "生成清除选区像素的 PNG 副本"}</label>
    <p className="muted">{embedded ? "内嵌 PNG/JPEG 将转换为无附带属性的 PNG；文字段落保留各自的处理方式。" : doc.format === "pdf" ? "此转换不保留可选文字、图层、表单、链接、签名有效性及文件属性。" : "图片副本不保留原图的定位、作者等属性。"}默认遮盖清除像素；逐项替换按所选策略绘字，手动清除区域最后生效。请检查印章、签名及其他敏感内容。</p>
    {!!value.deletedPages.length && <p>副本移除第 {[...value.deletedPages].sort((a, b) => a - b).map(i => i + 1).join("、")} 页</p>}
    <button className="secondary" disabled={disabled || deleted} onClick={() => void run(async () => setPreview(URL.createObjectURL(await previewPage(index))))}>查看本页处理预览</button>
    {preview && <div className="page-result"><p className="muted">本页处理预览。待确认文字仍保留原值。</p><img alt={`处理预览第 ${index + 1} 页`} src={preview} /></div>}
  </section>;
}
