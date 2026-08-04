import { linkifyChatText } from "../../utils/chatContent";

/** Plain chat text with auto-linked http(s) URLs. */
export default function ChatLinkedText({ text, className, style }) {
  const parts = linkifyChatText(text);
  return (
    <p className={className} style={style}>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={`t${i}`}>{part}</span>
        ) : (
          <a
            key={part.key || `l${i}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="chatInlineLink"
          >
            {part.label}
          </a>
        ),
      )}
    </p>
  );
}
