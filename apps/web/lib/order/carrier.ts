import type { Carrier } from '@lezzet/types';

/**
 * **Taşıyıcı takip adresleri** (08.5) — "Kargoyu takip et ↗" düğmesinin gittiği yer.
 *
 * Tablo BURADA, `packages/types`ta değil: orada enum'un kendisi yaşıyor (şema tek kaynak), ama bir
 * takip URL'i şema değil — taşıyıcının bugünkü sitesidir ve o site adres değiştirdiğinde
 * güncellenecek yer bir veri sözleşmesi olmamalı.
 *
 * **`other` bilerek YOK ve `null` dönüyor.** Beş taşıyıcının dördünün adresi bilinir; beşincisi
 * tam olarak "listede olmayan taşıyıcı" demektir — adresi tanım gereği bilinmez. Bir yer uydurmak
 * ya da ana sayfalarına göndermek, müşteriye tıklandığında karşılığı olmayan bir söz vermek olurdu.
 * Ekran o hâlde düğmeyi hiç çizmez ama NUMARAYI gösterir: numara müşterinin işine yarar (taşıyıcıyı
 * kendisi arayabilir), çalışmayan bir düğme yaramaz. Aynı sebeple boş/boşluklu numara da `null`.
 *
 * Numara URL'e KAÇIRILARAK giriyor (`encodeURIComponent`): takip numaraları boşluk taşıyor
 * (`8R 452 617 334 FR`) ve ham eklenen boşluk bağlantıyı bozardı.
 */
const TRACKING_URLS: Record<Exclude<Carrier, 'other'>, (code: string) => string> = {
  colissimo: (code) => `https://www.laposte.fr/outils/suivre-vos-envois?code=${code}`,
  chronopost: (code) => `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=${code}`,
  dhl: (code) => `https://www.dhl.com/fr-fr/home/tracking.html?tracking-id=${code}`,
  ups: (code) => `https://www.ups.com/track?loc=fr_FR&tracknum=${code}`,
};

/** Takip adresi; taşıyıcı `other` ya da numara boşsa `null` (düğme çizilmez). */
export function trackingUrlOf(carrier: Carrier | null, trackingNumber: string | null): string | null {
  if (!carrier || carrier === 'other') return null;
  const code = trackingNumber?.trim();
  if (!code) return null;
  return TRACKING_URLS[carrier](encodeURIComponent(code));
}
