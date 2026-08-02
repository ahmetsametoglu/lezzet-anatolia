/**
 * Özet satırı — solda etiket, sağda tutar (denetim bulgusu M2, 02.08).
 *
 * Üç yerde ayrı ayrı yazılmıştı (checkout özeti, sipariş onayı, sipariş detayı) ve **üçü de birbirinden
 * sapmıştı**: tutar bir yerde `font-bold` bir yerde `font-semibold`, yeşil bir yerde `olive` bir yerde
 * `olive-dark`, tonun etikete de uygulanıp uygulanmadığı her yerde başka. Aynı satır, üç görünüm.
 *
 * Tasarım tek ve net (`Musteri - Checkout.dc.html:91-95` · `Musteri - Siparis Detay.dc.html:76-77`):
 * tutar **700**, yeşil **#5f7a2c** (`olive`, `olive-dark` değil) ve **iki ton hâli var** —
 *   `olive`      → İNDİRİM satırı: etiket de tutar da yeşil (tasarımda renk satırın kendisinde).
 *   `oliveValue` → ÜCRETSİZ teslimat: yalnız tutar yeşil, etiket gövde tonunda kalır.
 * İkisini tek bir "yeşil" hâline indirmek, tasarımın ayırdığı iki cümleyi birleştirmek olurdu:
 * indirim satırın tamamı bir kazançtır, ücretsiz teslimatta kazanç yalnız tutardır.
 *
 * Ürün kalemleri de aynı satırdır (tasarım onları da aynı blokta, aynı ağırlıkla çiziyor) — ayrı bir
 * "kalem satırı" yok.
 */
type SummaryRowTone = 'default' | 'olive' | 'oliveValue';

interface SummaryRowProps {
  label: string;
  value: string;
  tone?: SummaryRowTone;
}

export function SummaryRow({ label, value, tone = 'default' }: SummaryRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-sans text-body-sm">
      <span className={tone === 'olive' ? 'text-olive' : 'text-body'}>{label}</span>
      <span className={['font-bold', tone === 'default' ? 'text-ink' : 'text-olive'].join(' ')}>{value}</span>
    </div>
  );
}
