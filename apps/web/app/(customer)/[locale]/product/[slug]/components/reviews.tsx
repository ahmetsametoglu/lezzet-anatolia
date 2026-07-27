import type { Messages } from '../product-types';

/**
 * Yorumlar bölümü — bugün YALNIZ boş hâli var, ve bu bir eksiklik değil DOĞRU hâl.
 *
 * Yorum modeli 17-geri-bildirim'e ait ve henüz kurulmadı; dolayısıyla her ürünün onaylı yorum sayısı
 * gerçekten sıfırdır. Tasarım bu durumu ayrıca çizmiş ("Yorumsuz ürün — boş durum"), bu yüzden
 * bölümü hiç çizmemek de uydurma yorum basmak da yanlış olurdu: biri tasarımdan sapmak, diğeri
 * olmayan sosyal kanıtı varmış gibi göstermek.
 *
 * Tasarımın iki kuralı burada uygulanır:
 *   · Puan alanı GİZLENİR — "0,0" gösterilmez (sıfır puan, kötü ürün demek değildir)
 *   · "Yorum yaz" yalnız o ürünü SATIN ALMIŞ girişli müşteride görünür → bugün hiç görünmez (04/07)
 *
 * Bölüm ayrıca sayfanın dengesini kurar: masaüstünde beyan sütununun yanında durur; olmasaydı sol
 * sütun uzarken sağ taraf boş kalırdı.
 */
interface ReviewsProps {
  t: Messages;
  compact?: boolean;
}

export function Reviews({ t, compact = false }: ReviewsProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-card-title'].join(' ')}>
        {t.reviews.title}
      </h2>
      <div className="flex flex-col items-center gap-1.5 rounded-soft border border-dashed border-sand-400 px-6 py-6 text-center">
        <span className="text-icon">☆</span>
        <span className="font-sans text-body font-bold text-ink">{t.reviews.emptyTitle}</span>
        <span className="font-sans text-note text-muted">{t.reviews.emptyBody}</span>
      </div>
    </section>
  );
}
