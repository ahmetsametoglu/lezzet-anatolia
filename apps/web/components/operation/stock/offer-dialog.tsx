'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { discountPercentOf, markupPercent } from '@lezzet/domain-core';
import { fromCents, removeVat, toCents } from '@lezzet/helper';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { HandoffNote } from '@/components/operation/ui/handoff-note';
import { PriceTriple } from '@/components/operation/form/price-triple';
import { daysLabel, money, percent, shortDate } from '@/components/operation/ui/format';
import { setOfferPriceAction } from '@/lib/stock/offer-actions';
import type { BatchView } from '@/lib/stock/batch-types';

// Tarihi yaklaşan partiye teklif diyaloğu — "bu partiyi indirimli satışa aç".
//
// İKİ ekranın ortak diyaloğu (stok 09.13 · fiyatlar 09.5): aynı karar iki yerden verilebiliyor ama
// TEK yerde yazılı. Kopyalansaydı biri KDV'yi düşerken öbürü unutabilirdi.
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
// marjı (%). Üçü aynı sayının farklı okunuşudur; birini yazan öbür ikisini doldurur. Kontrolün
// kendisi ORTAK (`PriceTriple`) — aynı üçlü müşteriye özel fiyat diyaloğunda da var.
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
  /**
   * **Asistan önerisinden gelindiyse** devir künyesi + o önerinin fiyatı (22.5). Verilmezse diyalog
   * hiç değişmez — elle açılan yol tek satır bile farklı koşmaz.
   *
   * Künye diyaloğun İÇİNDE duruyor, sayfada değil: bu pencere kendiliğinden açılıyor ve örtüsü
   * sayfayı kaplıyor. Künye arkada kalsaydı operatör fiyatın neden dolu geldiğini ancak pencereyi
   * kapattıktan sonra görürdü — yani kararı verdikten sonra.
   */
  handoff?: { proposalId: string; summary: string; reason: string | null; offerPriceCents: number } | null;
}

export function OfferDialog({ batch, onClose, handoff = null }: OfferDialogProps) {
  const router = useRouter();
  const editing = batch.offerPriceCents !== null;

  // Öneriden gelindiyse ONUN fiyatı; yoksa açık teklif, o da yoksa sistemin önerisi. Öneri de yoksa
  // (liste fiyatı girilmemiş) alan BOŞ gelir — sıfır yazmak "bedava" demekti.
  const initial = handoff?.offerPriceCents ?? batch.offerPriceCents ?? batch.suggestedOfferCents;
  const [price, setPrice] = useState<number | null>(initial === null ? null : fromCents(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const priceCents = price === null ? null : toCents(price);

  // Marj: KDV'siz gelir − alış maliyeti, maliyet üzerinden markup (DOMAIN'in marj tanımı). Üçlünün
  // içinde de aynı hesap var; buradaki, aşağıdaki KÂR CÜMLESİ için (tutarı da yazar, yalnız oranı değil).
  const vatRate = batch.variant.product.vatRate;
  const cost = batch.purchasePriceCents;
  const revenueHtCents = priceCents === null ? null : removeVat(priceCents, vatRate);
  const margin = revenueHtCents === null || cost === null ? null : markupPercent(revenueHtCents, cost);

  // Önerinin KDV'siz getirisi − alış: sistem önerisi listeden düz % iner ve maliyeti hiç görmez;
  // zararına düşen öneri, öneri cümlesinin içinde işaretlenir (uydurma taban yok — biri null'sa null).
  const suggestedProfit =
    batch.suggestedOfferCents === null || cost === null ? null : removeVat(batch.suggestedOfferCents, vatRate) - cost;

  // Parametre KURUŞTUR ve adı bunu söyler (yaşandı 15.08): buraya euro hâli (`price`) bağlanmıştı —
  // 2,91 gibi kesirli fiyatı Zod "integer bekliyordum" diye reddediyordu; asıl tehlike TAM euro'ydu:
  // 5,00 € doğrulamadan geçer ve teklif sessizce 5 KURUŞ yazılırdı. Action kuruş konuşur, ekran da
  // ona kuruş verir.
  const submit = async (nextCents: number | null) => {
    setBusy(true);
    setError(null);
    // Kuyruk satırı YALNIZ teklif AÇILDIĞINDA kapanır: `null` göndermek teklifi kaldırmaktır ve
    // öneriyi "uygulandı" saymak, tam tersini yapan bir kaydı onay diye damgalamak olurdu.
    const { error: actionError } = await setOfferPriceAction(
      batch.id,
      nextCents,
      nextCents === null ? null : handoff?.proposalId,
    );
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
      // Genişlik EN KALABALIK hâle göre (15.08, kullanıcı bildirimi): 520'de fiyat üçlüsünün ilk
      // etiketi ("Teklif fiyatı (€) * KDV dahil") hücreye sığmayıp kırılıyor ve kutu aşağı kayıyordu;
      // düzenleme footer'ında da dördüncü öğe ("Teklifi kapat") iki satıra düşüyordu.
      maxWidth={640}
      title={editing ? 'Teklifi düzenle' : 'Tarihi yaklaşan partiye teklif aç'}
      subtitle={`${batch.title}${batch.lotNumber ? ` · Lot ${batch.lotNumber}` : ''}`}
      footer={
        <>
          {/* Mesaj `min-w-0` ile SARAR, düğmeler `shrink-0` ile sabittir: uzun bir hata metni
              düğmeleri sıkıştırıp iki satıra kırıyordu (yaşandı 15.08, Zod hatasıyla). */}
          <span className="mr-auto min-w-0 font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : 'Karar sizin — sistem yalnız önerdi'}
          </span>
          {/* Teklifi kapatma yalnız AÇIKKEN görünür ve hiçbir koşulda engellenmez: yanlışlıkla
              açılmış bir teklif her zaman geri alınabilmeli. */}
          {editing ? (
            <Button variant="secondary" className="shrink-0" onClick={() => void submit(null)} disabled={busy}>
              Teklifi kapat
            </Button>
          ) : null}
          <Button variant="secondary" className="shrink-0" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button
            variant="primary"
            className="shrink-0"
            onClick={() => void submit(priceCents)}
            disabled={busy || blocked !== null}
            title={blocked ?? undefined}
          >
            {busy ? 'Kaydediliyor…' : editing ? 'Güncelle' : 'Teklifi aç'}
          </Button>
        </>
      }
    >
      {/* Devir künyesi EN ÜSTTE: fiyatın neden dolu geldiğini, alana bakmadan önce söyler. */}
      {handoff ? (
        <HandoffNote dense summary={handoff.summary} reason={handoff.reason}>
          Fiyat önerideki gibi dolduruldu ama <strong className="font-semibold">kilitli değil</strong> — aşağıdaki
          kâr satırına bakıp değiştirebilirsiniz. Kaydedince öneri kuyruktan düşer; teklifi kapatmak
          öneriyi uygulamak sayılmaz.
        </HandoffNote>
      ) : null}

      <div className="grid grid-cols-3 gap-2.5">
        <Metric label="Kalan" value={`${batch.physicalQty} ad.`} />
        {/* Tarih GÖRÜNÜR satırda, tooltip'te değil (15.08, kullanıcı bildirimi): "tarihi yaklaşan"
            kararının asıl girdisi tarih ve kalan gün — fareyle keşfedilecek bir ayrıntı değil.
            Ton da kademeli: tarihi GEÇMİŞ parti amber değil kırmızı, %0 ile %10 aynı renkte durmasın. */}
        <Metric
          label="Kalan raf"
          value={batch.remainingPercent === null ? '—' : percent(batch.remainingPercent)}
          tone={batch.flag === 'ok' ? undefined : batch.daysLeft < 0 ? 'red' : 'amber'}
          sub={`${shortDate(batch.expiryDate)} · ${daysLabel(batch.daysLeft)}`}
        />
        <Metric label="Maliyet" value={money(batch.purchasePriceCents)} sub="Partinin alış fiyatı" />
      </div>

      {batch.belowMlor ? (
        <div className="flex items-start gap-2.5 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3.5 py-2.5">
          <span className="flex-none font-ops-display text-ops-sm font-bold text-ops-amber">MLOR</span>
          {/* Rozet yüzeyin yerleşik terimi (stok "MLOR · kısa" çipi); cümle onu düz Türkçeyle açıyor. */}
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
            Bu parti, kalan ömrü kabul eşiğinin (%{batch.mlorPercent}) altındayken teslim alınmış — raf ömrü
            baştan kısaydı, hızlı eritilmesi bekleniyordu. Teklif kararınızı buna göre verin.
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {batch.suggestedOfferCents === null ? (
            <>Bu boyun liste fiyatı girilmemiş — sistem öneri üretemiyor, fiyatı siz belirleyin.</>
          ) : (
            <>
              {/* Yüzde ÖNERİLEN FİYATTAN türer, ayardan değil: ayar %30 der ama önerilen fiyat kuruşa
                  yuvarlanır ve kutu %29,9 gösterir — cümleyle kutu farklı sayı söyleyemez (15.08).
                  Ayarın kendisi indirim kutusunun placeholder'ında yaşamaya devam ediyor. */}
              Sistem önerisi:{' '}
              <strong className="text-ops-body">
                {percent(discountPercentOf(batch.listPriceCents, batch.suggestedOfferCents), 1)} indirim
              </strong>{' '}
              · liste {money(batch.listPriceCents)} → önerilen {money(batch.suggestedOfferCents)}
              {/* Öneri MALİYETİ GÖRMEZ (listeden düz % iner) — zararına bir öneri, öneri cümlesinin
                  kendisinde işaretlenir; kâr satırı zaten anlatıyor ama oraya kadar inmeden görülsün. */}
              {suggestedProfit !== null && suggestedProfit < 0 ? (
                <span className="font-semibold text-ops-amber">
                  {' '}
                  — dikkat: öneri alış maliyetinin ({money(cost)}) altında.
                </span>
              ) : null}
            </>
          )}
        </span>

        {/* Fiyatın üç yüzü ORTAK komponentte: aynı üçlü müşteriye özel fiyat diyaloğunda da var ve
            ikisi aynı hesabı kullanmak zorunda — teklifte %10 indirim, özel fiyatta başka bir kuruş
            demesin. Teklif fiyatı b2c tabanındadır (KDV dahil). */}
        <PriceTriple
          valueCents={priceCents}
          onChange={(cents) => setPrice(cents === null ? null : fromCents(cents))}
          channel="b2c"
          vatRate={vatRate}
          listCents={batch.listPriceCents}
          costCents={cost}
          priceLabel="Teklif fiyatı (€)"
          priceLabelAside="KDV dahil"
          pricePlaceholder="ör. 12,60"
          required
          idPrefix="offer"
          discountPlaceholder={`ör. ${batch.offerDiscountPercent}`}
        />

        {/* KÂR EKSENİ — kararın asıl yüzü. Maliyet bilinmiyorsa alan kilitli ve sebebi yazılı:
            uydurma bir maliyetle marj göstermek, olmayan bir hesabı doğruymuş gibi sunardı. */}
        <MarginRow batch={batch} margin={margin} revenueHtCents={revenueHtCents} />

        {/* Ders metni İKİ cümleye indi (15.08, metin yoğunluğu bildirimi): "iç terim taşımaz" cümlesi
            operatörün kararını değiştirmeyen bir güvenceydi, her açılışta tekrarlanmayı hak etmiyor. */}
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
          Teklif bu partiye bağlıdır: en çok kalan {batch.physicalQty} ad. bu fiyattan satılır, parti tükenince teklif
          kendiliğinden kalkar. Kupon ve genel indirim teklifli satıra uygulanmaz.
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
  // Mono YALNIZ sayıda: "kâr/zarar" kelimesi de mono dizilince cümle ortasında daktilo adası
  // oluşuyordu (15.08, kullanıcı bildirimi) — kelime gövde yazısında, renk ikisinde ortak.
  const word = profit >= 0 ? 'kâr' : 'zarar';

  return (
    <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
      Adet başına{' '}
      {profit === 0 ? (
        <span className={tone}>başa baş</span>
      ) : (
        <>
          <span className={`font-ops-mono ${tone}`}>{money(Math.abs(profit))}</span>{' '}
          <span className={tone}>{word}</span>
        </>
      )}{' '}
      ({percent(margin, 1)}) · {money(revenueHtCents)} KDV’siz gelir − {money(cost)} alış.{' '}
      {/* Toplam etki: karar tek adet için değil, elde kalan tüm parti için veriliyor. */}
      Parti tükenirse toplam{' '}
      <span className={`font-ops-mono ${tone}`}>{money(Math.abs(profit) * batch.physicalQty)}</span>{' '}
      <span className={tone}>{word}</span>.
    </span>
  );
}

interface MetricProps {
  label: string;
  value: string;
  /** Sayının altında GÖRÜNÜR küçük satır — tooltip değil: karar girdisi fareyle keşfedilmez (15.08). */
  sub?: string;
  tone?: 'amber' | 'red';
}

const METRIC_TONE: Record<NonNullable<MetricProps['tone']>, string> = {
  amber: 'text-ops-amber',
  red: 'text-ops-red',
};

/** Diyalogun üst künyesi — etiket küçük ve sessiz, sayı büyük ve mono (rakam sütunları hizalansın). */
function Metric({ label, value, sub, tone }: MetricProps): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted">{label}</span>
      <span className={`font-ops-mono text-ops-section ${tone ? METRIC_TONE[tone] : 'text-ops-ink'}`}>{value}</span>
      {sub ? <span className="font-ops-body text-ops-micro leading-[1.4] text-ops-faint">{sub}</span> : null}
    </div>
  );
}
