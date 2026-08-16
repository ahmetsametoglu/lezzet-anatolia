'use client';

import { useState, type ComponentProps } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Badge } from '@/components/customer/ui/badge';
import { recordVariantStockNoticeAction } from '@/lib/delivery/notice-actions';
import { elsewhereReasonOf } from '@/lib/delivery/place-types';
import type { StockStatus } from '@lezzet/types';
import { useDeliveryPlace } from './place-context';
import { NoticeDialog } from './notice-dialog';
import { noticeButtonClass, ZoneNoticeButton, type NoticeEmphasis } from './zone-notice-button';
import messages from './place-messages.json';

/**
 * Kalemin dört hâlinin İŞARET DİLİ (19.7 · tasarım §3) — kart ve liste düzeyinde.
 *
 * Dördü de stoktan doğar, müşteri seçmez:
 *   `available`     → **hiçbir işaret yok.** İyi haber sessizdir; normal ürün araçla ücretsiz gelir.
 *   `shipping`      → "📦 Kargoyla gönderilir" — yerelde yok ama kargolanabiliyor.
 *   `elsewhere`     → soğuk zincir, kargoya verilemez. **İKİ ALT HÂLİ VAR** (aşağıda).
 *   `out_of_stock`  → işaret BURADA basılmaz: "Tükendi" kartın kendi köşe rozetidir (K7), çünkü o
 *                     yere bağlı değil evrensel bir hâldir ve görselin üstünde durur.
 *
 * ── `elsewhere` TEK CÜMLEYLE ANLATILAMAZ (09.08) ─────────────────────────────
 * Sebebi müşterinin rotada olup olmamasına göre değişir ve ikisi aynı şeyi vaat etmez:
 *   rota İÇİ  → "Bölgenizde şu an yok" — GEÇİCİ; bölgenin deposuna mal gelince çözülür ve
 *               bekleyeceği şey KALEM (`variant_stock_notice`).
 *   rota DIŞI → "bu adrese gönderemiyoruz" — KALICI; ürün gelse bile ona gidemez, çünkü soğuk
 *               zincir kargoya verilemiyor. Bekleyeceği şey BÖLGENİN açılması (`zone_notice`).
 * "Şu an yok" demek rota dışındaki müşteriye gelmeyecek bir mal beklettirirdi. Ayrım sepetin kısıt
 * bloğunda 01.08'den beri yapılıyordu (`place-restriction`: `reason` ↔ `reasonHere`); kart ve ürün
 * detayı düzeyinde yapılmıyordu, çünkü rota dışı müşteri bu hâle 19.23'e kadar hiç düşmüyordu.
 *
 * İki cümle de yer ailesinin mevcut sözlüğünden geliyor (`lineBlocked` sepet satırında da aynı
 * durumu anlatıyor) — yeni bir cümle ailesi yazılmadı.
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
  /**
   * `lg` = ÜRÜN DETAYININ başlık altı işareti (16.08, kullanıcı tespiti): sepete ekleme yolu
   * bilinçli olarak açık kaldığı için müşterinin "buraya gönderemiyoruz" gerçeğini İLK okuyacağı
   * yer burası — rozet puntosunda kaçıyordu ve müşteri alabileceğini sanıyordu. Kart/listede
   * varsayılan rozet kalır: orada işaret bir tarama ipucudur, sayfanın uyarısı değil.
   */
  size?: 'sm' | 'lg';
}

export function StockMark({ status, locale, size = 'sm' }: StockMarkProps) {
  const t = messages[locale];
  const { place } = useDeliveryPlace();

  // Büyük hâl Badge'e ölçü eklemez, kendi bandını çizer: rozet ailesi kısa etiketler için
  // (envanter K5), buradaki ise tek cümlelik bir uyarı bandı — tonlar aynı aileden (honey · kum).
  const band = (tone: 'blocked' | 'ship', text: string) =>
    size === 'lg' ? (
      <span
        className={[
          'inline-flex w-fit items-center rounded-soft border px-3.5 py-2 font-sans text-body-sm font-bold leading-snug',
          tone === 'blocked' ? 'border-honey-line bg-honey-bg text-honey' : 'border-sand-300 bg-closed-bg text-closed',
        ].join(' ')}
      >
        {text}
      </span>
    ) : (
      <Badge tone={tone === 'blocked' ? 'pending' : 'closed'} variant="outline">
        {text}
      </Badge>
    );

  if (status === 'shipping') return band('ship', t.shipMark);
  if (status === 'elsewhere') {
    return band('blocked', elsewhereReasonOf(place) === 'out_of_route' ? t.lineBlocked : t.awayMark);
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
 *
 * **ROTA DIŞINDA kendi yerini bölge notuna bırakır** (09.08 · kullanıcı kararı): orada beklenecek
 * şey kalem değil bölgedir, kalem notu tutulamayacak bir sözdür. Kararı ÇAĞIRAN değil bu bileşen
 * verir — düğmenin kendi ön koşulunu bilmesi, üç çağıranın (kart · ürün detayı masaüstü/mobil)
 * aynı koşulu üç kez yazıp birinde unutmasından güvenlidir.
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
