/**
 * Choices on a dish ("Hot or iced", "Protein", "Add-ins"…). Shared by the
 * register, the online order page, and both checkouts so the rules and the
 * price math are identical everywhere. The server always re-checks.
 */

export type Option = { id: string; name: string; price: number };

export type OptionGroup = {
  id: string;
  name: string;
  min: number; // 0 = optional
  max: number; // 1 = pick one
  free: number; // picks included before charges apply (0 = every pick charged at its price)
  options: Option[];
};

/** "Choose 1", "Choose 2", "Choose up to 3", "Optional". */
export function groupRule(g: OptionGroup): string {
  if (g.min === 0 && g.max === 1) return "Optional";
  if (g.min === 0) return `Optional, up to ${g.max}`;
  if (g.min === g.max) return `Choose ${g.min}`;
  return `Choose ${g.min} to ${g.max}`;
}

/** "2 included, then +$0.50 each" for groups with included picks. */
export function freeRule(g: OptionGroup): string | null {
  if (g.free <= 0) return null;
  const prices = [...new Set(g.options.map((o) => o.price))];
  const each = prices.length === 1 && prices[0] > 0 ? `, then +$${prices[0].toFixed(2)} each` : "";
  return `${g.free} included${each}`;
}

/**
 * What each picked option actually costs. In a group with included picks
 * ("2 flavors included"), the most expensive picks are the free ones, so
 * the customer always gets the better deal.
 */
function chargedPrices(g: OptionGroup, inGroup: Option[]): Map<string, number> {
  const out = new Map(inGroup.map((o) => [o.id, o.price]));
  if (g.free > 0) {
    [...inGroup]
      .sort((a, b) => b.price - a.price)
      .slice(0, g.free)
      .forEach((o) => out.set(o.id, 0));
  }
  return out;
}

export type SelectionResult =
  | { ok: true; chosen: (Option & { groupId: string; groupName: string })[]; extra: number; summary: string }
  | { ok: false; error: string };

/**
 * Check a set of chosen option ids against a dish's groups and work out the
 * extra cost and the line printed for the kitchen, e.g.
 * "Iced · Oat · Flavor: Vanilla, Caramel".
 */
export function checkSelection(groups: OptionGroup[], selectedIds: string[]): SelectionResult {
  const picked = new Set(selectedIds);
  if (picked.size !== selectedIds.length) return { ok: false, error: "The same choice was picked twice" };

  const known = new Set(groups.flatMap((g) => g.options.map((o) => o.id)));
  for (const id of picked) if (!known.has(id)) return { ok: false, error: "A choice isn't available for this dish" };

  const chosen: (Option & { groupId: string; groupName: string })[] = [];
  const parts: string[] = [];
  for (const g of groups) {
    const inGroup = g.options.filter((o) => picked.has(o.id));
    if (inGroup.length < g.min) {
      return { ok: false, error: `${g.name}: choose ${g.min === 1 ? "one" : g.min}` };
    }
    if (inGroup.length > g.max) return { ok: false, error: `${g.name}: choose at most ${g.max}` };
    const charged = chargedPrices(g, inGroup);
    for (const o of inGroup) chosen.push({ ...o, price: charged.get(o.id) ?? o.price, groupId: g.id, groupName: g.name });
    if (inGroup.length) {
      const names = inGroup.map((o) => o.name).join(", ");
      // One required pick ("Iced", "Penne") reads fine alone; optional or
      // multi-pick groups get their label so "Chia Seeds" isn't ambiguous.
      parts.push(g.min === 1 && g.max === 1 ? names : `${g.name}: ${names}`);
    }
  }
  const extra = Math.round(chosen.reduce((s, o) => s + o.price, 0) * 100) / 100;
  return { ok: true, chosen, extra, summary: parts.join(" · ") };
}

/** True when a required choice (size, hot/iced…) can raise the price: show "from $X". */
export function priceStartsFrom(groups: OptionGroup[]): boolean {
  return groups.some((g) => g.min > 0 && g.options.some((o) => o.price > 0));
}

/** Same dish + same choices = same cart line. */
export function selectionKey(menuItemId: string, selectedIds: string[]): string {
  return `${menuItemId}|${[...selectedIds].sort().join(",")}`;
}
