import {entityIdentity,entityLabel,sameEntity} from '../../packages/core/entity-identity.ts';
import React, { useMemo, useState } from "react";
import { typeColor } from "./text-highlights.tsx";
import type { DocumentView, Mark } from "../../packages/contracts/index.ts";

export type EntityGroup = {
  id: string;
  kind: Mark["kind"];rawEntityType?:string;
  value: string;
  exact: boolean;
  indices: number[];
  counts: Record<Mark["decision"], number>;
  mixedDecisions: boolean;
  mixedReplacements: boolean;
};

function replacementKey(replacement: Mark["replacement"]): string {
  switch (replacement?.mode) {
    case "mask": return JSON.stringify(["mask", replacement.prefix, replacement.suffix]);
    case "custom": return JSON.stringify(["custom", replacement.value]);
    case "alias": return JSON.stringify(["alias", replacement.mappingId, replacement.version, replacement.token]);
    default: return "type";
  }
}

// markTexts may contain only a 120-character preview, so never use a long preview as identity.
export function buildEntityGroups(doc: Pick<DocumentView, "text" | "textOffset" | "markTexts">, marks: Mark[]): EntityGroup[] {
  const groups = new Map<string, EntityGroup>();
  const policies = new Map<string, string>();
  const offset = doc.textOffset ?? 0;
  marks.forEach((mark, index) => {
    const length = mark.end - mark.start;
    const visible = mark.start >= offset && mark.end <= offset + doc.text.length;
    const cached = doc.markTexts?.[`${mark.start}:${mark.end}`];
    const exact = length > 0 && length <= 120 && (visible || cached?.length === length);
    const value = visible
      ? doc.text.slice(mark.start - offset, Math.min(mark.end, mark.start + 2000) - offset)
      : cached ?? "";
    const id = exact ? JSON.stringify([entityIdentity(mark), value]) : JSON.stringify([entityIdentity(mark), mark.start, mark.end, index]);
    let group = groups.get(id);
    const policy = replacementKey(mark.replacement);
    if (!group) {
      group = { id, kind: mark.kind,...mark.rawEntityType!==undefined?{rawEntityType:mark.rawEntityType}:{}, value, exact, indices: [], counts: { pending: 0, redact: 0, ignore: 0 }, mixedDecisions: false, mixedReplacements: false };
      groups.set(id, group);
      policies.set(id, policy);
    }
    group.indices.push(index);
    group.counts[mark.decision]++;
    group.mixedReplacements ||= policies.get(id) !== policy;
  });
  const result = [...groups.values()];
  for (const group of result) {
    group.indices.sort((a, b) => marks[a].start - marks[b].start || marks[a].end - marks[b].end || a - b);
    group.mixedDecisions = Object.values(group.counts).filter(Boolean).length > 1;
  }
  return result.sort((a, b) => entityLabel(a).localeCompare(entityLabel(b), "zh-CN") || marks[a.indices[0]].start - marks[b.indices[0]].start);
}

const PAGE_SIZE = 50;

export function EntityGroups({ doc, marks, update, locate, run, disabled, canReview, onEdit, onCheck }: {
  doc: DocumentView;
  marks: Mark[];
  update: (marks: Mark[]) => void;
  locate: (span: { start: number; end: number }) => Promise<void>;
  run: (action: () => Promise<void>) => Promise<void>;
  disabled: boolean;
  canReview: boolean;
  onEdit: (index: number) => void;
  onCheck: () => void;
}) {
  const groups = useMemo(() => buildEntityGroups(doc, marks), [doc.text, doc.textOffset, doc.markTexts, marks]);
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(() => new Set());
  const [positions, setPositions] = useState<Record<string, number>>({});
  const kinds = useMemo(() => [...new Map(groups.map(group => [entityIdentity(group),entityLabel(group)])).entries()], [groups]);
  const filtered = useMemo(() => groups.filter(group => (kind === "all" || entityIdentity(group) === kind) && group.value.includes(query)), [groups, kind, query]);
  const filteredIds = useMemo(() => new Set(filtered.map(group => group.id)), [filtered]);
  const chosen = useMemo(() => groups.filter(group => selected.has(group.id)), [groups, selected]);
  const chosenCount = chosen.reduce((count, group) => count + group.indices.length, 0);
  const hiddenChosen = chosen.filter(group => !filteredIds.has(group.id)).length;
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const allFilteredSelected = filtered.length > 0 && filtered.every(group => selected.has(group.id));
  const locked = disabled || !canReview;

  function choose(id: string, checked: boolean) {
    setSelected(previous => {
      const next = new Set(previous);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }
  function chooseFiltered() {
    setSelected(previous => {
      const next = new Set(previous);
      for (const group of filtered) {
        if (allFilteredSelected) next.delete(group.id); else next.add(group.id);
      }
      return next;
    });
  }
  function apply(decision: Mark["decision"]) {
    if (locked || !chosen.length) return;
    const indices = new Set(chosen.flatMap(group => group.indices));
    update(marks.map((mark, index) => indices.has(index) ? { ...mark, decision } : mark));
    setSelected(new Set());
  }
  function position(group: EntityGroup) { return Math.min(positions[group.id] ?? 0, group.indices.length - 1); }
  function show(group: EntityGroup, occurrence: number) {
    const index = group.indices[occurrence];
    void run(async () => {
      await locate(marks[index]);
      setPositions(previous => ({ ...previous, [group.id]: occurrence }));
    });
  }

  return <section className="entity-groups" aria-label="实体分组">
    <div className="entity-group-heading"><h2>敏感实体 <small>{groups.length} 组 · {marks.length} 处</small></h2><button className="quiet" onClick={onCheck}>全文漏标检查</button></div>
    <div className="entity-group-filters">
      <label>实体类型<select aria-label="实体类型筛选" value={kind} onChange={event => { setKind(event.target.value); setPage(0); }}><option value="all">全部类型</option>{kinds.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>原值查找<input aria-label="实体原值筛选" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="筛选已载入的原值或片段" /></label>
    </div>
    <div className="entity-group-selection">
      <label><input type="checkbox" checked={allFilteredSelected} disabled={locked || !filtered.length} onChange={chooseFiltered} />选择筛选结果全部 {filtered.length} 组</label>
      <span role="status">已选 {chosen.length} 组 · {chosenCount} 处{hiddenChosen ? `（筛选外 ${hiddenChosen} 组）` : ""}</span>
      <button className="quiet" disabled={!chosen.length} onClick={() => setSelected(new Set())}>清空选择</button>
    </div>
    <div className="entity-group-actions" role="group" aria-label="所选实体处理">
      <button className="secondary" disabled={locked || !chosen.length} onClick={() => apply("redact")}>所选组脱敏</button>
      <button className="quiet" disabled={locked || !chosen.length} onClick={() => apply("ignore")}>所选组保留</button>
      <button className="quiet" disabled={locked || !chosen.length} onClick={() => apply("pending")}>恢复待确认</button>
    </div>
    <details className="entity-group-hint"><summary>分组与批量操作说明</summary><p className="muted">仅修改所选组的复核草稿，保留各处脱敏方式，可撤销修改。同类型完整相同原值合组；长原值片段按位置独立展示。</p></details>
    {!filtered.length && <p className="empty">{!marks.length ? "尚无敏感标记，可在原文中补充。" : "没有符合筛选条件的实体。"}</p>}
    <div className="entity-group-list">{filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((group, index, pageGroups) => {
      const occurrence = position(group);
      const markIndex = group.indices[occurrence];
      const mark = marks[markIndex];
      const preview = Array.from(group.value).slice(0, 120).join("");
      const label = group.value ? `${preview}${preview.length < group.value.length || !group.exact ? "…" : ""}` : "定位查看原值";
      return <React.Fragment key={group.id}>
        {(index === 0 || !sameEntity(pageGroups[index - 1],group)) && <h3 className="entity-type-heading"><button type="button" className="quiet" aria-label={`${collapsedTypes.has(entityIdentity(group)) ? "展开" : "收起"}${entityLabel(group)}实体`} aria-expanded={!collapsedTypes.has(entityIdentity(group))} style={{ "--entity-color": typeColor(group.kind) } as React.CSSProperties} onClick={() => setCollapsedTypes(previous => { const next = new Set(previous); if (next.has(entityIdentity(group))) next.delete(entityIdentity(group)); else next.add(entityIdentity(group)); return next; })}><span aria-hidden="true">{collapsedTypes.has(entityIdentity(group)) ? "▸" : "▾"}</span><span className="entity-type-dot" aria-hidden="true" />{entityLabel(group)}<small>{filtered.filter(item => sameEntity(item,group)).reduce((total, item) => total + item.indices.length, 0)} 处</small></button></h3>}
        <article className="entity-group-card" hidden={collapsedTypes.has(entityIdentity(group))} style={{ "--entity-color": typeColor(group.kind) } as React.CSSProperties}>
          <div className="entity-group-value"><input type="checkbox" aria-label={`选择${entityLabel(group)}实体：${label}，位置 ${marks[group.indices[0]].start + 1}`} checked={selected.has(group.id)} disabled={locked} onChange={event => choose(group.id, event.target.checked)} /><button className="quote" title={group.value || undefined} onClick={() => show(group, 0)}>{label}</button><span className="entity-count">{group.indices.length} 处</span></div>
          {!group.exact && <small className="muted">原值片段 · 独立位置 {mark.start + 1}–{mark.end}</small>}
          <div className="entity-group-counts"><span>待确认 {group.counts.pending}</span><span>脱敏 {group.counts.redact}</span><span>保留 {group.counts.ignore}</span></div>
          {(group.mixedDecisions || group.mixedReplacements) && <p className="entity-group-warning">{group.mixedDecisions ? "处理决定不一致" : ""}{group.mixedDecisions && group.mixedReplacements ? " · " : ""}{group.mixedReplacements ? "脱敏方式不一致" : ""}，请逐处核对。</p>}
          <div className="entity-occurrence-nav" aria-label={`${entityLabel(group)}出现位置`}><button className="quiet" disabled={occurrence === 0} onClick={() => show(group, occurrence - 1)}>上一处</button><span>第 {occurrence + 1} / {group.indices.length} 处 · 位置 {mark.start + 1}</span><button className="quiet" disabled={occurrence + 1 >= group.indices.length} onClick={() => show(group, occurrence + 1)}>下一处</button><button className="quiet" onClick={() => { show(group, occurrence); onEdit(markIndex); }}>{canReview ? "编辑此处" : "查看此处"}</button></div>
        </article>
      </React.Fragment>;
    })}</div>
    {filtered.length > PAGE_SIZE && <div className="pagination" aria-label="实体分组分页"><button className="quiet" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页实体</button><span>{currentPage + 1} / {lastPage + 1}</span><button className="quiet" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>下一页实体</button></div>}
  </section>;
}
