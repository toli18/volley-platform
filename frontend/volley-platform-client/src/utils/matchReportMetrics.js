/** Derived box-score metrics for match report UI + PDF. */

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round1(v) {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Math.round(Number(v) * 10) / 10;
}

export function serveTotal(row) {
  return num(row.aces) + num(row.serve_in) + num(row.serve_err);
}

export function passPosPct(row) {
  const t = num(row.pass_total);
  if (!t) return null;
  return round1(((num(row.pass_hash) + num(row.pass_plus)) / t) * 100);
}

export function passPerfPct(row) {
  const t = num(row.pass_total);
  if (!t) return null;
  return round1((num(row.pass_hash) / t) * 100);
}

/** Attack efficiency: (kills - errors) / attempts. */
export function attackEffPct(row) {
  const att = num(row.attack_attempts);
  if (!att) return null;
  return round1(((num(row.kills) - num(row.attack_err)) / att) * 100);
}

export function fmtPct(v) {
  if (v == null) return "·";
  return `${v}%`;
}

export function fmtCell(v) {
  if (v == null || v === "" || v === 0) return "·";
  return v;
}

export function fmtDiff(v) {
  const n = num(v);
  if (n > 0) return `+${n}`;
  return String(n);
}

const SUM_KEYS = [
  "points",
  "kills",
  "attack_zero",
  "attack_err",
  "attack_attempts",
  "aces",
  "serve_in",
  "serve_err",
  "blocks",
  "digs",
  "pass_hash",
  "pass_plus",
  "pass_minus",
  "pass_err",
  "pass_total",
  "set_hash",
  "set_plus",
  "set_minus",
  "set_err",
  "set_total",
  "indiv_err",
  "errors",
];

export function sumAthletes(rows = []) {
  const tot = Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
  for (const row of rows) {
    for (const k of SUM_KEYS) tot[k] += num(row[k]);
  }
  tot.attack_pct = tot.attack_attempts
    ? round1((tot.kills / tot.attack_attempts) * 100)
    : null;
  if (tot.pass_total) {
    const pts = tot.pass_hash * 3 + tot.pass_plus * 2 + tot.pass_minus;
    tot.pass_avg = round1(pts / tot.pass_total);
  } else {
    tot.pass_avg = null;
  }
  if (tot.set_total) {
    const pts = tot.set_hash * 3 + tot.set_plus * 2 + tot.set_minus;
    tot.set_avg = round1(pts / tot.set_total);
  } else {
    tot.set_avg = null;
  }
  return tot;
}

/** Compact insight chips from report insights + KPIs. */
export function buildInsightChips(report, { sideOut, byRotation } = {}) {
  const chips = [];
  const so = sideOut || report?.side_out;
  if (so?.side_out_attempts) {
    chips.push({
      id: "so",
      label: "Side-out",
      value: `${so.side_out_won || 0}/${so.side_out_attempts || 0}`,
      sub: so.side_out_pct != null ? `${so.side_out_pct}%` : "",
      tone: so.side_out_pct != null && so.side_out_pct >= 55 ? "good" : "neutral",
    });
  }
  if (so?.break_attempts) {
    chips.push({
      id: "bp",
      label: "Break",
      value: `${so.break_won || 0}/${so.break_attempts || 0}`,
      sub: so.break_pct != null ? `${so.break_pct}%` : "",
      tone: so.break_pct != null && so.break_pct >= 40 ? "good" : "neutral",
    });
  }
  if (so && ((so.points_for || 0) > 0 || (so.points_against || 0) > 0)) {
    const diff = num(so.points_for) - num(so.points_against);
    chips.push({
      id: "pts",
      label: "Точки",
      value: `${so.points_for || 0}:${so.points_against || 0}`,
      sub: fmtDiff(diff),
      tone: diff > 0 ? "good" : diff < 0 ? "bad" : "neutral",
    });
  }

  const rots = byRotation || report?.by_rotation || [];
  const withPlay = rots.filter((r) => num(r.points_for) + num(r.points_against) >= 2);
  if (withPlay.length) {
    const best = withPlay.reduce((a, b) => (num(b.point_diff) > num(a.point_diff) ? b : a));
    if (num(best.point_diff) > 0) {
      chips.push({
        id: "rot",
        label: "Силна ротация",
        value: `R${best.rotation}`,
        sub: fmtDiff(best.point_diff),
        tone: "good",
      });
    }
  }

  const athletes = report?.athletes || [];
  const withPts = athletes.filter((a) => num(a.points) > 0);
  if (withPts.length) {
    const top = withPts.reduce((a, b) => (num(b.points) > num(a.points) ? b : a));
    chips.push({
      id: "mvp",
      label: "Топ точки",
      value: `#${top.jersey_number || "·"}`,
      sub: `${top.points} т.`,
      tone: "accent",
    });
  }

  return chips;
}
