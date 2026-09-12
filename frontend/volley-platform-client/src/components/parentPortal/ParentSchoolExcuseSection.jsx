import { useCallback, useEffect, useState } from "react";

import { Button, Card, EmptyState, Input } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError, parseApiError } from "../../utils/normalizeError";
import { useToast } from "../ToastProvider";

function formatShortDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
}

export default function ParentSchoolExcuseSection({ isSession, token, onSaved }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [schoolForm, setSchoolForm] = useState({
    school_name: "",
    school_class: "",
    school_city: "",
    school_email: "",
  });
  const [sendEmailByComp, setSendEmailByComp] = useState({});

  const listPath = isSession
    ? API_PATHS.PARENT_SCHOOL_EXCUSE_LIST_ME
    : API_PATHS.PARENT_SCHOOL_EXCUSE_LIST_TOKEN(token);
  const schoolInfoPath = isSession
    ? API_PATHS.PARENT_SCHOOL_INFO_ME
    : API_PATHS.PARENT_SCHOOL_INFO_TOKEN(token);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(listPath);
      setData(res.data);
      setSchoolForm({
        school_name: res.data?.school_name || "",
        school_class: res.data?.school_class || "",
        school_city: res.data?.school_city || "",
        school_email: res.data?.school_email || "",
      });
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на бележките."));
    } finally {
      setLoading(false);
    }
  }, [listPath, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSchoolInfo = async () => {
    if (!schoolForm.school_name.trim() || !schoolForm.school_class.trim()) {
      toast?.error("Попълнете поне училище и клас.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.patch(schoolInfoPath, {
        school_name: schoolForm.school_name.trim(),
        school_class: schoolForm.school_class.trim(),
        school_city: schoolForm.school_city.trim() || null,
        school_email: schoolForm.school_email.trim() || null,
      });
      toast?.success("Данните за училището са записани.");
      await load();
      onSaved?.();
    } catch (err) {
      toast?.error(await parseApiError(err, "Неуспешен запис."));
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async (competitionId) => {
    try {
      setBusy(true);
      const path = isSession
        ? API_PATHS.PARENT_SCHOOL_EXCUSE_PDF_ME(competitionId)
        : API_PATHS.PARENT_SCHOOL_EXCUSE_PDF_TOKEN(token, competitionId);
      const res = await axiosInstance.get(path, { responseType: "blob", timeout: 120_000 });
      const blob = res.data;
      const header = await blob.slice(0, 5).text();
      if (!header.startsWith("%PDF")) {
        throw new Error(await parseApiError({ response: { data: blob, status: res.status } }, "PDF не е генериран."));
      }
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `izvinitelna_${competitionId}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast?.error(await parseApiError(err, "Неуспешно изтегляне на PDF."));
    } finally {
      setBusy(false);
    }
  };

  const sendToSchool = async (competitionId) => {
    const email = (sendEmailByComp[competitionId] || schoolForm.school_email || "").trim();
    if (!email) {
      toast?.error("Въведете имейл на училището.");
      return;
    }
    try {
      setBusy(true);
      const path = isSession
        ? API_PATHS.PARENT_SCHOOL_EXCUSE_SEND_ME(competitionId)
        : API_PATHS.PARENT_SCHOOL_EXCUSE_SEND_TOKEN(token, competitionId);
      await axiosInstance.post(path, { school_email: email });
      toast?.success("Бележката е изпратена на училището.");
      if (!schoolForm.school_email) {
        setSchoolForm((f) => ({ ...f, school_email: email }));
      }
    } catch (err) {
      toast?.error(await parseApiError(err, "Неуспешно изпращане."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card title="Извинителни бележки">
        <p className="uiMuted">Зареждане…</p>
      </Card>
    );
  }

  if (!data?.enabled) {
    return (
      <Card title="Извинителни бележки">
        <EmptyState
          title="Функцията не е активирана"
          description="Клубът все още не е включил извинителни бележки. Свържете се с главния треньор."
        />
      </Card>
    );
  }

  const missingSchool = !data.school_name || !data.school_class;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card title="Училище на детето">
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
          Попълнете веднъж — данните се ползват за всички бъдещи бележки.
        </p>
        <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Училище</span>
            <Input
              placeholder='СУ "Васил Левски"'
              value={schoolForm.school_name}
              disabled={busy}
              onChange={(e) => setSchoolForm((f) => ({ ...f, school_name: e.target.value }))}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Клас</span>
            <Input
              placeholder="7а"
              value={schoolForm.school_class}
              disabled={busy}
              onChange={(e) => setSchoolForm((f) => ({ ...f, school_class: e.target.value }))}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Град на училището</span>
            <Input
              placeholder="гр. Троян"
              value={schoolForm.school_city}
              disabled={busy}
              onChange={(e) => setSchoolForm((f) => ({ ...f, school_city: e.target.value }))}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Имейл на училището (за изпращане)</span>
            <Input
              type="email"
              placeholder="sekretariat@school.bg"
              value={schoolForm.school_email}
              disabled={busy}
              onChange={(e) => setSchoolForm((f) => ({ ...f, school_email: e.target.value }))}
            />
          </label>
          <Button type="button" size="sm" disabled={busy} onClick={saveSchoolInfo}>
            Запази училище
          </Button>
        </div>
      </Card>

      <Card title="Състезания — извинителни бележки">
        {missingSchool ? (
          <p className="uiMuted" style={{ marginTop: 0 }}>
            Попълнете училище и клас, за да активирате изтеглянето.
          </p>
        ) : null}
        {(data.items || []).length === 0 ? (
          <EmptyState
            title="Няма състезания с потвърден състав"
            description="Когато детето е в пътуващия състав, бележката ще се появи тук."
          />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {data.items.map((item) => (
              <article
                key={item.competition_id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div>
                  <strong>{item.event_label}</strong>
                  <p className="uiMuted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                    {formatShortDate(item.date)}
                    {item.location ? ` · ${item.location}` : ""}
                  </p>
                  {item.weekend_hint ? (
                    <p className="uiMuted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                      Уикенд — обикновено бележка не се изисква от училището.
                    </p>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !item.can_download}
                    onClick={() => downloadPdf(item.competition_id)}
                  >
                    Изтегли PDF
                  </Button>
                  {data.smtp_configured ? (
                    <>
                      <Input
                        type="email"
                        placeholder="имейл на училището"
                        value={sendEmailByComp[item.competition_id] ?? schoolForm.school_email ?? ""}
                        disabled={busy || !item.can_download}
                        onChange={(e) =>
                          setSendEmailByComp((m) => ({ ...m, [item.competition_id]: e.target.value }))
                        }
                        style={{ minWidth: 180, flex: "1 1 180px" }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy || !item.can_download}
                        onClick={() => sendToSchool(item.competition_id)}
                      >
                        Изпрати на училище
                      </Button>
                    </>
                  ) : (
                    <span className="uiMuted" style={{ fontSize: 12 }}>
                      Качете PDF в Skolo или го предайте на училището на хартия.
                    </span>
                  )}
                </div>
                {!item.can_download && item.missing_fields?.length ? (
                  <p className="uiMuted" style={{ margin: 0, fontSize: 12 }}>
                    {item.missing_fields.includes("club_config")
                      ? "Клубът още не е завършил настройката (председател/подпис)."
                      : "Попълнете училище и клас."}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
