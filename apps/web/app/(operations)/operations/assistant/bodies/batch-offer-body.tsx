'use client';

import type { ReactNode } from 'react';
import { markupPercent } from '@lezzet/domain-core';
import { removeVat } from '@lezzet/helper';
import type { BatchOfferPayload } from '@lezzet/types';
import { PriceTriple } from '@/components/operation/form/price-triple';
import { money, num, percent, shortDate } from '@/components/operation/ui/format';
import type { ProposalEconomics } from '@/lib/assistant/economics';
import type { ProposalSubject } from '@/lib/assistant/subject';
import { ProposalAside } from '@/components/operation/ui/proposal-aside';
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
  subject,
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
    <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-white p-3.5">
      {/* ── ÜÇ PANEL (kullanıcı kararı 10.08) ───────────────────────────────
          *"En solda kart olsun — ürün resmi, adı, bilgisi. Sonra form olsun. En kenarda da
          bilgilendirme kısmı."* Sıra kararın akışını izliyor: NE (konu) → NE YAZIYORUM (form) →
          NE OLUYOR (kâr ve uyarılar).

          ÜÇÜ DE AYNI KABUKTA ve `items-stretch` ile AYNI BOYDA. Bir tur yalnız konu sütununun
          çerçevesi vardı, öteki ikisi çıplak metindi: yüksek bir kutunun yanında havada duran iki
          blok, boy farkını "ölü alan" olarak okutuyordu. Eşit boy o farkı panelin İÇ boşluğuna
          çeviriyor — aynı piksel, ama artık dizilimin parçası (kullanıcı: *"üç bölüm birbiriyle
          uyumlu olmalı"*). `basis-0` şart: `basis-auto` sütunları içeriklerinin uzunluğuna göre
          farklı genişletirdi, oysa istenen eşit genişlik. */}
      <div className="flex flex-wrap items-stretch gap-4">
        {/* Önizleme sütunu ORTAK (`ProposalAside`, 22.10): konu kartı + asistanın dilekçesi + sapma.
            Bir tur bu panel burada elle kuruluydu; indirim tipi gelince aynı kurgu ikinci kez
            yazılacaktı — kullanıcının istediği düzen zaten buydu ("her tipte önizleme + tanıtım
            kartı + form"), o yüzden ikinci kopya doğmadan tek yere alındı. */}
        <ProposalAside
          subject={subject}
          fallbackTitle={size ? `${name} · ${size}` : name}
          facts={[
            { label: 'Depo', value: payload.warehouseCode },
            { label: 'SKT', value: shortDate(payload.expiryDate) },
            { label: 'Partide', value: `${num(payload.physicalQty)} ad.` },
            // Teklif fiyatı SAPMA gösteren tek satır: operatör kutuyu değiştirdiğinde asistanın
            // önerisi üstü çizili kalır — kararın konusu tam olarak bu fark.
            { label: 'Teklif', value: money(payload.offerPriceCents), now: money(valueCents) },
            ...(listCents !== null ? [{ label: 'Liste', value: money(listCents) }] : []),
          ]}
        />

        <Panel>
          {readOnly ? (
            <>
              <StaticFace label="Teklif fiyatı" aside="KDV dahil" value={money(valueCents)} />
              <StaticFace
                label="İndirim"
                aside="listeye göre"
                value={
                  listCents !== null && valueCents !== null
                    ? percent(((listCents - valueCents) / listCents) * 100, 1)
                    : '—'
                }
              />
              <StaticFace
                label="Kâr marjı"
                aside="alışa göre"
                value={marginPercent === null ? '—' : percent(marginPercent, 1)}
              />
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
      </div>
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
    <dl aria-live="polite" aria-busy={disabled || undefined} className="flex w-full flex-col gap-1">
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
