import "./ui.css";

export default function AdminSection({ title, subtitle, actions, children }) {
  return (
    <section className="uiAdminSection">
      {(title || subtitle || actions) && (
        <div className="uiAdminSectionHeader">
          <div className="uiAdminSectionTitleWrap">
            {title ? <h3 className="uiAdminSectionTitle">{title}</h3> : null}
            {subtitle ? <p className="uiAdminSectionSubtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="uiAdminSectionActions">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
