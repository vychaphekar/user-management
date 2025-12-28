export function parseTenantFromHost(host: string): string {
  const h = (host || "").split(":")[0].toLowerCase();
  const parts = h.split(".");

  // Need at least: api.<tenant>.<root>.<tld>
  if (parts.length < 4) return "";

  // Pattern A (yours): api.<tenant>.fostercareca.com
  if (parts[0] === "api" && parts[1]) return parts[1];

  // Pattern B (legacy/alt): <tenant>.api.fostercareca.com
  const apiIndex = parts.indexOf("api");
  if (apiIndex === 1 && parts[0]) return parts[0];

  return "";
}
