import { useCallback, useEffect, useState } from "react";

import { Button, Input } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

/**
 * Свързване с лицензиран треньор от СЕК.
 * mode: self | proxy | none
 *
 * onSuggestLocalName — при избор на лицензиран (self) предлага име за локалния профил.
 */
export default function SekCoachLinkFields({
  clubId,
  value,
  onChange,
  onSuggestLocalName,
  toast,
  disabled = false,
  autoLoad = true,
}) {
  const mode = value?.sek_link_mode || "none";
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const clubLinked = Boolean(clubId);

  const loadCoaches = useCallback(
    async ({ silent = false } = {}) => {
      if (!clubId) return;
      try {
        setLoading(true);
        setLoadError("");
        const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_COACHES_LIST, {
          club_id: Number(clubId),
        });
        const list = Array.isArray(res.data?.coaches) ? res.data.coaches : [];
        setCoaches(list);
        if (!list.length) {
          setLoadError("Няма лицензирани треньори в СЕК за този клуб (или липсва ApiKey).");
        } else if (!silent) {
          toast?.success(`Заредени ${list.length} лицензирани треньори.`);
        }
      } catch (err) {
        const msg = normalizeError(err, "Неуспешно зареждане на треньори от СЕК.");
        setLoadError(msg);
        if (!silent) toast?.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [clubId, toast]
  );

  useEffect(() => {
    setCoaches([]);
    setLoadError("");
    if (!clubId || !autoLoad) return;
    loadCoaches({ silent: true });
  }, [clubId, autoLoad, loadCoaches]);

  const patch = (partial) => onChange?.({ ...value, ...partial });

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

  /** Главният dropdown: "" = без лиценз, иначе SEK id */
  const primaryValue = mode === "self" && selectedSelf ? selectedSelf : "";

  const onPickPrimary = (idStr) => {
    if (!idStr) {
      // Без собствен лиценз — запазваме евентуален прокси, иначе none
      if (value?.bvf_first_coach_proxy_id) {
        patch({
          sek_link_mode: "proxy",
          bvf_coach_id: null,
          bvf_coach_name: "",
          set_as_club_default_first_coach: false,
        });
      } else {
        patch({
          sek_link_mode: "none",
          bvf_coach_id: null,
          bvf_coach_name: "",
          bvf_first_coach_proxy_id: null,
          bvf_first_coach_proxy_name: "",
          set_as_club_default_first_coach: false,
        });
      }
      return;
    }
    const id = Number(idStr);
    const row = coaches.find((c) => Number(c.id) === id);
    const label = row?.name || `БФВ #${id}`;
    patch({
      sek_link_mode: "self",
      bvf_coach_id: id,
      bvf_coach_name: label,
      bvf_first_coach_proxy_id: null,
      bvf_first_coach_proxy_name: "",
    });
    onSuggestLocalName?.(label);
  };

  const onPickProxy = (idStr) => {
    if (!idStr) {
      patch({
        sek_link_mode: "none",
        bvf_coach_id: null,
        bvf_coach_name: "",
        bvf_first_coach_proxy_id: null,
        bvf_first_coach_proxy_name: "",
        set_as_club_default_first_coach: false,
      });
      return;
    }
    const id = Number(idStr);
    const row = coaches.find((c) => Number(c.id) === id);
    patch({
      sek_link_mode: "proxy",
      bvf_coach_id: null,
      bvf_coach_name: "",
      bvf_first_coach_proxy_id: id,
      bvf_first_coach_proxy_name: row?.name || `БФВ #${id}`,
      set_as_club_default_first_coach: false,
    });
  };

  const showProxy = mode !== "self";

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
        <div style={{ fontWeight: 800, fontSize: 14 }}>Лиценз в СЕК (БФВ)</div>
        <div style={{ fontSize: 12, color: "#5f708c", marginTop: 2 }}>
          Избери име от списъка с лицензирани треньори. Локалното име в платформата се редактира
          отделно.
        </div>
      </div>

      {!clubLinked ? (
        <p style={{ margin: 0, fontSize: 13, color: "#b45309" }}>Първо избери клуб.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {loading ? (
              <span style={{ fontSize: 12, color: "#5f708c" }}>Зареждане…</span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => loadCoaches({ silent: false })}
              >
                Опресни списъка
              </Button>
            )}
            {coaches.length ? (
              <span style={{ fontSize: 12, color: "#166534" }}>{coaches.length} в СЕК</span>
            ) : null}
          </div>
          {loadError ? (
            <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>{loadError}</p>
          ) : null}

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Лицензиран треньор *</span>
            <Input
              as="select"
              value={primaryValue}
              disabled={disabled || (loading && !coaches.length && !primaryValue)}
              onChange={(e) => onPickPrimary(e.target.value)}
            >
              <option value="">— Няма лиценз в СЕК —</option>
              {selfOptionMissing ? (
                <option value={selectedSelf}>
                  {value?.bvf_coach_name || `БФВ #${selectedSelf}`} (текущ)
                </option>
              ) : null}
              {coaches.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Input>
          </label>

          {mode === "self" && primaryValue ? (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={Boolean(value?.set_as_club_default_first_coach)}
                disabled={disabled}
                onChange={(e) => patch({ set_as_club_default_first_coach: e.target.checked })}
              />
              Клубен default FirstCoach (за треньори без собствен лиценз)
            </label>
          ) : null}

          {showProxy ? (
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                Прокси FirstCoach (ако няма собствен лиценз)
              </span>
              <Input
                as="select"
                value={selectedProxy}
                disabled={disabled || (loading && !coaches.length && !selectedProxy)}
                onChange={(e) => onPickProxy(e.target.value)}
              >
                <option value="">Клубен default / без прокси</option>
                {proxyOptionMissing ? (
                  <option value={selectedProxy}>
                    {value?.bvf_first_coach_proxy_name || `БФВ #${selectedProxy}`} (текущ)
                  </option>
                ) : null}
                {coaches.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </Input>
              <span style={{ fontSize: 11, color: "#5f708c" }}>
                Нужно само ако треньорът не е в СЕК, а създавате състезатели във федерацията.
              </span>
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
  const status =
    coach?.sek_link_status ||
    (coach?.bvf_coach_id ? "self" : coach?.bvf_first_coach_proxy_id ? "proxy" : "none");
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
