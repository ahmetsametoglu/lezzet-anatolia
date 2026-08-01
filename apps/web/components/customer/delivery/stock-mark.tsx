'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Badge } from '@/components/customer/ui/badge';
import { buttonClass } from '@/components/customer/ui/button';
import { recordVariantStockNoticeAction } from '@/lib/delivery/notice-actions';
import type { StockStatus } from '@/lib/storefront/storefront-types';
import { useDeliveryPlace } from './place-context';
import { NoticeDialog } from './notice-dialog';
import messages from './place-messages.json';

/**
 * Kalemin dört hâlinin İŞARET DİLİ (19.7 · tasarım §3) — kart ve liste düzeyinde.
 *
 * Dördü de stoktan doğar, müşteri seçmez:
 *   `available`     → **hiçbir işaret yok.** İyi haber sessizdir; normal ürün araçla ücretsiz gelir.
 *   `shipping`      → "📦 Kargoyla gönderilir" — yerelde yok ama kargolanabiliyor.
 *   `elsewhere`     → "Bölgenizde şu an yok" — soğuk zincir, kargoya verilemez. YERE BAĞLI ve
 *                     değişebilir; birincil eylem "Gelince haber ver".
 *   `out_of_stock`  → işaret BURADA basılmaz: "Tükendi" kartın kendi köşe rozetidir (K7), çünkü o
 *                     yere bağlı değil evrensel bir hâldir ve görselin üstünde durur.
 *
 * **Metin burada, sayfada değil.** Aynı dört cümle anasayfa, katalog, ürün detayı ve sepette
 * görünüyor; dört `messages.json`'a kopyalansaydı biri değişince ötekiler eskirdi. Yer ailesinin
 * ortak metni yer ailesinin yanında durur (`place-chip` ile aynı desen).
 *
 * **Yer bilinmiyorken hiçbir işaret basılmaz** — çağıran sayfa yeri bilmeden `stockStatus`'ü zaten
 * ağ-geneli okumadan alır (`available` ya da `out_of_stock`); bu bileşen o hâllerde sessizdir.
 */
interface StockMarkProps {
  status: StockStatus;
  locale: Locale;
}

export function StockMark({ status, locale }: StockMarkProps) {
  const t = messages[locale];
  if (status === 'shipping') {
    return (
      <Badge tone="closed" variant="outline">
        {t.shipMark}
      </Badge>
    );
  }
  if (status === 'elsewhere') {
    return (
      <Badge tone="pending" variant="outline">
        {t.awayMark}
      </Badge>
    );
  }
  return null;
}

/**
 * "Gelince haber ver" — `elsewhere` hâlinin BİRİNCİL eylemi (tasarım: kartta çerçeveli, ürün
 * detayında dolu düğme).
 *
 * **Sepete ekleme yolunu kapatmaz:** müşteri bölge içindeki birine gönderiyor olabilir. Yer bir
 * söz, bir filtre değil (`place-types`) — bu düğme sepete eklemenin yerine değil, YANINA konur;
 * kartta yer dar olduğu için orada tek eylem odur, detayda ikisi birden durur.
 *
 * Kayıt bir SÖZ değil bir NOT: tetikleyici (stok girince mail) henüz yazılmadı ve metin de öyle
 * diyor ("not aldık"). Kaydın bugünkü değeri hangi ürünün nerede beklendiğini bilmek.
 */
interface StockNoticeButtonProps {
  variantId: string | null;
  /** Panelde geçen ürün adı — "{product} için not alalım". */
  productName: string;
  locale: Locale;
  /** Kartta çerçeveli ve küçük; ürün detayında dolu ve tam genişlik. */
  emphasis?: 'card' | 'panel';
}

export function StockNoticeButton({ variantId, productName, locale, emphasis = 'card' }: StockNoticeButtonProps) {
  const t = messages[locale];
  const { place } = useDeliveryPlace();
  const [open, setOpen] = useState(false);

  // Yer ya da varyant yoksa düğme HİÇ çizilmez: kaydın anahtarı (varyant + yer) eksikken açılan
  // panel, doldurulamayacak bir formdur. Bu hâl pratikte oluşmaz — `elsewhere` yalnız yer biliniyorken
  // doğar — ama düğmenin kendi ön koşulunu bilmesi, çağıranların onu unutmasından güvenlidir.
  if (!variantId || !place) return null;

  const fill = (text: string) => text.replace('{product}', productName).replace('{code}', place.postalCode);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass({
          variant: emphasis === 'card' ? 'secondary' : 'primary',
          size: emphasis === 'card' ? 'card' : 'md',
          fullWidth: emphasis === 'panel',
          className: emphasis === 'card' ? '!border-olive !text-olive flex-none whitespace-nowrap' : '',
        })}
      >
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
