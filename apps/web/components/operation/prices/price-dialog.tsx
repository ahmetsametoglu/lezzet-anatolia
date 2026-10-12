'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  autoPriceCents,
  countryAutoPrice,
  markupPercent,
  priceForMargin,
  revenueHtOf,
  targetMarginFor,
  vatBaseOf,
} from '@lezzet/domain-core';
import { addVat, fromCents, removeVat, toCents } from '@lezzet/helper';
import { COUNTRY_LABELS, type Channel, type Country } from '@lezzet/types';
import { removeCountryPriceAction, setCountryPriceAction } from '@/app/(operations)/operations/country-price-actions';
import { vatRateLabel } from '@/components/operation/form/document-form/labels';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Toggle } from '@/components/operation/form/toggle';
import { DateField } from '@/components/operation/form/date-field';
import { MoneyField, PercentField } from '@/components/operation/form/money-input';
import { decimal, money, percent } from '@/components/operation/ui/format';
import { locative } from '@/components/operation/ui/suffix';
import { Metric } from '@/components/operation/ui/metric';
import { setAutoPriceAction, setChannelPriceAction } from '@/lib/prices/price-actions';
import {
  countryColumnLabel,
  countryPriceWrites,
  FOREIGN_COUNTRIES,
  PRICE_CHANNELS,
  type CountryDrafts,
  type CountryPricing,
} from './country-prices';
import type { PriceRow } from '@/lib/pricing/price-rows';

// Fiyat penceresi: iki kanalın genel ve ülke fiyatı, otomatik fiyat anahtarı ve hedef marj; Fiyatlar ve Ürünler aynı pencereyi açar. B2C
// KDV dahil, B2B hariç yazılır ve etiket bunu söyler, yoksa toptan fiyat perakendeye göre ayarlanır ve marj sessizce kayar.

interface PriceDialogProps {
  /** `marginCountry` doluysa en dar marj o ülkenin fiyatındadır (Fiyatlar listesi). */
  row: PriceRow & { marginCountry?: Country | null };
  /** Boyun ülke fiyatları ve ürünün o ülkelerde uygulanan oranları. */
  countries: CountryPricing;
  /** Otomatik fiyatın yuvarlama adımı (cent), ayardan; açan sayfa okur ki önizleme yazımla aynı adımı kullansın. */
  stepCents: number;
  onClose: () => void;
}

const draftsOf = (prices: CountryPricing['prices']): CountryDrafts =>
  Object.fromEntries(
    FOREIGN_COUNTRIES.map((country) => [
      country,
      Object.fromEntries(
        PRICE_CHANNELS.map((channel) => {
          const cents = prices[country]?.[channel].amountCents ?? null;
          return [channel, cents === null ? null : fromCents(cents)];
        }),
      ) as Record<Channel, number | null>,
    ]),
  );

export function PriceDialog({ row, countries, stepCents, onClose }: PriceDialogProps) {
  const router = useRouter();

  const [b2c, setB2c] = useState<number | null>(row.b2c.amountCents === null ? null : fromCents(row.b2c.amountCents));
  const [b2b, setB2b] = useState<number | null>(row.b2b.amountCents === null ? null : fromCents(row.b2b.amountCents));
  const [autoPrice, setAutoPrice] = useState(row.autoPrice);
  // Boş = şimdi geçerli; ileri tarih zammı bugünden hazırlar ve o güne kadar eski fiyat satılır.
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [target, setTarget] = useState<number | null>(row.targetMarginPercent);
  // B2B'ye özel hedef; boşsa ortak hedef geçer. Çözüm motordadır (`targetMarginFor`) ki önizleme, otomatik fiyat ve uyarı ayrışmasın.
  const [targetB2b, setTargetB2b] = useState<number | null>(row.targetMarginB2bPercent);
  // Ülke alanı boşsa o ülkede genel fiyat geçer; boşaltılan alan kaydedince ülke fiyatını kaldırır.
  const [drafts, setDrafts] = useState<CountryDrafts>(() => draftsOf(countries.prices));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cost = row.costCents;

  /** Kanalın kendi tabanındaki tutarı KDV HARİÇ gelire çevirir — marjın tek geçerli tabanı. */
  const htOf = (channel: 'b2c' | 'b2b', euros: number | null): number | null => {
    if (euros === null) return null;
    const cents = toCents(euros);
    return vatBaseOf(channel) === 'ttc' ? removeVat(cents, row.vatRate) : cents;
  };
  /** Hedef marjı sağlayan fiyat, kanalın KENDİ tabanında (b2c'ye KDV eklenir). */
  const priceFor = (channel: 'b2c' | 'b2b', marginPercent: number): number | null => {
    if (cost === null) return null;
    const ht = priceForMargin(cost, marginPercent);
    return fromCents(vatBaseOf(channel) === 'ttc' ? addVat(ht, row.vatRate) : ht);
  };

  const b2cMargin = cost === null ? null : markupPercent(htOf('b2c', b2c) ?? 0, cost);
  const b2bMargin = cost === null ? null : markupPercent(htOf('b2b', b2b) ?? 0, cost);
  const general: Record<Channel, number | null> = { b2c, b2b };

  /** Ülkenin tüketiciye uygulanan oranı; ürün oradaki tüketiciye satılmıyorsa `null`, çünkü o fiyattan satış olmaz. */
  const consumerRateIn = (country: Country): number | null => {
    const vat = countries.vat[country];
    return vat?.sellableToConsumer ? vat.consumerRate : null;
  };
  /** Ülkede geçen fiyatın (alan boşsa genel) marjı, o ülkede uygulanan oranla; KDV hariç kanalda oran marjı değiştirmez. */
  const countryMargin = (country: Country, channel: Channel): number | null => {
    const euros = drafts[country]?.[channel] ?? general[channel];
    const rate = channel === 'b2b' ? row.vatRate : consumerRateIn(country);
    if (cost === null || euros === null || rate === null) return null;
    return markupPercent(revenueHtOf(channel, toCents(euros), rate), cost);
  };

  /**
   * Otomatik hesabın YAZACAĞI fiyatlar. Yalnız fiyatı OLAN kanal listelenir: motor da kapalı bir
   * kanalı açmaz (fiyat satırının yokluğu "o kanalda satışa kapalı" demektir).
   */
  const autoPreviewText =
    cost === null
      ? ''
      : (['b2c', 'b2b'] as const)
          .filter((channel) => row[channel].amountCents !== null)
          .map((channel) => {
            // Kanalın kendi hedefi; motorun yazacağı fiyatla aynı çözüm.
            const channelTarget = targetMarginFor(channel, target, targetB2b);
            if (channelTarget === null) return null;
            const next = autoPriceCents({
              channel,
              costCents: cost,
              targetMarginPercent: channelTarget,
              vatRate: row.vatRate,
              stepCents,
            });
            return next === null ? null : `${channel.toUpperCase()} ${money(next)}`;
          })
          .concat(
            // Otomatik üründe ülkenin tüketici fiyatı orada uygulanan orandan türer; genel fiyata eşitse ülke satırı yazılmaz.
            FOREIGN_COUNTRIES.map((country) => {
              const channelTarget = targetMarginFor('b2c', target, targetB2b);
              if (row.b2c.amountCents === null || channelTarget === null) return null;
              const generalCents = autoPriceCents({
                channel: 'b2c',
                costCents: cost,
                targetMarginPercent: channelTarget,
                vatRate: row.vatRate,
                stepCents,
              });
              if (generalCents === null) return null;
              const next = countryAutoPrice({
                costCents: cost,
                targetMarginPercent: channelTarget,
                stepCents,
                countryVatRate: consumerRateIn(country),
                generalCents,
              });
              return next.action === 'set' ? `${countryColumnLabel('b2c', country)} ${money(next.amountCents)}` : null;
            }),
          )
          .filter(Boolean)
          .join(' · ');

  const submit = async () => {
    setBusy(true);
    setError(null);

    // Sıra bilinçli: önce ürün ayarı (anahtar + hedef), sonra fiyatlar. Anahtar açılırken hedef
    // eksikse action reddeder ve fiyat hiç yazılmaz — yarım kaydedilmiş bir durum doğmaz.
    const settings = await setAutoPriceAction(row.productId, autoPrice, target, targetB2b);
    if (settings.error) {
      setBusy(false);
      setError(settings.error);
      return;
    }

    // YALNIZ DEĞİŞENLER yazılır: `setPrice` her çağrıda yeni satır ekler (fiyat geçmişi). Değişmemiş
    // fiyatı yeniden yazmak, geçmişi aynı tutarın kopyalarıyla şişirirdi.
    const writes: Array<Promise<{ error: string | null }>> = [];
    // Tarih gün başı olarak yazılır: "1 Ağustos'tan itibaren" diyen operatör o günün başını kasteder. Boşsa `null`, servis "şimdi" yazar.
    const startsAt = effectiveFrom ? new Date(`${effectiveFrom}T00:00:00`).toISOString() : null;
    if (!autoPrice && b2c !== null && toCents(b2c) !== row.b2c.amountCents) {
      writes.push(setChannelPriceAction(row.variantId, 'b2c', toCents(b2c), startsAt));
    }
    if (!autoPrice && b2b !== null && toCents(b2b) !== row.b2b.amountCents) {
      writes.push(setChannelPriceAction(row.variantId, 'b2b', toCents(b2b), startsAt));
    }
    // Otomatik üründe ülke fiyatını motor yazar; elle yazılan ülke fiyatı bir sonraki hizalamada silinirdi.
    for (const write of autoPrice ? [] : countryPriceWrites(drafts, countries.prices)) {
      writes.push(
        write.kind === 'write'
          ? setCountryPriceAction(row.variantId, write.channel, write.country, write.amountCents, startsAt)
          : removeCountryPriceAction(row.variantId, write.channel, write.country),
      );
    }
    const results = await Promise.all(writes);
    setBusy(false);

    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setError(failed.error);
      return;
    }
    router.refresh();
    onClose();
  };

  // Boşaltılan kutu reddedilir: kanal kapatma ayrı bir iştir ve kutu sessizce yutulsa operatör kanalı kapattığını sanırdı.
  const emptied =
    !autoPrice && ((b2c === null && row.b2c.amountCents !== null) || (b2b === null && row.b2b.amountCents !== null));

  const blocked = autoPrice && target === null
    ? 'Otomatik fiyat için hedef marj girilmeli'
    : emptied
      ? 'Fiyat kutusu boş bırakılamaz — kanalı kapatmak ayrı bir iştir'
      : null;

  return (
    // Genişlik kitin varsayılanıdır (640); daha dar pencerede iki sütunlu alanların etiketleri sarar ve alanlar kayar.
    <Dialog
      open
      onClose={onClose}
      title="Fiyat düzenle"
      subtitle={row.title}
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {error ? (
              <span className="font-semibold text-ops-red">{error}</span>
            ) : (
              'Verilmiş siparişleri etkilemez'
            )}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || blocked !== null} title={blocked ?? undefined}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2.5">
        <Metric label="Maliyet" value={money(cost)} hint="Son alış — yeniden almanın bedeli (KDV hariç)" />
        <Metric
          label="Marj (şimdi)"
          value={row.marginPercent === null ? '—' : percent(row.marginPercent)}
          tone={row.belowTarget === true || (row.marginPercent ?? 0) < 0 ? 'red' : undefined}
          hint={
            row.marginChannel === null
              ? 'Fiyat yok'
              : `En dar: ${row.marginCountry ? countryColumnLabel(row.marginChannel, row.marginCountry) : row.marginChannel.toUpperCase()}`
          }
        />
        <Metric
          label="Hedef marj"
          value={
            target === null && targetB2b === null
              ? '—'
              : [target === null ? null : percent(target), targetB2b === null ? null : `B2B ${percent(targetB2b)}`]
                  .filter(Boolean)
                  .join(' · ')
          }
          hint={targetB2b === null ? 'İki kanalda da geçerli' : 'B2B kendi hedefini kullanır'}
        />
      </div>

      {/* Otomatik fiyatta kutular kilitlidir, çünkü elle yazılan fiyat bir sonraki otomatik hesapta silinirdi. */}
      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label="B2C liste fiyatı (€)"
          labelAside="KDV dahil"
          id="price-b2c"
          value={b2c}
          disabled={autoPrice}
          onChange={setB2c}
          placeholder="ör. 18,00"
        />
        <MoneyField
          label="B2B liste fiyatı (€)"
          labelAside="KDV hariç"
          id="price-b2b"
          value={b2b}
          disabled={autoPrice}
          onChange={setB2b}
          placeholder="ör. 15,00"
        />
        {/* Kanal başına marj: fiyatın ikinci yazımı. Maliyet yoksa kilitli ve sebebi yazılı —
            uydurma bir maliyetle marj göstermek olmayan bir hesabı doğruymuş gibi sunardı. */}
        <PercentField
          label="B2C marjı (%)"
          labelAside="alışa göre"
          id="price-b2c-margin"
          value={b2cMargin}
          disabled={cost === null || autoPrice}
          placeholder={cost === null ? '—' : 'ör. 42'}
          onChange={(pct) => {
            if (pct === null) return;
            const next = priceFor('b2c', pct);
            if (next !== null) setB2c(next);
          }}
        />
        <PercentField
          label="B2B marjı (%)"
          labelAside="alışa göre"
          id="price-b2b-margin"
          value={b2bMargin}
          disabled={cost === null || autoPrice}
          placeholder={cost === null ? '—' : 'ör. 30'}
          onChange={(pct) => {
            if (pct === null) return;
            const next = priceFor('b2b', pct);
            if (next !== null) setB2b(next);
          }}
        />
      </div>

      {FOREIGN_COUNTRIES.map((country) => {
        const consumerRate = consumerRateIn(country);
        const name = COUNTRY_LABELS[country];
        const toConsumers = `${name}${locative(name)}ki tüketiciye`;
        // Oranı olmayan ülkede tüketici marjı yazılmaz, çünkü o ülkenin tüketicisine satılmaz; işletme marjı yine geçerlidir.
        const margins = PRICE_CHANNELS.filter((channel) => channel !== 'b2c' || consumerRate !== null)
          .map((channel) => `${countryColumnLabel(channel, country)} ${percent(countryMargin(country, channel))}`)
          .join(' · ');
        return (
          <div key={country} className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-3">
              {PRICE_CHANNELS.map((channel) => {
                const generalEuros = general[channel];
                return (
                  <MoneyField
                    key={channel}
                    label={`${countryColumnLabel(channel, country)} fiyatı (€)`}
                    labelAside={channel === 'b2c' ? 'KDV dahil' : 'KDV hariç'}
                    id={`price-${channel}-${country}`}
                    value={drafts[country]?.[channel] ?? null}
                    disabled={autoPrice}
                    onChange={(euros) =>
                      setDrafts((prev) => ({ ...prev, [country]: { ...(prev[country] ?? { b2c: null, b2b: null }), [channel]: euros } }))
                    }
                    placeholder={generalEuros === null ? 'genel fiyat yok' : `genel: ${decimal(generalEuros)}`}
                  />
                );
              })}
            </div>
            <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
              {consumerRate === null
                ? `Boş alanda genel fiyat geçer. ${name} KDV oranı girilmemiş, ${toConsumers} satılmaz. Marj ${margins}.`
                : `Boş alanda genel fiyat geçer. Marj ${margins}, ${toConsumers} uygulanan KDV ${vatRateLabel(consumerRate)}.`}
            </span>
          </div>
        );
      })}

      <DateField
        label="Ne zamandan geçerli"
        labelAside="boş = hemen"
        value={effectiveFrom}
        onChange={setEffectiveFrom}
        placeholder="Hemen"
        disabled={autoPrice}
      />
      {effectiveFrom ? (
        // İleri tarihli yazım SESSİZ olmamalı: kaydeden kişi fiyatın bugün değişmeyeceğini bilmeli,
        // yoksa "kaydettim ama vitrinde eski fiyat" diye geri döner.
        <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-amber-dark">
          Yeni fiyat o güne kadar YÜRÜRLÜĞE GİRMEZ; bugünkü satışlar eski fiyattan devam eder.
        </span>
      ) : null}

      <div className="flex flex-col gap-3 rounded-ops-card border border-ops-line px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-px">
            <span className="font-ops-body text-ops-sm font-medium text-ops-ink">Otomatik fiyat</span>
            <span className="font-ops-body text-ops-xs text-ops-muted">
              Açıkken fiyat elle değil, hedef marjdan hesaplanır
            </span>
          </div>
          <Toggle on={autoPrice} onChange={setAutoPrice} label="Otomatik fiyat" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <PercentField
            label="Hedef marj (%)"
            labelAside={autoPrice ? 'zorunlu' : 'uyarı eşiği'}
            id="price-target"
            value={target}
            onChange={setTarget}
            placeholder="ör. 42"
          />
          {/* Boş bırakmak ortak hedefi B2B'de de geçerli kılar ve kutu bunu yer tutucusuyla söyler. Etiket kısadır, yarım sütunda sarsa
              alan kayardı. */}
          <PercentField
            label="B2B hedefi (%)"
            labelAside="boş = ortak"
            id="price-target-b2b"
            value={targetB2b}
            onChange={setTargetB2b}
            placeholder={target === null ? 'ör. 30' : `ortak: ${percent(target)}`}
          />
        </div>

        {/* SÜRPRİZ FİYAT OLMAZ (tasarım): otomatik hesap kaydederken çalışır, o yüzden sonucu
            ÖNCEDEN gösteriyoruz. Önizleme motorun kendi fonksiyonundan çıkar — ayrı bir formülle
            yazılsaydı ekranın vaat ettiği fiyatla yazılan fiyat bir gün ayrışırdı. */}
        {autoPrice ? (
          cost === null ? (
            <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-amber-dark">
              Maliyet bilinmiyor (alış fiyatlı parti yok) — otomatik hesap çalışmaz, fiyat olduğu gibi kalır.
            </span>
          ) : row.costJump ? (
            // Önizleme burada YANLIŞ olurdu: fren devrede, kaydetmek fiyatı hedefe ÇEKMEZ.
            <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-amber-dark">
              Son alış, önceki alımların ortancasından <strong>%{row.costJump.deviationPercent}</strong> sapıyor
              ({money(row.costJump.medianCents)} → {money(cost)}). Otomatik fiyat bu boyda BEKLİYOR: gerçek bir zam mı,
              tek seferlik bir alım mı — bunu sistem bilemez. Maliyet doğrulanınca fiyat kendiliğinden hizalanır.
            </span>
          ) : target === null ? null : (
            <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
              Kaydedince fiyat hedefe çekilir:{' '}
              <span className="font-ops-mono text-ops-body">{autoPreviewText}</span>. Maliyet değiştikçe (mal kabul)
              kendiliğinden güncellenir.
            </span>
          )
        ) : (
          <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
            Kapalıyken fiyata dokunulmaz; hedefin altına düşen satır yalnız “marj-altı” uyarısı alır.
          </span>
        )}
      </div>

      {/* "Verilmiş siparişleri etkilemez" alt şeritte yazar; burada yalnız başka yerde söylenmeyen iki bilgi kalır. */}
      <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Her değişiklik yeni fiyat satırı yazar (geçmiş korunur); müşteriye özel fiyatlar bu listeden bağımsızdır.
      </span>
    </Dialog>
  );
}

