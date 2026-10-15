import {entityIdentity,entityLabel,entityValueKey} from "../../packages/core/entity-identity.ts";
import { ReplacementPoliciesEditor } from "./replacement-policies.tsx";
import React, { useEffect, useRef, useState } from "react";
import { MAX_MARKS, type DocumentView, type Mark, type PageReview } from "../../packages/contracts/index.ts";
import type { KnownEntityCheck, SearchScope } from "../../packages/core/review-tools.ts";
import {applySignatureDecision} from "../../packages/core/review-group-ui.ts";

export function ReviewTools({ doc, marks, pageReview, update, locate, run, api, disabled, canReview, canUseAliases, mode, showMarks, surface = "all", onAddMissing }: {
  doc: DocumentView; marks: Mark[]; update: (marks: Mark[]) => void; locate: (span: { start: number; end: number }) => Promise<void>;
  pageReview: PageReview;
  onAddMissing?: (marks:Mark[])=>void;
  surface?: "all" | "search" | "actions";
  canUseAliases: boolean; mode: "marks" | "search" | "bulk" | "known"; showMarks: () => void;
  run: (action: () => Promise<void>) => Promise<void>; api: <T>(path: string, method?: string, body?: unknown) => Promise<T>; disabled: boolean; canReview: boolean;
}) {
  const [query, setQuery] = useState(""), [searchScope, setSearchScope] = useState<SearchScope>("all");
  type SearchPage = { matches: { start: number; end: number; excerpt: string }[]; next: number | null };
  const [searchResult, setSearchResult] = useState<{ page: SearchPage; version: number; cursors: number[]; active: number } | null>(null);
  const [searching, setSearching] = useState(false), searchRequest = useRef(0);
  const searchContext = useRef({ query, scope: searchScope, marks, id: doc.id, revision: doc.revision, version: 0 });
  if (searchContext.current.query !== query || searchContext.current.scope !== searchScope || searchContext.current.marks !== marks || searchContext.current.id !== doc.id || searchContext.current.revision !== doc.revision) {
    searchContext.current = { query, scope: searchScope, marks, id: doc.id, revision: doc.revision, version: searchContext.current.version + 1 };
  }
  const currentSearch = searchResult?.version === searchContext.current.version ? searchResult : null;
  const results = currentSearch?.page;
  const [kind, setKind] = useState("all"), [scope, setScope] = useState("pending");
  const draft = useRef({ marks, pageReview, version: 0 });
  if (draft.current.marks !== marks || draft.current.pageReview !== pageReview) draft.current = { marks, pageReview, version: draft.current.version + 1 };
  useEffect(() => () => { draft.current.version++; searchContext.current.version++; searchRequest.current++; }, []);
  const [checked, setChecked] = useState<{ version: number; result: KnownEntityCheck } | null>(null), [entityPage, setEntityPage] = useState(0);
  const coverage = checked?.version === draft.current.version ? checked.result : null;
  const indexes = new Set(marks.flatMap((m, i) => (kind === "all" || entityIdentity(m) === kind) && (scope === "all" || m.decision === scope || scope === "whitelist" && m.decision === "pending" && m.sources?.some(s => s.code === "project-whitelist")) ? [i] : []));
  async function search(cursors = [0], last = false) {
    const context = searchContext.current, version = context.version, request = ++searchRequest.current;
    setSearching(true);
    try {
      const page = await api<SearchPage>(`/documents/${context.id}/search`, "POST", {
        revision: context.revision, query: context.query, from: cursors.at(-1), scope: context.scope,
        spans: context.marks.map(({ start, end, decision }) => ({ start, end, decision })),
      });
      if (version !== searchContext.current.version || request !== searchRequest.current) return;
      const active = page.matches.length ? last ? page.matches.length - 1 : 0 : -1;
      setSearchResult({ page, version, cursors, active });
      if (active >= 0) await locate(page.matches[active]);
    } finally { if (request === searchRequest.current) setSearching(false); }
  }
  async function selectMatch(index: number) {
    if (!currentSearch) return;
    setSearchResult({ ...currentSearch, active: index });
    setSearching(true);
    try { await locate(currentSearch.page.matches[index]); }
    finally { setSearching(false); }
  }
  async function stepMatch(direction: -1 | 1) {
    if (!currentSearch) return;
    const next = currentSearch.active + direction;
    if (next >= 0 && next < currentSearch.page.matches.length) await selectMatch(next);
    else if (direction === 1 && currentSearch.page.next !== null) await search([...currentSearch.cursors, currentSearch.page.next]);
    else if (direction === -1 && currentSearch.cursors.length > 1) await search(currentSearch.cursors.slice(0, -1), true);
  }
  function bulk(decision: Mark["decision"]) {
    if (disabled || !canReview || !indexes.size) return;
    update(applySignatureDecision(marks,indexes,decision)); showMarks();
  }
  async function check() {
    const version = draft.current.version;
    const result = await api<KnownEntityCheck>(`/documents/${doc.id}/known-entities`, "POST", { revision: doc.revision, marks });
    if (version !== draft.current.version) throw new Error("复核草稿已变化，请重新检查");
    setChecked({ version, result }); setEntityPage(0);
  }
  function addMissing() {
    if (disabled || !canReview || !coverage?.additions.length || aliasBlocked) return;
    (onAddMissing??update)([...marks, ...coverage.additions]); setChecked(null); showMarks();
  }
  const aliasBlocked = !canUseAliases && coverage?.additions.some(mark => mark.replacement?.mode === "alias");
  return <section className="review-tools" aria-label="复核工具" hidden={mode === "marks"}>
    {surface !== "actions" && <div hidden={mode !== "search"}>
    <form className="search-form" onSubmit={e => { e.preventDefault(); if (query && !disabled && !searching) void run(() => search()); }}>
      <label>全文查找<input aria-label="全文查找" disabled={disabled || searching} value={query} onChange={e => { searchContext.current.version++; setQuery(e.target.value); setSearchResult(null); }} maxLength={200} placeholder="输入要定位的文字" /></label>
      <label>查找范围<select aria-label="查找范围" disabled={disabled || searching} value={searchScope} onChange={e => { searchContext.current.version++; setSearchScope(e.target.value as SearchScope); setSearchResult(null); }}>
        <option value="all">全部文字</option><option value="inside">敏感标记内</option><option value="outside">敏感标记外</option>
      </select></label>
      <button className="secondary" disabled={!query || disabled || searching}>{searching ? "查找中…" : "查找"}</button>
    </form>
    <p className="muted">按当前草稿查找；保留原值项不算敏感标记。命中需完整落在同一标记内，否则归入标记外。</p>
    {results && currentSearch && <div className="search-results" aria-label="查找结果"><p className="muted" role="status">第 {currentSearch.cursors.length} 组，本组 {results.matches.length} 处{results.next !== null ? "，后面还有结果" : "，已到末尾"}{currentSearch.active >= 0 ? ` · 当前第 ${currentSearch.active + 1} 处` : ""}</p>
      <div className="actions" aria-label="查找结果导航">
        <button className="secondary" disabled={disabled || searching || currentSearch.active <= 0 && currentSearch.cursors.length === 1} onClick={() => void run(() => stepMatch(-1))}>上一处</button>
        <button className="secondary" disabled={disabled || searching || currentSearch.active >= results.matches.length - 1 && results.next === null} onClick={() => void run(() => stepMatch(1))}>下一处</button>
      </div>
      {results.matches.map((m, index) => <button type="button" className="quote" key={m.start} disabled={disabled || searching} aria-pressed={index === currentSearch.active} onClick={() => void run(() => selectMatch(index))}>{m.excerpt}<small> · 位置 {m.start + 1}</small></button>)}
      {results.next !== null && <button className="secondary" disabled={disabled || searching} onClick={() => void run(() => search([...currentSearch.cursors, results.next!]))}>下一组结果</button>}
    </div>}
    </div>}
    {surface !== "search" && <><fieldset hidden={mode !== "bulk"} disabled={disabled || !canReview} className="bulk-review"><legend>批量复核 · 当前文档</legend>
      <label>类型<select value={kind} onChange={e => setKind(e.target.value)}><option value="all">全部类型</option>{[...new Map(marks.map(m => [entityIdentity(m),m])).entries()].map(([k,m]) => <option key={k} value={k}>{entityLabel(m)}</option>)}</select></label>
      <label>状态<select value={scope} onChange={e => setScope(e.target.value)}><option value="pending">待确认</option><option value="whitelist">白名单待确认</option><option value="all">全部状态</option><option value="redact">已选脱敏</option><option value="ignore">已选保留</option></select></label>
      <span className="muted">符合 {indexes.size} 项</span>
      <button className="secondary" disabled={!indexes.size} onClick={() => bulk("redact")}>批量脱敏</button>
      <button className="quiet" disabled={!indexes.size} onClick={() => bulk("ignore")}>批量保留</button>
    </fieldset>
    {mode === "bulk" && <ReplacementPoliciesEditor doc={doc} marks={marks} update={update} api={api} run={run} disabled={disabled || !canReview} canUseAliases={canUseAliases} />}
    <section hidden={mode !== "known"} className="known-entities" aria-label="已知实体漏标检查">
      <div className="actions"><h3>已知实体漏标检查</h3><button className="secondary" disabled={disabled || !canReview || !marks.length} onClick={() => void run(check)}>检查全文漏标</button></div>
      <p className="muted">检查当前材料中已知原值的重复位置；已标记项仍需确认，未知敏感内容仍需人工检查。</p>
      {coverage && <>
        <p role="status">检查 {coverage.entities.length} 个已知原值，可补录 {coverage.additions.length} 处。人工保留、白名单和冲突范围需分别复核。</p>
        <p className="muted">检查上限：单个原值 2,000 字符，累计匹配 {MAX_MARKS.toLocaleString()} 处。材料过长或原值过多时会提示超限，需拆分材料后重试。</p>
        {!coverage.entities.length ? <p className="empty">当前没有可检查的原值，请先补充敏感标记。保留项和白名单待确认项不会作为检查起点。</p> : <table className="data-table" aria-label="全文漏标结果">
          <thead><tr><th>原值 / 类型</th><th>全文位置</th><th>检查结果</th><th>定位</th></tr></thead>
          <tbody>{coverage.entities.slice(entityPage * 50, (entityPage + 1) * 50).map(entity => {
            const count = { marked: 0, retained: 0, missing: 0, conflict: 0 };
            for (const match of entity.matches) count[match.status]++;
            const issue = entity.matches.find(m => m.status === "missing" || m.status === "conflict") ?? entity.matches.find(m => m.status === "retained") ?? entity.matches[0];
            const complete = !count.missing && !count.conflict && !count.retained && !entity.ambiguous;
            return <tr key={entityValueKey(entity,entity.value)}><td><span className="known-value" title={entity.value}>{entity.value}</span><small>{entityLabel(entity)}</small></td><td>标记 {count.marked} · 保留 {count.retained}<br />漏标 {count.missing} · 冲突 {count.conflict}</td><td className={complete ? "known-complete" : count.missing || count.conflict || entity.ambiguous ? "known-attention" : ""}>{entity.ambiguous ? "同值策略需核对" : count.conflict ? "存在范围冲突" : count.missing ? "存在漏标" : count.retained ? "存在保留项" : "已完整标记"}</td><td>{issue && <button className="quiet" disabled={disabled} onClick={() => void run(() => locate(issue))}>定位原文</button>}</td></tr>;
          })}</tbody>
        </table>}
        {coverage.entities.length > 50 && <div className="pagination" aria-label="漏标结果分页"><button className="quiet" disabled={!entityPage || disabled} onClick={() => setEntityPage(entityPage - 1)}>上一组</button><span>{entityPage + 1} / {Math.ceil(coverage.entities.length / 50)}</span><button className="quiet" disabled={(entityPage + 1) * 50 >= coverage.entities.length || disabled} onClick={() => setEntityPage(entityPage + 1)}>下一组</button></div>}
        {aliasBlocked && <p role="status" className="error">漏标项需要沿用项目假名。你没有假名映射权限，请联系项目管理员补录；本次检查不会修改草稿。</p>}
        <button className="secondary" disabled={disabled || !canReview || !coverage.additions.length || aliasBlocked} onClick={addMissing}>补录全部漏标到草稿</button>
      </>}
    </section></>}
  </section>;
}

export function ReplacementEditor({ mark, index, change }: { mark: Mark; index: number; change: (replacement: Mark["replacement"]) => void }) {
  const policy = mark.replacement;
  return <div className="replacement-editor">
    <label>脱敏方式<select aria-label={`标记 ${index + 1} 脱敏方式`} value={policy?.mode ?? "type"} onChange={e => change(e.target.value === "alias" ? policy : e.target.value === "clear" ? {mode: "clear"} : e.target.value === "reference-mask" ? {mode: "reference-mask", variant: "default"} : e.target.value === "full" ? { mode: "full" } : e.target.value === "mask" ? { mode: "mask", prefix: 0, suffix: 0 } : e.target.value === "custom" ? { mode: "custom", value: "已隐藏" } : { mode: "type" })}>
      <option value="clear">完整遮盖</option><option value="type">类型占位符</option><option value="full">全字符星号</option><option value="reference-mask">按类型遮盖</option><option value="mask">部分遮盖</option><option value="custom">自定义替换</option>
      {policy?.mode === "alias" && <option value="alias">项目假名</option>}
    </select></label>
    {policy?.mode === "mask" && <div className="mask-settings"><label>保留前几字<input aria-label={`标记 ${index + 1} 保留前几字`} type="number" min="0" max="100" value={policy.prefix} onChange={e => change({ ...policy, prefix: Number(e.target.value) })} /></label><label>保留后几字<input aria-label={`标记 ${index + 1} 保留后几字`} type="number" min="0" max="100" value={policy.suffix} onChange={e => change({ ...policy, suffix: Number(e.target.value) })} /></label></div>}
    {policy?.mode === "custom" && <label>替换文字<textarea aria-label={`标记 ${index + 1} 替换文字`} value={policy.value} rows={2} onChange={e => change({ mode: "custom", value: e.target.value })} /><small>此方式不保存还原关系。</small></label>}
  </div>;
}
