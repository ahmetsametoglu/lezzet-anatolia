import { FONT_SCALES, FONT_SCALE_FACTOR, FONT_SCALE_VAR, type FontScale } from '@lezzet/design-tokens';

/** Seçim çerezde durur ki sunucu ilk kareyi doğru boyla çizsin; yerel depoda dursaydı her açılışta yazı bir kare zıplardı. */
export const FONT_SCALE_COOKIE = 'lz_font_scale';

/** Tanınmayan ya da boş değer `normal`dir, ilk açılışın hâli. */
export function fontScaleOf(raw: string | undefined | null): FontScale {
  return FONT_SCALES.find((scale) => scale === raw) ?? 'normal';
}

/** Kökün stil değişkeni; `normal`de yazılmaz, çünkü tanımsız değişkenin çarpanı zaten 1. */
export function fontScaleStyle(scale: FontScale): Record<string, string> | undefined {
  return scale === 'normal' ? undefined : { [FONT_SCALE_VAR]: String(FONT_SCALE_FACTOR[scale]) };
}

/** Seçimi hemen uygular ve bir yıllık çereze yazar; yalnız istemcide çağrılır. */
export function saveFontScale(scale: FontScale): void {
  const root = document.documentElement;
  if (scale === 'normal') root.style.removeProperty(FONT_SCALE_VAR);
  else root.style.setProperty(FONT_SCALE_VAR, String(FONT_SCALE_FACTOR[scale]));
  document.cookie = `${FONT_SCALE_COOKIE}=${scale}; path=/; max-age=31536000; samesite=lax`;
}

/** Kökteki değişkenden okunan güncel seçim; sunucuda `normal`. */
export function currentFontScale(): FontScale {
  const factor = Number(document.documentElement.style.getPropertyValue(FONT_SCALE_VAR) || '1');
  return FONT_SCALES.find((scale) => FONT_SCALE_FACTOR[scale] === factor) ?? 'normal';
}
