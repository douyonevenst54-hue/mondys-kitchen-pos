/**
 * Customer-facing domains. On these, the home page IS the online order page
 * and every staff screen (login, register, reports) is unreachable; staff
 * keep using the vercel.app address.
 *
 * Change with the PUBLIC_ORDER_HOSTS environment variable (comma-separated).
 */
export const PUBLIC_ORDER_HOSTS = (process.env.PUBLIC_ORDER_HOSTS ?? "mondyskitchen.com,www.mondyskitchen.com")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function isPublicOrderHost(host: string | null | undefined, hosts: string[] = PUBLIC_ORDER_HOSTS): boolean {
  if (!host) return false;
  return hosts.includes(host.toLowerCase().split(":")[0]);
}
