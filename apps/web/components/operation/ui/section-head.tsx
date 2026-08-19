import { InfoIcon } from './icons';

/**
 * **Bölüm başlığı** — başlık + o bölümün neden orada olduğunu söyleyen tek satır.
 *
 * İpucu (`hint`) süs değil sözleşmenin parçası: bir bölüm kendi varlık sebebini söylemiyorsa,
 * okuyan onu ya atlar ya yanlış okur. Depolar sayfasının bütün bölümleri bu kalıpta
 * ("Karne — bugün nasıl durduğu", "Hizmet alanı — nereye hizmet ettiği").
 *
 * `aside` sağa yaslanır: bölüme ait ama başlık olmayan tek bilgi (sayaç rozeti, kısayol).
 *
 * Depolar sayfasının içindeydi; Hazırlık karşılama ekranı ikinci tüketici olunca ortak yere geldi
 * (19.32) — iki sayfanın bölüm başlığı aynı sesle konuşmalı.
 */
export function SectionHead({ title, hint, aside }: { title: string; hint: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2.5">
      <span className="font-ops-display text-ops-section font-semibold text-ops-ink">{title}</span>
      <span className="font-ops-body text-ops-sm text-ops-muted">{hint}</span>
      {aside ? (
        <>
          <span className="flex-1" />
          {aside}
        </>
      ) : null}
    </div>
  );
}

/**
 * **Kurulum eksikliği / bilgi şeridi** — sarı kutu, tek cümle.
 *
 * Bir DURUM bildirir, bir eylem istemez: "bu tesis açık ama ulaşılamaz", "bu nokta hiç ölçülmemiş".
 * Hata değil (kırmızı olurdu), öneri de değil (bir düğmesi olurdu) — düzeltilmesi gereken ama
 * ekranı durdurmayan bir boşluk.
 *
 * Depolar sayfasından ortak yere geldi (19.32): Hazırlık karşılama ekranı aynı cümleyi aynı kutuda
 * gösteriyor (`@/lib/warehouse/setup-gap`), çünkü söylediği şey orada da seçimden önce bilinmeli.
 */
export function SetupGapNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-2.5 py-2">
      <span className="mt-px flex-none text-ops-amber">
        <InfoIcon size={14} />
      </span>
      <span className="font-ops-body text-ops-sm leading-snug text-ops-amber">{text}</span>
    </div>
  );
}
