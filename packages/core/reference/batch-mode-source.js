// Exact pure mode branches from renderer.js:27839-27845. The renderer's
// selected-document closure is adapted in the API, not copied as a new UI.
function sO(e2) {
  return { pseudonym: "default_pseudonym" === e2 || "custom_pseudonym" === e2 || "selective_pseudonym" === e2, customValue: "custom_pseudonym" === e2 || "selective_pseudonym" === e2, selective: "selective_pseudonym" === e2, fullStar: "full_star" === e2 };
}
function oO(e2, t2) {
  return "default_pseudonym" === e2 ? "custom_pseudonym" : t2.visual && "full_star" === e2 ? "default_star" : e2;
}
export {sO as sourceModeFlags,oO as sourceNormalizeMode};
