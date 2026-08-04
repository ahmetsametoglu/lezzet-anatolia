'use client';

import { shareProductAction } from '@/lib/analytics/actions';

/**
 * Paylaş düğmesi (↗) — mobil detay başlığında. Sistem paylaşım menüsünü açar; tasarımın etkileşim
 * sözleşmesi WhatsApp'ı öncelikli sayıyor, ama uygulama sırasını İŞLETİM SİSTEMİ belirler: kendi
 * menümüzü çizmek, kullanıcının gerçekten kullandığı uygulamayı listeden düşürür.
 *
 * `navigator.share` yoksa (çoğu masaüstü tarayıcı) bağlantı panoya kopyalanır — düğme sessizce
 * ölmez. Paylaşılan adres o anki sayfadır, yani DİL ÖNEKİYLE birlikte gider: linki alan kişi
 * gönderenin okuduğu dilde açar.
 */
interface ShareButtonProps {
  label: string;
  /**
   * NE paylaşıldığı (08.9). Düğme adresi paylaşıyor ama defter adresi tanımaz — yol ROTA KALIBI
   * olarak yazılıyor (`ANALYTICS §2`), yani `/product/[slug]`'tan hangi ürün olduğu çıkmaz.
   * Konuyu bu yüzden çağıran söyler.
   */
  subject: ShareSubject;
}

export interface ShareSubject {
  subjectType: 'product' | 'bundle';
  subjectId: string;
  productId?: string | null;
}

export function ShareButton({ label, subject }: ShareButtonProps) {
  const onShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      // İptal etmek hata değildir — kullanıcı vazgeçtiğinde ekranda uyarı çıkmamalı.
      // **Olay da ancak ÇÖZÜLÜNCE atılır:** vazgeçilen paylaşım paylaşım değildir; çağrı anında
      // saysaydık menüyü açıp kapatan her ziyaretçi bir paylaşma olarak deftere düşerdi.
      void navigator.share({ url }).then(
        () => void shareProductAction({ ...subject, method: 'native' }),
        () => undefined,
      );
      return;
    }
    // Panoya kopyalama da bir paylaşma NİYETİDİR (masaüstünde tek yol) ve sayılır — ama `method`
    // ile ayrı: ikisinin dönüşümü aynı değil, tek sayıda toplamak masaüstünü mobil gibi okuturdu.
    void navigator.clipboard
      ?.writeText(url)
      .then(() => void shareProductAction({ ...subject, method: 'copy' }))
      .catch(() => undefined);
  };

  return (
    <button type="button" onClick={onShare} aria-label={label} title={label} className="cursor-pointer font-sans text-icon-sm text-ink">
      ↗
    </button>
  );
}
