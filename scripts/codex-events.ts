const skillWarning = "Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest.";
export function validateCodexEvents(stdout: string) {
  let warnings = 0;
  for (const line of stdout.split("\n").filter(Boolean)) {
    let event; try { event = JSON.parse(line); } catch { throw new Error("MODEL_EVENT_INVALID"); }
    if (event.item?.type === "error") {
      const message = String(event.item.message ?? event.item.text ?? "unspecified");
      if (message === skillWarning) { warnings++; continue; }
      const detail = message.replace(/https?:\/\/\S+|Bearer\s+\S+|sk-[\w-]+|[A-Za-z0-9_.-]{40,}/g, "[redacted]").slice(0, 500);
      throw new Error(`MODEL_CALL_REPORTED:${detail}`);
    }
    if (event.type === "turn.failed" || event.type === "error") throw new Error("MODEL_TURN_FAILED");
    if (event.item?.type && !["agent_message", "reasoning"].includes(event.item.type)) {
      const type = /^[a-z_]{1,40}$/.test(event.item.type) ? event.item.type : "unknown";
      throw new Error(`MODEL_UNEXPECTED_ITEM:${type}`);
    }
  }
  return { informationalWarnings: warnings };
}
