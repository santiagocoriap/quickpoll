import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, getDictionary, type Locale } from "./i18n";

export function getLocale(): Locale {
  return normalizeLocale(cookies().get(LOCALE_COOKIE)?.value);
}

export function getDict() {
  return getDictionary(getLocale());
}
