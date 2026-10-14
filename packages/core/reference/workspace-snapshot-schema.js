// Pure snapshot validation only, extracted from readable main.js:18927-19296. No IO or licensed engine invocation.
const $m = ["name_cn", "org_name", "id_card", "phone", "bank_card", "address", "email", "website_url", "uscc", "wechat_id", "plate_cn", "securities_account", "case_number", "cert_no", "patent_no", "filing_no", "contract_amount", "seal", "face"], Lm = /* @__PURE__ */ new Set([...$m, "signature"]), Fm = /* @__PURE__ */ new Set(["default_star", "full_star", "default_pseudonym", "custom_pseudonym", "selective_pseudonym"]), Bm = /* @__PURE__ */ new Set(["default_star", "default_pseudonym", "custom_pseudonym", "selective_pseudonym"]), jm = /* @__PURE__ */ new Set(["black", "white", "purple", "lightGray"]);
function Vm(e5) {
  return "object" == typeof e5 && null !== e5 && !Array.isArray(e5);
}
function Um(e5) {
  if (!Vm(e5) || 1 !== e5.schemaVersion) throw new Error("DesensitizationProfileV1.schemaVersion must be 1");
  for (const s2 of ["id", "name", "description", "createdAt", "updatedAt"]) if ("string" != typeof e5[s2]) throw new Error(`DesensitizationProfileV1.${s2} must be a string`);
  if ("system" !== e5.source && "user" !== e5.source) throw new Error("DesensitizationProfileV1.source is invalid");
  if ("boolean" != typeof e5.readonly) throw new Error("DesensitizationProfileV1.readonly must be boolean");
  if ("system" === e5.source && true !== e5.readonly) throw new Error("System profiles must be readonly");
  if (!Array.isArray(e5.enabledEntityTypeIds) || 0 === e5.enabledEntityTypeIds.length) throw new Error("DesensitizationProfileV1.enabledEntityTypeIds cannot be empty");
  if (!e5.enabledEntityTypeIds.every((e6) => "string" == typeof e6 && Lm.has(e6))) throw new Error("DesensitizationProfileV1 contains unsupported entity types");
  if (new Set(e5.enabledEntityTypeIds).size !== e5.enabledEntityTypeIds.length) throw new Error("DesensitizationProfileV1 contains duplicate entity types");
  if (void 0 !== e5.certNoPreferenceRecorded && "boolean" != typeof e5.certNoPreferenceRecorded) throw new Error("DesensitizationProfileV1.certNoPreferenceRecorded must be boolean");
  if (void 0 !== e5.pseudonymTypeActions) {
    if (!Vm(e5.pseudonymTypeActions)) throw new Error("Profile pseudonymTypeActions is invalid");
    for (const [t3, n3] of Object.entries(e5.pseudonymTypeActions)) if (!Lm.has(t3) || !["mask", "pseudonym", "partial_star", "full_star"].includes(String(n3))) throw new Error("Profile pseudonymTypeActions contains an unsupported rule");
  }
  for (const s2 of ["docx", "pdf", "image", "batch"]) if (!Vm(e5[s2])) throw new Error(`DesensitizationProfileV1.${s2} is required`);
  const t2 = e5.docx, n2 = e5.pdf, r2 = e5.image;
  if (!Fm.has(String(t2.defaultMode))) throw new Error("Profile docx.defaultMode is invalid");
  if (!(void 0 === e5.markdown || Vm(e5.markdown) && Fm.has(String(e5.markdown.defaultMode)))) throw new Error("Profile markdown.defaultMode is invalid");
  if (!Bm.has(String(n2.defaultMode)) || !Bm.has(String(r2.defaultMode))) throw new Error("Profile visual defaultMode is invalid");
  if (!jm.has(String(n2.maskStyle)) || !jm.has(String(r2.maskStyle))) throw new Error("Profile maskStyle is invalid");
  for (const [s2, o2] of [[t2, ["removeHeaderFooter", "removeImages", "exportMarkdown"]], [n2, ["exportPdfAsDocx", "exportMarkdown"]], [r2, ["exportMarkdown"]]]) for (const e6 of o2) if ("boolean" != typeof s2[e6]) throw new Error(`Profile ${e6} must be boolean`);
  if (!["remove", "anonymize", "keep"].includes(String(t2.commentHandlingMode))) throw new Error("Profile commentHandlingMode is invalid");
  if (void 0 !== e5.pseudonymTemplate) {
    if (!Vm(e5.pseudonymTemplate) || !["standard", "party_slots"].includes(String(e5.pseudonymTemplate.kind))) throw new Error("Profile pseudonymTemplate is invalid");
    if ("party_slots" === e5.pseudonymTemplate.kind) {
      if (!Array.isArray(e5.pseudonymTemplate.slots) || e5.pseudonymTemplate.slots.length < 2) throw new Error("Party-slot profile requires at least two slots");
      const t3 = /* @__PURE__ */ new Set();
      for (const n3 of e5.pseudonymTemplate.slots) {
        if (!Vm(n3) || "string" != typeof n3.id || !n3.id.trim() || "string" != typeof n3.label || !n3.label.trim()) throw new Error("Party-slot profile contains an invalid slot");
        if (t3.has(n3.id)) throw new Error("Party-slot profile contains duplicate slot ids");
        t3.add(n3.id);
      }
    }
  }
  const a2 = e5.batch;
  if (!Fm.has(String(a2.docxDefaultMode))) throw new Error("Profile batch.docxDefaultMode is invalid");
  if (void 0 !== a2.markdownDefaultMode && !Fm.has(String(a2.markdownDefaultMode))) throw new Error("Profile batch.markdownDefaultMode is invalid");
  if (!Bm.has(String(a2.pdfDefaultMode)) || !Bm.has(String(a2.imageDefaultMode))) throw new Error("Profile batch visual mode is invalid");
  if (!Vm(a2.exportMarkdownByKind)) throw new Error("Profile batch exportMarkdownByKind is required");
  for (const s2 of ["docx", "pdf", "image"]) if ("boolean" != typeof a2.exportMarkdownByKind[s2]) throw new Error(`Profile batch ${s2} markdown default is required`);
  if (!Vm(a2.pseudonymTableNameTemplates)) throw new Error("Profile pseudonym table templates are required");
  for (const s2 of ["singleDocument", "unifiedBatch", "independentBatch"]) if ("string" != typeof a2.pseudonymTableNameTemplates[s2] || !String(a2.pseudonymTableNameTemplates[s2]).trim()) throw new Error(`Profile pseudonym table template ${s2} is required`);
}
function zm(e5) {
  if (void 0 === e5) return;
  if (!e5 || "object" != typeof e5 || 1 !== e5.schemaVersion || !Array.isArray(e5.entries)) throw new Error("Inherited pseudonym profile is invalid");
  const t2 = e5.entries;
  if (t2.length > 1e5) throw new Error("Inherited pseudonym profile exceeds the entry limit");
  const n2 = e5.reservedTokens;
  if (void 0 !== n2 && (!Array.isArray(n2) || n2.length > 2e5 || n2.some((e6) => "string" != typeof e6 || !e6.trim()))) throw new Error("Inherited pseudonym reservations are invalid");
  const r2 = /* @__PURE__ */ new Set();
  for (const a2 of t2) {
    if (!(a2 && "string" == typeof a2.key && a2.key.includes(":") && "string" == typeof a2.token && a2.token.trim() && "string" == typeof a2.canonicalKey && a2.canonicalKey.includes(":"))) throw new Error("Inherited pseudonym entry is invalid");
    if (r2.has(a2.key)) throw new Error("Inherited pseudonym keys must be unique");
    r2.add(a2.key);
  }
}
function Wm(e5) {
  return "object" == typeof e5 && null !== e5 && !Array.isArray(e5);
}
function Hm(e5, t2) {
  const n2 = e5[t2];
  if ("number" != typeof n2 || !Number.isFinite(n2)) throw new Error(`${t2} must be a finite number`);
  return n2;
}
function Km(e5, t2) {
  const n2 = e5[t2];
  if ("string" != typeof n2) throw new Error(`${t2} must be a string`);
  return n2;
}
function Ym(e5, t2 = false) {
  if (!Wm(e5)) throw new Error("bbox must be an object");
  for (const n2 of ["x", "y", "width", "height"]) Hm(e5, n2);
  t2 && Hm(e5, "pageNumber");
}
function Gm(e5) {
  if (!Wm(e5) || ".doc" !== e5.extension && ".wps" !== e5.extension) throw new Error("Workspace legacyOffice extension is invalid");
  if (void 0 !== e5.engine && "word" !== e5.engine && "wps" !== e5.engine) throw new Error("Workspace legacyOffice engine is invalid");
  if (void 0 !== e5.engineVersion && "string" != typeof e5.engineVersion) throw new Error("Workspace legacyOffice engineVersion must be a string");
  if (void 0 !== e5.normalizationVersion && (!Number.isInteger(e5.normalizationVersion) || Number(e5.normalizationVersion) < 1)) throw new Error("Workspace legacyOffice normalizationVersion is invalid");
}
function qm(e5) {
  if (!Array.isArray(e5)) throw new Error("ocrCachePages must be an array");
  for (const t2 of e5) {
    if (!Wm(t2)) throw new Error("ocrCachePages page must be an object");
    if (Hm(t2, "pageNumber"), Hm(t2, "pageWidth"), Hm(t2, "pageHeight"), void 0 !== t2.ocrText && "string" != typeof t2.ocrText) throw new Error("ocrCachePages page.ocrText must be a string if present");
    if (!Array.isArray(t2.lines)) throw new Error("ocrCachePages page.lines must be an array");
    for (const e6 of t2.lines) {
      if (!Wm(e6)) throw new Error("ocrCachePages line must be an object");
      if (Ym(e6.bbox), void 0 !== e6.charBoxes && !Array.isArray(e6.charBoxes)) throw new Error("ocrCachePages line.charBoxes must be an array if present");
    }
  }
}
function Jm(e5) {
  if (!Wm(e5)) throw new Error("pdfOcrProgress must be an object");
  if (1 !== e5.schemaVersion) throw new Error("pdfOcrProgress schemaVersion is unsupported");
  if ("incomplete" !== e5.status && "complete" !== e5.status) throw new Error("pdfOcrProgress status is invalid");
  const t2 = Hm(e5, "totalPages");
  if (!Number.isInteger(t2) || t2 <= 0) throw new Error("pdfOcrProgress totalPages must be a positive integer");
  if (void 0 !== e5.controlState && !["running", "paused", "skipped", "complete"].includes(String(e5.controlState))) throw new Error("pdfOcrProgress controlState is invalid");
  if (void 0 !== e5.mode && "supplement" !== e5.mode && "required" !== e5.mode) throw new Error("pdfOcrProgress mode is invalid");
  if (void 0 !== e5.targetPageNumbers) {
    if (!Array.isArray(e5.targetPageNumbers)) throw new Error("pdfOcrProgress targetPageNumbers must be an array");
    for (const n2 of e5.targetPageNumbers) if ("number" != typeof n2 || !Number.isInteger(n2) || n2 <= 0 || n2 > t2) throw new Error("pdfOcrProgress target page number is invalid");
  }
  if (!Array.isArray(e5.completedPageNumbers)) throw new Error("pdfOcrProgress completedPageNumbers must be an array");
  for (const n2 of e5.completedPageNumbers) if ("number" != typeof n2 || !Number.isInteger(n2) || n2 <= 0 || n2 > t2) throw new Error("pdfOcrProgress completed page number is invalid");
  if (void 0 !== e5.repeatedImageGroups) {
    if (!Array.isArray(e5.repeatedImageGroups)) throw new Error("pdfOcrProgress repeatedImageGroups must be an array");
    const n2 = /* @__PURE__ */ new Set();
    for (const r2 of e5.repeatedImageGroups) {
      if (!Wm(r2)) throw new Error("pdfOcrProgress repeated image group must be an object");
      const e6 = Km(r2, "id");
      if (!e6 || n2.has(e6)) throw new Error("pdfOcrProgress repeated image group id is invalid");
      n2.add(e6);
      const a2 = Hm(r2, "pageWidth"), s2 = Hm(r2, "pageHeight");
      if (a2 <= 0 || s2 <= 0) throw new Error("pdfOcrProgress repeated image page size is invalid");
      if (!Array.isArray(r2.pageNumbers) || r2.pageNumbers.length < 2) throw new Error("pdfOcrProgress repeated image pageNumbers are invalid");
      const o2 = /* @__PURE__ */ new Set();
      for (const n3 of r2.pageNumbers) {
        if (!Number.isInteger(n3) || Number(n3) <= 0 || Number(n3) > t2 || o2.has(Number(n3))) throw new Error("pdfOcrProgress repeated image page number is invalid");
        o2.add(Number(n3));
      }
      const i2 = Hm(r2, "representativePageNumber");
      if (!Number.isInteger(i2) || !o2.has(i2)) throw new Error("pdfOcrProgress repeated image representative page is invalid");
      Ym(r2.bbox);
      const c2 = r2.bbox;
      if (c2.x < 0 || c2.y < 0 || c2.width <= 0 || c2.height <= 0 || c2.x + c2.width > a2 || c2.y + c2.height > s2) throw new Error("pdfOcrProgress repeated image bbox is invalid");
    }
  }
  Km(e5, "updatedAt");
}
function Xm(e5) {
  Jm(e5);
  const t2 = e5;
  return { schemaVersion: 1, status: t2.status, ...t2.controlState ? { controlState: t2.controlState } : {}, ...t2.mode ? { mode: t2.mode } : {}, totalPages: t2.totalPages, ...t2.targetPageNumbers ? { targetPageNumbers: [...t2.targetPageNumbers] } : {}, completedPageNumbers: [...t2.completedPageNumbers], ...t2.repeatedImageGroups?.length ? { repeatedImageGroups: t2.repeatedImageGroups.map((e6) => ({ id: e6.id, pageNumbers: [...e6.pageNumbers], representativePageNumber: e6.representativePageNumber, pageWidth: e6.pageWidth, pageHeight: e6.pageHeight, bbox: { x: e6.bbox.x, y: e6.bbox.y, width: e6.bbox.width, height: e6.bbox.height } })) } : {}, updatedAt: t2.updatedAt };
}
function Zm(e5) {
  if (!Wm(e5)) throw new Error("recognitionProgress must be an object");
  if (1 !== e5.schemaVersion) throw new Error("recognitionProgress schemaVersion is unsupported");
  if ("pending" !== e5.status && "incomplete" !== e5.status && "complete" !== e5.status) throw new Error("recognitionProgress status is invalid");
  if (void 0 !== e5.stopReason && "user-cancel" !== e5.stopReason) throw new Error("recognitionProgress stopReason is invalid");
  if ("user-cancel" === e5.stopReason && "complete" === e5.status) throw new Error("recognitionProgress cannot be complete after user cancellation");
  const t2 = Hm(e5, "processedPages");
  if (!Number.isInteger(t2) || t2 < 0) throw new Error("recognitionProgress processedPages must be a non-negative integer");
  if (null !== e5.totalPages) {
    const n2 = Hm(e5, "totalPages");
    if (!Number.isInteger(n2) || n2 <= 0 || t2 > n2) throw new Error("recognitionProgress totalPages is invalid");
  }
  if (void 0 !== e5.warnings && (!Array.isArray(e5.warnings) || e5.warnings.some((e6) => "seal_manual_review_required" !== e6))) throw new Error("recognitionProgress warnings are invalid");
  Km(e5, "updatedAt");
}
function Qm(e5) {
  if (!Wm(e5)) throw new Error("ReviewOccurrenceAnchorV1 must be an object");
  if ("docx" === e5.kind) return Hm(e5, "startOffset"), Hm(e5, "endOffset"), Km(e5, "contextBefore"), Km(e5, "contextAfter"), void Km(e5, "textHash");
  if ("pdf" !== e5.kind) {
    if ("image" !== e5.kind) throw new Error("ReviewOccurrenceAnchorV1.kind is invalid");
    Ym(e5.bbox);
  } else {
    if (Hm(e5, "pageNumber"), Km(e5, "textHash"), !Array.isArray(e5.bboxes) || 0 === e5.bboxes.length) throw new Error("PDF anchors require at least one bbox");
    e5.bboxes.forEach((e6) => Ym(e6, true));
  }
}
function eg(e5) {
  if (!Wm(e5)) throw new Error("ReviewDocumentDraftV1 must be an object");
  if ((function(e6) {
    if (1 !== e6.schemaVersion) throw new Error("Review draft schemaVersion must be 1");
    for (const t2 of ["isPreviewMode", "hasVisitedPreview", "enablePseudonymization"]) if ("boolean" != typeof e6[t2]) throw new Error(`Review draft ${t2} must be boolean`);
    if (!Array.isArray(e6.pseudonymEntries)) throw new Error("Review draft pseudonymEntries must be an array");
    if (void 0 !== e6.pseudonymTypeActions) {
      if (!Wm(e6.pseudonymTypeActions)) throw new Error("Review draft pseudonymTypeActions must be an object");
      for (const t2 of Object.values(e6.pseudonymTypeActions)) if (!["mask", "pseudonym", "partial_star", "full_star"].includes(String(t2))) throw new Error("Review draft pseudonymTypeActions contains an invalid action");
    }
    if (!["black", "white", "purple", "lightGray"].includes(String(e6.maskStyle))) throw new Error("Review draft maskStyle is invalid");
  })(e5), "docx" === e5.kind) {
    if (!Array.isArray(e5.entities) || !Wm(e5.viewport)) throw new Error("DOCX draft entities and viewport are required");
    return e5.entities.forEach((e6) => {
      if (!Wm(e6)) throw new Error("DOCX review entity must be an object");
      if (Hm(e6, "startOffset"), Hm(e6, "endOffset"), void 0 !== e6.region && !["body", "table", "header", "footer", "comment", "textbox", "footnote", "endnote", "image_ocr"].includes(String(e6.region))) throw new Error("DOCX review entity region is invalid");
      void 0 !== e6.meta && (function(e7) {
        if (!Wm(e7)) throw new Error("DOCX review entity meta must be an object");
        for (const t2 of ["imagePath", "imageAnnotationSource", "imageDomId", "shape"]) if (void 0 !== e7[t2] && "string" != typeof e7[t2]) throw new Error(`DOCX review entity meta.${t2} must be a string`);
        for (const t2 of ["imageDomIndex", "imageWidth", "imageHeight", "noteId", "noteOccurrenceIndex"]) if (void 0 !== e7[t2] && ("number" != typeof e7[t2] || !Number.isFinite(e7[t2]))) throw new Error(`DOCX review entity meta.${t2} must be a finite number`);
        if (void 0 !== e7.noteId && (!Number.isInteger(e7.noteId) || Number(e7.noteId) < 0)) throw new Error("DOCX review entity meta.noteId is invalid");
        if (void 0 !== e7.noteOccurrenceIndex && (!Number.isInteger(e7.noteOccurrenceIndex) || Number(e7.noteOccurrenceIndex) < 0)) throw new Error("DOCX review entity meta.noteOccurrenceIndex is invalid");
        for (const t2 of ["imageBbox", "bboxOriginal", "imageDisplayRatioBbox"]) void 0 !== e7[t2] && Ym(e7[t2]);
      })(e6.meta);
    }), Hm(e5.viewport, "scrollTop"), Hm(e5.viewport, "scrollLeft"), Hm(e5.viewport, "zoom"), void Km(e5.viewport, "searchText");
  }
  if ("pdf" === e5.kind) {
    if (!(Array.isArray(e5.entities) && Wm(e5.pageRotations) && Array.isArray(e5.manualOnlyRotationPages) && Wm(e5.viewport))) throw new Error("PDF draft entities, rotations and viewport are required");
    if (void 0 !== e5.sealProgress) {
      const t2 = e5.sealProgress;
      if (!Wm(t2) || !["deferred", "complete"].includes(String(t2.status)) || !Array.isArray(t2.completedPageNumbers) || t2.completedPageNumbers.some((e6) => !Number.isInteger(e6) || Number(e6) <= 0)) throw new Error("PDF draft sealProgress is invalid");
    }
    if (e5.entities.forEach((e6) => {
      if (!Wm(e6)) throw new Error("PDF review entity must be an object");
      if (Hm(e6, "pageNumber"), void 0 !== e6.bbox && Ym(e6.bbox, true), void 0 !== e6.bboxes) {
        if (!Array.isArray(e6.bboxes)) throw new Error("PDF entity bboxes must be an array");
        e6.bboxes.forEach((e7) => Ym(e7, true));
      }
    }), void 0 !== e5.deletedPageNumbers) {
      if (!Array.isArray(e5.deletedPageNumbers)) throw new Error("PDF draft deletedPageNumbers must be an array");
      e5.deletedPageNumbers.forEach((e6) => {
        if (!Number.isInteger(e6) || Number(e6) <= 0) throw new Error("PDF draft deleted page number is invalid");
      });
    }
    return Hm(e5.viewport, "pageNumber"), void Hm(e5.viewport, "scale");
  }
  if ("image" === e5.kind) {
    if (!Array.isArray(e5.activeBBoxes) || !Array.isArray(e5.deletedBBoxes) || !Wm(e5.viewport)) throw new Error("Image draft bbox collections and viewport are required");
    return e5.activeBBoxes.forEach((e6) => {
      if (Ym(e6), void 0 !== e6.bboxes) {
        if (!Array.isArray(e6.bboxes)) throw new Error("image bbox ranges must be an array");
        e6.bboxes.forEach((e7) => Ym(e7));
      }
    }), e5.deletedBBoxes.forEach((e6) => {
      if (Ym(e6), void 0 !== e6.bboxes) {
        if (!Array.isArray(e6.bboxes)) throw new Error("deleted image bbox ranges must be an array");
        e6.bboxes.forEach((e7) => Ym(e7));
      }
    }), void Hm(e5.viewport, "scale");
  }
  throw new Error("ReviewDocumentDraftV1.kind is invalid");
}
function tg(e5) {
  if (!Wm(e5) || 1 !== e5.schemaVersion) throw new Error("WorkspaceSnapshotV1.schemaVersion must be 1");
  for (const t2 of ["projectId", "projectName", "createdAt", "updatedAt"]) Km(e5, t2);
  if (Hm(e5, "contentRevision"), !Array.isArray(e5.documents) || !Array.isArray(e5.reviewDecisionEvents) || !Array.isArray(e5.workspaceCorrections)) throw new Error("WorkspaceSnapshotV1 document and decision collections are required");
  zm(e5.inheritedPseudonymProfile), null !== e5.profileSnapshot && void 0 !== e5.profileSnapshot && Um(e5.profileSnapshot);
  for (const t2 of e5.documents) {
    if (!Wm(t2)) throw new Error("Workspace document must be an object");
    const e6 = t2.fileKind;
    if ("docx" !== e6 && "pdf" !== e6 && "image" !== e6) throw new Error("Workspace document kind is invalid");
    if (!Wm(t2.review) || !Wm(t2.exportState)) throw new Error("Workspace document review and exportState are required");
    if (void 0 !== t2.relativePath && "string" != typeof t2.relativePath) throw new Error("Workspace document relativePath must be a string");
    if (void 0 !== t2.legacyOffice) {
      if ("docx" !== e6) throw new Error("Workspace legacyOffice is only valid for DOCX review documents");
      Gm(t2.legacyOffice);
    }
    if (Wm(t2.detection) && void 0 !== t2.detection.ocrCachePages && qm(t2.detection.ocrCachePages), Wm(t2.detection) && void 0 !== t2.detection.pdfOcrProgress && Jm(t2.detection.pdfOcrProgress), Wm(t2.detection) && void 0 !== t2.detection.recognitionProgress && Zm(t2.detection.recognitionProgress), eg(t2.review), t2.review.kind !== e6 || t2.exportState.kind !== e6) throw new Error("Workspace document fileKind, review.kind and exportState.kind must match");
    if (void 0 !== t2.exportState.mode && !["default_pseudonym", "custom_pseudonym", "selective_pseudonym", "default_star", "full_star"].includes(String(t2.exportState.mode))) throw new Error("Workspace exportState.mode is invalid");
    for (const n2 of ["exportMarkdown"]) if ("boolean" != typeof t2.exportState[n2]) throw new Error(`Workspace exportState.${n2} must be boolean`);
    if ("string" != typeof t2.exportState.pseudonymTableName) throw new Error("Workspace exportState.pseudonymTableName must be a string");
    if ("docx" === e6) {
      if ("boolean" != typeof t2.exportState.pseudonym || "boolean" != typeof t2.exportState.fullMask) throw new Error("DOCX export state is invalid");
    } else {
      if ("boolean" != typeof t2.exportState.redact || "boolean" != typeof t2.exportState.redactPseudo) throw new Error("Visual export state is invalid");
      if (!["black", "white", "purple", "lightGray"].includes(String(t2.exportState.maskStyle))) throw new Error("Visual export maskStyle is invalid");
      if ("pdf" === e6 && "boolean" != typeof t2.exportState.exportDocx) throw new Error("PDF exportDocx must be boolean");
      if ("image" === e6 && "exportDocx" in t2.exportState) throw new Error("Image export state cannot contain PDF-only exportDocx");
    }
  }
  if (void 0 !== e5.folderBatch) {
    if (!Wm(e5.folderBatch) || 1 !== e5.folderBatch.schemaVersion) throw new Error("Workspace folderBatch is invalid");
    if (Km(e5.folderBatch, "sourceRootName"), Km(e5.folderBatch, "scannedAt"), !Array.isArray(e5.folderBatch.skippedItems)) throw new Error("Workspace folderBatch skippedItems must be an array");
  }
  for (const t2 of e5.reviewDecisionEvents) {
    if (!Wm(t2)) throw new Error("Review decision event must be an object");
    for (const e6 of ["id", "workspaceId", "documentId", "text", "normalizedText", "entityType", "createdAt"]) Km(t2, e6);
    if (!["excludeOccurrence", "addMissedEntity", "restoreEntity", "removeAddedEntity"].includes(String(t2.action))) throw new Error("Review decision event action is invalid");
    Qm(t2.occurrenceAnchor);
  }
  for (const t2 of e5.workspaceCorrections) {
    if (!Wm(t2) || "exact" !== t2.matchMode) throw new Error("Workspace corrections must use exact matching in V1");
    for (const e6 of ["id", "pattern", "normalizedPattern", "entityType", "createdAt", "updatedAt"]) Km(t2, e6);
    if ("forceDetect" !== t2.kind && "forceSkip" !== t2.kind) throw new Error("Workspace correction kind is invalid");
    if ("normal" !== t2.risk && "high" !== t2.risk) throw new Error("Workspace correction risk is invalid");
    if (void 0 !== t2.origin && !["automatic", "imported", "legacy"].includes(String(t2.origin))) throw new Error("Workspace correction origin is invalid");
    if (void 0 !== t2.sourceWorkspaceId && "string" != typeof t2.sourceWorkspaceId) throw new Error("Workspace correction sourceWorkspaceId must be a string");
    if ("boolean" != typeof t2.enabled) throw new Error("Workspace correction enabled must be boolean");
    if (!Array.isArray(t2.sourceDecisionIds) || t2.sourceDecisionIds.some((e6) => "string" != typeof e6)) throw new Error("Workspace correction sourceDecisionIds must be a string array");
  }
}
function ng(e5) {
  return "object" == typeof e5 && null !== e5 && !Array.isArray(e5);
}
function rg(e5, t2) {
  const n2 = e5[t2];
  if ("string" != typeof n2) throw new Error(`${t2} must be a string`);
  return n2;
}
function ag(e5, t2) {
  const n2 = e5[t2];
  if ("number" != typeof n2 || !Number.isFinite(n2)) throw new Error(`${t2} must be a finite number`);
  return n2;
}
function sg(e5) {
  if (!ng(e5) || "markdown-source" !== e5.schemaId || 1 !== e5.schemaVersion) throw new Error("Markdown source sidecar is missing or unsupported");
  if ("utf16-code-unit" !== e5.offsetEncoding || "utf8" !== e5.encoding) throw new Error("Markdown source sidecar encoding is invalid");
  if (rg(e5, "sourceSha256"), rg(e5, "scanTextSha256"), ag(e5, "sourceLength"), !(Array.isArray(e5.regions) && Array.isArray(e5.sourceMap) && Array.isArray(e5.syntaxContainers) && Array.isArray(e5.blockers))) throw new Error("Markdown source sidecar collections are invalid");
  for (const t2 of e5.sourceMap) {
    if (!ng(t2)) throw new Error("Markdown source map segment is invalid");
    for (const e6 of ["scanStart", "scanEnd", "sourceStart", "sourceEnd"]) ag(t2, e6);
    if (Number(t2.scanStart) < 0 || Number(t2.scanEnd) <= Number(t2.scanStart) || Number(t2.sourceStart) < 0 || Number(t2.sourceEnd) <= Number(t2.sourceStart) || Number(t2.sourceEnd) > Number(e5.sourceLength)) throw new Error("Markdown source map range is invalid");
  }
}
function og(e5) {
  if (!ng(e5)) throw new Error("ReviewOccurrenceAnchorV2 must be an object");
  if ("markdown" !== e5.kind) {
    if ("docx" === e5.kind) return ag(e5, "startOffset"), ag(e5, "endOffset"), rg(e5, "contextBefore"), rg(e5, "contextAfter"), void rg(e5, "textHash");
    if ("pdf" !== e5.kind) {
      if ("image" !== e5.kind) throw new Error("ReviewOccurrenceAnchorV2.kind is invalid");
      if (!ng(e5.bbox)) throw new Error("Image anchor bbox is invalid");
    } else {
      if (ag(e5, "pageNumber"), !Array.isArray(e5.bboxes)) throw new Error("PDF anchor bboxes are invalid");
      rg(e5, "textHash");
    }
  } else {
    for (const t2 of ["sourceStart", "sourceEnd", "scanStart", "scanEnd"]) ag(e5, t2);
    for (const t2 of ["region", "contextBefore", "contextAfter", "textHash"]) rg(e5, t2);
    if (Number(e5.sourceStart) < 0 || Number(e5.sourceEnd) <= Number(e5.sourceStart)) throw new Error("Markdown source anchor range is invalid");
    if (Number(e5.scanStart) < 0 || Number(e5.scanEnd) <= Number(e5.scanStart)) throw new Error("Markdown scan anchor range is invalid");
  }
}
function ig(e5) {
  if (!ng(e5) || 2 !== e5.schemaVersion) throw new Error("WorkspaceSnapshotV2.schemaVersion must be 2");
  for (const n2 of ["projectId", "projectName", "createdAt", "updatedAt"]) rg(e5, n2);
  if (ag(e5, "contentRevision"), zm(e5.inheritedPseudonymProfile), !Array.isArray(e5.documents) || !Array.isArray(e5.reviewDecisionEvents) || !Array.isArray(e5.workspaceCorrections)) throw new Error("WorkspaceSnapshotV2 document and decision collections are required");
  const t2 = /* @__PURE__ */ new Set();
  for (const n2 of e5.documents) {
    if (!ng(n2)) throw new Error("Workspace v2 document must be an object");
    const e6 = rg(n2, "id");
    if (t2.has(e6)) throw new Error(`Workspace v2 contains duplicate document id: ${e6}`);
    if (t2.add(e6), rg(n2, "fileName"), rg(n2, "sourceEntry"), !["docx", "pdf", "image", "markdown"].includes(String(n2.fileKind))) throw new Error("Workspace v2 document kind is invalid");
    if (!ng(n2.detection) || !Array.isArray(n2.detection.entities) || !Array.isArray(n2.detection.bboxes)) throw new Error("Workspace v2 detection snapshot is invalid");
    void 0 !== n2.detection.pdfOcrProgress && Xm(n2.detection.pdfOcrProgress);
    for (const t3 of n2.detection.entities) {
      if (!ng(t3)) throw new Error("Workspace v2 detection entity is invalid");
      og(t3.anchor);
    }
    if (!ng(n2.review) || !ng(n2.exportState)) throw new Error("Workspace v2 review/export state is invalid");
    if ("markdown" === n2.fileKind) {
      if ("markdown" !== n2.review.kind || 2 !== n2.review.schemaVersion || "markdown" !== n2.exportState.kind) throw new Error("Markdown workspace document review/export kind is invalid");
      if (sg(n2.detection.markdownSourceSidecar), !Array.isArray(n2.review.entities) || !Array.isArray(n2.review.blockerDecisions)) throw new Error("Markdown review draft collections are invalid");
      if (!["default_pseudonym", "custom_pseudonym", "selective_pseudonym", "default_star", "full_star"].includes(String(n2.review.exportMode))) throw new Error("Markdown review export mode is invalid");
      rg(n2.review, "pseudonymTableName");
      const t3 = n2.detection.markdownSourceSidecar, r2 = `documents/${e6}/source${t3.originalExtension}`;
      if (n2.sourceEntry !== r2) throw new Error("Markdown sourceEntry is not controlled");
      if (!String(n2.fileName).toLowerCase().endsWith(t3.originalExtension)) throw new Error("Markdown filename extension is inconsistent");
      const a2 = new Set(t3.blockers.map((e7) => e7.id)), s2 = /* @__PURE__ */ new Set();
      for (const e7 of n2.review.blockerDecisions) {
        if (!ng(e7) || "remove" !== e7.action || "string" != typeof e7.blockerId || !a2.has(e7.blockerId)) throw new Error("Markdown blocker decision is invalid");
        if (s2.has(e7.blockerId)) throw new Error("Markdown blocker decision is duplicated");
        s2.add(e7.blockerId);
      }
      for (const e7 of n2.review.entities) {
        if (!ng(e7)) throw new Error("Markdown review entity is invalid");
        for (const t4 of ["startOffset", "endOffset", "sourceStart", "sourceEnd"]) ag(e7, t4);
        for (const t4 of ["text", "textHash", "region"]) rg(e7, t4);
        if (rg(e7, "customReplacement"), "boolean" != typeof e7.usePseudonym) throw new Error("Markdown review entity pseudonym choice is invalid");
        if (Number(e7.startOffset) < 0 || Number(e7.endOffset) <= Number(e7.startOffset) || Number(e7.sourceStart) < 0 || Number(e7.sourceEnd) <= Number(e7.sourceStart) || Number(e7.sourceEnd) > t3.sourceLength) throw new Error("Markdown review entity range is invalid");
      }
      if (![".md", ".markdown"].includes(String(n2.exportState.sourceExtension)) || n2.exportState.sourceExtension !== t3.originalExtension) throw new Error("Markdown export source extension is invalid");
      if (n2.review.exportMode !== n2.exportState.mode || n2.review.pseudonymTableName !== n2.exportState.pseudonymTableName) throw new Error("Markdown review/export state is inconsistent");
    } else if (n2.review.kind !== n2.fileKind || n2.exportState.kind !== n2.fileKind) throw new Error("Workspace v2 document review/export kind mismatch");
  }
  if (null !== e5.activeDocumentId && ("string" != typeof e5.activeDocumentId || !t2.has(e5.activeDocumentId))) throw new Error("WorkspaceSnapshotV2 activeDocumentId is invalid");
  for (const n2 of e5.reviewDecisionEvents) {
    if (!ng(n2)) throw new Error("Workspace v2 review decision event is invalid");
    og(n2.occurrenceAnchor);
  }
}
function cg(e5) {
  return { ...JSON.parse(JSON.stringify(e5)), schemaVersion: 2, documents: e5.documents.map((e6) => ({ ...JSON.parse(JSON.stringify(e6)), fileKind: e6.fileKind, detection: { ...JSON.parse(JSON.stringify(e6.detection)), entities: e6.detection.entities.map((e7) => ({ ...e7, anchor: { ...e7.anchor } })) } })), reviewDecisionEvents: e5.reviewDecisionEvents.map((e6) => ({ ...JSON.parse(JSON.stringify(e6)), occurrenceAnchor: { ...e6.occurrenceAnchor } })) };
}

export {ig as assertSourceWorkspaceV2,tg as assertSourceWorkspaceV1};
