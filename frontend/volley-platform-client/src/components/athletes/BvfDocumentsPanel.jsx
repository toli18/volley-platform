import { useState } from "react";

import { Button, Input } from "../ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

/**
 * Документи като мост към БФВ — метаданни + upload (файлът не се пази при нас).
 */
export default function BvfDocumentsPanel({ athleteId, toast }) {
  const { permanent, tokenBody, appendToken } = useClubBvfLink();
  const [token, setToken] = useState("");
  const [docs, setDocs] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState("2");
  const [description, setDescription] = useState(`Форма картотекиране ${new Date().getFullYear()}`);
  const [file, setFile] = useState(null);

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

  const upload = async () => {
    if (!canCallBvf || !file) {
      toast?.error(canCallBvf ? "Избери файл." : "Оторизирай клуба или постави token.");
      return;
    }
    const form = new FormData();
    form.append("athlete_id", String(athleteId));
    appendToken(form, token);
    form.append("doc_type", String(docType));
    form.append("description", description.trim());
    form.append("start_date", `${seasonYear}-01-01T00:00:00`);
    form.append("end_date", `${seasonYear}-12-31T00:00:00`);
    form.append("file", file);
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_DOCS_UPLOAD, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDocs(res.data?.documents || []);
      setChecklist(res.data?.checklist || []);
      setFile(null);
      toast?.success("Документът е изпратен към БФВ.");
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно качване."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
        Файловете отиват директно в db.bvf.bg. При нас остават само тип, описание и дати.
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
        <p className="uiMuted" style={{ margin: 0, fontSize: 12 }}>Няма заредени метаданни — sync първо.</p>
      )}

      <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "4px 0" }} />
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Тип</span>
        <select className="uiInput" value={docType} onChange={(e) => setDocType(e.target.value)}>
          <option value="2">Форма 03 / 03-А (картотекиране)</option>
          <option value="0">Договор / документ</option>
          <option value="1">Медицински</option>
          <option value="3">Друг</option>
        </select>
      </label>
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание" />
      <input type="file" accept=".pdf,image/*,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <Button type="button" size="sm" disabled={busy || !file || !canCallBvf} onClick={upload}>
        Изпрати към БФВ
      </Button>
      <p className="uiMuted" style={{ margin: 0, fontSize: 12 }}>
        Форма 03 / 03-А за списъците се попълва онлайн от родителя след отваряне на сезона
        (Картотекиране). Тук може само да качите PDF копие към БФВ.
      </p>
    </div>
  );
}
