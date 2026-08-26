'use client';

import type { ReactNode } from 'react';
import { markupPercent } from '@lezzet/domain-core';
import { removeVat } from '@lezzet/helper';
import type { BatchOfferPayload, ProductDateType } from '@lezzet/types';
import { PriceTriple } from '@/components/operation/form/price-triple';
import { money, percent } from '@/components/operation/ui/format';
import { offerBlockedByExpiry } from '@/lib/assistant/offer-block';
import type { ProposalEconomics } from '@/lib/assistant/economics';
import type { ProposalSubject } from '@/lib/assistant/subject';
import { ProposalAside, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
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
  /** Önerinin konusu — görsel + ad + ürün ekranı bağlantısı (22.9). */
  subject: ProposalSubject | null;
  /** Teknik künye — dilekçe sütununun "Metadata" görünümü basıyor (11.08). */
  meta: ProposalMeta;
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

export function BatchOfferBody({ payload, economics, subject, meta, valueCents, onChange, disabled, readOnly }: BatchOfferBodyProps) {
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
    // ── ÜÇ PANEL (kullanıcı kararı 10.08) ─────────────────────────────────
    // *"En solda kart olsun — ürün resmi, adı, bilgisi. Sonra form olsun. En kenarda da
    // bilgilendirme kısmı."* Sıra kararın akışını izliyor: NE (konu) → NE YAZIYORUM (form) →
    // NE OLUYOR (kâr ve uyarılar).
    //
    // ÜÇÜ DE AYNI KABUKTA ve `items-stretch` ile AYNI BOYDA. Bir tur yalnız konu sütununun
    // çerçevesi vardı, öteki ikisi çıplak metindi: yüksek bir kutunun yanında havada duran iki
    // blok, boy farkını "ölü alan" olarak okutuyordu. Eşit boy o farkı panelin İÇ boşluğuna
    // çeviriyor — aynı piksel, ama artık dizilimin parçası (kullanıcı: *"üç bölüm birbiriyle
    // uyumlu olmalı"*). `basis-0` şart: `basis-auto` sütunları içeriklerinin uzunluğuna göre
    // farklı genişletirdi, oysa istenen eşit genişlik.
    //
    // Sarmalayan kart KALKTI (11.08): panellerin kendi kenarlığı zaten var, dıştaki "kart içinde
    // kart" okunuyordu (kullanıcı tespiti — desen üç gövdede aynı).
    <div className="flex flex-wrap items-stretch gap-4">
      <Panel>
        {readOnly ? (
          <>
            <StaticFace label="Teklif fiyatı" aside="KDV dahil" value={money(valueCents)} />
            <StaticFace
              label="İndirim"
              aside="listeye göre"
              value={listCents !== null && valueCents !== null ? percent(((listCents - valueCents) / listCents) * 100, 1) : '—'}
            />
            <StaticFace label="Kâr marjı" aside="alışa göre" value={marginPercent === null ? '—' : percent(marginPercent, 1)} />
          </>
        ) : (
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
        )}
      </Panel>

      <Panel>
        <ExpiryLine dateType={economics?.dateType ?? null} expiryDate={payload.expiryDate} />
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

        {/* Not panelin DİBİNE yaslanır (`mt-auto`): eşit boya çekilen sütunda artan boşluk
              künyenin altında kalırsa "eksik bir şey var" gibi durur; altta bir kapanış satırı
              varsa aynı boşluk paragraf arası olur. */}
        <span className="mt-auto font-ops-body text-ops-base text-ops-muted">
          Parti tükenince teklif kendiliğinden kalkar · kupon ve genel indirim bu satıra işlemez.
        </span>
      </Panel>

      {/* ── DİLEKÇE SÜTUNU EN SAĞDA (kullanıcı düzeltmesi 11.08) ────────────
          Bu sütun bir tur EN SOLDA duruyordu ve o da bir kullanıcı kararıydı (10.08: *"en solda
          kart olsun — ürün resmi, adı, bilgisi; sonra form; en kenarda bilgilendirme"*). Ama 22.15
          sütunu bütün tiplerde standart yaptı ve standardın yeri SAĞ: indirim ve ürün gövdeleri
          öyle çizildi, fırsat gövdesi eski yerinde kalınca tipler arası geçişte göz her seferinde
          yer değiştiren bir sütun arıyordu — *"asistanın önerisi en sağda olacaktı, burada en solda
          olmuş."* Konu kartı da bu sütunun içinde olduğu için 10.08'in "en solda kart" isteği
          artık ayrı bir sütun gerektirmiyor. */}
      <ProposalAside
        subject={subject}
        fallbackTitle={size ? `${name} · ${size}` : name}
        // Öne çıkan tek satır SAPMAYI gösteren teklif fiyatı — kararın konusu tam olarak o fark.
        // Dilekçenin geri kalanı altta, okunur ağaç olarak (22.15).
        facts={[{ label: 'Teklif', value: money(payload.offerPriceCents), now: money(valueCents) }]}
        payload={payload}
        meta={meta}
      />
    </div>
  );
}

/**
 * Kararın üç bölümünden biri — eşit genişlik (`basis-0 flex-1`), eşit boy (dışarıdaki
 * `items-stretch`), aynı kabuk. Üçü tek yerden tanımlı, çünkü aralarındaki tek fark İÇERİK olmalı:
 * ayrı ayrı yazılsalardı bir gün biri farklı bir dolgu ya da farklı bir kenarlık alır ve "uyumlu üç
 * bölüm" bozulurdu (`CLAUDE §1`).
 */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-[15rem] flex-1 basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
      {children}
    </div>
  );
}

// Künye satırı (`Fact`) BURADAN KALKTI: aynı çift `ProposalAside` içinde duruyor ve sapmayı da
// gösteriyor. İki kopya kalsaydı biri bir gün sapmayı öğrenir, öteki öğrenmezdi.

/**
 * **TARİH TİPİ + KALAN GÜN** (22.38 · 10.08 talimatının kapanmamış iki maddesi).
 *
 * Fırsat kararı tam olarak *"bu partiyi ne yapalım"* kararıdır ve iki girdisi ekranda yoktu:
 * - **DLC ↔ DDM ayrımı gıda güvenliğinin özü.** DLC geçince mal SATILAMAZ (tek yol imha), DDM
 *   geçince satılabilir, yalnız kalite garantisi düşer. Aynı tarih iki tipte iki farklı karar.
 * - **Kalan gün** kararın aciliyeti. "16 Ağu 2026" tek başına bir tarihtir; "6 gün kaldı" bir
 *   karardır.
 *
 * Ton kuralı ölçülü: süre varken NÖTR (bilgi), geçmişse DDM'de amber (kalite düştü), DLC'de
 * KIRMIZI (satılamaz — indirim kararı burada anlamsız, tek yol imha). Tarih tipi okunamadıysa
 * (`null`) satır yalnız tarihi yazar ve tip uydurmaz: "DDM" diye bir tahmin, geçmiş tarihli bir
 * DLC partisini satılabilir gösterirdi.
 *
 * **"Satılamaz" kararı MOTORDAN geliyor** (`offerBlockedByExpiry` → `expiryFlagOf`), burada elle
 * kurulmuyor (`STACK §4` · düzeltildi 26.08). İlk yazımda `gecti && dateType === 'DLC'` diye
 * yazılmıştı; doğru cevabı veriyordu ama motorun kopyasıydı ve aynı kopya karar düğmesinin
 * engelinde de duruyordu — bir kural, üç yer. Kalan GÜN burada hesaplanmaya devam ediyor ve bu
 * ayrı bir şey: o bir gösterim (aciliyet), yasak değil.
 */
function ExpiryLine({ dateType, expiryDate }: { dateType: ProductDateType | null; expiryDate: string }) {
  const gun = Math.round((new Date(`${expiryDate}T12:00:00`).getTime() - Date.now()) / 86_400_000);
  const gecti = gun < 0;
  const engelli = offerBlockedByExpiry(dateType, expiryDate);

  const kabuk = engelli
    ? 'border-ops-red-line bg-ops-red-bg text-ops-red'
    : gecti
      ? 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark'
      : 'border-ops-line bg-ops-white text-ops-body';

  return (
    <span className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-ops-card border px-3 py-2 font-ops-body text-ops-base ${kabuk}`}>
      {dateType ? (
        <strong className="font-ops-display font-semibold">
          {dateType} · {dateType === 'DLC' ? 'güvenlik' : 'kalite'}
        </strong>
      ) : null}
      <span className="font-ops-mono text-ops-sm">{dateLabel(expiryDate)}</span>
      <span className={engelli || gecti ? 'font-medium' : 'text-ops-muted'}>
        {gecti ? `${Math.abs(gun)} gün geçti` : gun === 0 ? 'bugün doluyor' : `${gun} gün kaldı`}
      </span>
      {engelli ? <span className="w-full font-medium">DLC geçti — bu parti satılamaz, tek yol imha.</span> : null}
    </span>
  );
}

/** `2026-09-15` → `15 Eyl 2026`. Operasyon dili Türkçe (CLAUDE §2). */
function dateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
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
        Bu partinin alış fiyatı girilmemiş — kâr hesaplanamıyor. Karar yalnız liste fiyatına göre verilebilir.
      </span>
    );
  }
  if (offerHtCents === null || marginCents === null) {
    return <span className="font-ops-body text-ops-base text-ops-muted">Fiyat girilince kâr hesaplanır.</span>;
  }

  const tone = marginCents > 0 ? 'text-ops-olive-dark' : marginCents === 0 ? 'text-ops-body' : 'text-ops-amber';
  const verdict = marginCents > 0 ? `${money(marginCents)} kâr` : marginCents === 0 ? 'başa baş' : `${money(-marginCents)} zarar`;
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
    <dl aria-live="polite" aria-busy={disabled || undefined} className="flex w-full flex-col gap-1">
      <MoneyRow
        label="Adet başına"
        value={verdict}
        aside={marginPercent === null ? null : `${percent(marginPercent, 1)} marj`}
        tone={tone}
        strong
      />
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
