export default function CoachMobileHeaderBrand({ subtitle }) {
  return (
    <div className="coachMobileHeaderBrand">
      <img
        src="/bfvb-logo.png"
        alt="БФВ"
        className="coachMobileHeaderBrandLogo"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div className="coachMobileHeaderBrandText">
        <span className="coachMobileHeaderBrandTitle">
          <span className="triWhite">Volley</span>
          <span className="triGreen"> Coach</span>
        </span>
        {subtitle ? <span className="coachMobileHeaderBrandSub">{subtitle}</span> : null}
      </div>
    </div>
  );
}
