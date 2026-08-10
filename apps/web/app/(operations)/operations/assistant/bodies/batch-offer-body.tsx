'use client';

import { markupPercent } from '@lezzet/domain-core';
import { removeVat } from '@lezzet/helper';
import type { BatchOfferPayload } from '@lezzet/types';
import { PriceTriple } from '@/components/operation/form/price-triple';
import { money, num, percent, shortDate } from '@/components/operation/ui/format';
import type { ProposalEconomics } from '@/lib/assistant/economics';
import { splitVariantName } from '../assistant-labels';

/**
 * PARTİ FIRSATI — kuyruğun içinde karar verilen ilk tip (22.8).
 *
 * ── NEDEN BURADA, STOK EKRANINDA DEĞİL ──────────────────────────────────────
 * Bir tur bu tip `handoff`tu: kuyruk uygulamaz, stok ekranını ön doldururdu. Devrin gerekçesi
 * doğruydu (fiyat düzenlenmeden onaylanmamalı) ama bedeli kullanıcının kendi cümlesiyle ölçüldü:
 * *"asistan sayfasından dışarı çıkmam benim açımdan büyük problem, konseptten kopuyorum."*
 * Gövde bu yüzden taşındı — devrin çözdüğü sorun duruyor, yarattığı sorun kalkıyor.
 *
 * ── YENİ FORM YAZILMADI ─────────────────────────────────────────────────────
 * Ortadaki kontrol `PriceTriple`: `offer-dialog`un ve müşteriye-özel-fiyat diyaloğunun kullandığı
 * ortak üçlü. Kopyalansaydı bir gün biri KDV'yi düşerken öteki unuturdu ve aynı parti iki ekranda
 * iki farklı marj gösterirdi. Hesapların hiçbiri burada YAZILMAZ, motordan gelir.
 *
 * ── SAYILAR KÜNYEDEN, YENİ OKUMA YOK ────────────────────────────────────────
 * Maliyet · liste · KDV oranı `economics` künyesinden (22.7) geliyor; bu gövde hiçbir sorgu
 * açmıyor. Künye yoksa (maliyet hiç girilmemiş, varyant çözülememiş) üçlü yine çizilir ama
 * kilitli kutularıyla — uydurma bir tabanla yüzde göstermek olmayan bir hesabı doğru gibi sunardı.
 */

interface BatchOfferBodyProps {
  payload: BatchOfferPayload;
  economics: Extract<ProposalEconomics, { kind: 'offer' }> | null;
  /** Operatörün girdiği fiyat (kuruş, KDV DAHİL). `null` = kutu boş. */
  valueCents: number | null;
  onChange: (cents: number | null) => void;
  disabled: boolean;
  /**
   * Karar VERİLMİŞ öneri — aynı gövde, düzenlenmeyen hâliyle.
   *
   * Arşiv satırına ikinci bir "özet" komponenti yazmak, aynı kararı iki dilde anlatmak olurdu
   * (talebin birinci amacı bunu azaltmaktı). Değişen tek şey ortadaki üçlünün yerini sabit
   * sayıların alması: olup bitmiş bir işte düzenlenebilir kutu, hâlâ seçenekmiş gibi okunur.
   */
  readOnly: boolean;
}

export function BatchOfferBody({
  payload,
  economics,
  valueCents,
  onChange,
  disabled,
  readOnly,
}: BatchOfferBodyProps) {
  const { name, size } = splitVariantName(payload.productName);

  // Liste ŞU ANKİ olandır (künye), öneri anındaki değil — karar bugünkü fiyata göre verilir.
  // Künye yoksa payload'daki öneri-anı listesine düşülür; ikisi de yoksa `null` ve indirim kutusu
  // kilitlenir.
  const listCents = economics?.listPriceCents ?? payload.listPriceCents;
  const costCents = economics?.costCents ?? null;
  const vatRate = economics?.vatRate ?? null;

  /**
   * **Marj GİRİLEN fiyattan hesaplanır, künyedeki sabit sayıdan değil.**
   *
   * Künyenin `marginCents`i asistanın ÖNERDİĞİ fiyata aittir. Operatör kutuyu değiştirdiği an o
   * sayı bayatlar; ekranda bırakılsaydı yeni fiyatın altında eski fiyatın kârı yazardı — kuyruğun
   * yapabileceği en sinsi yalan, çünkü hem doğru görünür hem de kararın tam konusudur.
   */
  const offerHtCents = valueCents === null || vatRate === null ? null : removeVat(valueCents, vatRate);
  const marginCents = offerHtCents === null || costCents === null ? null : offerHtCents - costCents;
  const marginPercent = offerHtCents === null || costCents === null ? null : markupPercent(offerHtCents, costCents);

  /**
   * **Liste fiyatı öneriden sonra değişmiş mi** — payload öneri anındaki, künye şu anki.
   * Ayrışma sessizce geçilemez ve güncel olan da sessizce gösterilemez: patron kararı önerinin
   * dayandığı gerçeğe göre veriyor olabilir (denetimle mutabık, 09.08).
   */
  const listDrift =
    economics?.listPriceCents != null && payload.listPriceCents !== null && economics.listPriceCents !== payload.listPriceCents
      ? { was: payload.listPriceCents, now: economics.listPriceCents }
      : null;

  /** Asistanın önerdiği fiyattan sapıldı mı — sapma bir uyarı değil, kararın künyesi. */
  const edited = valueCents !== null && valueCents !== payload.offerPriceCents;

  return (
    <div className="flex flex-col gap-3 overflow-hidden rounded-ops-card border border-ops-line bg-ops-white p-3.5">
      {/* Ad KENDİ SATIRINDA: künyeyle yan yana dururken uzun adlar sıkışıp ortasından bölünüyordu
          ("Artisan Strawberry / Cake") — kararın konusu olan şeyin adı, ekranın en kolay okunan
          satırı olmalı. Boy adın yanında, kuyruk satırındaki gibi. */}
      <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3">
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">
          {name}
          {size ? <span className="font-ops-body font-normal text-ops-body"> · {size}</span> : null}
        </span>
        {/* Künye METİN DEĞİL VERİ ve öyle okunmalı: etiket sönük, sayı mono ve koyu. "Asistan
            önerdi" bilgisi de buraya girdi — bir tur altında ayrı bir cümle olarak duruyordu
            ("alan onunla dolduruldu ama kilitli değil, değiştirirseniz kâr satırı değişir": 194
            karakter). İkisi de gereksizdi: bir GİRİŞ KUTUSUNA bakan insan onun yazılabilir olduğunu
            zaten görüyor, mekanizmayı da `PriceTriple` kendi ipucunda anlatıyor. Geriye kalan tek
            gerçek bilgi sayının kendisiydi. */}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-ops-body text-ops-base text-ops-body">
          <Fact label="Depo" value={payload.warehouseCode} />
          <Fact label="SKT" value={shortDate(payload.expiryDate)} />
          <Fact label="Partide" value={`${num(payload.physicalQty)} ad.`} />
          <Fact label="Asistanın önerisi" value={money(payload.offerPriceCents)} />
          {listCents !== null ? <Fact label="Liste" value={money(listCents)} /> : null}
        </span>
      </div>

      {/* ── İKİ SÜTUN: solda YAZILAN, sağda OKUNAN (kullanıcı kararı 10.08) ────
          Üçlü bir tur tam genişlikte yatay duruyordu ve konteyner büyüdükçe kutular da büyüyordu:
          *"inputlar ekran genişliğine göre uzuyor"*. Bir para alanının 400 piksele ihtiyacı yok.

          Sonra sıra düzeltildi: *"asıl odaklanılması gereken yer input, dolayısıyla inputları sola
          alalım"*. Karar sütunu SOLDA ve SABİT (16rem) — göz soldan başlar, ilk gördüğü şey
          yazacağı yer olur. Bilgi sağda ve `flex-1`: geniş ekranda büyüyen taraf bilgi olsun,
          kutular değil.

          `items-start` bilgi sütununda ZORUNLU: onsuz flex çocukları sütun genişliğine yayılıyor ve
          tek satırlık sarı uyarı ekranı boydan boya kesiyordu — *"ihtiyacından fazla uzuyor, dağınık
          tasarım havası veriyor"*. Artık her uyarı kendi metni kadar yer kaplıyor. */}
      {/* `px-3.5` künye kutusuyla HİZA içindir: o kutu kendi iç boşluğunu taşıyor, sütunlar ise
          kartın kenarından başlıyordu — "Depo:" ile "Teklif fiyatı" 14 piksel kaymış görünüyor ve
          göz aradığı dikey çizgiyi bulamıyordu. */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4 px-3.5">
      {readOnly ? (
        <div className="flex w-[16rem] flex-none flex-col gap-3">
          <StaticFace label="Teklif fiyatı" aside="KDV dahil" value={money(valueCents)} />
          <StaticFace
            label="İndirim"
            aside="listeye göre"
            value={
              listCents !== null && valueCents !== null ? percent(((listCents - valueCents) / listCents) * 100, 1) : '—'
            }
          />
          <StaticFace
            label="Kâr marjı"
            aside="alışa göre"
            value={marginPercent === null ? '—' : percent(marginPercent, 1)}
          />
        </div>
      ) : (
        <div className="w-[16rem] flex-none">
        <PriceTriple
          valueCents={valueCents}
          onChange={onChange}
          channel="b2c"
          vatRate={vatRate ?? 0}
          listCents={listCents}
          costCents={costCents}
          priceLabel="Teklif fiyatı (€)"
          priceLabelAside="KDV dahil"
          pricePlaceholder="ör. 12,60"
          required
          idPrefix="proposal-offer"
          layout="column"
        />
        </div>
      )}

        <div className="flex min-w-[18rem] flex-1 items-start flex-col gap-3">
          <MarginSentence
            costCents={costCents}
            offerHtCents={offerHtCents}
            marginCents={marginCents}
            marginPercent={marginPercent}
            physicalQty={payload.physicalQty}
            disabled={disabled}
          />

          {/* Sapma bir UYARI değil künye: cümle değil, iki sayı ve aralarındaki ok. */}
          {edited && !readOnly ? (
            <span className="rounded-ops-card border border-ops-violet-line bg-ops-violet-bg px-3.5 py-2 font-ops-body text-ops-base text-ops-violet">
              Öneriden sapıldı: <span className="font-ops-mono">{money(payload.offerPriceCents)}</span> →{' '}
              <strong className="font-ops-mono font-semibold">{money(valueCents)}</strong>
            </span>
          ) : null}

          {listDrift ? (
            <span className="rounded-ops-card border border-ops-amber-line border-l-[3px] border-l-ops-amber-dot bg-ops-amber-bg px-3.5 py-2 font-ops-body text-ops-base font-medium text-ops-amber-dark">
              Liste öneriden sonra değişti: <span className="font-ops-mono">{money(listDrift.was)}</span> →{' '}
              <span className="font-ops-mono font-semibold">{money(listDrift.now)}</span>
            </span>
          ) : null}

          <span className="font-ops-body text-ops-base text-ops-muted">
            Parti tükenince teklif kendiliğinden kalkar · kupon ve genel indirim bu satıra işlemez.
          </span>
      </div>
      </div>

    </div>
  );
}

/** Künye çifti — etiket sönük ve küçük, DEĞER mono ve tam boyda (okunacak şey o). */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-ops-sm text-ops-muted">{label}:</span>{' '}
      <strong className="font-ops-mono font-semibold text-ops-ink">{value}</strong>
    </span>
  );
}

/**
 * Karar verilmiş öneride üçlünün yerini alan sabit sayı — `PriceTriple`in kutularıyla aynı sırada
 * ve aynı künyelerle, ki arşivden kuyruğa dönen göz aynı üç şeyi aynı yerde bulsun.
 */
function StaticFace({ label, aside, value }: { label: string; aside: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-ops-card border border-ops-line bg-ops-subtle px-3 py-2">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted">
        {label} <span className="normal-case tracking-normal text-ops-faint">· {aside}</span>
      </span>
      <span className="font-ops-mono text-ops-base text-ops-ink">{value}</span>
    </div>
  );
}

/**
 * Kâr cümlesi — `offer-dialog`un `MarginRow`'uyla AYNI dili konuşur ve öyle kalmalı: aynı karara
 * iki ekran iki farklı cevap vermemeli.
 *
 * Zarar ROZET değil CÜMLE: elde kalıp imha edilecek maldan zararına satış iyidir ve kırmızı bir
 * rozet operatörü düşünmeden geri adım attırırdı. Tutarıyla söyle, yolu kapatma.
 */
function MarginSentence({
  costCents,
  offerHtCents,
  marginCents,
  marginPercent,
  physicalQty,
  disabled,
}: {
  costCents: number | null;
  offerHtCents: number | null;
  marginCents: number | null;
  marginPercent: number | null;
  physicalQty: number;
  disabled: boolean;
}) {
  // Maliyet `null` "sıfır maliyet" DEĞİLDİR (`CLAUDE §1`): sıfır sayılsaydı ekran "%100 kâr"
  // gösterirdi — yanlışın en tehlikelisi, çünkü ikna edici.
  if (costCents === null) {
    return (
      <span className="font-ops-body text-ops-base leading-relaxed text-ops-muted">
        Bu partinin alış fiyatı girilmemiş — kâr hesaplanamıyor. Karar yalnız liste fiyatına göre
        verilebilir.
      </span>
    );
  }
  if (offerHtCents === null || marginCents === null) {
    return <span className="font-ops-body text-ops-base text-ops-muted">Fiyat girilince kâr hesaplanır.</span>;
  }

  const tone = marginCents > 0 ? 'text-ops-olive-dark' : marginCents === 0 ? 'text-ops-body' : 'text-ops-amber';
  const verdict =
    marginCents > 0 ? `${money(marginCents)} kâr` : marginCents === 0 ? 'başa baş' : `${money(-marginCents)} zarar`;
  const totalCents = Math.abs(marginCents) * physicalQty;

  /**
   * ── CÜMLE DEĞİL KÜNYE (kullanıcı kararı 10.08: "sağdaki bölüm problemli") ──
   *
   * Bu blok bir tur tek uzun cümleydi: *"Adet başına 0,25 € kâr (%16,9 marj) · 1,73 € KDV'siz
   * gelir − 1,48 € alış. Parti tükenirse toplam 2,00 € kâr."* Beş sayı bir cümleye sıkışmıştı ve
   * ekranı boydan boya kesiyordu — **metin gibi akıyordu ama veriydi.** Okuyan, aradığı sayıyı her
   * seferinde cümlenin içinden çıkarmak zorundaydı.
   *
   * Künye olarak: her sayı kendi satırında, etiketler sönük, değerler mono ve sağa hizalı — göz
   * tek bir dikey çizgide aşağı iniyor. Yan etkisi de istenen yöndeydi: sol sütun üç kutu boyunda,
   * bu blok dört satır; iki sütun arasındaki ölü boşluk kapandı.
   */
  return (
    <dl aria-live="polite" aria-busy={disabled || undefined} className="flex w-full max-w-[22rem] flex-col gap-1">
      <MoneyRow label="Adet başına" value={verdict} aside={marginPercent === null ? null : `${percent(marginPercent, 1)} marj`} tone={tone} strong />
      <MoneyRow label="KDV’siz gelir" value={money(offerHtCents)} />
      <MoneyRow label="Alış" value={money(costCents)} />
      {/* Toplam etki: karar tek adet için değil, elde kalan TÜM parti için veriliyor. */}
      <MoneyRow
        label={`Parti tükenirse (${physicalQty} ad.)`}
        value={`${money(totalCents)} ${marginCents >= 0 ? 'kâr' : 'zarar'}`}
        tone={tone}
        divided
      />
    </dl>
  );
}

/** Künye satırı — etiket solda sönük, değer sağda mono. Dört satır tek dikey hizada okunur. */
function MoneyRow({
  label,
  value,
  aside = null,
  tone = 'text-ops-body',
  strong = false,
  divided = false,
}: {
  label: string;
  value: string;
  aside?: string | null;
  tone?: string;
  strong?: boolean;
  divided?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3${divided ? ' mt-1 border-t border-ops-line pt-1.5' : ''}`}>
      <dt className="font-ops-body text-ops-base text-ops-muted">{label}</dt>
      <dd className="flex items-baseline gap-1.5 text-right">
        {aside ? <span className="font-ops-body text-ops-sm text-ops-muted">({aside})</span> : null}
        <span className={`font-ops-mono ${strong ? 'font-semibold' : ''} ${tone}`}>{value}</span>
      </dd>
    </div>
  );
}
