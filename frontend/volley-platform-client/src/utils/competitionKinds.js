export const COMPETITION_KIND_OPTIONS = [
  { value: "championship", label: "Първенство" },
  { value: "tournament", label: "Турнир" },
  { value: "control", label: "Контролна" },
  { value: "friendly", label: "Приятелска" },
];

export const isCompetitionEvent = (item) => String(item?.event_type || "training") === "competition";

export const competitionKindLabel = (item) => {
  if (item?.competition_kind_label) return item.competition_kind_label;
  const found = COMPETITION_KIND_OPTIONS.find((o) => o.value === item?.competition_kind);
  return found?.label || "Състезание";
};

/** Distinct style for competition blocks in calendars */
export const competitionBlockStyle = {
  border: "1px solid #f59e0b",
  background: "linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)",
  color: "#9a3412",
};
