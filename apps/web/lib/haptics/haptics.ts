/*
  Titreşim: native `mobile-kit/lib/haptics` sözlüğünün web ikizi; ekran niyeti söyler, dokunuşu bu dosya seçer. Başarısızlık sessiz
  düşer, çünkü titreşimin yokluğu hiçbir akışı bozmamalı ve kullanıcıya söylenecek bir şey yok.
*/

type HapticIntent = 'select' | 'commit' | 'success' | 'warning' | 'error';

/** Android deseni (ms; titreşim, ara, titreşim); iPhone'da desendeki titreşim sayısı kadar sistem tıkı çalınır. */
const PATTERN: Record<HapticIntent, readonly number[]> = {
  select: [8],
  commit: [18],
  success: [14, 70, 14],
  warning: [24, 70, 24],
  error: [30, 60, 30, 60, 30],
};

/** iPhone'da art arda tıkların arası; sistem tıkının süresi sabit olduğu için desenin boşluklarını izleyemez. */
const TICK_GAP_MS = 120;

type HapticRoute = 'vibrate' | 'switch' | 'none';

/** Android tarayıcıları titreşim komutunu tanır; iPhone Safari tanımaz ama anahtar kutusunun değişmesi sistem dokunuşunu çalar. */
export function hapticRouteOf(nav: { vibrate?: unknown; userAgent: string } | undefined): HapticRoute {
  if (nav === undefined) return 'none';
  if (typeof nav.vibrate === 'function') return 'vibrate';
  return /iPhone|iPod/.test(nav.userAgent) ? 'switch' : 'none';
}

/** Görünmez bir anahtar kutusunu çevirir; kutu yalnız bu an için sayfaya girer. */
function switchTick(): void {
  const label = document.createElement('label');
  label.ariaHidden = 'true';
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.append(input);
  document.head.append(label);
  label.click();
  label.remove();
}

function fire(intent: HapticIntent): void {
  try {
    const route = hapticRouteOf(typeof navigator === 'undefined' ? undefined : navigator);
    const pattern = PATTERN[intent];
    if (route === 'vibrate') navigator.vibrate([...pattern]);
    if (route === 'switch') {
      const ticks = Math.ceil(pattern.length / 2);
      switchTick();
      for (let index = 1; index < ticks; index++) window.setTimeout(switchTick, index * TICK_GAP_MS);
    }
  } catch {
    /* Tarayıcı ya da donanım titreşimi desteklemiyor; yokluğu hiçbir akışı bozmamalı. */
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
