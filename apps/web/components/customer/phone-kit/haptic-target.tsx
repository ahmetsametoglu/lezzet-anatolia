'use client';

import { useHapticRoute } from '@/lib/haptics/use-haptic-route.hook';

/** React bilinmeyen boolean özniteliği yazmadığı için anahtar kutusu özniteliği dizeyle verilir. */
const SWITCH_ATTRIBUTE = { switch: '' };

/**
 * iPhone'da dokunuş titreşiminin tek yolu: düğmeyi kaplayan şeffaf etiket, gerçek dokunuşu gizli anahtar kutusuna güvenilir tıklama
 * olarak iletir ve iOS sistem tıkını çalar (iOS 26.5 betikten tetiklemeyi kapattı). Anahtar parmağın altında durmaz, çünkü WebKit onun
 * üstünde başlayan dokunuşu sürükleme için alır ve kaydırma başlamaz.
 */
export function HapticTarget() {
  if (useHapticRoute() !== 'switch') return null;
  return (
    <label aria-hidden className="absolute inset-0 touch-manipulation [-webkit-tap-highlight-color:transparent]">
      {/* Etiketin anahtara ilettiği ikinci tıklama düğmeye ulaşmaz, yoksa düğmenin işi iki kez çalışırdı. */}
      <input type="checkbox" className="invisible size-px" onClick={(event) => event.stopPropagation()} {...SWITCH_ATTRIBUTE} />
    </label>
  );
}
