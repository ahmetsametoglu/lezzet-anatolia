'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { buttonClass } from '@/components/customer/ui/button';
import { PlaceDialog } from './place-dialog';
import messages from './place-messages.json';

/**
 * Rota-only üründe satın alma eyleminin YERİNE geçen posta kodu isteği (02.08, kullanıcı kararı).
 *
 * **Neden bir düğme değişikliği:** soğuk zincir ürünü yalnız kendi aracımızla, yalnız rota
 * bölgesine gidiyor. Yer bilinmiyorken "Sepete ekle" düğmesi örtük bir iddia yapıyor —
 * *"bunu satın alabilirsiniz"* — ve onu doğrulayamıyoruz. Müşteri iddiaya güvenip sepete atıyor,
 * gerçeği ancak checkout'ta öğreniyor. Soru burada sorulunca hem dürüst oluyoruz hem de cevabı
 * alma olasılığımız en yüksek yerde soruyoruz: müşteri o an bu ürünü istiyor.
 *
 * **Bu bir SÜZGEÇ değil, bir SIRA.** Ürün katalogda duruyor, kart tıklanıyor, detay okunuyor,
 * fiyat görünüyor. Değişen tek şey eylemin bir ön koşulu olması; kod girilir girilmez kart dört
 * hâlinden birine oturuyor (kapıya · kargoyla · bölgenizde şu an yok · tükendi) ve normal akış
 * kaldığı yerden sürüyor.
 *
 * **Fiyat GİZLENMEZ.** Liste fiyatı yere göre asla değişmiyor (tasarım §5); değişebilen tek şey
 * near-expiry teklifi ve o da yalnız aşağı — yer bilinmiyorken teklifler hiç okunmadığı için
 * (`read-context`) gösterilen sayı tavandır, kod girilince ya aynı kalır ya düşer. Fiyatı
 * saklamak, düzelttiğimizden daha büyük bir bilgi kaybı olurdu: müşteri ürünle ilgilenip
 * ilgilenmeyeceğine karar edemezdi.
 *
 * ── TASARIMDAN SAPMA (kayıt: `design/BACKLOG §3`) ────────────────────────────
 * Tasarımın soğuk zincir kartı aynı hâli çiziyor ama altına *"davet zorunlu değildir, KİLİT
 * değildir: atlanabilir"* yazıyor. Kullanıcı kararıyla burada yumuşak bir kilide dönüştü. Ayrıca
 * tasarım satır içi bir posta kodu alanı çiziyor; burada sitenin kanonik panelini (`PlaceDialog`)
 * açıyoruz — üçüncü bir posta kodu girdisi yazmak aynı doğrulamayı üç yerde bakıma bırakırdı.
 */
// `onDark` prop'u SÖKÜLDÜ (sekizinci tur 20.08): tek kullanıcısı mobilin sabit koyu satın alma
// çubuğuydu ve çubuk akışa indi — kapı artık her yerde açık zeminde duruyor.
interface PlaceGateProps {
  locale: Locale;
}

export function PlaceGate({ locale }: PlaceGateProps) {
  const t = messages[locale];
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClass({
            variant: 'primary',
            size: 'lg',
            fullWidth: true,
            className: 'border-2 border-transparent !px-4 !py-3 leading-tight whitespace-nowrap',
          })}
        >
          {t.gateCta}
        </button>
        <span className="font-sans text-micro leading-relaxed text-muted">{t.gateHint}</span>
      </div>

      {open && <PlaceDialog locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}
