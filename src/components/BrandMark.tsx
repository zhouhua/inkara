import { t, type Locale } from "@/lib/i18n";

type BrandMarkProps = {
  locale: Locale;
};

/** Top-left brand: logo mark + 墨语 / inkara. */
export function BrandMark({ locale }: BrandMarkProps) {
  return (
    <div className="brand-mark">
      <img
        className="brand-logo"
        src="/icons/icon-192.svg"
        alt=""
        width={28}
        height={28}
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
