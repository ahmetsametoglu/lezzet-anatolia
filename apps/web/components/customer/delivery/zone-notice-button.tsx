'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
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

interface ZoneNoticeButtonProps {
  locale: Locale;
  /** Müşterinin cevabındaki posta kodu — kaydın anahtarı ve panelde geçen yer. */
  postalCode: string;
  emphasis?: NoticeEmphasis;
}

export function ZoneNoticeButton({ locale, postalCode, emphasis = 'card' }: ZoneNoticeButtonProps) {
  const t = messages[locale];
  const [open, setOpen] = useState(false);

  const fill = (text: string) => text.replace('{code}', postalCode);

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
          onSubmit={(email) => recordZoneNoticeAction(postalCode, email, locale)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
