import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  parseLocale,
  type Locale,
} from "@/lib/i18n";

/** Saved cookie wins; otherwise the browser's Accept-Language. */
export async function requestLocale(): Promise<Locale> {
  const jar = await cookies();
  const saved = parseLocale(jar.get(LOCALE_COOKIE)?.value);
  if (saved) return saved;
  const h = await headers();
  return localeFromAcceptLanguage(h.get("accept-language"));
}
