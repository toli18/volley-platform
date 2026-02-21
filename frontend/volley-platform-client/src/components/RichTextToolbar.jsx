const FONT_FAMILIES = [
  "inherit",
  "Arial, sans-serif",
  "'Times New Roman', serif",
  "Georgia, serif",
  "Verdana, sans-serif",
  "'Trebuchet MS', sans-serif",
];

const FONT_SIZES = ["12", "14", "16", "18", "22", "26", "32"];

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

export default function RichTextToolbar({ textareaRef, value, onChange, disabled }) {
  const applyWrap = (startTag, endTag, placeholder) => {
    wrapSelection(textareaRef?.current, value || "", onChange, startTag, endTag, placeholder);
  };

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" disabled={disabled} onClick={() => applyWrap("<strong>", "</strong>")}>
        B
      </button>
      <button type="button" disabled={disabled} onClick={() => applyWrap("<em>", "</em>")}>
        I
      </button>
      <button type="button" disabled={disabled} onClick={() => applyWrap("<u>", "</u>")}>
        U
      </button>
      <button type="button" disabled={disabled} onClick={() => applyWrap("<blockquote>", "</blockquote>")}>
        Цитат
      </button>
      <button type="button" disabled={disabled} onClick={() => applyWrap("<ul><li>", "</li></ul>", "точка")}>
        Списък
      </button>

      <select
        disabled={disabled}
        defaultValue=""
        onChange={(e) => {
          const family = e.target.value;
          if (!family) return;
          applyWrap(`<span style="font-family:${family};">`, "</span>");
          e.target.value = "";
        }}
      >
        <option value="">Шрифт</option>
        {FONT_FAMILIES.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>

      <select
        disabled={disabled}
        defaultValue=""
        onChange={(e) => {
          const size = e.target.value;
          if (!size) return;
          applyWrap(`<span style="font-size:${size}px;">`, "</span>");
          e.target.value = "";
        }}
      >
        <option value="">Размер</option>
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}px
          </option>
        ))}
      </select>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 12, color: "#475569" }}>Цвят</span>
        <input
          type="color"
          disabled={disabled}
          onChange={(e) => applyWrap(`<span style="color:${e.target.value};">`, "</span>")}
        />
      </label>
    </div>
  );
}

