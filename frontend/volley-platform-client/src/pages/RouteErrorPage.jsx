import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";

/**
 * Friendly fallback for React Router crashes (incl. iOS Safari removeChild / NotFoundError).
 */
export default function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Нещо се обърка";
  let detail = "Опитай да презаредиш страницата. Ако проблемът продължи, пиши ни.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Страницата не е намерена" : `Грешка ${error.status}`;
    detail = error.statusText || detail;
  } else if (error && typeof error === "object") {
    const msg = String(error.message || "");
    const isDomNotFound =
      /removeChild|NotFoundError|не може да бъде намерен|cannot be found here/i.test(msg) ||
      error.name === "NotFoundError";
    if (isDomNotFound) {
      title = "Временен проблем с екрана";
      detail =
        "Често се случва на iPhone, ако браузърът превежда страницата. Изключи „Превод“ за този сайт и презареди. Ако създаваше състезател — провери дали вече е в списъка.";
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        background: "#f4f7f5",
        color: "#0f2f24",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%", display: "grid", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
        <p style={{ margin: 0, lineHeight: 1.45, color: "#3a5a4e" }}>{detail}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#0c5b3e",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Презареди
          </button>
          <button
            type="button"
            onClick={() => navigate("/coach/athletes", { replace: true })}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #b9d8c8",
              background: "#fff",
              color: "#0c5b3e",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Към състезатели
          </button>
        </div>
      </div>
    </div>
  );
}
