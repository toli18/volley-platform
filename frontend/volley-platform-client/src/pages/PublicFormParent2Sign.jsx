import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { Button, Card } from "../components/ui";
import SignaturePad from "../components/parentPortal/SignaturePad";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { normalizeError } from "../utils/normalizeError";

/**
 * Публичен екран: само подпис на родител 2 към вече записана Форма 0-3.
 */
export default function PublicFormParent2Sign() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [meta, setMeta] = useState(null);
  const [sig, setSig] = useState(null);

  const path = useMemo(() => (token ? API_PATHS.PUBLIC_CARDING_PARENT2(token) : null), [token]);

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
        }
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
    if (!sig) {
      setError("Нарисувай подписа на родител 2.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      await axiosInstance.post(path, {
        signature_parent2_image: sig,
        signature_parent2: meta?.parent2_full_name || null,
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
        <Card title="Форма 0-3 — родител 2">
          <p>Зареждане…</p>
        </Card>
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <Card title="Форма 0-3 — родител 2">
          <p style={{ color: "#b91c1c" }}>{error}</p>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <Card title="Форма 0-3 — родител 2">
          <p style={{ margin: 0 }}>
            {meta?.already_signed || !meta?.needs_sign
              ? "Подписът на родител 2 вече е записан. Можеш да затвориш този прозорец."
              : "Готово — подписът на родител 2 е добавен към Форма 0-3. Другите подписи са запазени."}
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
      <Card title="Форма 0-3 — подпис родител 2">
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
          {meta?.athlete_name}
          {meta?.club_name ? ` · ${meta.club_name}` : ""}
          {meta?.season_label ? ` · сезон ${meta.season_label}` : ""}
        </p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
          Формата вече е подписана от родител 1
          {meta?.parent1_full_name ? ` (${meta.parent1_full_name})` : ""}. Добавете само подписа на{" "}
          <strong>{meta?.parent2_full_name || "родител 2"}</strong> — първият подпис се запазва.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 8 }}>
          <SignaturePad
            label={`Подпис — ${meta?.parent2_full_name || "родител 2"}`}
            required
            disabled={busy}
            onChange={setSig}
          />
          {error ? <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Запис…" : "Добави подпис"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
