/** Sticker sizes the Labels screen can print (inches; Avery 5160 = letter sheet of 30). */
export const LABEL_SIZES = {
  "2.25x1.25": { label: '2.25" × 1.25" roll (recommended)', w: 2.25, h: 1.25, sheet: false },
  "2x1": { label: '2" × 1" roll', w: 2, h: 1, sheet: false },
  "1.5x1": { label: '1.5" × 1" roll (small)', w: 1.5, h: 1, sheet: false },
  avery5160: { label: "Avery 5160 sheet (30 per page)", w: 2.625, h: 1, sheet: true },
} as const;
export type LabelSize = keyof typeof LABEL_SIZES;
