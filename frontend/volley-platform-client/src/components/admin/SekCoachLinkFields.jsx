import { useEffect, useState } from "react";

import { Button, Input } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

/**
 * Разпознаване на локален треньор в СЕК (db.bvf.bg) за FirstCoachId.
 * mode: self | proxy | none
 */
export default function SekCoachLinkFields({
  clubId,
  value,
  onChange,
  toast,
  disabled = false,
}) {
  const mode = value?.sek_link_mode || "none";
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const clubLinked = Boolean(clubId);

  useEffect(() => {
    setCoaches([]);
    setLoadError("");
  }, [clubId]);

  const patch = (partial) => onChange?.({ ...value, ...partial });

  const loadCoaches = async () => {
    if (!clubId) {
      toast?.error("Първо избери клуб.");
      return;
    }
    try {
      setLoading(true);
      setLoadError("");
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_COACHES_LIST, {
        club_id: Number(clubId),
      });
      const list = Array.isArray(res.data?.coaches) ? res.data.coaches : [];
      setCoaches(list);
      if (!list.length) {
        setLoadError("Няма треньори в СЕК за този клуб (или липсва ApiKey).");
      } else {
        toast?.success(`Заредени ${list.length} треньори от СЕК.`);
      }
    } catch (err) {
      const msg = normalizeError(err, "Неуспешно зареждане на треньори от СЕК.");
      setLoadError(msg);
      toast?.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const onSelectSelf = (idStr) => {
    const id = idStr ? Number(idStr) : null;
    const row = coaches.find((c) => Number(c.id) === id);
    patch({
      sek_link_mode: "self",
      bvf_coach_id: id,
      bvf_coach_name: row?.name || (id ? `БФВ #${id}` : ""),
      bvf_first_coach_proxy_id: null,
      bvf_first_coach_proxy_name: "",
    });
  };

  const onSelectProxy = (idStr) => {
    const id = idStr ? Number(idStr) : null;
    const row = coaches.find((c) => Number(c.id) === id);
    patch({
      sek_link_mode: "proxy",
      bvf_coach_id: null,
      bvf_coach_name: "",
      bvf_first_coach_proxy_id: id,
      bvf_first_coach_proxy_name: row?.name || (id ? `БФВ #${id}` : ""),
    });
  };

  const selectedSelf =
    mode === "self" && value?.bvf_coach_id != null ? String(value.bvf_coach_id) : "";
  const selectedProxy =
    mode === "proxy" && value?.bvf_first_coach_proxy_id != null
      ? String(value.bvf_first_coach_proxy_id)
      : "";

  const selfOptionMissing =
    selectedSelf && !coaches.some((c) => String(c.id) === selectedSelf);
  const proxyOptionMissing =
    selectedProxy && !coaches.some((c) => String(c.id) === selectedProxy);

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 12,
        border: "1px solid #dce5f2",
        borderRadius: 12,
        background: "#f8fafc",
      }}
    >
      <div>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Разпознаване в СЕК (БФВ)</div>
        <div style={{ fontSize: 12, color: "#5f708c", marginTop: 2 }}>
          Нужно за FirstCoachId при създаване на състезател във федерацията. Без това треньорът
          работи нормално в платформата.
        </div>
      </div>

      {!clubLinked ? (
        <p style={{ margin: 0, fontSize: 13, color: "#b45309" }}>Избери клуб, за да свържеш със СЕК.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled || loading}
              onClick={loadCoaches}
            >
              {loading ? "Зареждане…" : "Зареди треньори от СЕК"}
            </Button>
            {value?.bvf_coach_name || value?.bvf_first_coach_proxy_name ? (
              <span style={{ fontSize: 12, color: "#166534" }}>
                Текущо:{" "}
                {mode === "self"
                  ? value.bvf_coach_name
                  : mode === "proxy"
                    ? `прокси → ${value.bvf_first_coach_proxy_name}`
                    : "—"}
              </span>
            ) : null}
          </div>
          {loadError ? (
            <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>{loadError}</p>
          ) : null}

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Режим</span>
            <Input
              as="select"
              value={mode}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.value;
                if (next === "none") {
                  patch({
                    sek_link_mode: "none",
                    bvf_coach_id: null,
                    bvf_coach_name: "",
                    bvf_first_coach_proxy_id: null,
                    bvf_first_coach_proxy_name: "",
                    set_as_club_default_first_coach: false,
                  });
                } else if (next === "self") {
                  patch({
                    sek_link_mode: "self",
                    bvf_first_coach_proxy_id: null,
                    bvf_first_coach_proxy_name: "",
                  });
                } else {
                  patch({
                    sek_link_mode: "proxy",
                    bvf_coach_id: null,
                    bvf_coach_name: "",
                    set_as_club_default_first_coach: false,
                  });
                }
              }}
            >
              <option value="none">Без разпознаване (ползва клубен default)</option>
              <option value="self">Този треньор е в СЕК (лицензиран)</option>
              <option value="proxy">Няма лиценз — прокси лицензиран треньор</option>
            </Input>
          </label>

          {mode === "self" ? (
            <>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Треньор в СЕК *</span>
                <Input
                  as="select"
                  value={selectedSelf}
                  disabled={disabled || (!coaches.length && !selectedSelf)}
                  onChange={(e) => onSelectSelf(e.target.value)}
                >
                  <option value="">{coaches.length ? "Избери" : "Зареди списъка от СЕК"}</option>
                  {selfOptionMissing ? (
                    <option value={selectedSelf}>
                      {value?.bvf_coach_name || `БФВ #${selectedSelf}`} (запазен)
                    </option>
                  ) : null}
                  {coaches.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </Input>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={Boolean(value?.set_as_club_default_first_coach)}
                  disabled={disabled || !selectedSelf}
                  onChange={(e) => patch({ set_as_club_default_first_coach: e.target.checked })}
                />
                Задай като клубен default FirstCoach (за треньори без собствен СЕК id)
              </label>
            </>
          ) : null}

          {mode === "proxy" ? (
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Прокси треньор в СЕК *</span>
              <Input
                as="select"
                value={selectedProxy}
                disabled={disabled || (!coaches.length && !selectedProxy)}
                onChange={(e) => onSelectProxy(e.target.value)}
              >
                <option value="">{coaches.length ? "Избери" : "Зареди списъка от СЕК"}</option>
                {proxyOptionMissing ? (
                  <option value={selectedProxy}>
                    {value?.bvf_first_coach_proxy_name || `БФВ #${selectedProxy}`} (запазен)
                  </option>
                ) : null}
                {coaches.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </Input>
            </label>
          ) : null}
        </>
      )}
    </div>
  );
}

export function emptySekLinkValue() {
  return {
    sek_link_mode: "none",
    bvf_coach_id: null,
    bvf_coach_name: "",
    bvf_first_coach_proxy_id: null,
    bvf_first_coach_proxy_name: "",
    set_as_club_default_first_coach: false,
  };
}

export function sekLinkFromCoach(coach) {
  const status = coach?.sek_link_status || (coach?.bvf_coach_id ? "self" : coach?.bvf_first_coach_proxy_id ? "proxy" : "none");
  return {
    sek_link_mode: status,
    bvf_coach_id: coach?.bvf_coach_id ?? null,
    bvf_coach_name: coach?.bvf_coach_name || "",
    bvf_first_coach_proxy_id: coach?.bvf_first_coach_proxy_id ?? null,
    bvf_first_coach_proxy_name: coach?.bvf_first_coach_proxy_name || "",
    set_as_club_default_first_coach: false,
  };
}

export function sekLinkPayload(value) {
  const mode = value?.sek_link_mode || "none";
  const payload = { sek_link_mode: mode };
  if (mode === "self") {
    payload.bvf_coach_id = value.bvf_coach_id != null ? Number(value.bvf_coach_id) : null;
    payload.bvf_coach_name = value.bvf_coach_name || null;
    payload.set_as_club_default_first_coach = Boolean(value.set_as_club_default_first_coach);
  } else if (mode === "proxy") {
    payload.bvf_first_coach_proxy_id =
      value.bvf_first_coach_proxy_id != null ? Number(value.bvf_first_coach_proxy_id) : null;
    payload.bvf_first_coach_proxy_name = value.bvf_first_coach_proxy_name || null;
  }
  return payload;
}
