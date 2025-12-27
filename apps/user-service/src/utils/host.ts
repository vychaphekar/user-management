export function parseTenantFromHost(host: string): string {
  // Expect: {tenant}.api.fostercareca.com
  const parts = host.split(":")[0].split(".");
  if (parts.length < 4) return "";
  return parts[0].toLowerCase();
}
