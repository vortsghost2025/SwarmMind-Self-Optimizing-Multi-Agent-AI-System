"use strict";

/**
 * Ensure output begins with OUTPUT_PROVENANCE.
 *
 * @param {string} output
 * @param {{agent:string,lane:string,target:string,generated_at?:string,session_id?:string}} context
 * @returns {string}
 */
function ensureOutputProvenance(output, context) {
  const text = typeof output === "string" ? output : String(output ?? "");
  const trimmed = text.trimStart();
  if (trimmed.startsWith("OUTPUT_PROVENANCE:")) {
    return text;
  }

  const lines = [
    "OUTPUT_PROVENANCE:",
    `agent: ${context?.agent || "unknown"}`,
    `lane: ${context?.lane || "unknown"}`,
    context?.generated_at ? `generated_at: ${context.generated_at}` : null,
    context?.session_id ? `session_id: ${context.session_id}` : null,
    `target: ${context?.target || "unspecified"}`,
    ""
  ].filter(Boolean);

  return `${lines.join("\n")}${text}`;
}

/**
 * Verify OUTPUT_PROVENANCE prefix fields in first lines.
 *
 * @param {string} output
 * @returns {{ok:boolean,missing:string[],status:string}}
 */
function verifyOutputProvenance(output) {
  const text = typeof output === "string" ? output : String(output ?? "");
  const firstLines = text.trimStart().split(/\r?\n/).slice(0, 10);
  const header = firstLines.join("\n");

  const requiredPlaintext = [
    "OUTPUT_PROVENANCE:",
    "agent:",
    "lane:",
    "target:"
  ];
  const missingPlaintext = requiredPlaintext.filter((token) => !header.includes(token));
  if (missingPlaintext.length === 0) {
    return { ok: true, missing: [], status: "OK" };
  }

  try {
    const parsed = JSON.parse(text.trimStart());
    if (parsed && typeof parsed === "object" && parsed.OUTPUT_PROVENANCE) {
      const op = parsed.OUTPUT_PROVENANCE;
      const missingJson = [];
      if (!op.agent) missingJson.push("agent:");
      if (!op.lane) missingJson.push("lane:");
      if (!op.target) missingJson.push("target:");
      if (missingJson.length === 0) {
        return { ok: true, missing: [], status: "OK" };
      }
      return { ok: false, missing: missingJson, status: "FORMAT_VIOLATION" };
    }
  } catch (_) {}

  return {
    ok: false,
    missing: missingPlaintext,
    status: "FORMAT_VIOLATION"
  };
}

module.exports = {
  ensureOutputProvenance,
  verifyOutputProvenance
};

