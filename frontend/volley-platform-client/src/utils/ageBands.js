/** Единен източник за възрастови групи БФВ в UI. */

export const BVF_AGE_BANDS = [
  { value: "mini", label: "Mini (8–10 г.)", textbook: true, library: true },
  { value: "U13", label: "U13 (12–13 г.)", textbook: true, library: true },
  { value: "U14", label: "U14", textbook: true, library: true },
  { value: "U15", label: "U15 (→ U16)", textbook: true, library: true },
  { value: "U16", label: "U16", textbook: true, library: true },
  { value: "U17", label: "U17 (→ U18)", textbook: true, library: true },
  { value: "U18", label: "U18", textbook: true, library: true },
];

export const TEXTBOOK_AGE_FILTER_OPTIONS = [
  "all",
  ...BVF_AGE_BANDS.filter((b) => b.textbook).map((b) => b.value),
];

export const NATIONAL_LIBRARY_AGE_OPTIONS = BVF_AGE_BANDS.filter((b) => b.library).map((b) => ({
  value: b.value,
  label: b.label,
}));

export const PLAN_BAND_ORDER = ["mini", "U13", "U14", "U16", "U18"];

export const PLAN_BAND_LABELS = Object.fromEntries(BVF_AGE_BANDS.map((b) => [b.value, b.label]));

export const AGE_BAND_TO_YEARS = {
  mini: 11,
  U13: 13,
  U14: 14,
  U15: 15,
  U16: 16,
  U17: 17,
  U18: 18,
};

export const FORM_AGE_YEAR_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 10);
