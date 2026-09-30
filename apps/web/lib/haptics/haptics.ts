/*
  Titreşim: native `mobile-kit/lib/haptics` sözlüğünün web ikizi; ekran niyeti söyler, dokunuşu bu dosya seçer. Android titreşim komutunu
  çalar; iPhone'da betik titreşim çalamaz, dokunuş tıkı düğmenin içindeki `HapticTarget`ten gelir.
*/

type HapticIntent = 'select' | 'commit' | 'success' | 'warning' | 'error';

/** Android deseni (ms; titreşim, ara, titreşim). */
const PATTERN: Record<HapticIntent, readonly number[]> = {
  select: [8],
  commit: [18],
  success: [14, 70, 14],
  warning: [24, 70, 24],
  error: [30, 60, 30, 60, 30],
};

export type HapticRoute = 'vibrate' | 'switch' | 'none';

/** Android tarayıcıları titreşim komutunu tanır; iPhone Safari tanımaz, ona gerçek dokunuşun değdiği anahtar kutusu yolu kalır. */
export function hapticRouteOf(nav: { vibrate?: unknown; userAgent: string } | undefined): HapticRoute {
  if (nav === undefined) return 'none';
  if (typeof nav.vibrate === 'function') return 'vibrate';
  return /iPhone|iPod/.test(nav.userAgent) ? 'switch' : 'none';
}

/** Dokunma yüzeyi: düğme ve kutu bağlantısı. */
const TAP_SURFACE = 'button, a, [role="button"]';

/**
 * Native'in dokunma yüzeyi kuralı: her düğme ve kutu bağlantısı hafifçe tıklar. Gezinme yüzeyleri (sekme, çip, metin eylemi)
 * `data-haptic="off"` taşır; metin içindeki bağlantı bir sözcüktür, dokunma yüzeyi değil.
 */
function ticksOnTap(surface: Element): boolean {
  if (surface.closest('[data-haptic="off"]') !== null) return false;
  if (surface instanceof HTMLButtonElement && surface.disabled) return false;
  return getComputedStyle(surface).display !== 'inline';
}

function fire(intent: HapticIntent): void {
  try {
    if (hapticRouteOf(typeof navigator === 'undefined' ? undefined : navigator) === 'vibrate') navigator.vibrate([...PATTERN[intent]]);
  } catch {
    /* Tarayıcı ya da donanım titreşimi desteklemiyor; yokluğu hiçbir akışı bozmamalı ve kullanıcıya söylenecek bir şey yok. */
  }
}

/** Beklenen sonuç geldi: sipariş oluştu, kayıt yazıldı. */
export function hapticSuccess(): void {
  fire('success');
}

/** İşlem olmadı ve kullanıcının bilmesi gerekiyor: yanlış kod, reddedilen ödeme. Boş alan için titremeyiz. */
export function hapticError(): void {
  fire('error');
}

/** Kullanıcının kendi kararlı hareketi: keşifte oy, hesabın silinmesi. */
export function hapticCommit(): void {
  fire('commit');
}

/** Hafif dokunuş: düğmeye basış, geri alma. Gezinme yüzeyleri (sekme, çip, metin eylemi) titremez. */
export function hapticSelect(): void {
  fire('select');
}

/** Dokunuşun titreşim yolu (telefon çerçevesinin tıklama yakalayıcısı); titreşim komutu olmayan iPhone'da bir şey yapmaz. */
export function tickOnTap(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const surface = target.closest(TAP_SURFACE);
  if (surface !== null && ticksOnTap(surface)) fire('select');
}
