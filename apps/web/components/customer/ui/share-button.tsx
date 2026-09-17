'use client';

import { shareProductAction } from '@/lib/analytics/actions';
import { MobileIcon } from './mobile-icon';

/**
 * Paylaş düğmesi — İÇERİĞİN İÇİNDE durur, başlıkta değil (kullanıcı kararı 20.08, yedinci tur):
 * ürün/paket detayında ürün adının sağında. Header sadeleşti (‹ + sepet), paylaşmanın bağlamı da
 * netleşti — düğme neyin yanındaysa onu paylaşır. İşaret KLASİK paylaş ikonu (yukarı ok + tepsi,
 * inline SVG `currentColor`): eski "↗" glifi bağlantı açma okuyla karışıyordu.
 *
 * Sistem paylaşım menüsünü açar; tasarımın etkileşim sözleşmesi WhatsApp'ı öncelikli sayıyor, ama
 * uygulama sırasını İŞLETİM SİSTEMİ belirler: kendi menümüzü çizmek, kullanıcının gerçekten
 * kullandığı uygulamayı listeden düşürür.
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
  /**
   * `inline` — içerikteki düğme (adın yanında). Telefon görünümünün iki biçimi native'in paylaş ikonunu taşır
   * (14.09): `photo` — ürün detayının kahramanında yüzen 42px krem cam daire (`sand-50/96`); `bar` — paket
   * detayının başlık çubuğunda zeminsiz 44px daire (geri düğmesinin `bar` biçiminin aynası). Davranış hepsinde aynı.
   */
  variant?: 'inline' | 'photo' | 'bar';
}

interface ShareSubject {
  subjectType: 'product' | 'bundle';
  subjectId: string;
  productId?: string | null;
}

export function ShareButton({ label, subject, variant = 'inline' }: ShareButtonProps) {
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

  if (variant === 'bar') {
    return (
      // Native'in 40'lık dairesi (`iconButton`); dokunma alanı görünmez `after` katmanıyla 44 (envanter tabanı) —
      // geri düğmesinin `bar` biçiminin aynası.
      <button
        type="button"
        onClick={onShare}
        aria-label={label}
        title={label}
        className="relative flex size-10 flex-none cursor-pointer items-center justify-center rounded-full text-ink transition-colors after:absolute after:-inset-0.5 after:content-[''] hover:bg-sand-200 active:bg-sand-200"
      >
        <MobileIcon name="share" size={17} />
      </button>
    );
  }

  if (variant === 'photo') {
    return (
      <button
        type="button"
        onClick={onShare}
        aria-label={label}
        title={label}
        className="flex size-10.5 flex-none cursor-pointer items-center justify-center rounded-full bg-sand-50/96 text-ink transition-transform active:scale-[0.97]"
      >
        <MobileIcon name="share" size={17} />
      </button>
    );
  }

  return (
    // Masaüstü detaylarında adın yanındaki beyaz, çerçeveli 44px daire (tasarım).
    <button
      type="button"
      onClick={onShare}
      aria-label={label}
      title={label}
      className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border border-sand-300 bg-card text-ink transition-colors hover:border-olive hover:text-olive"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
        <path d="m8 6 4-4 4 4" />
        <path d="M12 2v13" />
      </svg>
    </button>
  );
}
