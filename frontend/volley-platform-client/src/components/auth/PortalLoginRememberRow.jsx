import { useEffect } from "react";

import { clearRememberedLogin, saveRememberedLogin } from "../../utils/portalLoginRemember";

export default function PortalLoginRememberRow({ kind, remember, onRememberChange, phone, birthYear }) {
  useEffect(() => {
    if (!remember) return;
    saveRememberedLogin(kind, { phone, birthYear });
  }, [kind, remember, phone, birthYear]);

  return (
    <label className="parentLoginRemember">
      <input
        type="checkbox"
        checked={remember}
        onChange={(e) => {
          const on = e.target.checked;
          onRememberChange(on);
          if (on) saveRememberedLogin(kind, { phone, birthYear });
          else clearRememberedLogin(kind);
        }}
      />
      <span className="parentLoginRememberText">
        <span className="parentLoginRememberTitle">Запази данните преди вход</span>
        <span className="parentLoginRememberHint">
          Телефонът и годината остават на това устройство и се попълват сами следващия път.
        </span>
      </span>
    </label>
  );
}
