/**
 * EAN-13 barcodes (the kind on groceries; a 12-digit UPC-A is the same
 * barcode with a leading 0). Used to print stickers for food made in house.
 * Codes starting with 2 are reserved for in-store use, so store codes never
 * clash with a real product.
 */

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLG", "LGLGGL", "LGLGLG", "LGGLGL"];

/** Check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** A stored code as a printable EAN-13 (UPC-A gets its leading 0), or null. */
export function asEan13(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = /^\d{12}$/.test(code) ? `0${code}` : code;
  if (!/^\d{13}$/.test(c)) return null;
  return ean13CheckDigit(c.slice(0, 12)) === Number(c[12]) ? c : null;
}

/** 95 modules: "1" = bar, "0" = space. */
export function ean13Modules(code: string): string {
  const c = asEan13(code);
  if (!c) throw new Error("Not a valid EAN-13");
  const parity = PARITY[Number(c[0])];
  let out = "101";
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === "L" ? L : G)[Number(c[i])];
  out += "01010";
  for (let i = 7; i <= 12; i++) out += R[Number(c[i])];
  return out + "101";
}

/** Next in-store code: "21" + 10-digit number + check digit. */
export function storeCode(n: number): string {
  const first12 = `21${String(n).padStart(10, "0")}`;
  return first12 + ean13CheckDigit(first12);
}
