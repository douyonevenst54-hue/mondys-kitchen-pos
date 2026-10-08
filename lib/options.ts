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
  options: Option[];
};

/** "Choose 1", "Choose 2", "Choose up to 3", "Optional". */
export function groupRule(g: OptionGroup): string {
  if (g.min === 0 && g.max === 1) return "Optional";
  if (g.min === 0) return `Optional, up to ${g.max}`;
  if (g.min === g.max) return `Choose ${g.min}`;
  return `Choose ${g.min} to ${g.max}`;
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
    for (const o of inGroup) chosen.push({ ...o, groupId: g.id, groupName: g.name });
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

/** Same dish + same choices = same cart line. */
export function selectionKey(menuItemId: string, selectedIds: string[]): string {
  return `${menuItemId}|${[...selectedIds].sort().join(",")}`;
}
