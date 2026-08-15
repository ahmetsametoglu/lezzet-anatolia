'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { autoPriceCents, markupPercent, priceForMargin, targetMarginFor, vatBaseOf } from '@lezzet/domain-core';
import { addVat, fromCents, removeVat, toCents } from '@lezzet/helper';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Toggle } from '@/components/operation/form/toggle';
import { DateField } from '@/components/operation/form/date-field';
import { MoneyField, PercentField } from '@/components/operation/form/money-input';
import { money, percent } from '@/components/operation/ui/format';
import { Metric } from '@/components/operation/ui/metric';
import { setAutoPriceAction, setChannelPriceAction } from './actions';
import type { PriceRow } from './prices-types';

// Fiyat düzenleme diyaloğu — iki kanalın liste fiyatı + otomatik fiyat anahtarı + hedef marj.
//
// TABAN FARKI EKRANDA YAZILI: B2C fiyatı KDV DAHİL, B2B hariç (DOMAIN §5). İki kutu yan yana durunca
// aynı tabandaymış gibi okunur; etiket bunu söylemezse operatör toptan fiyatı perakendeye göre
// ayarlar ve marj sessizce kayar.
//
// MARJ KUTUSU FİYATIN İKİNCİ YAZIMIDIR (teklif diyaloğundaki desen): yüzde girilince fiyat dolar.
// Hesap motordan gelir (`priceForMargin`) — aynı marj iki formülle hesaplanırsa ekranla uyarı ayrışır.
//
// auto_price AÇIKKEN fiyat alanları KİLİTLİ: tasarımın kuralı ("otomatik üründe hedef marj değişir,
// fiyat elle değil"). Kilit bir engel değil bir açıklamadır — elle yazılan fiyatın bir sonraki
// otomatik hesapta silineceğini önceden söyler.

interface PriceDialogProps {
  row: PriceRow;
  onClose: () => void;
}

export function PriceDialog({ row, onClose }: PriceDialogProps) {
  const router = useRouter();

  const [b2c, setB2c] = useState<number | null>(row.b2c.amountCents === null ? null : fromCents(row.b2c.amountCents));
  const [b2b, setB2b] = useState<number | null>(row.b2b.amountCents === null ? null : fromCents(row.b2b.amountCents));
  const [autoPrice, setAutoPrice] = useState(row.autoPrice);
  // Boş = "şimdi geçerli". İleri tarih, zammı bugünden hazırlamak için (05.4 baştan destekliyordu,
  // ekranı yoktu): o güne kadar eski fiyat satılmaya devam eder.
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [target, setTarget] = useState<number | null>(row.targetMarginPercent);
  // B2B'ye ÖZEL hedef (15.08, kullanıcı kararı): toptan marjı perakendeden farklı kurulabilir.
  // Boş = ortak hedef B2B'de de geçerli; çözüm motorda (`targetMarginFor`) — önizleme, otomatik
  // fiyat ve marj-altı uyarısı aynı fonksiyonu okur.
  const [targetB2b, setTargetB2b] = useState<number | null>(row.targetMarginB2bPercent);
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
            // Kanalın KENDİ hedefi (15.08) — motorun yazacağı fiyatla birebir aynı çözüm.
            const channelTarget = targetMarginFor(channel, target, targetB2b);
            if (channelTarget === null) return null;
            const next = autoPriceCents({ channel, costCents: cost, targetMarginPercent: channelTarget, vatRate: row.vatRate });
            return next === null ? null : `${channel.toUpperCase()} ${money(next)}`;
          })
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
    // Tarih GÜN başı olarak yazılır: "1 Ağustos'tan itibaren" diyen operatör o günün başını
    // kasteder. Boşsa `undefined` → servis "şimdi" yazar.
    const startsAt = effectiveFrom ? new Date(`${effectiveFrom}T00:00:00`).toISOString() : null;
    if (!autoPrice && b2c !== null && toCents(b2c) !== row.b2c.amountCents) {
      writes.push(setChannelPriceAction(row.variantId, 'b2c', toCents(b2c), startsAt));
    }
    if (!autoPrice && b2b !== null && toCents(b2b) !== row.b2b.amountCents) {
      writes.push(setChannelPriceAction(row.variantId, 'b2b', toCents(b2b), startsAt));
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

  // Boşaltılan fiyat kutusu SESSİZCE YUTULMAZ: "bu kanalı kapatayım" diye kutuyu silen operatör
  // Kaydet'e basınca pencere kapanıyor, fiyat aynı kalıyordu. `null` tutar bugün desteklenmiyor
  // (kanal kapatma ayrı bir iş) — o zaman ekran REDDEDER, yutmaz.
  const emptied =
    !autoPrice && ((b2c === null && row.b2c.amountCents !== null) || (b2b === null && row.b2b.amountCents !== null));

  const blocked = autoPrice && target === null
    ? 'Otomatik fiyat için hedef marj girilmeli'
    : emptied
      ? 'Fiyat kutusu boş bırakılamaz — kanalı kapatmak ayrı bir iştir'
      : null;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={520}
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
          hint={row.marginChannel === null ? 'Fiyat yok' : `En dar: ${row.marginChannel === 'b2b' ? 'B2B' : 'B2C'}`}
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
          {/* Toptan marjı perakendeden farklı kurulabilir (15.08). Boş bırakmak bir karar:
              ortak hedef B2B'de de geçerli — kutu bunu placeholder'ıyla söyler. */}
          <PercentField
            label="B2B hedef marj (%)"
            labelAside="boş = ortak hedef"
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
            Kapalıyken sistem yalnız UYARIR: marj hedefin altına düşerse satır “marj-altı” listesine girer, fiyata
            dokunulmaz.
          </span>
        )}
      </div>

      <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Fiyat değişikliği YENİ bir satır yazar; eski fiyat geçmişte kalır ve verilmiş siparişlerin tutarı değişmez.
        Müşteriye özel fiyatlar bu listeden bağımsızdır ve çözümde önce gelir.
      </span>
    </Dialog>
  );
}

