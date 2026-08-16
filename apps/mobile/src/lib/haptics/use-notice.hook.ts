import { useCallback, useState } from 'react';

import { hapticError, hapticSuccess, hapticWarning } from './haptics';

/*
  OPERASYONUN SONUÇ BİLDİRİMİ — durum + titreşim TEK yerde.

  ── NEDEN BURASI ───────────────────────────────────────────────────────────
  Depo ve kurye kancalarının sekizi de aynı deseni kurmuş: `{ tone, text }` biçiminde bir
  `notice` durumu, ve `tone` sözlüğü zaten ortak (`ok · warn · error · info`). Yani "işlem
  bitti, sonucu şu" bilgisi operasyon yüzeyinde ZATEN tek bir dille konuşuyordu; eksik olan
  yalnız o dilin dokunsal karşılığıydı.

  Titreşimi sekiz kancaya ayrı ayrı yazmak, aynı kararın sekiz kopyası olurdu (CLAUDE §1) — ve
  dokuzuncu kanca yazıldığında unutulacak olan da tam bu olurdu. `useState`in yerine geçen bu
  kanca ile kural kancanın KURULUŞUNDA duruyor: sonucu bildiren herkes titreşimi de bildirir.

  ── NEDEN ÇİZİMDE DEĞİL, YAZIMDA ───────────────────────────────────────────
  Bildirimi çizen ortak bir komponente bağlamak daha kolay görünüyordu ve YANLIŞ olurdu: çizim
  tekrar eder (yeniden render, tema değişimi, ekran odağı), titreşim ise bir OLAYDIR ve iki kez
  olmamalıdır. Durumun YAZILDIĞI an, olayın bir kez gerçekleştiği tek andır.

  ── NEDEN OPERASYONDA DAHA ÇOK ÖNEMLİ ──────────────────────────────────────
  Depocu ve kurye ekrana sürekli bakmaz: eli koli ya da direksiyondadır, telefon bir eylemden
  sonra cebe gider. "Kabul edildi mi, reddedildi mi" sorusunun cevabını görmeden almak,
  müşteri yüzeyinde konfor, operasyonda ise işin kendisidir.
*/

/* Operasyon kancalarının ortak ton sözlüğü — her kanca bunun bir ALT KÜMESİNİ kullanır (kimi
   `warn` bilmez, kimi `info`). Bilerek DIŞARI AÇILMIYOR: kancalar kendi ton birleşimlerini
   kendi dosyalarında tanımlıyor ve bu tip yalnız onları kapsayan üst sınır. Dışa açılsaydı
   `knip` haklı olarak "kullanılmıyor" derdi — ve ilk kullanan da tonunu daraltmak yerine bunu
   ithal edip her kancaya dört tonu birden açardı. */
type NoticeTone = 'ok' | 'warn' | 'error' | 'info';

/** `info` SESSİZ: haber verir ama bir sonucun duyurusu değildir ("gün zaten kapalıydı"). */
function announceTone(tone: NoticeTone): void {
  if (tone === 'ok') hapticSuccess();
  else if (tone === 'warn') hapticWarning();
  else if (tone === 'error') hapticError();
}

/**
 * `useState` yerine geçer: bildirimi yazar VE tonuna göre titretir.
 *
 * `null` yazmak (bildirimi temizlemek) sessizdir — temizlik bir sonuç değildir.
 */
export function useNotice<T extends { tone: NoticeTone }>(): [T | null, (next: T | null) => void] {
  const [notice, setNotice] = useState<T | null>(null);
  const announce = useCallback((next: T | null) => {
    if (next !== null) announceTone(next.tone);
    setNotice(next);
  }, []);
  return [notice, announce];
}
