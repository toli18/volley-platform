const eurFormatter = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** @param {number|string|null|undefined} amount */
export function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return eurFormatter.format(n);
}

export const AMOUNT_INPUT_PLACEHOLDER = "Сума (€)";
