import { canPreviewInBrowser, fileIcon, formatBytes, formatDateBg, resolveMediaUrl } from "./articleUtils";
import "./articles.css";

function groupVersions(items) {
  const groups = new Map();
  for (const it of items) {
    const original = String(it?.name || "file");
    const base = original.replace(/\s*\(v\d+\)\s*/i, "").replace(/_v\d+/i, "");
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(it);
  }
  return Array.from(groups.entries()).map(([baseName, versions]) => ({
    baseName,
    versions: versions.sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0)),
  }));
}

export default function ArticleAttachmentList({ attachments }) {
  const files = Array.isArray(attachments)
    ? attachments.filter((m) => String(m?.type || "").toUpperCase() === "FILE")
    : [];
  const grouped = groupVersions(files);

  if (grouped.length === 0) {
    return (
      <div className="emptyBlock">
        <strong>Материали за сваляне</strong>
        <p>Все още няма качени файлове към тази статия.</p>
      </div>
    );
  }

  return (
    <div className="attachmentList">
      {grouped.map((group) => (
        <div key={group.baseName} className="attachmentCard">
          <div className="attachmentHeader">
            <span className="attachmentName">{group.baseName}</span>
            {group.versions.length > 1 && <span className="chip chipVersion">Версии: {group.versions.length}</span>}
          </div>

          <div className="attachmentVersions">
            {group.versions.map((file, idx) => (
              <div key={file.id} className="attachmentRow">
                <div className="attachmentLeft">
                  <span className="fileIcon">{fileIcon(file.name, file.mime_type)}</span>
                  <div>
                    <div className="attachmentMetaMain">
                      {file.name} {idx === 0 ? "(последна версия)" : ""}
                    </div>
                    <div className="attachmentMetaSub">
                      {formatBytes(file.size)} • {formatDateBg(file.created_at)} • v{group.versions.length - idx}
                    </div>
                  </div>
                </div>
                <div className="attachmentActions">
                  {canPreviewInBrowser(file.name, file.mime_type) && (
                    <a href={resolveMediaUrl(file.url)} target="_blank" rel="noreferrer">
                      Преглед
                    </a>
                  )}
                  <a href={resolveMediaUrl(file.url)} download>
                    Свали
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

