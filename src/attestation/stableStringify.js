/**
* stableStringify.js - Deterministic JSON serialization
*
* COPIED FROM: Archivist-Agent/src/attestation/stableStringify.js
* VERSION: 1.0
* LAST_SYNC: 2026-04-19
*
* CANONICALIZATION SPEC (Gap 1 fix):
* This function implements sorted-key stringify with no whitespace.
* Intended to align with RFC 8785 (JCS) semantics:
* - Object keys sorted lexicographically
* - No whitespace between tokens
* - UTF-8 codepoint order for strings
* - Numbers in minimal representation (no leading zeros, integer preferred)
*
* CRITICAL: Same function MUST be used for both signing and verification.
* ANY change to this function breaks cross-lane verification.
*
* Ensures consistent property ordering for signature verification.
* Prevents false negatives from JSON.stringify() non-determinism.
* DO NOT MODIFY - changes must be synced from Archivist.
*/

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
  return `{${entries.join(',')}}`;
}

module.exports = { stableStringify };
