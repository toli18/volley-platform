import { useState } from "react";

import { resolveStaticUrl } from "../../utils/staticUrl";

export default function ClubLogo({ logoUrl, name, className = "" }) {
  const [errored, setErrored] = useState(false);
  const src = resolveStaticUrl(logoUrl);

  if (!src || errored) return null;

  return (
    <span className={`clubLogo${className ? ` ${className}` : ""}`} title={name || "Клуб"}>
      <img
        src={src}
        alt={name || "Клубно лого"}
        className="clubLogoImg"
        loading="lazy"
        onError={() => setErrored(true)}
      />
    </span>
  );
}
