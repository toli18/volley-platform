function wrapSelection(textarea, value, onChange, startTag, endTag, placeholder = "текст") {
  const start = textarea?.selectionStart ?? value.length;
  const end = textarea?.selectionEnd ?? value.length;
  const selected = value.slice(start, end) || placeholder;
  const inserted = `${startTag}${selected}${endTag}`;
  const next = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
  onChange(next);

  requestAnimationFrame(() => {
    if (!textarea) return;
    textarea.focus();
    const cursor = start + inserted.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}

function insertAtCursor(textarea, value, onChange, insertedText) {
  const start = textarea?.selectionStart ?? value.length;
  const end = textarea?.selectionEnd ?? value.length;
  const next = `${value.slice(0, start)}${insertedText}${value.slice(end)}`;
  onChange(next);
  requestAnimationFrame(() => {
    if (!textarea) return;
    const cursor = start + insertedText.length;
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
}

function prefixSelectedLines(textarea, value, onChange, prefix) {
  const start = textarea?.selectionStart ?? value.length;
  const end = textarea?.selectionEnd ?? value.length;
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndCandidate = value.indexOf("\n", end);
  const lineEnd = lineEndCandidate === -1 ? value.length : lineEndCandidate;
  const selectedBlock = value.slice(lineStart, lineEnd);
  const lines = selectedBlock.split("\n");
  const nextBlock = lines.map((line) => `${prefix}${line}`).join("\n");
  const next = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`;
  onChange(next);

  requestAnimationFrame(() => {
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(lineStart, lineStart + nextBlock.length);
  });
}

function createToolbarButtonStyle(isPrimary = false) {
  return {
    border: "1px solid #dbe5f2",
    background: isPrimary ? "#eff6ff" : "#fff",
    color: "#0f172a",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 10px",
    cursor: "pointer",
  };
}

export default function RichTextToolbar({
  textareaRef,
  value,
  onChange,
  disabled,
  onInsertTemplate,
  compact = false,
}) {
  const applyWrap = (startTag, endTag, placeholder) => {
    wrapSelection(textareaRef?.current, value || "", onChange, startTag, endTag, placeholder);
  };
  const applyPrefix = (prefix) => {
    prefixSelectedLines(textareaRef?.current, value || "", onChange, prefix);
  };
  const insertText = (inserted) => {
    insertAtCursor(textareaRef?.current, value || "", onChange, inserted);
  };
  const insertImageByUrl = () => {
    const raw = window.prompt("Постави линк към снимка (например Imgur):");
    const url = String(raw || "").trim();
    if (!url) return;
    insertText(`\n![Снимка](${url})\n`);
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={createToolbarButtonStyle(true)} disabled={disabled} onClick={() => insertText("\n## Заглавие\n")}>
          Заглавие
        </button>
        <button type="button" style={createToolbarButtonStyle(true)} disabled={disabled} onClick={() => insertText("\n### Подзаглавие\n")}>
          Подзаглавие
        </button>
        <button type="button" style={createToolbarButtonStyle()} disabled={disabled} onClick={() => applyPrefix("- ")}>
          Списък
        </button>
        <button type="button" style={createToolbarButtonStyle()} disabled={disabled} onClick={() => applyPrefix("1. ")}>
          Номериран
        </button>
        <button type="button" style={createToolbarButtonStyle()} disabled={disabled} onClick={() => applyPrefix("> ")}>
          Цитат
        </button>
        <button type="button" style={createToolbarButtonStyle()} disabled={disabled} onClick={() => applyWrap("<strong>", "</strong>")}>
          Удебелен
        </button>
        <button type="button" style={createToolbarButtonStyle()} disabled={disabled} onClick={() => applyWrap("<em>", "</em>")}>
          Курсив
        </button>
        <button type="button" style={createToolbarButtonStyle()} disabled={disabled} onClick={insertImageByUrl}>
          Снимка (линк)
        </button>
      </div>

      {!compact && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            style={createToolbarButtonStyle()}
            disabled={disabled}
            onClick={() => onInsertTemplate?.("article")}
          >
            Шаблон статия
          </button>
          <button
            type="button"
            style={createToolbarButtonStyle()}
            disabled={disabled}
            onClick={() => onInsertTemplate?.("forum")}
          >
            Шаблон форум
          </button>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Подсказка: ползвай Заглавие/Подзаглавие за по-ясна структура.
          </span>
        </div>
      )}
    </div>
  );
}

