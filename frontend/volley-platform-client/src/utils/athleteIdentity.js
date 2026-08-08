export const DEFAULT_NATIONALITY = "България";

export function composeAthleteName(first, middle, last, fallback = "") {
  const parts = [first, middle, last].map((s) => String(s || "").trim()).filter(Boolean);
  if (parts.length) return parts.join(" ");
  return String(fallback || "").trim();
}

export function emptyAthleteIdentityForm(overrides = {}) {
  return {
    first_name: "",
    middle_name: "",
    last_name: "",
    athlete_name: "",
    athlete_phone: "",
    parent_name: "",
    parent_phone: "",
    birth_date: "",
    birth_year: "",
    place_of_birth: "",
    nationality: DEFAULT_NATIONALITY,
    gender: "",
    notes: "",
    is_active: true,
    egn: "",
    ...overrides,
  };
}

export function athleteToIdentityForm(athlete) {
  if (!athlete) return emptyAthleteIdentityForm();
  return emptyAthleteIdentityForm({
    first_name: athlete.first_name || "",
    middle_name: athlete.middle_name || "",
    last_name: athlete.last_name || "",
    athlete_name: athlete.athlete_name || "",
    athlete_phone: athlete.athlete_phone || "",
    parent_name: athlete.parent_name || "",
    parent_phone: athlete.parent_phone || "",
    birth_date: athlete.birth_date ? String(athlete.birth_date).slice(0, 10) : "",
    birth_year: athlete.birth_year ? String(athlete.birth_year) : "",
    place_of_birth: athlete.place_of_birth || "",
    nationality: athlete.nationality || DEFAULT_NATIONALITY,
    gender: athlete.gender || "",
    notes: athlete.notes || "",
    is_active: athlete.is_active !== false,
    egn: athlete.egn || "",
  });
}

/** Validate create/update form. Returns error string or null.
 * mode: "full" (edit / legacy) | "minimal" (coach quick create)
 */
export function validateAthleteIdentityForm(
  form,
  { requireEgn = false, requireSplitNames = false, mode = "full" } = {},
) {
  if (mode === "minimal") {
    const first = (form.first_name || "").trim();
    if (first.length < 3) return "Собственото име трябва да е поне 3 символа.";
    const year = Number(form.birth_year);
    if (!Number.isFinite(year) || year < 1970 || year > new Date().getFullYear()) {
      return "Попълни валидна година на раждане.";
    }
    if (!(form.parent_phone || "").trim() || String(form.parent_phone).trim().length < 6) {
      return "Телефонът на родителя е задължителен.";
    }
    if (!form.gender) return "Избери пол.";
    return null;
  }

  const first = (form.first_name || "").trim();
  const middle = (form.middle_name || "").trim();
  const last = (form.last_name || "").trim();
  const legacy = (form.athlete_name || "").trim();
  const hasSplit = Boolean(first || middle || last);

  if (requireSplitNames || hasSplit) {
    if (first.length < 3) return "Собственото име трябва да е поне 3 символа.";
    if (middle.length < 3) return "Бащиното име трябва да е поне 3 символа.";
    if (last.length < 3) return "Фамилията трябва да е поне 3 символа.";
  } else if (!legacy) {
    return "Попълни трите имена.";
  }

  if (!form.birth_date) return "Датата на раждане е задължителна.";
  if (!(form.place_of_birth || "").trim()) return "Градът на раждане е задължителен.";
  if (!form.gender) return "Избери пол.";
  if (requireEgn && !(form.egn || "").trim()) return "ЕГН е задължително.";
  return null;
}

export function buildAthletePayload(form, { includeEgn = true, mode = "full" } = {}) {
  const first = (form.first_name || "").trim();
  const middle = (form.middle_name || "").trim();
  const last = (form.last_name || "").trim();
  const place = (form.place_of_birth || "").trim();
  const nationality = (form.nationality || "").trim() || DEFAULT_NATIONALITY;

  if (mode === "minimal") {
    const payload = {
      first_name: first,
      parent_phone: (form.parent_phone || "").trim(),
      birth_year: Number(form.birth_year),
      gender: form.gender || null,
      athlete_name: first,
      is_active: Boolean(form.is_active),
      notes: (form.notes || "").trim() || null,
    };
    return payload;
  }

  const payload = {
    athlete_phone: (form.athlete_phone || "").trim() || null,
    parent_name: (form.parent_name || "").trim() || null,
    parent_phone: (form.parent_phone || "").trim() || null,
    birth_date: form.birth_date || null,
    place_of_birth: place || null,
    nationality,
    gender: form.gender || null,
    notes: (form.notes || "").trim() || null,
    is_active: Boolean(form.is_active),
  };

  if (first || middle || last) {
    payload.first_name = first;
    payload.middle_name = middle;
    payload.last_name = last;
    payload.athlete_name = composeAthleteName(first, middle, last);
  } else {
    payload.athlete_name = (form.athlete_name || "").trim();
  }

  if (includeEgn) {
    payload.egn = (form.egn || "").trim() || null;
  }

  return payload;
}
