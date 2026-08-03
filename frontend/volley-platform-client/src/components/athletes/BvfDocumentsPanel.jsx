import { useState } from "react";

import { Button } from "../ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

/**
 * Документи БФВ — само sync на метаданни.
 * Форма 03 / 03-А се попълва онлайн от родителя; ръчно качване на файл е скрито.
 */
export default function BvfDocumentsPanel({ athleteId, toast }) {
  const { permanent, tokenBody } = useClubBvfLink();
  const [token, setToken] = useState("");
  const [docs, setDocs] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState(false);

  const canCallBvf = permanent || Boolean(token.trim());

  const sync = async () => {
    if (!canCallBvf) {
      toast?.error("Първо оторизирай клуба в Администрация БФВ или постави token.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_DOCS_SYNC, {
        ...tokenBody(token),
        athlete_id: athleteId,
      });
      setDocs(res.data?.documents || []);
      setChecklist(res.data?.checklist || []);
      setSeasonYear(res.data?.season_year || seasonYear);
      toast?.success(`Документи: ${(res.data?.documents || []).length}`);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешен sync на документи."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
        Форма 03 / 03-А се попълва онлайн от родителя. Тук се синхронизират само метаданните от БФВ
        (тип, описание, дати) — без ръчно качване на файл.
      </p>
      {permanent ? (
        <p style={{ margin: 0, fontSize: 13, color: "#166534" }}>Постоянна връзка с БФВ — token не е нужен.</p>
      ) : (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>БФВ token</span>
          <textarea
            className="uiInput"
            rows={2}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
          />
        </label>
      )}
      <Button type="button" size="sm" variant="secondary" disabled={busy || !canCallBvf} onClick={sync}>
        Синхронизирай документи
      </Button>

      {checklist.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {checklist.map((c) => (
            <li key={c.key} style={{ color: c.ok ? "#166534" : "#92400e" }}>
              {c.ok ? "✓" : "○"} {c.label}
            </li>
          ))}
        </ul>
      ) : null}

      {docs.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {docs.map((d) => (
            <li key={d.bvf_document_id}>
              {d.type_label || "Документ"}
              {d.description ? ` — ${d.description}` : ""}
              {d.season_year ? ` (${d.season_year})` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="uiMuted" style={{ margin: 0, fontSize: 12 }}>
          Няма заредени метаданни — sync първо.
        </p>
      )}
    </div>
  );
}
