import "./ui.css";
import Card from "./Card";

export default function AdminHero({ title, subtitle, actions }) {
  return (
    <Card
      className="uiCard--padded"
      style={{
        background: "linear-gradient(130deg, #0a5137 0%, #0e6b48 55%, #be1e2d 160%)",
        borderColor: "#0a5137",
        color: "#fff",
      }}
    >
      <div className="uiAdminHero">
        <div className="uiAdminHeroText">
          <h2 style={{ margin: 0, color: "#fff" }}>{title}</h2>
          {subtitle ? <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,.9)" }}>{subtitle}</p> : null}
        </div>
        {actions ? <div className="uiAdminHeroActions">{actions}</div> : null}
      </div>
    </Card>
  );
}
