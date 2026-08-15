import { FEATURED_SLOTS, type FeaturedTarget } from '@lezzet/types';

/**
 * **VİTRİN IZGARASININ FORMU** — iki yüzeyin paylaştığı tek tanım (22.35).
 *
 * Vitrin bir liste değil bir SEÇKİdir ve kontenjanı vardır (`FEATURED_SLOTS`): dolu bir ızgaraya
 * ekleme yapmak, sıradaki birini ana sayfadan düşürür. Katalog ekranı bunu toggle'larla yönetiyor;
 * asistan kuyruğunun vitrin önerisi ise bugüne kadar iki uçlu bir karardı — onayla ya da reddet — ve
 * onay, kimin düşeceğini SÖYLEMEDEN uygulanıyordu.
 *
 * Kullanıcı kararı 15.08: *"biz yönlendirme yapmıyoruz; doğrudan açılan diyaloğun içerisinde
 * düzenlenecek ortak komponent yapıyoruz."* Yani karar kuyruğun içinde verilir — öneriyi reddedip
 * aynı işi katalog ekranında elle yapmak, kuyruğun var oluş sebebini siler.
 */

/** Izgaraya giren aday — kayıt + o anki iki bayrağı. */
export interface FeaturedCandidate {
  id: string;
  name: string;
  /** Yayında mı — işaretli AMA pasif kayıt ana sayfada ÇİZİLMEZ (aşağıdaki künye). */
  isActive: boolean;
}

export interface FeaturedFormValues {
  /** Vitrinde OLACAK kimlikler. Öneri konusu açılışta bu kümededir (ya da değildir — yön dilekçeden). */
  featuredIds: string[];
}

/**
 * Izgaranın sayımı — **"kaç tanesi GÖRÜNECEK", "kaç tanesi işaretli" değil.**
 *
 * İki eksen ayrı (`isFeatured` = seçkide mi · `isActive` = yayında mı) ve işaret pasif bir kayda da
 * konabilir: kampanya hazırlanırken işaret önceden konur, yayına alınınca vitrine düşer. Ama pasif
 * kayıt ana sayfada çizilmez. İkisini tek sayıda toplamak, "6/6 dolu" diyen bir başlığın altında
 * vitrinde dört kart bırakırdı (`catalog-tab` künyesinin ölçtüğü hata).
 */
export function featuredSummary(
  values: FeaturedFormValues,
  candidates: readonly FeaturedCandidate[],
  target: FeaturedTarget,
): { visible: number; passive: number; slots: number; overflowing: boolean } {
  const chosen = candidates.filter((c) => values.featuredIds.includes(c.id));
  const visible = chosen.filter((c) => c.isActive).length;
  const slots = FEATURED_SLOTS[target];
  return { visible, passive: chosen.length - visible, slots, overflowing: visible > slots };
}
