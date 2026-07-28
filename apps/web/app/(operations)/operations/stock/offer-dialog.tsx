'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { markupPercent, offerDiscountPercent, priceForMargin, suggestedOfferPriceCents } from '@lezzet/domain-core';
import { addVat, fromCents, removeVat, toCents } from '@lezzet/helper';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { MoneyField, PercentField } from '@/components/operation/form/money-input';
import { daysLabel, money, percent, shortDate } from '@/components/operation/ui/format';
import { setOfferPriceAction } from './actions';
import type { BatchView } from './stock-types';

// Tarihi yaklaşan partiye teklif diyaloğu — "bu partiyi indirimli satışa aç".
//
// BAŞLIK TÜRKÇE: tasarım "Near-expiry teklif aç" diyor ama operasyon yüzeyi Türkçedir ve "near-expiry"
// operatörün diline girmemiş bir terim. Ekranın geri kalanı ("Yaklaşan tarihli" sekmesi) zaten Türkçe
// söylüyordu; başlık tek başına İngilizce kalmıştı.
//
// EKRANIN SÖZÜ: sistem işaretledi ve bir fiyat ÖNERDİ; fiyatı da kararı da operatör verir. Bu yüzden
// öneri bir kutu içinde durur ve alan öneriyle DOLU gelir ama kilitli değildir — "sistem indirime
// soktu" izlenimi yaratmadan işi kolaylaştırır (design/pages/admin-stok §6).
//
// FİYATIN ÜÇ YÜZÜ, tek karar: tutar (€) · liste fiyatına göre indirim (%) · ALIŞ fiyatına göre kâr
// marjı (%). Üçü aynı sayının farklı okunuşudur; birini yazan öbür ikisini doldurur.
//
// Üçüncüsü tasarımda YOK, bilinçli bir ekleme: elden çıkarma kararında asıl soru "listeden ne kadar
// indirdim" değil, "bu maldan kâr mı ediyorum, ne kadar zarara razıyım". Liste fiyatı bir referans;
// karar alış fiyatına göre verilir. Marj EKSİ girilebilir — zararına satmak da bir karardır ve elde
// kalıp imha edilecek maldan iyidir.
//
// KDV: teklif fiyatı b2c tabanındadır (KDV DAHİL), alış fiyatı hariç. Marj HT gelir üzerinden
// hesaplanır — ikisini doğrudan karşılaştırmak kârı KDV oranı kadar şişirirdi.
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

  // Marj: KDV'siz gelir − alış maliyeti, maliyet üzerinden markup (DOMAIN'in marj tanımı).
  const vatRate = batch.variant.product.vatRate;
  const cost = batch.purchasePriceCents;
  const revenueHtCents = priceCents === null ? null : removeVat(priceCents, vatRate);
  const margin = revenueHtCents === null || cost === null ? null : markupPercent(revenueHtCents, cost);
  /** Marj yazılınca fiyatı türetir: hedef HT fiyat → KDV eklenerek satış fiyatına döner. */
  const priceFromMargin = (target: number): number | null =>
    cost === null ? null : fromCents(addVat(priceForMargin(cost, target), vatRate));

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
      title={editing ? 'Teklifi düzenle' : 'Tarihi yaklaşan partiye teklif aç'}
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
            Bu partinin kalan ömrü kabul eşiğinin (%{batch.mlorPercent}) altında — teklif kararına bağlam.
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {batch.suggestedOfferCents === null ? (
            <>Bu boyun liste fiyatı girilmemiş — sistem öneri üretemiyor, fiyatı siz belirleyin.</>
          ) : (
            <>
              Sistem önerisi: <strong className="text-ops-body">%{batch.offerDiscountPercent} indirim</strong> · liste{' '}
              {money(batch.listPriceCents)} → önerilen {money(batch.suggestedOfferCents)}
            </>
          )}
        </span>

        <div className="grid grid-cols-3 gap-3">
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
            placeholder={batch.listPriceCents === null ? '—' : `ör. ${batch.offerDiscountPercent}`}
            onChange={(pct) => {
              // Hesap MOTORDAN gelir (`suggestedOfferPriceCents` yüzdeyi parametre alır) — aynı
              // indirim iki farklı formülle hesaplanırsa öneri ile elle girilen yüzde ayrışırdı.
              const next = suggestedOfferPriceCents(batch.listPriceCents, pct ?? 0);
              if (next !== null) setPrice(fromCents(next));
            }}
          />
          {/* Kâr marjı: alış fiyatına göre. EKSİ girilebilir — zararına satmak da bir karardır. */}
          <PercentField
            label="Kâr marjı (%)"
            labelAside="alışa göre"
            id="offer-margin"
            value={margin}
            disabled={cost === null}
            placeholder={cost === null ? '—' : 'ör. 10'}
            onChange={(pct) => {
              if (pct === null) return;
              const next = priceFromMargin(pct);
              if (next !== null) setPrice(next);
            }}
          />
        </div>

        {/* KÂR EKSENİ — kararın asıl yüzü. Maliyet bilinmiyorsa alan kilitli ve sebebi yazılı:
            uydurma bir maliyetle marj göstermek, olmayan bir hesabı doğruymuş gibi sunardı. */}
        <MarginRow batch={batch} margin={margin} revenueHtCents={revenueHtCents} />

        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
          Teklif bu PARTİYE bağlıdır: miktar tavanı partinin kalanı ({batch.physicalQty} ad.) ve parti tükenince teklif
          kendiliğinden kalkar. Kupon ve genel indirim teklifli satıra uygulanmaz. Müşteriye giden metin “parti”, “lot”,
          “DLC” gibi iç terimleri taşımaz.
        </span>
      </div>
    </Dialog>
  );
}

interface MarginRowProps {
  batch: BatchView;
  margin: number | null;
  revenueHtCents: number | null;
}

/**
 * Kâr satırı — girilen fiyatın ALIŞ fiyatına göre ne anlama geldiğini açık açık yazar.
 *
 * Üç hâl var ve üçü de farklı bir cümle hak ediyor: kâr var · başa baş · zarar. Zararı gizlemek ya da
 * kırmızıyla korkutmak yerine TUTARIYLA söylüyoruz — "3,20 € zarar" bilinçli verilebilecek bir karar,
 * "kırmızı bir uyarı" ise operatörü düşünmeden geri adım attırır. Elde kalıp imha edilecek maldan
 * zararına satış iyidir ve ekran bu kararın önünü kesmez.
 */
function MarginRow({ batch, margin, revenueHtCents }: MarginRowProps): ReactNode {
  const cost = batch.purchasePriceCents;
  if (cost === null) {
    return (
      <span className="font-ops-body text-ops-xs text-ops-muted">
        Bu partinin alış fiyatı girilmemiş — kâr hesaplanamıyor. Karar yalnız liste fiyatına göre verilebilir.
      </span>
    );
  }
  if (revenueHtCents === null || margin === null) {
    return <span className="font-ops-body text-ops-xs text-ops-muted">Fiyat girilince kâr hesaplanır.</span>;
  }

  const profit = revenueHtCents - cost;
  const tone = profit > 0 ? 'text-ops-olive-dark' : profit === 0 ? 'text-ops-body' : 'text-ops-amber';
  const verdict = profit > 0 ? `${money(profit)} kâr` : profit === 0 ? 'başa baş' : `${money(-profit)} zarar`;

  return (
    <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
      Adet başına <span className={`font-ops-mono ${tone}`}>{verdict}</span> ({percent(margin, 1)}) ·{' '}
      {money(revenueHtCents)} KDV’siz gelir − {money(cost)} alış.{' '}
      {/* Toplam etki: karar tek adet için değil, elde kalan tüm parti için veriliyor. */}
      Parti tükenirse toplam{' '}
      <span className={`font-ops-mono ${tone}`}>{money(Math.abs(profit) * batch.physicalQty)}</span>{' '}
      {profit >= 0 ? 'kâr' : 'zarar'}.
    </span>
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
