/** Team/group composition gender (not athlete biological gender). */
export const TEAM_GENDER_OPTIONS = [
  { value: "male", label: "Мъжки" },
  { value: "female", label: "Женски" },
  { value: "mixed", label: "Смесени" },
];

export function teamGenderLabel(gender) {
  if (gender === "male") return "Мъжки";
  if (gender === "female") return "Женски";
  if (gender === "mixed") return "Смесени";
  return "—";
}

export function teamGenderShort(gender) {
  if (gender === "male") return "М";
  if (gender === "female") return "Ж";
  if (gender === "mixed") return "См";
  return "";
}

export function teamGenderSuffix(gender) {
  const short = teamGenderShort(gender);
  return short ? ` · ${short}` : "";
}

export function teamGenderHubClass(gender) {
  if (gender === "male") return " teamsHubItem--male";
  if (gender === "female") return " teamsHubItem--female";
  if (gender === "mixed") return " teamsHubItem--mixed";
  return "";
}
