'use client';

import type { ReactNode } from 'react';
import { toCents } from '@lezzet/helper';
import {
  DECLARATION_GAP_LABELS,
  PROPOSAL_PAYLOAD_SCHEMAS,
  resolveLocalizedText,
  type AssistantProposalKind,
  type DeclarationGap,
  type BatchOfferPayload,
  type BundleDraftPayload,
  type DiscountDraftPayload,
  type FeaturedFlagPayload,
  type MoneyMovementPayload,
  type ProductCreatePayload,
  type ProductDraftPayload,
  type PurchaseOrderPayload,
  type RecipeDraftPayload,
  type StockIntakePayload,
  type ZoneExtendPayload,
} from '@lezzet/types';
import { money, num, percent, shortDate } from '@/components/operation/ui/format';
import { MEDIA_H, SubjectCard } from '@/components/operation/ui/subject-card';
import { CardFact } from './assistant-card';
import { DECLARATION_FIELD_LABEL, draftFieldSummary } from './assistant-labels';
import type { AssistantRowView } from './assistant-types';

/**
 * KART GÖVDELERİ — her tipin kendi özeti (22.11).
 *
 * ── NEDEN `assistant-body` DEĞİL, AYRI BİR KAYIT ────────────────────────────
 * O dosya "kind'a göre dallanan tek yer" diye yazılmıştı ve artık iki yer var. Ayrım keyfi değil,
 * iki sözleşme İKİ AYRI SORUYA cevap veriyor:
 *
 * · `assistant-body` → **kararın** gövdesi: düzenlenebilir form, engel, kaydeden kapı. Diyalogda.
 * · burası → **özetin** gövdesi: okunur, düzenlenemez, tıklanmayı hak edip etmediğini söyler. Kartta.
 *
 * Tek kayıtta birleştirilseydi kart bir gün form taşımaya başlardı — ızgaranın tek gerekçesi olan
 * "bir bakışta tara" yeteneği de o gün biterdi.
 *
 * ── KART BİR ÖZETTİR: EN FAZLA ÜÇ SATIR ─────────────────────────────────────
 * Sınır tasarımdan değil işten geliyor. Kartta okunacak şey "bu öneri acil mi, konusu ne, ne kadar
 * para" — dördüncü satır kararı hızlandırmıyor, ızgarayı yavaşlatıyor. Ayrıntının yeri diyalog.
 *
 * ── ŞEKLİ TUTMAYAN DİLEKÇEYE GÖVDE ÇİZİLMEZ ─────────────────────────────────
 * Payload `safeParse`ten geçmezse `null` dönüyor ve kart ortak iskeletiyle kalıyor: uydurma bir
 * özet, bozuk bir dilekçeyi sağlam gibi gösterirdi.
 */

export function cardBodyOf(row: AssistantRowView): ReactNode {
  switch (row.kind) {
    case 'batch_offer':
      return renderWith<BatchOfferPayload>(row, 'batch_offer', (p) => <BatchOfferCard payload={p} row={row} />);
    case 'discount_draft':
      return renderWith<DiscountDraftPayload>(row, 'discount_draft', (p) => (
        <>
          <SummaryLine summary={row.summary} amountCents={row.amountCents} />
          <Facts>
            <DiscountCard payload={p} />
          </Facts>
        </>
      ));
    case 'zone_extend':
      return renderWith<ZoneExtendPayload>(row, 'zone_extend', (p) => (
        <>
          <SummaryLine summary={row.summary} amountCents={row.amountCents} />
          <Facts>
            <ZoneCard payload={p} />
          </Facts>
        </>
      ));
    case 'bundle_draft':
      return renderWith<BundleDraftPayload>(row, 'bundle_draft', (p) => <BundleCard payload={p} row={row} />);
    case 'money_movement':
      return renderWith<MoneyMovementPayload>(row, 'money_movement', (p) => <MoneyCard payload={p} />);
    case 'purchase_order':
      return renderWith<PurchaseOrderPayload>(row, 'purchase_order', (p) => <PurchaseOrderCard payload={p} row={row} />);
    case 'stock_intake':
      return renderWith<StockIntakePayload>(row, 'stock_intake', (p) => <StockIntakeCard payload={p} row={row} />);
    case 'product_draft':
      return renderWith<ProductDraftPayload>(row, 'product_draft', (p) => <ProductDraftCard payload={p} row={row} />);
    case 'product_create':
      return renderWith<ProductCreatePayload>(row, 'product_create', (p) => <ProductCreateCard payload={p} />);
    case 'recipe_draft':
      return renderWith<RecipeDraftPayload>(row, 'recipe_draft', (p) => <RecipeCard payload={p} row={row} />);
    case 'featured_flag':
      return renderWith<FeaturedFlagPayload>(row, 'featured_flag', (p) => <FeaturedCard payload={p} row={row} />);
    default:
      // Kalan yedi tip asistanın CÜMLESİYLE duruyor ve bu yeterli bir hâl, eksik bir hâl değil —
      // özet zaten tam bir cümle. Kendi dilleri tip tip kurulacak (fırsat ve paket kuruldu); desen
      // kanıtlanmadan on bire çoğaltılmıyor (22.8 dersi).
      return <SummaryLine summary={row.summary} amountCents={row.amountCents} />;
  }
}

/** Dilekçeyi kendi şemasıyla çözer; tutmuyorsa kart asistanın cümlesine düşer — uydurma özet yok. */
function renderWith<P>(row: AssistantRowView, kind: AssistantProposalKind, draw: (payload: P) => ReactNode): ReactNode {
  const schema = (PROPOSAL_PAYLOAD_SCHEMAS as Partial<Record<AssistantProposalKind, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }>>)[kind];
  const parsed = schema?.safeParse(row.payload);
  return parsed?.success ? draw(parsed.data as P) : <SummaryLine summary={row.summary} amountCents={row.amountCents} />;
}

/**
 * Asistanın kurduğu cümle — kendi dili olmayan tiplerin gövdesi.
 *
 * Tutar da BURADA yazılıyor (varsa): ortak iskeletten kalktı, çünkü kendi dili olan tipte para iki
 * kez görünüyordu (`ProposalCard` künyesi). Cümlenin altında ve büyük — kendi dili olmayan bir
 * tipte okunacak tek sayı odur.
 */
function SummaryLine({ summary, amountCents }: { summary: string; amountCents?: number | null }) {
  return (
    <>
      <span className="line-clamp-3 font-ops-body text-ops-base font-medium leading-snug text-ops-ink">{summary}</span>
      {amountCents != null ? (
        <span className="font-ops-mono text-ops-lead font-semibold text-ops-ink">{money(amountCents)}</span>
      ) : null}
    </>
  );
}

/**
 * KARARIN PARA BLOĞU — asıl fiyat büyük, karşılaştırma ALTINDA ve sönük.
 *
 * ── NEDEN İKİ KATMAN (kullanıcı ölçümü 10.08) ───────────────────────────────
 * Bir tur üçü tek satırdaydı: `%18  15,81 €  12,90 €`. Kullanıcının cümlesi: *"üç tane rakam arka
 * arkaya yazılmış, aralarında boşluk yok… bu karta baktığım zaman çok fazla bir şey anlamıyorum."*
 * Haklıydı — aynı hizada duran üç sayı eşit ağırlıkta okunuyor ve hangisinin ASIL fiyat olduğu
 * yalnız harf kalınlığından anlaşılıyordu. Fırsat kartında göze batmamıştı çünkü oradaki sayılar
 * kısa; sorun ölçüde değil dizilimdeydi ve iki basamaklı fiyatlarda ortaya çıktı.
 *
 * ── ESKİ FİYAT ÜSTTE, YENİSİ ALTTA ─────────────────────────────────────────
 * Sıra kullanıcının düzeltmesi (10.08): *"'15,81 € yerine' ifadesi yukarıda olmalı, biraz daha
 * küçük."* Doğrusu bu — okuma "neydi → ne oldu" yönünde akar; büyük sayıyı önce koyup tabanı
 * altına yazmak, cevabı sorudan önce söylemekti.
 *
 * ── YÜZDE KİMİN, AÇIKÇA SÖYLENİR ────────────────────────────────────────────
 * Etiket bir tur "avantaj"dı ve kullanıcı haklı olarak sordu: *"kimin için, müşteriye mi satıcıya
 * mı?"* Kelime cevabı taşımıyordu. İki yüzde aynı kartta duruyor ve **farklı muhataplara** bakıyor:
 * buradaki müşterinin kazancı, künyedeki `Kâr` bizim. Karışmamalarının tek yolu her birinin kime
 * ait olduğunu söylemesi — o yüzden yüzde artık daima "indirim" (indirim müşteriye yapılır) ve
 * TABAN da adlandırılıyor ("liste" · "ayrı alınsa"), çünkü indirimin neye göre olduğu vaadin
 * kendisidir: listeye göre mi, kalemleri tek tek almaya göre mi.
 */
function PriceBlock({
  cents,
  wasCents,
  wasLabel,
  percentOff,
  tone,
  note,
}: {
  cents: number;
  /** Karşılaştırma tabanı — yoksa üst satır hiç çizilmez (uydurma bir "yerine" yazılmaz). */
  wasCents: number | null;
  /** Tabanın ADI: "liste" (fırsat) · "ayrı alınsa" (paket). İndirimin neye göre olduğu vaadin kendisi. */
  wasLabel: string;
  percentOff: number | null;
  tone: string;
  /**
   * Tabanı OLMAYAN tutarın üst satırı — tedarikte "tahmini tutar" gibi. Sayının NE olduğunu söyleyen
   * tek kelime; onsuz büyük bir rakam "kesin fiyat" diye okunur.
   */
  note?: string;
}) {
  return (
    <span className="flex flex-col gap-0.5 pt-0.5">
      {wasCents !== null ? (
        <span className="flex items-baseline gap-1.5 font-ops-body text-ops-xs text-ops-muted">
          <span>{wasLabel}</span>
          <span className="font-ops-mono line-through">{money(wasCents)}</span>
        </span>
      ) : note ? (
        <span className="font-ops-body text-ops-xs text-ops-muted">{note}</span>
      ) : null}
      <span className="flex items-baseline gap-2">
        <span className="font-ops-mono text-ops-section font-semibold leading-none text-ops-ink">{money(cents)}</span>
        {percentOff !== null ? (
          <strong className={`font-ops-display text-ops-sm font-semibold ${tone}`}>
            {percent(percentOff, 0)} indirim
          </strong>
        ) : null}
      </span>
    </span>
  );
}

/** Künye bloğu — cümleden ayraçla ayrılır; biri anlatı, öteki sayı. */
function Facts({ children }: { children: ReactNode }) {
  return <span className="flex flex-col gap-1 border-t border-ops-line-soft pt-2.5">{children}</span>;
}

/**
 * KONU KUTUSU — kartın başındaki beyaz çerçeve (ürün · paket · kategori…).
 *
 * Beyaz kutu içinde duruyor: renkli üst şeridin altında yükseliyor ve "bu kartın konusu bu" demiş
 * oluyor. Kutu iki tipte de aynı olduğu için burada tek yerde — `SubjectCard` içeriği çiziyor,
 * burası yalnızca çerçeve. Ayrı ayrı yazılsaydı fırsat ile paketin kutusu bir gün ayrışırdı ve
 * ızgarada iki farklı çerçeve dolgusu görünürdü.
 *
 * Görselin boyu `SubjectCard`ın kendi standardından geliyor (`MEDIA_H`), buradan verilmiyor:
 * yükseklik kararı çizen tarafın, çerçeve çizenin değil.
 */
function SubjectBox({ subject }: { subject: NonNullable<AssistantRowView['subject']> }) {
  return (
    <span className="rounded-ops-card border border-ops-line bg-ops-white p-2">
      <SubjectCard
        name={subject.name}
        detail={subject.detail}
        imageUrl={subject.imageUrl}
        crop={subject.crop}
        images={subject.images}
        // Kartın kendisi zaten tıklanabilir; içeride ikinci bir bağlantı hem iç içe etkileşim olurdu
        // hem de "hangisine bastım" sorusunu doğururdu. İlgili ekrana giden yol diyalogda.
        href={null}
        fluid
      />
    </span>
  );
}

/**
 * PARTİ FIRSATI — kartın METİN DEĞİL, üç sayı olduğu ilk tip (kullanıcı kararı 10.08).
 *
 * ── NEDEN CÜMLE KALKTI ──────────────────────────────────────────────────────
 * Asistanın özeti ("Artisan Mango Cake 90g — %30 indirimle 1,68 €") doğru ama YAVAŞ: ızgarada
 * on beş kart varken göz her kartta bir cümle okumak zorunda kalıyor. Fırsatta karar üç şeyden
 * ibaret — ne kadar ucuzluyor, ne kadar vakit var, elde ne kadar var — ve üçü de sayı. Sayıyı
 * cümlenin içine gömmek, onu her seferinde yeniden bulmak demek.
 *
 * ── ÜRÜN KARTI KARTIN İÇİNDE ────────────────────────────────────────────────
 * Konu bir ÜRÜN (kullanıcı: *"bir ürün var demektir, ürünün kendisi olsun"*) ve tanımanın en hızlı
 * yolu fotoğraf. Beyaz kutu içinde duruyor: renkli kart zemininin üstünde yükseliyor ve "bu kartın
 * konusu bu" demiş oluyor. Konu çözülemezse kutu çizilmez — boş bir çerçeve, olmayan bir bilginin
 * yerini tutmaz.
 *
 * ── İNDİRİM YÜZDESİ KARTTA HESAPLANIYOR ─────────────────────────────────────
 * Bilinçli bir istisna: iş kuralı değil, iki sayının oranı. Liste ile teklif zaten dilekçede yan
 * yana ve operatörün gözünde yaptığı bölmeyi ekranın yapmaması, ızgaranın işini görmemesi olurdu.
 * Liste yoksa yüzde hiç yazılmaz (bölünecek taban yok) ve fiyat tek başına durur.
 */
function BatchOfferCard({ payload, row }: { payload: BatchOfferPayload; row: AssistantRowView }) {
  const list = row.economics?.kind === 'offer' ? (row.economics.listPriceCents ?? payload.listPriceCents) : payload.listPriceCents;
  const off = list !== null && list > 0 ? ((list - payload.offerPriceCents) / list) * 100 : null;
  const left = daysLeft(payload.expiryDate);

  return (
    <>
      {/* BOY (90g) ADIN SAĞINDA, sönük — `SubjectCard`ın kendi yerleşimi. Ayrı satır kartta tam bir
          satır yer tutuyordu, ada parantezle eklemek de adı iki satıra düşürüyordu. Ama SİLİNMİYOR
          da: kullanıcının uyarısı yerinde — *"bu ürünün varyantını ifade ediyor, o da önemli"*.
          Aynı ürünün 90 g'ı ile 450 g'ı ayrı partilerdir ve teklif YALNIZ birine açılıyor; boyu
          düşürmek, hangi mala fiyat verdiğimizi belirsiz bırakırdı. */}
      {row.subject ? <SubjectBox subject={row.subject} /> : null}

      <PriceBlock cents={payload.offerPriceCents} wasCents={list} wasLabel="liste" percentOff={off} tone="text-ops-amber" />

      <Facts>
        {/* Tarih tek başına bir sayı değil bir SÜREdir: "16 Ağu" kararı vermez, "6 gün" verir.
            Geçmiş tarih ayrı bir cümleyle söylenir (`leftLabel`), eksi sayıyla değil. */}
        <CardFact
          label="Tarih"
          value={`${shortDate(payload.expiryDate)}${left === null ? '' : ` · ${leftLabel(left)}`}`}
        />
        <CardFact label="Partide" value={`${num(payload.physicalQty)} ad. · ${payload.warehouseCode}`} />
      </Facts>
    </>
  );
}

/** KAMPANYA — değeri, kapsamı, ne zamana kadar. Kupon ise kodu kapsamın yerine geçer. */
function DiscountCard({ payload }: { payload: DiscountDraftPayload }) {
  const value =
    payload.type === 'percent'
      ? payload.percent === null
        ? '—'
        : percent(payload.percent, payload.percent % 1 === 0 ? 0 : 1)
      : money(payload.amountCents);

  return (
    <>
      <CardFact label={payload.trigger === 'coupon' ? 'Kupon' : 'Otomatik'} value={value} />
      <CardFact label="Kapsam" value={payload.scope === 'cart' ? 'Sepetin tamamı' : (payload.scopeName ?? '—')} />
      <CardFact label="Bitiş" value={payload.validTo ? shortDate(payload.validTo) : 'süresiz'} />
    </>
  );
}

/**
 * BÖLGE GENİŞLETME — kararın konusu coğrafya ama kartın konusu TALEP.
 *
 * Harita kartta çizilmez (diyaloğun işi); burada okunacak şey "kaç kişi istedi, kaçı hâlâ bekliyor".
 * Bekleyen sayısı ayrı bir satır değil aynı satırın devamı: ikisi tek soruyu birlikte cevaplıyor.
 */
function ZoneCard({ payload }: { payload: ZoneExtendPayload }) {
  const codes = payload.postalCodes;
  const requests = codes.reduce((sum, c) => sum + (c.requestCount ?? 0), 0);
  const waiting = codes.reduce((sum, c) => sum + (c.waitingCount ?? 0), 0);

  return (
    <>
      <CardFact label={codes.length === 1 ? 'Posta kodu' : `${codes.length} posta kodu`} value={codes.map((c) => c.postalCode).join(' · ')} />
      <CardFact label="Bölge" value={payload.zoneName} />
      {/* Sıfır talep de BİLGİDİR ve gizlenmez: "0 talep" gören patron, öneriyi rota verimliliği
          gerekçesiyle değerlendirir — satırı saklamak o kararı elinden alırdı. */}
      <CardFact label="Talep" value={waiting > 0 ? `${num(requests)} · ${num(waiting)} bekliyor` : num(requests)} />
    </>
  );
}

/**
 * PAKET — konusu kendisi ama YÜZÜ kalemleri (22.11).
 *
 * ── İKİ SAYI, İKİ MUHATAP ───────────────────────────────────────────────────
 * Paket kararı tek sayıyla verilmiyor ve ikisi farklı kişilere bakıyor:
 *
 * · **Avantaj** (`%15`) müşterinin gördüğü şey — kalemleri ayrı ayrı almaya göre ne kazanıyor.
 *   Paketin SATILABİLİR olup olmadığını bu söylüyor; avantajsız bir paket vitrinde durur ama
 *   kimse almaz.
 * · **Marj** patronun gördüğü şey — bu paket para kazandırıyor mu. Kârlılık kapısı zaten canlı bir
 *   zararlı paket yakalamıştı (10.08, "Baklava İkili Lezzet" −6 cent), yani soru teorik değil.
 *
 * Biri olmadan öteki yanıltır: yüksek avantajlı bir paket zararına satılıyor olabilir, yüksek marjlı
 * bir paket de müşteriye hiçbir şey kazandırmıyor olabilir. Kart ikisini yan yana koyuyor.
 *
 * **Avantaj LİSTE fiyatlarından hesaplanıyor** (`economics.lines[].listPriceCents`), dilekçedeki
 * paylardan değil: paylar paket fiyatını bölüştürüyor, yani toplamları zaten paket fiyatına eşit ve
 * hiçbir tasarruf göstermez. Karşılaştırılacak şey "ayrı ayrı alsaydı ne öderdi". Bir kalemin bile
 * liste fiyatı yoksa hesap YAPILMAZ — eksik tabanla bulunan yüzde, uydurma bir vaattir.
 *
 * **Fiyat EURO** ve cent'e çevriliyor: paket ailesi henüz cent'e göçmedi
 * (`BundleDraftPayloadSchema.totalPrice` künyesi). Dönüşüm olmasa "12,90 €" yerine "0,13 €" yazardı.
 */
function BundleCard({ payload, row }: { payload: BundleDraftPayload; row: AssistantRowView }) {
  const eco = row.economics?.kind === 'bundle' ? row.economics : null;
  const priceCents = eco?.priceCents ?? toCents(payload.totalPrice);

  // Ayrı ayrı alınsa: liste fiyatı × adet. Tek bir kalemin listesi eksikse taban yok sayılır.
  const lines = eco?.lines ?? [];
  const separately =
    lines.length > 0 && lines.every((l) => l.listPriceCents !== null)
      ? lines.reduce((sum, l) => sum + (l.listPriceCents ?? 0) * l.qty, 0)
      : null;
  const advantage = separately !== null && separately > 0 ? ((separately - priceCents) / separately) * 100 : null;

  return (
    <>
      {/* Kalem görselleri, adı ve "4 çeşit · 4 kişilik" eki fırsat kartıyla AYNI kutuda ve aynı
          hizada (`SubjectBox`): paketin çoğul bandını ayrı yazmak, iki tipin görsel bandını farklı
          yüksekliklere düşürüyordu. Bandın tek sıra oluşu ve "+N" hücresi `SubjectCard`ın işi. */}
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      {/* Taban "ayrı alınsa": paketin indirimi listeye göre değil, KALEMLERİ TEK TEK almaya göre.
          Etiketi yazmak şart — aynı yüzde iki farklı tabandan çıkabilir ve hangisi olduğu vaadin
          kendisidir. */}
      <PriceBlock
        cents={priceCents}
        wasCents={separately}
        wasLabel="ayrı alınsa"
        percentOff={advantage}
        tone="text-ops-olive-dark"
      />

      <Facts>
        {/* ── "KÂR", "MARJ" DEĞİL (10.08, kullanıcı ölçümü) ────────────────────
            Satır bir tur `Marj  %32,8 · 3,02 €` diye yazıyordu ve kullanıcının sorusu haklıydı:
            *"orada 3,02 € var, 3,02 € ne?"* İki sayı yan yana konmuş, ikisi de açıklamasızdı.
            Şimdi ETİKET tutarın kendisini adlandırıyor ("Kâr") ve yüzde parantezde, sönük — teklif
            diyaloğundaki künyeyle aynı dil ("(%12,8 marj) 0,18 € kâr"). Okunacak şey paketin kaç
            euro bıraktığı; oran onu tartıyor, yerine geçmiyor. */}
        {eco?.marginCents != null ? (
          /* ── ZARAR "EKSİ KÂR" DİYE YAZILMAZ (10.08) ─────────────────────────
             Satır bir tur `Kâr  -0,06 € (%-0,6)` gösteriyordu ve zararına bir paket kârlı bir
             paketle aynı dilde, aynı tonda duruyordu — eksi işaretini fark etmek okuyanın işine
             kalıyordu. Kârlılık kapısı bu paketi canlıda yakalamıştı (10.08); ızgarada gözden
             kaçması, kapının bütün gerekçesini boşa çıkarır.

             Zarar ROZET değil KELİME: elde kalıp imha edilecek maldan zararına satış meşrudur ve
             kırmızı bir alarm operatörü düşünmeden geri adım attırırdı (`MarginSentence` ile aynı
             karar). Etiket adını değiştiriyor, ton uyarıyor, yol kapanmıyor. */
          <CardFact
            label={eco.marginCents < 0 ? 'Zarar' : 'Kâr'}
            value={`${money(Math.abs(eco.marginCents))}${eco.marginPercent != null ? ` (${percent(Math.abs(eco.marginPercent), 1)})` : ''}`}
            tone={eco.marginCents < 0 ? 'text-ops-amber' : undefined}
          />
        ) : (
          // Maliyeti bilinmeyen kalem sayısı kararın kendisini etkiliyor: "bu paketin kârını
          // bilmiyorum" ile "kârı yok" aynı şey değil (`CLAUDE §1` — ölçülemeyen değer sıfır değildir).
          <CardFact
            label="Kâr"
            value={eco && eco.unknownCostLines > 0 ? `${num(eco.unknownCostLines)} kalemde alış yok` : 'hesaplanamadı'}
          />
        )}
        <CardFact label="İçerik" value={`${payload.items.length} kalem · ${num(payload.items.reduce((s, i) => s + i.qty, 0))} ad.`} />
      </Facts>
    </>
  );
}

/** Kalemlerin toplam adedi — künyedeki "N kalem · M ad." ikilisinin ikinci yarısı. */
function totalQty(lines: { qty: number }[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

/**
 * TEDARİK SİPARİŞİ — kararın konusu "ne kadar mal, kimden, hangi depoya, kaça".
 *
 * ── TAHMİNİ TUTAR: ÖNCE YOKTU, ÖLÇÜNCE ÇIKTI ────────────────────────────────
 * İlk tur kartta tutar yoktu ve gerekçesi şuydu: "alış fiyatı siparişte değil mal kabulde
 * kesinleşir, uydurma sayı onaylatmayalım." Kullanıcının sorusu doğru soruydu (*"bu ürünlerin
 * yaklaşık kaç lira ettiğini biliyor muyuz?"*) ve ölçüm gerekçeyi çürüttü:
 * `supplier_product.last_purchase_price` 23/23 dolu — **biliyoruz**. Bilinen bir sayıyı saklamak,
 * kasadan ne çıkacağını görmeden sipariş onaylatmak demekti.
 *
 * Tutar TAHMİN olarak sunuluyor (`~`) ve **bir kalemin bile fiyatı eksikse hiç yazılmıyor**: eksik
 * tabanla bulunan toplam, gerçeğinden daima azdır ve az görünen bir tutar onayı kolaylaştırır
 * (`CLAUDE §1` — ölçülemeyen değer sıfır değildir).
 *
 * **Adetleri MOTOR hesapladı, model değil** (`ReorderService`): kart adedi tartışmaya açmıyor,
 * yalnız gösteriyor. Düzenleme diyaloğun işi.
 */
function PurchaseOrderCard({ payload, row }: { payload: PurchaseOrderPayload; row: AssistantRowView }) {
  const eco = row.economics?.kind === 'supply' ? row.economics : null;
  // Fiyat önce BUGÜNKÜ kayıttan, sonra dilekçeden: sipariş kuyrukta beklerken alış değişmiş
  // olabilir ve onay anında geçerli olan bugünküdür (`batch_offer`daki liste fiyatıyla aynı sıra).
  const unitOf = (line: PurchaseOrderPayload['lines'][number]) =>
    eco?.unitCostByVariant[line.variantId] ?? line.lastPurchasePriceCents;
  const unknownPrice = payload.lines.filter((l) => unitOf(l) == null).length;
  const estimateCents = unknownPrice > 0 ? null : payload.lines.reduce((sum, l) => sum + (unitOf(l) ?? 0) * l.qty, 0);

  return (
    <>
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      {estimateCents !== null ? (
        <PriceBlock cents={estimateCents} wasCents={null} wasLabel="" percentOff={null} tone="" note="tahmini tutar" />
      ) : null}

      {/* ── KÜNYE SATIRLARI AYRI (kullanıcı düzeltmesi 10.08) ─────────────────
          Bir tur depo/kalem/adet tek satıra sıkıştırılmıştı (`STR · 14 kalem · 411 ad.`) ve dar
          sütunda üç değer birbirine giriyordu — üstelik kartın altında boş alan varken. Sıkıştırma
          "kart en fazla üç künye satırı" kuralından geliyordu; kural yerinde ama burada yanlış
          uygulanmıştı: sınırın amacı kartı kısa tutmak değil, OKUNUR tutmak. */}
      <Facts>
        {estimateCents === null ? (
          <CardFact label="Tahmini tutar" value={`${num(unknownPrice)} kalemde fiyat yok`} />
        ) : null}
        <CardFact label="Depo" value={eco?.warehouseCode ?? payload.warehouseCode ?? '—'} />
        <CardFact label="Kalem" value={`${num(payload.lines.length)} çeşit`} />
        <CardFact label="Toplam" value={`${num(totalQty(payload.lines))} ad.`} />
      </Facts>
    </>
  );
}

/**
 * MAL KABUL — siparişten farkı: burada mal ELDE ve sayılar kesin.
 *
 * ── TOPLAM MALİYET HESAPLANIYOR ─────────────────────────────────────────────
 * `Σ qty × unitCostCents`. Fırsat kartındaki indirim yüzdesiyle aynı bilinçli istisna: iş kuralı
 * değil, dilekçede yan yana duran iki sayının çarpımı. **Bir kalemin bile alış fiyatı yoksa toplam
 * YAZILMAZ** — eksik tabanla bulunan bir tutar, kasadan çıkacak parayı olduğundan az gösterir
 * (`CLAUDE §1`: ölçülemeyen değer sıfır değildir). O hâlde kaç kalemin fiyatsız olduğu söylenir.
 *
 * ── EN YAKIN SKT KARARIN KENDİSİ ────────────────────────────────────────────
 * Girişi yapılan partinin ömrü, malın satılabilirliğidir: üç ay sonra dolacak 40 adet ile bir yıl
 * sonrası aynı karar değildir. Kalem başına tarih göstermek karta sığmaz; **en yakını** göstermek
 * riski söyler, çünkü ilk dolan parti ilk sorunu çıkarır.
 */
function StockIntakeCard({ payload, row }: { payload: StockIntakePayload; row: AssistantRowView }) {
  const unknownCost = payload.lines.filter((l) => l.unitCostCents === null).length;
  const costCents = unknownCost > 0 ? null : payload.lines.reduce((sum, l) => sum + (l.unitCostCents ?? 0) * l.qty, 0);
  // Tarihler dizge olarak ISO (YYYY-MM-DD) — sıralama için ayrıştırmaya gerek yok.
  const soonest = payload.lines.map((l) => l.expiryDate).sort()[0];

  return (
    <>
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      {costCents !== null ? (
        <PriceBlock cents={costCents} wasCents={null} wasLabel="" percentOff={null} tone="" note="alış toplamı" />
      ) : null}

      {/* Künye satırları AYRI — tedarik siparişiyle aynı gerekçe (kullanıcı düzeltmesi 10.08):
          dar sütunda birleştirilen değerler birbirine giriyor, oysa kartın altında yer var. */}
      <Facts>
        {costCents === null ? <CardFact label="Alış" value={`${num(unknownCost)} kalemde fiyat yok`} /> : null}
        <CardFact label="En yakın SKT" value={soonest ? shortDate(soonest) : '—'} />
        <CardFact label="Belge" value={payload.documentNo ?? '—'} />
        <CardFact label="Parti" value={`${num(payload.lines.length)} çeşit · ${num(totalQty(payload.lines))} ad.`} />
      </Facts>
    </>
  );
}

/**
 * TARİF TASLAĞI — kararın konusu içerik, ölçüsü MALZEME.
 *
 * ── NEDEN ADIM SAYISI ───────────────────────────────────────────────────────
 * Tarifin hazırlanışı çok dilli tek bir metin (`steps`) ve karta sığmaz. Ama "kaç adım" sayısı
 * kararın ölçeğini söylüyor: iki adımlık bir servis önerisi ile sekiz adımlık bir pişirme tarifi
 * aynı iş değil. Adımlar satır satır yazılıyor (`1.` `2.` …), sayı da satırlardan çıkıyor —
 * ayraç ekranın işi olduğu için (`RecipeDraftPayloadSchema` künyesi) burada da aynı ayraç geçerli.
 *
 * ── AÇIKLAMA VARSA GÖSTERİLİYOR ─────────────────────────────────────────────
 * Tarif müşteri yüzeyine çıkan bir içerik; onaylanan metnin ne olduğu onay anında okunmalı
 * (`product_create`teki tanıtım metniyle aynı gerekçe).
 */
function RecipeCard({ payload, row }: { payload: RecipeDraftPayload; row: AssistantRowView }) {
  const description = payload.description ? resolveLocalizedText(payload.description, 'tr') : '';
  const steps = resolveLocalizedText(payload.steps, 'tr')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  return (
    <>
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      {description ? (
        <span className="line-clamp-2 font-ops-body text-ops-base leading-snug text-ops-ink">{description}</span>
      ) : null}

      <Facts>
        <CardFact
          label="Malzeme"
          value={`${num(payload.items.length)} çeşit · ${num(totalQty(payload.items))} ad.`}
        />
        <CardFact label="Hazırlanış" value={steps.length > 0 ? `${num(steps.length)} adım` : 'yazılmamış'} />
      </Facts>
    </>
  );
}

/**
 * VİTRİN İŞARETİ — tek bir aç/kapa kararı, ama yalnız başına verilemez.
 *
 * ── KARARIN KENDİSİ BÜYÜK YAZILIR ───────────────────────────────────────────
 * Öteki tiplerde kartın büyük satırı paradır; burada para yok, **yön** var: "Vitrine çıkar" ya da
 * "Vitrinden kaldır". İkisini küçük bir künye satırına gömmek, kartın ne teklif ettiğini okunmaz
 * kılardı — ızgarada iki zıt karar aynı görünürdü.
 *
 * ── VİTRİNDEKİ SAYI KARARIN YARISI ──────────────────────────────────────────
 * Vitrin bir liste değil bir SEÇKİdir: doluysa eklenen şey ötekini aşağı iter. "Bir tane daha
 * eklemek" ile "sekizinciyi eklemek" aynı karar değil ve fark ancak sayı görünürse fark edilir
 * (`currentlyFeaturedCount`, 22.5 denetim bulgusu). Sayı öneri anındaki hâldir — uygulama anında
 * değişmiş olabilir, o yüzden karar girdisi olarak sunuluyor, kural olarak değil.
 *
 * Alan HİÇ gelmemişse "0" denmiyor: sayılmamış olmak ile sıfır olmak ayrı şeyler (`CLAUDE §1`).
 */
function FeaturedCard({ payload, row }: { payload: FeaturedFlagPayload; row: AssistantRowView }) {
  const on = payload.isFeatured;

  return (
    <>
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      <span
        className={`font-ops-display text-ops-lead font-semibold ${on ? 'text-ops-olive-dark' : 'text-ops-body'}`}
      >
        {on ? 'Vitrine çıkar' : 'Vitrinden kaldır'}
      </span>

      <Facts>
        <CardFact label="Tür" value={TARGET_LABEL[payload.target]} />
        <CardFact
          label="Vitrinde"
          value={
            payload.currentlyFeaturedCount === undefined
              ? 'sayılmadı'
              : `${num(payload.currentlyFeaturedCount)} ${TARGET_LABEL[payload.target].toLowerCase()}`
          }
        />
      </Facts>
    </>
  );
}

/** Vitrin hedefinin türü — konu künyesiyle aynı kelimeyi kullanır (`lib/assistant/subject`). */
const TARGET_LABEL: Record<FeaturedFlagPayload['target'], string> = {
  category: 'Kategori',
  collection: 'Koleksiyon',
  bundle: 'Paket',
};

/**
 * MODELİN NET OKUYAMADIĞI ALANLAR — ambalaj fotoğrafı bulanık, kesik ya da yansımalıydı.
 *
 * **Boşken satır ÇİZİLMEZ ve bu, "boş alan da gösterilir" kuralıyla çelişmez** (22.10): o kural
 * asistanın doldurmadığı KARAR alanları içindi ("asgari sepete hiç girmemiş, haberi var mıydı?"),
 * burada ise eksik bir veri değil, olmayan bir SORUN var. Boş dizi "hepsini net okudum" demektir ve
 * her karta "belirsiz: yok" satırı koymak, asıl doluyken göze çarpması gereken uyarıyı sıradanlaştırır.
 *
 * Dolduğunda amber: patronun gözünü tek tek bütün alanları okumaya değil, şüpheli olana yönlendiriyor
 * — ürünü zaten tanıyor, ona "şuraya bak" demek yeter (`ProductReviewSignalsSchema` künyesi).
 */
function UncertainFact({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;
  return (
    <CardFact
      label="Belirsiz okuma"
      value={fields.map((f) => DECLARATION_FIELD_LABEL[f] ?? f).join(' · ')}
      tone="text-ops-amber"
    />
  );
}

/**
 * ONAY SONRASI HÂLÂ EKSİK KALACAK BEYANLAR. Ölçüt motordan (`missingDeclarations`), adlar tek
 * kaynaktan (`DECLARATION_GAP_LABELS`) — ürün önizlemesi de aynı eksiği aynı kelimeyle yazıyor.
 *
 * `showEmpty` YENİ ürün içindir: orada "eksik beyan yok" gerçek bir cevaptır (kayıt tam doğacak).
 * Tamamlama önerisinde ise satır yalnız doluyken çiziliyor — zaten eksikleri kapatmak için açılmış
 * bir öneride "eksik yok" demek, kartın söylediği işi tekrar etmekten başka şey değil.
 */
function GapFact({ gaps, showEmpty = false }: { gaps: DeclarationGap[]; showEmpty?: boolean }) {
  if (gaps.length === 0 && !showEmpty) return null;
  return (
    <CardFact
      label="Eksik beyan"
      value={gaps.length === 0 ? 'yok' : gaps.map((g) => DECLARATION_GAP_LABELS[g]).join(' · ')}
      tone={gaps.length > 0 ? 'text-ops-amber' : undefined}
    />
  );
}

/**
 * ÜRÜN TAMAMLAMA — kararın konusu ürün, ama asıl soru "NE KAYBEDİYORUM".
 *
 * ── ÜZERİNE YAZMA KARTIN EN ÖNEMLİ SAYISI ───────────────────────────────────
 * `updateDetails` düz bir `update`tir ve sürüm tutmaz: dolu bir açıklama onaylandığı an kaybolur,
 * geri getirilemez. Kart "3 kutu dolduruluyor" deyip geçseydi, patron geri alınamaz bir silmeyi
 * "eksik tamamlama" sanarak onaylardı. O yüzden satır ayrı ve tonu uyarıyor.
 *
 * **`currentFields` hiç gelmediyse ne "0" ne de "var" denir** — "eski hâl okunamadı" ayrı bir
 * cevaptır ve karta öyle yazılır (`CLAUDE §1`).
 *
 * ── GÖRSEL ÜRÜNÜN KENDİSİ ───────────────────────────────────────────────────
 * Bu tipte ürün ZATEN VAR, yani fotoğrafı da var: kart onu gösteriyor (`SubjectBox`). Yeni ürün
 * önerisinde (`product_create`) gösteremez, çünkü ortada henüz kayıt yoktur — iki kardeş tipin
 * kartı bu yüzden aynı görünmüyor.
 */
function ProductDraftCard({ payload, row }: { payload: ProductDraftPayload; row: AssistantRowView }) {
  const summary = draftFieldSummary(payload);

  return (
    <>
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      <Facts>
        <CardFact label="Doldurulan" value={summary.labels.length > 0 ? summary.labels.join(' · ') : '—'} />
        <CardFact
          label="Üzerine yazılan"
          value={
            summary.overwrites === null
              ? 'eski hâl okunamadı'
              : summary.overwrites === 0
                ? 'yok — boş kutular'
                : `${num(summary.overwrites)} dolu kutu`
          }
          tone={summary.overwrites ? 'text-ops-amber' : undefined}
        />
        <UncertainFact fields={payload.uncertainFields} />
        <GapFact gaps={payload.remainingGaps} />
      </Facts>
    </>
  );
}

/**
 * YENİ ÜRÜN — görseli OLMAYAN ikinci tip, ama sebebi para hareketininkinden başka: ürün henüz
 * DOĞMAMIŞTIR. Fotoğraf onaylandıktan sonra ürün ekranından yüklenir.
 *
 * ── BANDI ÜRÜNÜN KİMLİĞİ DOLDURUYOR ─────────────────────────────────────────
 * Ad (TR) + kategori + boylar. Bir katalog kararında ilk sorulan üç şey bunlar; "kaç boyu var"
 * özellikle önemli çünkü **varyantsız ürün satılamaz** (fiyat ve stok varyanta bağlı).
 *
 * ── EKSİK BEYAN GİZLENMİYOR ─────────────────────────────────────────────────
 * `remainingGaps` yasal beyanın onaydan SONRA da eksik kalacak parçaları — adları tek kaynaktan
 * (`DECLARATION_GAP_LABELS`), çünkü aynı eksiği ürün önizlemesi de yazıyor. Ürün eksik beyanla
 * yaratılabilir (taslak olarak durur, vitrine çıkmaz); saklanması gereken bir kusur değil, onay
 * sonrası yapılacak işin listesi.
 */
function ProductCreateCard({ payload }: { payload: ProductCreatePayload }) {
  const name = resolveLocalizedText(payload.name, 'tr');
  const description = payload.description ? resolveLocalizedText(payload.description, 'tr') : '';

  return (
    <>
      <span
        className={`flex ${MEDIA_H} flex-col justify-center gap-1.5 rounded-ops-card border border-ops-line bg-ops-white px-3.5`}
      >
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-muted">
          {payload.categoryName ?? 'kategorisiz'}
        </span>
        <span className="line-clamp-2 font-ops-display text-ops-lead font-semibold leading-snug text-ops-ink">{name}</span>
        <span className="truncate font-ops-body text-ops-sm text-ops-muted">
          {payload.variants.map((v) => resolveLocalizedText(v.label, 'tr')).join(' · ')}
        </span>
      </span>

      {/* Asistanın yazdığı tanıtım metni — ürünün NE OLDUĞUNU söyleyen tek cümle ve onay anında
          okunması gereken şeylerin başında geliyor: müşteri sayfasına aynen bu çıkacak. Bir tur
          karta hiç konmamıştı (kullanıcı sorusu 11.08: *"başka eksik bir şey var mı?"*) — dilekçede
          dolu duran bir metni göstermemek, onaylanan şeyi görünmez kılmaktı. */}
      {description ? (
        <span className="line-clamp-2 font-ops-body text-ops-base leading-snug text-ops-ink">{description}</span>
      ) : null}

      <Facts>
        <UncertainFact fields={payload.uncertainFields} />
        {/* Eksik beyan ÖNCE: onay sonrası iş yükünü söyleyen satır, KDV'den önce okunmalı. */}
        <GapFact gaps={payload.remainingGaps} showEmpty />
        <CardFact label="Boy" value={`${num(payload.variants.length)} çeşit`} />
        {/* Tarih tipi ile raf ömrü tek satırda ve bu birleştirme bilinçli: ikisi TEK kuralın iki
            yarısı — "DDM · 30 gün" bir partinin ne zaman düşeceğini söyler, ayrı ayrı hiçbir şey. */}
        <CardFact
          label="Tarih"
          value={`${payload.dateType}${payload.shelfLifeDays ? ` · ${num(payload.shelfLifeDays)} gün` : ''}`}
        />
        <CardFact label="KDV" value={percent(payload.vatRate, 1)} />
      </Facts>
    </>
  );
}

/** Para hareketinin türü — dilekçedeki kapalı küme, operatörün diliyle. */
const MONEY_TYPE: Record<MoneyMovementPayload['type'], string> = {
  expense: 'Gider',
  transfer: 'Transfer',
  capital: 'Sermaye',
  misc: 'Diğer',
};

/**
 * PARA HAREKETİ — görseli OLMAYAN ilk tip (22.11).
 *
 * ── GÖRSELİN YERİNİ TUTAR ALIYOR ────────────────────────────────────────────
 * Bugüne kadar kurulan kart dili fotoğraf üzerineydi: fırsat ürünü, paket kalemlerini gösteriyor.
 * Defter satırının fotoğrafı yok ve olamaz — ama bandın YÜKSEKLİĞİ standart (`MEDIA_H`, kullanıcı
 * kararı 10.08) ve ızgarada hizayı o tutuyor. Bandı boş bırakmak kartı ötekilerden 128 piksel kısa
 * yapardı; onun yerine bandı **kararın kendisi** dolduruyor: tür, tutar, paranın yolu. Bir para
 * hareketinde tanımayı sağlayan şey zaten fotoğraf değil bu üçlü.
 *
 * ── TUTAR RENKLİ: GİDER KIRMIZI, GELİR YEŞİL (kullanıcı kararı 10.08) ───────
 * Bir tur yalnız işaret vardı (`−`/`+`) ve gerekçesi "kira ödemek arıza değil, alarm rengi gereksiz
 * korku yaratır"dı. Kullanıcı düzeltti: *"gider ve gelir kavramı dolayısıyla rakamı
 * renklendirebilirsin."* Doğrusu bu — burada renk bir UYARI değil bir SINIFLANDIRMA: muhasebenin
 * kendi dili kırmızıyı "çıkan", yeşili "giren" için kullanır ve operatör o dili zaten biliyor.
 * Zarar satırındaki amber ile karışmıyorlar, çünkü o gerçekten bir uyarıdır (beklenmeyen sonuç),
 * bu ise hareketin türü.
 *
 * ── TRANSFERDE PARANIN YOLU GÖRÜNÜR ─────────────────────────────────────────
 * `Kasa → Crédit Mutuel`. Hedef hesabın ADI dilekçeye 22.11'de eklendi; öncesinde yalnız kimlik
 * yazılıyordu ve transfer önerisi "Kasa → uuid" diye okunuyordu, yani onaylanamazdı.
 *
 * ── AÇIKLAMA CÜMLESİ KALIYOR ────────────────────────────────────────────────
 * Öteki tiplerde cümle kalktı, burada kalıyor ve sebebi tipin kendisi: "Ağustos ayı depo kirası —
 * STR deposu" bilgisinin sayıya çevrilebilir bir karşılığı yok. Kategori (`kira`) neyin ödendiğini
 * söyler, açıklama HANGİSİNİN ödendiğini.
 *
 * ── BOŞ ALAN DA GÖSTERİLİR ──────────────────────────────────────────────────
 * Kategori/karşı taraf/değer tarihi yoksa satır "—" ile duruyor, gizlenmiyor. Kural kullanıcının
 * kendi kararı (22.10, indirim formu): *"asgari sepete hiç girmemiş, haberi var mıydı?"* — verilmemiş
 * bir kararı listeden çıkarmak, onu verilmiş gibi gösterir. Defterde bu daha da ağır basıyor:
 * kategorisiz bir gider ay sonunda hiçbir raporda görünmez.
 */
function MoneyCard({ payload }: { payload: MoneyMovementPayload }) {
  const out = payload.direction === 'out';
  // Paranın yolu: transferde iki hesap, ötekilerde tek. Ok işareti yönü kelimeye gerek bırakmıyor.
  const route = payload.counterAccountName
    ? `${payload.accountName} → ${payload.counterAccountName}`
    : payload.accountName;

  return (
    <>
      <span
        className={`flex ${MEDIA_H} flex-col justify-center gap-1.5 rounded-ops-card border border-ops-line bg-ops-white px-3.5`}
      >
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-muted">
          {MONEY_TYPE[payload.type]}
        </span>
        <span
          className={`font-ops-mono text-ops-title font-semibold leading-none ${out ? 'text-ops-red' : 'text-ops-olive-dark'}`}
        >
          {out ? '−' : '+'}
          {money(payload.amountCents)}
        </span>
        {/* Hesap tutarın ALTINDA ve sönük: "ne kadar" ile "nereden" ardışık iki soru. Künyeye
            indirilseydi kararın yarısı ayraçın altında kalırdı — aynı tutar kasadan çıkmakla
            bankadan çıkmak ayrı şeylerdir. */}
        <span className="truncate font-ops-body text-ops-sm text-ops-muted">{route}</span>
      </span>

      {payload.description ? (
        <span className="line-clamp-2 font-ops-body text-ops-base leading-snug text-ops-ink">{payload.description}</span>
      ) : null}

      <Facts>
        <CardFact label="Kategori" value={payload.category ?? '—'} />
        <CardFact label="Karşı taraf" value={payload.counterpartyName ?? '—'} />
        <CardFact label="Değer tarihi" value={payload.valueDate ? shortDate(payload.valueDate) : '—'} />
      </Facts>
    </>
  );
}

/**
 * Tarihe kalan gün. `null` = tarih okunamadı; o hâlde satır tarihi yalnız gösterir, süre demez —
 * ölçülemeyen değer sıfır DEĞİLDİR (`CLAUDE §1`).
 */
function daysLeft(iso: string): number | null {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  return Math.round((target.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86_400_000);
}

/** "3 gün" · "bugün" · "6 gün geçti" — geçmiş tarih ayrı bir cümle, eksi sayı değil. */
function leftLabel(days: number): string {
  if (days < 0) return `${num(-days)} gün geçti`;
  if (days === 0) return 'bugün';
  return `${num(days)} gün`;
}
