/**
 * Kurulum eksikliği — tesisin **açık ama ulaşılamaz** olduğu hâl.
 *
 * İki ayrı yoksunluk var ve ikisi aynı şey değil:
 * - **Sipariş girmiyor:** ne aktif bölgesi ne kargo çıkışı var → posta kodu buraya çözülmez, kargo
 *   yolu buradan geçmez. Tesis açık görünür ama hiçbir sipariş ona düşmez.
 * - **Mal işlenemiyor:** kapsamında bu depo olan personel yok → mal kabul ve hazırlık yapılamaz.
 *
 * İkisi bir arada olabilir ve cümle ikisini de söyler; hiçbiri yoksa `null` (kurulum tam). Kapalı
 * depoda hiç sorulmaz: kapalı tesisin "eksik kurulumu" bir arıza değil, kapalılığın kendisidir.
 *
 * ── NEDEN SAYFA ALTINDA DEĞİL BURADA (19.32) ────────────────────────────────
 * `warehouses-read.ts`in özel fonksiyonuydu. İkinci tüketici Hazırlık'ın karşılama ekranı oldu:
 * orada da seçmeden ÖNCE bilinmesi gereken tek şey bu — kapsamlı personeli olmayan bir depoyu
 * seçmek, girip hiçbir şey yapamamak demek. İki sayfanın aynı cümleyi ayrı ayrı yazması,
 * gün gelip birinin ötekinden ayrılması demekti (`CLAUDE §1`).
 *
 * **Saf kalır** — DB okuması yok, `server-only` yok: `warehouses-read.ts` istemci penceresinden de
 * çağrılıyor (`close-warehouse-dialog.tsx`) ve bu modül onunla aynı pakete giriyor.
 */
export function setupGapOf(input: {
  isActive: boolean;
  shipsOnline: boolean;
  activeZoneCount: number;
  staffCount: number;
}): string | null {
  if (!input.isActive) return null;
  const gaps: string[] = [];
  if (input.activeZoneCount === 0 && !input.shipsOnline) {
    gaps.push('ne bağlı bölgesi ne kargo çıkışı var — hiçbir sipariş buraya çözülmez');
  }
  if (input.staffCount === 0) {
    gaps.push('kapsamlı personeli yok — mal kabul ve hazırlık yapılamaz');
  }
  return gaps.length === 0 ? null : `Açık ama ulaşılamaz tesis: ${gaps.join('; ')}.`;
}
