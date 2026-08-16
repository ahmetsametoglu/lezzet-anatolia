'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { recordZoneNoticeAction } from '@/lib/delivery/notice-actions';
import { NoticeDialog } from './notice-dialog';
import messages from './restriction-messages.json';

/**
 * "Bölgeye gelince haber ver" — **rota DIŞINDAKİ** müşterinin tek doğru bekleyişi (`zone_notice`).
 *
 * Kardeşi `StockNoticeButton` ile karıştırılmaz ve ayrım `notice-actions`'ın kendi künyesinde
 * yazılı: o "bölgenize geliyoruz ama bu ürün burada şu an yok" hâlinin kaydı, bu "bölgenize hiç
 * gelmiyoruz" hâlinin. Rota dışındaki müşteriye kalem notu vermek tutulamayacak bir sözdür —
 * ürün gelse bile ona gidemez, çünkü soğuk zincir kargoya verilemiyor. Bekleyeceği şey ürün
 * değil, **bölgenin açılması**.
 *
 * **Kısıt bloğundan (K32) buraya çıkarıldı.** Ayrım sepette 01.08'den beri doğru yapılıyordu
 * (`place-restriction`: `here = place.inRoute`), kart ve ürün detayı düzeyinde yapılmıyordu. İki
 * yerde iki kopya panel yazmak yerine düğme ortak: metin, kayıt kapısı ve panelin davranışı tek
 * yerde durur. (Rota dışı müşteri bu hâle ancak 19.23'ten sonra düşebiliyor — o düzeltmeden önce
 * `warehouseId` iki anlam taşıdığı için ona "ücretsiz kapı teslimi" deniyordu ve eksik hiç
 * görünmüyordu.)
 *
 * Metin `restriction-messages.json`'da kalıyor, `place-messages.json`'a KOPYALANMADI: aynı cümleyi
 * iki sözlükte tutmak, biri değişince ötekinin sessizce eskimesi demek. Panelin kendisi de
 * (`NoticeDialog`) zaten o sözlükten besleniyor.
 */
export type NoticeEmphasis = 'card' | 'panel' | 'ghost';

/**
 * Haber düğmelerinin ortak görünüm kademesi — iki kardeş düğme (bölge notu · kalem notu) aynı
 * yerlerde belirdiği için ölçüleri de ortak:
 *   `card`  — vitrin kartının dar fiyat satırı: çerçeveli, küçük, satır sarmaz.
 *   `panel` — ürün detayının kısıt kutusu: dolu ve tam genişlik, oranın birincil eylemi.
 *   `ghost` — sepet kısıt bloğunun ÜÇÜNCÜ çıkışı: üç çıkışın en hafifi (dolu → çerçeveli → hayalet).
 */
export function noticeButtonClass(emphasis: NoticeEmphasis): string {
  if (emphasis === 'ghost') return buttonClass({ variant: 'ghost', size: 'sm' });
  return buttonClass({
    variant: emphasis === 'card' ? 'secondary' : 'primary',
    size: emphasis === 'card' ? 'card' : 'md',
    fullWidth: emphasis === 'panel',
    className: emphasis === 'card' ? '!border-olive !text-olive flex-none whitespace-nowrap' : '',
  });
}

/**
 * ── "BİR KEZ NOT ALDIK" HAFIZASI (16.08, kullanıcı tespiti) ─────────────────
 * Bekleyiş BÖLGENİNDİR, ürünün değil — ama düğme her ürün kartında ve sepette beliriyor ve not
 * bırakan müşteri her yerde aynı daveti görmeye devam ediyordu: "kaydım alınmadı mı?" Sunucu kaydı
 * zaten idempotent (`already` de başarı sayılır); eksik olan tarayıcının HATIRLAMASIYDI.
 *
 * Hafıza `localStorage`'da ve POSTA KODUYLA anahtarlı: yer değişirse (yeni kod) davet yeniden
 * görünür — yeni bölge yeni bir bekleyiştir. Çerez değil, çünkü sunucunun bu bilgiye ihtiyacı yok;
 * hesap da değil, çünkü kayıt hesapsız verilebiliyor. Depolama kapalıysa (gizli sekme) sessizce
 * unutulur: düğme yeniden görünür, mükerrer kaydı sunucu zaten yutuyor — hata değil, en kötüsü
 * bir kez daha sorulmuş olur.
 */
const NOTED_KEY = 'lz-zone-notice';

/**
 * Hafıza değişince SAYFADAKİ ÖTEKİ düğmelere de haber (16.08, kullanıcı tespiti): vitrinde aynı
 * düğme onlarca kartta duruyor ve `storage` olayı yalnız BAŞKA sekmelere gider — not bırakılan
 * sekmede kalan kartlar yenilemeye kadar daveti göstermeye devam ediyordu.
 */
const NOTED_EVENT = 'lz-zone-notice-change';

function notedCodes(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(NOTED_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberNoted(postalCode: string): void {
  try {
    window.localStorage.setItem(NOTED_KEY, JSON.stringify({ ...notedCodes(), [postalCode]: new Date().toISOString() }));
    window.dispatchEvent(new Event(NOTED_EVENT));
  } catch {
    // Depolama yazılamıyorsa (dolu/kapalı) davet bir dahaki ziyarette yeniden görünür — sunucu
    // kaydı idempotent, mükerrer istek zararsız.
  }
}

interface ZoneNoticeButtonProps {
  locale: Locale;
  /** Müşterinin cevabındaki posta kodu — kaydın anahtarı ve panelde geçen yer. */
  postalCode: string;
  emphasis?: NoticeEmphasis;
  /**
   * Not alındıktan sonra düğmenin yerine geçecek ÜRÜN DETAYI köprüsü — yalnız kart bağlamı verir
   * (16.08, kullanıcı kararı): kartta uzun bir onay cümlesi taşar, oysa boş kalan eylem yuvasına
   * detaya davet koymak kartın işine devam eder. Detay sayfası ve sepet vermez — orada zaten
   * detaydasın / köprünün anlamı yok, kısa onay metni kalır.
   */
  productHref?: ComponentProps<typeof Link>['href'];
}

export function ZoneNoticeButton({ locale, postalCode, emphasis = 'card', productHref }: ZoneNoticeButtonProps) {
  const t = messages[locale];
  const [open, setOpen] = useState(false);
  // Hafıza EFEKTTE okunur, ilk çizimde değil: sunucu HTML'i düğmeyle gelir, `localStorage` ancak
  // tarayıcıda okunabilir — ilk çizimde okumak hydration uyuşmazlığı doğururdu.
  const [noted, setNoted] = useState(false);
  useEffect(() => {
    const sync = () => setNoted(Boolean(notedCodes()[postalCode]));
    sync();
    // Aynı sekmedeki öteki kartlar (özel olay) + öteki sekmeler (`storage`) aynı anda döner.
    window.addEventListener(NOTED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(NOTED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [postalCode]);

  const fill = (text: string) => text.replace('{code}', postalCode);

  // Not zaten alınmışsa davet TEKRARLANMAZ: kartta yerine ürün detayı köprüsü, öbür bağlamlarda
  // kısa bir onay — düğmeyi büsbütün yok etmek "kaydım kayboldu mu" sorusunu açık bırakırdı.
  if (noted && !open) {
    if (productHref) {
      return (
        <Link href={productHref} className={noticeButtonClass('card')}>
          {t.detailCta}
        </Link>
      );
    }
    return <span className="font-sans text-note leading-relaxed text-olive-dark">✓ {t.noticeSaved}</span>;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={noticeButtonClass(emphasis)}>
        {t.noticeCta}
      </button>

      {open && (
        <NoticeDialog
          locale={locale}
          title={t.noticeTitle}
          body={fill(t.noticeBody)}
          doneText={fill(t.noticeDone)}
          /**
           * Sayfanın dili kayda GEÇİYOR (14.10): kayıt hesapsız olabildiği için haber
           * gönderilirken dili çözecek bir profil yoktur — yazılmazsa bir daha öğrenilemez ve
           * Alman müşteri Fransızca bir haber okur. Kapının kendi künyesi bunu istiyordu, çağıran
           * geçmiyordu.
           */
          onSubmit={async (email) => {
            const result = await recordZoneNoticeAction(postalCode, email, locale);
            // Hafıza yalnız BAŞARIDA yazılır: reddedilen bir kayıt düğmeyi susturursa müşteri
            // hiç not bırakamadan "not aldık" okur.
            if (!result.errorKey) {
              rememberNoted(postalCode);
              setNoted(true);
            }
            return result;
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
