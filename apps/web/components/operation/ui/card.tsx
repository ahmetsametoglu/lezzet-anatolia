import type { HTMLAttributes } from 'react';

/**
 * Operasyon kart yüzeyi — "Veri Masası": açık kart zemini, ince çizgi, GÖLGE YOK (Envanter §0).
 * Panel/tablo/boş-durum gibi bloklar bunun üstüne kurulur; iç yerleşim çağırana aittir.
 */

/**
 * Kabuk sınıfı — kart-OLMAYAN elemanlara aynı yüzeyi vermek için (`buttonClass`'ın ikizi).
 *
 * Neden var: kabuk dizgisi 10 yerde elle yazılmıştı (denetim OP1) ve ikisi `<section>`'dı. Hepsini
 * `<Card>` bileşenine çevirmek o iki yerde `<section>`'ı `<div>`e düşürürdü — sipariş detayında
 * "Para" ve "Kalemler" gerçek bölümlerdir, semantiği bir sınıf uğruna kaybetmenin karşılığı yok.
 * Sınıfı ayrı vermek kabuğu tek kaynakta tutar ve elemanı çağırana bırakır.
 *
 * `overflow-hidden` KABUĞUN parçası: kart içindeki tablo başlığı ve ayraç çizgileri yuvarlatılmış
 * köşeden taşar. Menü/ipucu taşıması gereken bir kart bu kabuğu KULLANMAZ — `AnchoredMenu` zaten
 * portal ile çiziliyor, yani kabuk onu kesmiyor.
 */
/**
 * ── KART ZEMİNİ `ops-card` DEĞİL `ops-white` (18.08, ölçüldü) ────────────────────────────
 * Kabuk pane'i `ops-card`a (#fbfbf9) çıkınca kart aynı renkte kalırdı, yani yüzey yok olurdu.
 * Tasarım zaten böyle: mock'ların kapsayıcıları #ffffff, pane #fbfbf9. İlişki değişmedi —
 * kart hâlâ pane'den bir kademe açık; değişen, ikisinin de bir kademe yukarı taşınması.
 * (`ops-white`ın künyesi "dialog ve girdi zemini" diyor; kart da aynı kademede duruyor artık —
 * ayrı bir token açmadım çünkü değer aynı ve ikisi karanlıkta da aynı yönde dönüyor.)
 */
export function cardClass(className?: string): string {
  return ['overflow-hidden rounded-ops-card border border-ops-line bg-ops-white', className].filter(Boolean).join(' ');
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cardClass(className)} {...rest} />;
}
