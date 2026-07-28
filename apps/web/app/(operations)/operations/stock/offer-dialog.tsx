'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { OFFER_DISCOUNT_PERCENT, offerDiscountPercent, suggestedOfferPriceCents } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { MoneyField, PercentField } from '@/components/operation/form/money-input';
import { daysLabel, money, percent, shortDate } from '@/components/operation/ui/format';
import { setOfferPriceAction } from './actions';
import type { BatchView } from './stock-types';

// Near-expiry teklif diyaloğu — "bu partiyi indirimli satışa aç".
//
// EKRANIN SÖZÜ: sistem işaretledi ve bir fiyat ÖNERDİ; fiyatı da kararı da operatör verir. Bu yüzden
// öneri bir kutu içinde durur ve alan öneriyle DOLU gelir ama kilitli değildir — "sistem indirime
// soktu" izlenimi yaratmadan işi kolaylaştırır (design/pages/admin-stok §6).
//
// Kendi düzenini kuran bir form (paylaşılan `DialogFooter` yerine kendi alt barı): teklif kapatma
// yıkıcı olmayan ama geri döndürücü bir eylem ve İptal/Kaydet ikilisinin yanında üçüncü bir yol
// olarak durması gerekiyor. Bu bilinçli bir sapma, envanterin dışına düşmek değil.

interface OfferDialogProps {
  batch: BatchView;
  onClose: () => void;
}

export function OfferDialog({ batch, onClose }: OfferDialogProps) {
  const router = useRouter();
  const editing = batch.offerPriceCents !== null;

  // Açık teklif varsa onunla, yoksa öneriyle başlar. Öneri de yoksa (liste fiyatı girilmemiş) alan
  // BOŞ gelir — sıfır yazmak "bedava" demekti.
  const initial = batch.offerPriceCents ?? batch.suggestedOfferCents;
  const [price, setPrice] = useState<number | null>(initial === null ? null : fromCents(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const priceCents = price === null ? null : toCents(price);
  const discount = offerDiscountPercent(batch.listPriceCents, priceCents);

  const submit = async (next: number | null) => {
    setBusy(true);
    setError(null);
    const { error: actionError } = await setOfferPriceAction(batch.id, next);
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  };

  // Kaydetmenin engeli TEK yerde ve sebebi yazılır: düğme etkin görünüp hiçbir şey yapmasın.
  // Maliyetin ALTINDA fiyat engel DEĞİLDİR — zararına satmak da bir karardır (elde kalacak malı
  // hiç satmamaktan iyidir); ekran onu aşağıda uyarı olarak söyler, yolu kapatmaz.
  const blocked = price === null ? 'Teklif fiyatı girilmeli' : price <= 0 ? 'Fiyat sıfırdan büyük olmalı' : null;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={520}
      title={editing ? 'Teklifi düzenle' : 'Near-expiry teklif aç'}
      subtitle={`${batch.title}${batch.lotNumber ? ` · Lot ${batch.lotNumber}` : ''}`}
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : 'Karar sizin — sistem yalnız önerdi'}
          </span>
          {/* Teklifi kapatma yalnız AÇIKKEN görünür ve hiçbir koşulda engellenmez: yanlışlıkla
              açılmış bir teklif her zaman geri alınabilmeli. */}
          {editing ? (
            <Button variant="secondary" onClick={() => void submit(null)} disabled={busy}>
              Teklifi kapat
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit(price)}
            disabled={busy || blocked !== null}
            title={blocked ?? undefined}
          >
            {busy ? 'Kaydediliyor…' : editing ? 'Güncelle' : 'Teklifi aç'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2.5">
        <Metric label="Kalan" value={`${batch.physicalQty} ad.`} />
        <Metric
          label="Kalan raf"
          value={batch.remainingPercent === null ? '—' : percent(batch.remainingPercent)}
          tone={batch.flag === 'ok' ? undefined : 'amber'}
          hint={`${shortDate(batch.expiryDate)} · ${daysLabel(batch.daysLeft)}`}
        />
        <Metric label="Maliyet" value={money(batch.purchasePriceCents)} hint="Partinin alış fiyatı" />
      </div>

      {batch.belowMlor ? (
        <div className="flex items-start gap-2.5 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3.5 py-2.5">
          <span className="flex-none font-ops-display text-ops-sm font-bold text-ops-amber">MLOR</span>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
            Bu partinin kalan ömrü kabul eşiğinin (%75) altında — teklif kararına bağlam.
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {batch.suggestedOfferCents === null ? (
            <>Bu boyun liste fiyatı girilmemiş — sistem öneri üretemiyor, fiyatı siz belirleyin.</>
          ) : (
            <>
              Sistem önerisi: <strong className="text-ops-body">%{OFFER_DISCOUNT_PERCENT} indirim</strong> · liste{' '}
              {money(batch.listPriceCents)} → önerilen {money(batch.suggestedOfferCents)}
            </>
          )}
        </span>

        <div className="grid grid-cols-2 gap-3">
          <MoneyField
            label="Teklif fiyatı (€)"
            required
            id="offer-price"
            value={price}
            onChange={setPrice}
            placeholder="ör. 12,60"
          />
          {/* İndirim yüzdesi fiyatın İKİNCİ yazımıdır (paket formundaki desen): türetilir ve yazılınca
              fiyatı doldurur. Liste fiyatı yoksa oran hesaplanamaz — alan kilitli ve boş. */}
          <PercentField
            label="İndirim (%)"
            labelAside="fiyatla bağlı"
            id="offer-discount"
            value={discount != null && discount >= 0 ? discount : null}
            disabled={batch.listPriceCents === null}
            placeholder={batch.listPriceCents === null ? '—' : `ör. ${OFFER_DISCOUNT_PERCENT}`}
            onChange={(pct) => {
              // Hesap MOTORDAN gelir (`suggestedOfferPriceCents` yüzdeyi parametre alır) — aynı
              // indirim iki farklı formülle hesaplanırsa öneri ile elle girilen yüzde ayrışırdı.
              const next = suggestedOfferPriceCents(batch.listPriceCents, pct ?? 0);
              if (next !== null) setPrice(fromCents(next));
            }}
          />
        </div>

        {batch.purchasePriceCents !== null && priceCents !== null && priceCents < batch.purchasePriceCents ? (
          <span className="font-ops-body text-ops-xs text-ops-amber">
            Bu fiyat alış maliyetinin ({money(batch.purchasePriceCents)}) altında — zararına satış. Engel değil, bilginiz olsun.
          </span>
        ) : null}

        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
          Teklif bu PARTİYE bağlıdır: miktar tavanı partinin kalanı ({batch.physicalQty} ad.) ve parti tükenince teklif
          kendiliğinden kalkar. Kupon ve genel indirim teklifli satıra uygulanmaz. Müşteriye giden metin “parti”, “lot”,
          “DLC” gibi iç terimleri taşımaz.
        </span>
      </div>
    </Dialog>
  );
}

interface MetricProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'amber';
}

/** Diyalogun üst künyesi — etiket küçük ve sessiz, sayı büyük ve mono (rakam sütunları hizalansın). */
function Metric({ label, value, hint, tone }: MetricProps): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5" title={hint}>
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted">{label}</span>
      <span className={`font-ops-mono text-ops-section ${tone === 'amber' ? 'text-ops-amber' : 'text-ops-ink'}`}>{value}</span>
    </div>
  );
}
