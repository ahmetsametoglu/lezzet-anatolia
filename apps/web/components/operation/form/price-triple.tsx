'use client';

import type { ReactNode } from 'react';
import type { Channel } from '@lezzet/types';
import {
  channelPriceForMargin,
  discountPercentOf,
  markupPercent,
  priceFromDiscountPercent,
  revenueHtOf,
} from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import { MoneyField, PercentField } from './money-input';

/**
 * FİYATIN ÜÇ YÜZÜ — tutar (€) · liste fiyatına göre indirim (%) · alış fiyatına göre kâr marjı (%).
 *
 * Üçü AYNI sayının farklı okunuşudur; birini yazan öbür ikisini doldurur. Operatör kararı kimi zaman
 * "13,50 €'ya vereyim", kimi zaman "bu müşteriye hep %10 indirim", kimi zaman "%20 kârın altına
 * inmeyeyim" diye kurar — üçü de aynı fiyata çıkar ve ekran hangisinden girileceğini dayatmamalı.
 *
 * TEK KANONİK DEĞER FİYATTIR: kaydedilen odur, yüzdeler ondan TÜRER. Üçünü ayrı ayrı saklamak,
 * yuvarlama yüzünden birbirini tutmayan üç sayı demekti (13,50 € · %10 · %19,8 → hangisi doğru?).
 * Yazılmakta olan kutu kendi metnini korur (`useNumericDraft`), ötekiler anında yeniden hesaplanır.
 *
 * Hesapların hiçbiri burada YAZILMAZ, motordan gelir (`domain-core/pricing`): aynı marj ekranda bir,
 * uyarı eşiğinde başka formülle hesaplanırsa "hedefi tutturdum" diyen fiyat marj-altı listesine düşer.
 *
 * TABAN: fiyat ve liste kanalın kendi tabanında (b2c KDV DAHİL, b2b hariç), maliyet her zaman KDV
 * hariç. Marj HT gelir üzerinden hesaplanır — TTC fiyatı maliyete bölmek kârı KDV oranı kadar şişirir.
 *
 * Bilinmeyen taban alanı KİLİTLER: liste fiyatı yoksa indirim, maliyet yoksa marj hesaplanamaz.
 * Uydurma bir tabanla yüzde göstermek, olmayan bir hesabı doğruymuş gibi sunmaktır.
 */
interface PriceTripleProps {
  /** Girilen fiyat — kanalın KENDİ tabanında, kuruş. `null` = boş. */
  valueCents: number | null;
  onChange: (cents: number | null) => void;
  /** Fiyatın tabanını belirler (b2c TTC · b2b HT). */
  channel: Channel;
  vatRate: number;
  /** Karşılaştırma fiyatı — indirim yüzdesinin paydası, fiyatla AYNI tabanda. `null` → alan kilitli. */
  listCents: number | null;
  /** Birim maliyet (KDV hariç) — marjın paydası. `null` → alan kilitli. */
  costCents: number | null;
  priceLabel: ReactNode;
  priceLabelAside?: ReactNode;
  pricePlaceholder?: string;
  required?: boolean;
  /** Alan kimliklerinin öneki — aynı ekranda iki üçlü çakışmasın. */
  idPrefix: string;
  /** İndirim kutusunun örnek değeri (ör. sistemin önerdiği oran). */
  discountPlaceholder?: string;
  /**
   * **Üçlünün yönü.** `row` (varsayılan) geniş formlar için — fiyat ekranı böyle kullanıyor.
   * `column` DAR bir karar sütunu içindir: kutular alt alta gelir ve konteyner genişledikçe
   * uzamazlar.
   *
   * Neden prop, neden kullanıcının sarmalayıcısı değil: `grid-cols-3` bu komponentin İÇİNDE ve
   * dışarıdan ezilemiyordu; kart onu dar bir sütuna koyduğunda üç kutu sıkışıp okunmaz oluyordu.
   * Yön kararı burada dursun ki her çağıran aynı iki seçenekten birini alsın (kullanıcı kararı 10.08:
   * *"inputlar ekran genişliğine göre uzuyor, bu istediğim bir şey değil"*).
   */
  layout?: 'row' | 'column';
}

export function PriceTriple({
  valueCents,
  onChange,
  channel,
  vatRate,
  listCents,
  costCents,
  priceLabel,
  priceLabelAside,
  pricePlaceholder,
  required,
  idPrefix,
  discountPlaceholder = 'ör. 10',
  layout = 'row',
}: PriceTripleProps) {
  const discount = discountPercentOf(listCents, valueCents);
  const margin =
    valueCents === null || costCents === null ? null : markupPercent(revenueHtOf(channel, valueCents, vatRate), costCents);

  return (
    <div className="flex flex-col gap-1.5">
      <div className={layout === 'column' ? 'flex flex-col gap-3' : 'grid grid-cols-3 gap-3'}>
        <MoneyField
          label={priceLabel}
          labelAside={priceLabelAside}
          required={required}
          id={`${idPrefix}-price`}
          value={valueCents === null ? null : fromCents(valueCents)}
          onChange={(euros) => onChange(euros === null ? null : toCents(euros))}
          placeholder={pricePlaceholder}
        />

        {/* İndirim EKSİ olabilir: fiyat listenin üstündeyse zam demektir ve gizlenmez. */}
        <PercentField
          label="İndirim (%)"
          labelAside="listeye göre"
          id={`${idPrefix}-discount`}
          signed
          value={discount}
          disabled={listCents === null}
          placeholder={listCents === null ? '—' : discountPlaceholder}
          onChange={(pct) => {
            if (pct === null) return;
            const next = priceFromDiscountPercent(listCents, pct);
            if (next !== null) onChange(next);
          }}
        />

        {/* Marj da EKSİ olabilir — zararına satmak bir karardır (tarihi yaklaşan mal, özel anlaşma). */}
        <PercentField
          label="Kâr marjı (%)"
          labelAside="alışa göre"
          id={`${idPrefix}-margin`}
          signed
          value={margin}
          disabled={costCents === null}
          placeholder={costCents === null ? '—' : 'ör. 20'}
          onChange={(pct) => {
            if (pct === null) return;
            const next = channelPriceForMargin(channel, costCents, pct, vatRate);
            if (next !== null) onChange(next);
          }}
        />
      </div>

      {/* Mekanizma bir kez SÖYLENİR: kutular birbirine bağlı olduğunu kendiliğinden anlatmaz;
          operatör yüzde kutusunu "bilgi" sanıp fiyatı elle çevirmeye kalkardı. */}
      {/* Dar (dikey) sütunda GİZLİ: orada iki satıra düşüp sütunu uzatıyor ve yanındaki bilgi
          sütunuyla arasında ölü boşluk açıyor. Kutular alt alta ve etiketleri okunurken mekanizma
          zaten bir denemede anlaşılıyor; yatay düzende tek satır olduğu için orada kalıyor. */}
      <span className={`font-ops-body text-ops-micro leading-[1.5] text-ops-muted${layout === 'column' ? ' hidden' : ''}`}>
        Üçü aynı fiyatın farklı okunuşu — hangisini yazarsanız diğer ikisi ondan hesaplanır.
      </span>
    </div>
  );
}
