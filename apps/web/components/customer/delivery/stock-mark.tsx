'use client';

import { useState, type ComponentProps } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Badge } from '@/components/customer/ui/badge';
import { Icon, type IconName } from '@/components/customer/ui/icons';
import { recordVariantStockNoticeAction } from '@/lib/delivery/notice-actions';
import { elsewhereReasonOf } from '@/lib/delivery/place-types';
import type { StockStatus } from '@lezzet/types';
import { useDeliveryPlace } from './place-context';
import { NoticeDialog } from './notice-dialog';
import { noticeButtonClass, ZoneNoticeButton, type NoticeEmphasis } from './zone-notice-button';
import messages from './place-messages.json';

/**
 * Kalemin dört hâlinin işaret dili: `available` sessizdir, `out_of_stock` kartın köşe rozetidir, `elsewhere` rota içinde geçici
 * ("bölgenizde şu an yok"), rota dışında kalıcıdır ("bu adrese gönderemiyoruz") ve ikisi aynı şeyi vaat etmez. Metin yer ailesinin
 * yanında durur, çünkü aynı cümleler dört sayfada görünür ve kopyalar ayrı ayrı eskirdi.
 */
interface StockMarkProps {
  status: StockStatus;
  locale: Locale;
  /**
   * `lg` ürün detayının başlık altı uyarısıdır: sepete ekleme yolu açık kaldığı için müşteri "buraya gönderemiyoruz" gerçeğini ilk
   * burada okur. Kart ve listede varsayılan rozet kalır, orada işaret bir tarama ipucudur.
   */
  size?: 'sm' | 'lg';
}

export function StockMark({ status, locale, size = 'sm' }: StockMarkProps) {
  const t = messages[locale];
  const { place } = useDeliveryPlace();

  // Büyük hâl rozet ailesine ölçü eklemez, kendi bandını çizer: rozet kısa etiketler içindir, bu tek cümlelik bir uyarıdır.
  const band = (tone: 'blocked' | 'ship', text: string, icon?: IconName) =>
    size === 'lg' ? (
      <span
        className={[
          // Ölçü `ColdChainMark` ile ortaktır: yan yana durdukları için farklı boyda biri rozet, öteki etiket gibi okunurdu.
          'inline-flex w-fit items-center gap-1.5 rounded-soft border px-2.5 py-1 font-sans text-note font-semibold leading-snug',
          tone === 'blocked' ? 'border-honey-line bg-honey-bg text-honey' : 'border-sand-300 bg-closed-bg text-closed',
        ].join(' ')}
      >
        {icon && <Icon name={icon} size={14} className="flex-none" />}
        {text}
      </span>
    ) : (
      <Badge tone={tone === 'blocked' ? 'pending' : 'closed'} variant="outline">
        {/* Boşluğu ÇAĞIRAN taşır: `Badge` yalnız kabuk ve tonu verir, içeriğin yerleşimine
            karışmaz — kabuğa `gap` eklemek onun "çağıran ANLAM seçer, sınıf değil" sözleşmesini
            bozardı. Ölçü büyük hâlle aynı (`gap-1.5`) ki iki boy yan yana aynı aileden okunsun. */}
        <span className="inline-flex items-center gap-1.5">
          {icon && <Icon name={icon} size={12} />}
          {text}
        </span>
      </Badge>
    );

  if (status === 'shipping') return band('ship', t.shipMark, 'box');
  if (status === 'elsewhere') {
    const outOfRoute = elsewhereReasonOf(place) === 'out_of_route';
    return band('blocked', outOfRoute ? t.lineBlocked : t.awayMark, outOfRoute ? 'snowflake' : undefined);
  }
  return null;
}

/**
 * Soğuk zincir ürünün künyesidir, teslimat ayrıntısı değil: kargoya verilememesinin sebebi budur. Tonu bilerek sessizdir, çünkü bir
 * engel değil bir özellik söyler ve uyarı tonu sorunsuz ürünü sorunlu gösterirdi.
 */
export function ColdChainMark({ label }: { label: string }) {
  return (
    // Ölçü yer işaretiyle ORTAK — gerekçesi orada (`band`), ikisi birlikte değişir.
    <span className="inline-flex w-max items-center gap-1.5 rounded-soft border border-sand-300 bg-sand-100 px-2.5 py-1 font-sans text-note font-semibold text-body">
      <Icon name="snowflake" size={14} />
      {label}
    </span>
  );
}

/**
 * "Gelince haber ver" sepete eklemenin yerine değil yanına konur: müşteri bölge içindeki birine gönderiyor olabilir. Rota dışında
 * yerini bölge notuna bırakır ve kararı bu bileşen verir, ki üç çağıran aynı koşulu ayrı ayrı yazmasın.
 */
interface StockNoticeButtonProps {
  variantId: string | null;
  /** Panelde geçen ürün adı — "{product} için not alalım". */
  productName: string;
  locale: Locale;
  /** Kartta çerçeveli ve küçük; ürün detayında dolu ve tam genişlik. */
  emphasis?: NoticeEmphasis;
  /** Bölge notu ALINMIŞSA düğmenin yerine geçecek detay köprüsü — yalnız kart verir (künye orada). */
  productHref?: ComponentProps<typeof ZoneNoticeButton>['productHref'];
}

export function StockNoticeButton({ variantId, productName, locale, emphasis = 'card', productHref }: StockNoticeButtonProps) {
  const t = messages[locale];
  const { place } = useDeliveryPlace();
  const [open, setOpen] = useState(false);

  // Yer ya da varyant yoksa düğme HİÇ çizilmez: kaydın anahtarı (varyant + yer) eksikken açılan
  // panel, doldurulamayacak bir formdur. Bu hâl pratikte oluşmaz — `elsewhere` yalnız yer biliniyorken
  // doğar — ama düğmenin kendi ön koşulunu bilmesi, çağıranların onu unutmasından güvenlidir.
  if (!variantId || !place) return null;

  // Rota DIŞI: kalem notu yerine bölge notu. Ürünün gelmesini beklemek burada bir şey çözmez —
  // geldiğinde de kargoya verilemeyecek; değişmesi gereken şey bölgedir.
  if (elsewhereReasonOf(place) === 'out_of_route') {
    return <ZoneNoticeButton locale={locale} postalCode={place.postalCode} emphasis={emphasis} productHref={productHref} />;
  }

  const fill = (text: string) => text.replace('{product}', productName).replace('{code}', place.postalCode);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={noticeButtonClass(emphasis)}>
        {t.notifyCta}
      </button>

      {open && (
        <NoticeDialog
          locale={locale}
          title={t.stockNoticeTitle}
          body={fill(t.stockNoticeBody)}
          doneText={fill(t.stockNoticeDone)}
          onSubmit={(email) => recordVariantStockNoticeAction(variantId, email)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
