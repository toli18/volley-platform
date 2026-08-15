import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { Button, Card, Input } from "../components/ui";
import SignaturePad from "../components/parentPortal/SignaturePad";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { normalizeError } from "../utils/normalizeError";

/**
 * Публичен екран за подпис на Форма 0-3 B по линк (без логин).
 */
export default function PublicForm03bSign() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [meta, setMeta] = useState(null);
  const [city, setCity] = useState("");
  const [fullName, setFullName] = useState("");
  const [egn, setEgn] = useState("");
  const [rules, setRules] = useState(false);
  const [sig, setSig] = useState(null);

  const path = useMemo(() => (token ? API_PATHS.PUBLIC_CARDING_03B(token) : null), [token]);

  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(path);
        if (cancelled) return;
        const d = res.data || {};
        setMeta(d);
        if (!d.needs_sign) {
          setDone(true);
          return;
        }
        const pre = d.prefill || {};
        const composed = [pre.athlete_first_name, pre.athlete_middle_name, pre.athlete_last_name]
          .filter(Boolean)
          .join(" ");
        setFullName(composed || d.athlete_name || "");
        setEgn(pre.athlete_egn || "");
        setCity(pre.city || "");
      } catch (err) {
        if (!cancelled) setError(normalizeError(err, "Линкът е невалиден или изтекъл."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!path) return;
    if (!rules) {
      setError("Потвърди приемането на правилата на БФВ.");
      return;
    }
    if (!sig) {
      setError("Нарисувай подписа си в полето.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      await axiosInstance.post(path, {
        city: city.trim() || null,
        rules_accepted: true,
        signature_athlete_image: sig,
        athlete_full_name: fullName.trim() || null,
        athlete_egn: egn.trim() || null,
      });
      setDone(true);
    } catch (err) {
      setError(normalizeError(err, "Неуспешен подпис."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <Card title="Форма 0-3 B">
          <p>Зареждане…</p>
        </Card>
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <Card title="Форма 0-3 B">
          <p style={{ color: "#b91c1c" }}>{error}</p>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <Card title="Форма 0-3 B">
          <p style={{ margin: 0 }}>
            {meta?.already_signed || !meta?.needs_sign
              ? "Формата вече е подписана. Можеш да затвориш този прозорец."
              : "Готово — Форма 0-3 B е подписана. Можеш да затвориш този прозорец."}
          </p>
          {meta?.athlete_name ? (
            <p className="uiMuted" style={{ marginTop: 8 }}>
              {meta.athlete_name}
              {meta.season_label ? ` · сезон ${meta.season_label}` : ""}
            </p>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "24px auto", padding: 16 }}>
      <Card title="Форма 0-3 B — подпис">
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
          {meta?.athlete_name}
          {meta?.club_name ? ` · ${meta.club_name}` : ""}
          {meta?.season_label ? ` · сезон ${meta.season_label}` : ""}
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <Input label="Трите имена" value={fullName} onChange={(e) => setFullName(e.target.value)} required disabled={busy} />
          <Input
            label="ЕГН"
            value={egn}
            onChange={(e) => setEgn(e.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            required
            disabled={busy}
          />
          <Input label="Град" value={city} onChange={(e) => setCity(e.target.value)} disabled={busy} />
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
            С подписване декларирам, че съм запознат/а и се задължавам да спазвам устава, правилниците и
            наредбите на БФВ.
          </p>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <input type="checkbox" checked={rules} onChange={(e) => setRules(e.target.checked)} disabled={busy} />
            <span>Потвърждавам приемането на правилата на БФВ</span>
          </label>
          <SignaturePad label="Подпис на състезателя" required disabled={busy} onChange={setSig} />
          {error ? <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Запис…" : "Подпиши"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
