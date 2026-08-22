export default function CoachMobileHeaderBrand({ subtitle }) {
  return (
    <div className="coachMobileHeaderBrand">
      <img
        src="/bfvb-logo.png"
        alt="БФВ"
        className="coachMobileHeaderBrandLogo"
        onError={(e) => {
          e.currentTarget.src = "/presentation/logo.png";
        }}
      />
      <div className="coachMobileHeaderBrandText">
        <p className="coachMobileHeaderBrandTitle">Volley Coach</p>
        {subtitle ? <p className="coachMobileHeaderBrandSub">{subtitle}</p> : null}
      </div>
    </div>
  );
}
