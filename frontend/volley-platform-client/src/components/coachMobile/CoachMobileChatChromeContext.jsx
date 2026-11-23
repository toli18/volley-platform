import { createContext, useContext, useMemo, useState } from "react";

const CoachMobileChatChromeContext = createContext(null);

export function CoachMobileChatChromeProvider({ children }) {
  const [composerFocused, setComposerFocused] = useState(false);
  const value = useMemo(
    () => ({
      composerFocused,
      setComposerFocused,
    }),
    [composerFocused],
  );
  return <CoachMobileChatChromeContext.Provider value={value}>{children}</CoachMobileChatChromeContext.Provider>;
}

export function useCoachMobileChatChrome() {
  return useContext(CoachMobileChatChromeContext) || { composerFocused: false, setComposerFocused: () => {} };
}

/** Детайлен изглед на чат (отбор или родители по група). */
export function isCoachMobileChatThreadPath(pathname) {
  return /^\/coach\/chat\/\d+$/.test(pathname) || /^\/coach\/chat\/parents\/\d+$/.test(pathname);
}