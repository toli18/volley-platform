import BrandTriLine from "./BrandTriLine";
import PlatformBrandTitle from "./PlatformBrandTitle";

export default function PlatformBrandBlock({ subtitle, className = "" }) {
  return (
    <div className={`platformBrand${className ? ` ${className}` : ""}`}>
      <img
        src="/bfvb-logo.png"
        alt="БФВ"
        className="platformBrandLogo"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div className="platformBrandText">
        <span className="platformBrandName">
          <PlatformBrandTitle />
        </span>
        {subtitle ? <span className="platformBrandSub">{subtitle}</span> : null}
        <BrandTriLine />
      </div>
    </div>
  );
}
