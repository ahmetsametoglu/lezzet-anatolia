'use client';

import { useState } from 'react';
import { meetsMinBasket } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { useCart } from '@/components/customer/cart/cart-context';
import { cartKey, type CartLine, type CartRef } from '@/lib/cart/cart-types';
import { formatPrice } from '@/lib/storefront/format';
import type { DeliveryPlace } from '@/lib/delivery/place-types';
import { useDeliveryPlace } from './place-context';
import { PlaceDialog } from './place-dialog';
import { recordVariantStockNoticeAction, recordZoneNoticeAction } from '@/lib/delivery/notice-actions';
import type { ActionResult } from '@/lib/error';
import { NoticeDialog } from './notice-dialog';
import messages from './restriction-messages.json';

/**
 * K32 · Teslimat Kısıtı Bloğu — sepette ve (sonra) checkout'ta AYNI bileşen.
 *
 * Aynı olması tasarımın kararı: müşteri aynı kısıtı iki farklı dille iki kez okumamalı. Üç çıkış
 * HEP AYNI SIRADA durur — sepeti böl · yeri değiştir · haber ver.
 *
 * **Kırmızı yok, kilit yok.** Bu bir hata değil, bir durum bilgisi: sepete ekleme de checkout da
 * pasifleştirilmez. Müşteri bölge içindeki birine gönderiyor olabilir (tasarım §7).
 *
 * **Birinci çıkış her zaman mümkün değildir** ve tasarımın taslağı bunu atlıyordu. Üç hâl var,
 * üçünde de sebebi yazılır:
 *   sepetin tamamı kısıtlı → ayrılacak bir kalan yok, çıkış hiç gösterilmez
 *   kalan asgari sepetin altında → çıkış kapalı, eksik tutar söylenir
 *   kalan ücretsiz kargo eşiğinin altına düşüyor → çıkış açık ama doğacak ücret ÖNCEDEN söylenir
 * Üçüncüsü özellikle önemli: iki kalemi çıkarıp toplamın artmasını açıklamayan bir ekran, müşteriye
 * hata yapmış hissi verir.
 */
interface PlaceRestrictionProps {
  locale: Locale;
  /** Bu ekrandaki satırlar — sepette sepet satırları, checkout'ta siparişe girecek olanlar. */
  lines: CartLine[];
  /** Asgari sepet ve ücretsiz kargo eşiği (kuruş) — sepet okumasından gelir, ekran ayar okumaz. */
  minBasketCents: number;
  freeShippingCents: number;
  compact?: boolean;
  /**
   * Yerin KAYNAĞI. Verilmezse sitenin ortak cevabı kullanılır (başlıktaki hap) — sepetin hâli.
   *
   * **Checkout SEÇİLİ ADRESİ verir** ve bu şart: orada "nereye getirelim" sorusunun cevabı hapta
   * değil, müşterinin seçtiği adrestedir. İkisi ayrışabilir — müşteri sepette "şimdi değil" deyip
   * hiç kod vermemiş olabilir (o zaman hap boş, blok hiç doğmaz) ya da hapta bölge içi bir kod
   * varken bölge dışı bir adrese gönderiyor olabilir (blok yine doğmaz). İki hâlde de kısıt
   * gerçekti ve ekranda yalnız soluk bir cümle kalıyordu (29.07).
   */
  place?: DeliveryPlace | null;
  /**
   * "Yeri değiştir" çıkışının davranışı. Verilmezse posta kodu paneli açılır (sepetin hâli).
   * Checkout'ta yer bir kodla değil ADRESLE değişir — orada bu çıkış adres adımına götürür,
   * yoksa müşteri kodu değiştirir ama seçili adresi olduğu yerde kalırdı.
   */
  onChangePlace?: () => void;
}

/**
 * Bu ekranda gönderilemeyen satırlar. Bileşenin içinde ve dışında AYNI kural geçerli olsun diye
 * dışarı açık: çağıran "blok çizilecek mi" sorusunu ikinci bir filtreyle cevaplamamalı — iki
 * kopya, biri değiştiğinde sessizce ayrışır.
 *
 * Zaten engelli satır (tükendi/satıştan kalktı) SAYILMAZ: onun çıkışı bu blok değil, sepetten
 * çıkarmaktır.
 *
 * **Cevabı motor verir** (`line.route === 'not_shippable_here'`). Eski kural "rota dışındayım +
 * ürün kargolanamıyor" idi ve çok depoda bir hâli tamamen kaçırıyordu: rota İÇİNDEKİ müşterinin
 * kendi deposunda bulunmayan soğuk zincir ürünü. `place.inRoute` doğru olduğu için blok hiç
 * çizilmiyor, satır normal görünüyor, kalem checkout'a kadar geliyor ve orada reddediliyordu
 * (`cold_chain_unshippable`). Kısıt gerçekti; ekran onu ancak müşteri ödemeye geçince söylüyordu.
 *
 * PAKET satırı eski kuralda kalır: yolu yoktur (`route: null` — paket bölünmez, checkout'ta bütünü
 * üzerinden çözülür), o yüzden hakkındaki tek bilgi "içinde soğuk zincir var mı" (`shippable`).
 */
export function restrictedLines(place: DeliveryPlace | null, lines: CartLine[]): CartLine[] {
  if (!place) return [];
  return lines.filter((l) =>
    l.blocked ? false : l.route !== null ? l.route === 'not_shippable_here' : !place.inRoute && !l.shippable,
  );
}

/**
 * Rota İÇİNDEKİ müşterinin "gelince haber ver" kaydı — kalem başına bir satır.
 *
 * Tek bir hata bile kaydı başarısız sayar: müşteriye "not aldık" derken kalemlerin bir kısmının
 * düşmüş olması, tutulamayacak bir sözün yarısını vermektir. Paneli hatayla döndürmek, müşterinin
 * tekrar denemesini sağlar (kayıt kısmi unique'li — ikinci deneme çift satır yazmaz).
 */
async function recordVariantNotices(lines: CartLine[], email: string): Promise<ActionResult<true>> {
  const ok: ActionResult<true> = { data: true, error: null };
  const results = await Promise.all(
    lines.map((line) => (line.variantId ? recordVariantStockNoticeAction(line.variantId, email) : Promise.resolve(ok))),
  );
  return results.find((r) => r.error !== null) ?? ok;
}

export function PlaceRestriction({ locale, lines, minBasketCents, freeShippingCents, compact = false, place: override, onChangePlace }: PlaceRestrictionProps) {
  const t = messages[locale];
  const { place: chipPlace } = useDeliveryPlace();
  const { saveForLater } = useCart();
  const [placeOpen, setPlaceOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  // Yer: çağıran verdiyse o (checkout → seçili adres), yoksa sitenin ortak cevabı (sepet → hap).
  const place = override !== undefined ? override : chipPlace;

  // Kısıt YALNIZ rota dışı bir yer bilindiğinde doğar. Yer sorulmamışsa kimse "gönderemiyoruz"
  // diyemez: kime gönderileceği bilinmiyor (tasarım: atlanırsa uyarılar "muhtemel" tonunda kalır).
  const blocked = restrictedLines(place, lines);
  if (!place || blocked.length === 0) return null;

  /**
   * Kısıtın İKİ sebebi var ve müşteriye aynı cümleyle anlatılamaz:
   *   rota dışı  → "bu bölgeye hiç gelmiyoruz" — kalıcı; bekleyeceği şey BÖLGENİN açılması.
   *   rota içi   → "geliyoruz ama bu kalem bölgenizin deposunda şu an yok" — geçici; bekleyeceği
   *                şey KALEMİN gelmesi (vitrinin dördüncü hâli, 19.10 `elsewhere`).
   * İkisini "gönderemiyoruz" diye birleştirmek, gelecek malı bekleyen müşteriye bölge açılmasını
   * bekletmek olurdu. Kayıt da farklı: biri bölge notu, öteki varyant notu.
   */
  const here = place.inRoute;

  const remaining = lines.filter((l) => !blocked.includes(l));
  const remainingCents = remaining.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  const currentCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);

  const allBlocked = remaining.length === 0;
  const basket = meetsMinBasket(remainingCents, minBasketCents);
  // Eşik 0 = tanımsız (okuma varsayılanı); o zaman "kargo ücreti doğar" diye bir şey yok.
  const losesFreeShipping = freeShippingCents > 0 && currentCents >= freeShippingCents && remainingCents < freeShippingCents;
  const canSplit = !allBlocked && basket.ok;

  const refOf = (line: CartLine): CartRef =>
    line.kind === 'bundle' ? { kind: 'bundle', bundleId: line.bundleId } : { kind: 'variant', variantId: line.variantId, stockId: line.stockId };

  return (
    <div
      className={[
        'flex flex-col gap-3 rounded-card border border-honey-line bg-honey-bg',
        compact ? 'px-4 py-3.5' : 'px-5 py-4.5',
      ].join(' ')}
    >
      <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>
        {t.title.replace('{n}', String(blocked.length))}
      </span>
      <p className={['font-sans leading-relaxed text-body', compact ? 'text-micro' : 'text-note'].join(' ')}>
        {here ? t.reasonHere : t.reason}
      </p>

      {/* Hangi kalemler — sayı tek başına "hangisi" sorusunu cevaplamıyor.
          Satır içi "sonraya kaydet" YALNIZ ÇOĞULDA çizilir: seçim ancak seçilecek bir şey varken
          anlamlıdır ("ikisini bırak, birini gönder"). Tek kalemde o düğme alttaki birincil eylemle
          birebir aynı işi yapardı — aynı sonucu veren iki kontrol, müşteriyi olmayan bir farkı
          aramaya iter. Tek kalemde satır saf bilgidir: ad · adet · tutar. */}
      <ul className="flex flex-col gap-1.5">
        {blocked.map((line) => (
          <li key={cartKey(line)} className="flex items-center gap-3 rounded-soft border border-dashed border-honey-line bg-card px-3.5 py-2">
            {/* Nesne eylemden daha yüksek sesle konuşur: ad `body`, tutar `ink`. Eskiden ikisi de
                soluktu ve yanındaki zeytin link satırın en parlak öğesiydi. */}
            <span className="flex-1 font-sans text-note font-semibold text-body">
              {line.name}
              {line.unitLabel && ` · ${line.unitLabel}`} × {line.qty}
            </span>
            {line.lineTotalCents !== null && (
              <span className="font-sans text-note font-bold text-ink">{formatPrice(line.lineTotalCents, locale)}</span>
            )}
            {blocked.length > 1 && (
              <Button variant="ghost" size="xs" onClick={() => saveForLater([refOf(line)])}>
                {t.saveOne}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {/* Sepetin tamamı kısıtlıysa "kalanını sipariş et" anlamsız — cümle onun yerini alır. */}
      {allBlocked && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">{here ? t.allBlockedHere : t.allBlocked}</p>
      )}
      {!allBlocked && !basket.ok && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">
          {t.belowMin.replace('{remaining}', formatPrice(remainingCents, locale)).replace('{min}', formatPrice(minBasketCents, locale))}
        </p>
      )}
      {canSplit && losesFreeShipping && (
        <p className="font-sans text-note leading-relaxed text-honey">
          {t.losesFreeShipping.replace('{threshold}', formatPrice(freeShippingCents, locale))}
        </p>
      )}

      {/* Üç çıkış TEK dilbilgisiyle: dolu → çerçeveli → hayalet. Ağırlık farkı sırayı söyler, ama
          üçü de aynı ailedendir. Üçüncüsü eskiden altı çizili düz metindi ve iki hapın yanında
          "üçüncü buton" gibi değil, "metne kaçmış link" gibi duruyordu. */}
      <div className="flex flex-wrap items-center gap-2.5">
        {canSplit && (
          <Button size="sm" onClick={() => saveForLater(blocked.map(refOf))}>
            {t.splitCta}
          </Button>
        )}
        <Button variant="outlineOlive" size="sm" onClick={onChangePlace ?? (() => setPlaceOpen(true))}>
          {onChangePlace ? t.changeAddressCta : t.changeCta}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setNoticeOpen(true)}>
          {here ? t.noticeCtaHere : t.noticeCta}
        </Button>
      </div>

      {placeOpen && <PlaceDialog locale={locale} onClose={() => setPlaceOpen(false)} />}
      {noticeOpen && (
        <NoticeDialog
          locale={locale}
          title={here ? t.noticeTitleHere : t.noticeTitle}
          body={(here ? t.noticeBodyHere : t.noticeBody).replace('{code}', place.postalCode)}
          doneText={(here ? t.noticeDoneHere : t.noticeDone).replace('{code}', place.postalCode)}
          /* Rota içindeyken bölge notu ANLAMSIZ — müşteri zaten bölgede. Söz kalem kalem verilir
             ve kayıt da kalem kalem düşülür; tek bir çağrının kaydedeceği bir "bölge" yok.
             Bu dalda engelli satırların hepsi varyant satırıdır: paketin yolu `null` olduğu için
             kısıt süzgeci onu ancak rota DIŞINDA yakalar. */
          onSubmit={(email) => (here ? recordVariantNotices(blocked, email) : recordZoneNoticeAction(place.postalCode, email))}
          onClose={() => setNoticeOpen(false)}
        />
      )}
    </div>
  );
}
