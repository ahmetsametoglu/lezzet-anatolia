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
export function cardClass(className?: string): string {
  return ['overflow-hidden rounded-ops-card border border-ops-line bg-ops-card', className].filter(Boolean).join(' ');
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cardClass(className)} {...rest} />;
}
