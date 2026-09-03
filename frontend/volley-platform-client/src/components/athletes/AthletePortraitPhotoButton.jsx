import { useRef } from "react";

import { Button } from "../ui";

/**
 * Portrait upload for athlete profiles. Avoids capture="environment" (iOS black screen)
 * and uses a direct button → file input click (reliable on iPhone Safari).
 */
export default function AthletePortraitPhotoButton({
  label,
  busy = false,
  disabled = false,
  onFileSelected,
  size = "sm",
}) {
  const inputRef = useRef(null);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size={size}
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Запис…" : label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFileSelected?.(file);
        }}
      />
    </>
  );
}
