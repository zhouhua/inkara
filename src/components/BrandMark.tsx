import { t, type Locale } from "@/lib/i18n";

type BrandMarkProps = {
  locale: Locale;
};

/** Top-left brand: logo mark + 墨语 / inkara. */
export function BrandMark({ locale }: BrandMarkProps) {
  return (
    <div className="brand-mark">
      {/* Static SVG mark; next/image adds little value here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="brand-logo"
        src="/icons/icon-192.svg"
        alt=""
        width={32}
        height={32}
        decoding="async"
        aria-hidden
      />
      <div className="brand-text">
        <p className="brand-zh">{t(locale, "brand")}</p>
        <p className="brand-en">{t(locale, "brandEn")}</p>
      </div>
    </div>
  );
}
