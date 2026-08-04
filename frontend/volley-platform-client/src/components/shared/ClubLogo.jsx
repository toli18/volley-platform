import { useState } from "react";
import { Link } from "react-router-dom";

import { resolveStaticUrl } from "../../utils/staticUrl";

export default function ClubLogo({ logoUrl, name, className = "", to, title }) {
  const [errored, setErrored] = useState(false);
  const src = resolveStaticUrl(logoUrl);
  const tip = title || name || "Клуб";

  if (!src || errored) return null;

  const inner = (
    <img
      src={src}
      alt={name || "Клубно лого"}
      className="clubLogoImg"
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );

  const cls = `clubLogo${className ? ` ${className}` : ""}${to ? " clubLogo--clickable" : ""}`;

  if (to) {
    return (
      <Link to={to} className={cls} title={tip} aria-label={tip}>
        {inner}
      </Link>
    );
  }

  return (
    <span className={cls} title={tip}>
      {inner}
    </span>
  );
}
