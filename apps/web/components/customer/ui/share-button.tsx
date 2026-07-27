'use client';

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
}

export function ShareButton({ label }: ShareButtonProps) {
  const onShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      // İptal etmek hata değildir — kullanıcı vazgeçtiğinde ekranda uyarı çıkmamalı.
      void navigator.share({ url }).catch(() => undefined);
      return;
    }
    void navigator.clipboard?.writeText(url).catch(() => undefined);
  };

  return (
    <button type="button" onClick={onShare} aria-label={label} title={label} className="cursor-pointer font-sans text-icon-sm text-ink">
      ↗
    </button>
  );
}
