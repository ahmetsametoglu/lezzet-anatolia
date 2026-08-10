'use client';

import type { ReactNode } from 'react';
import { toCents } from '@lezzet/helper';
import {
  PROPOSAL_PAYLOAD_SCHEMAS,
  type AssistantProposalKind,
  type BatchOfferPayload,
  type BundleDraftPayload,
  type DiscountDraftPayload,
  type ZoneExtendPayload,
} from '@lezzet/types';
import { money, num, percent, shortDate } from '@/components/operation/ui/format';
import { SubjectCard } from '@/components/operation/ui/subject-card';
import { CardFact } from './assistant-card';
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
}: {
  cents: number;
  /** Karşılaştırma tabanı — yoksa üst satır hiç çizilmez (uydurma bir "yerine" yazılmaz). */
  wasCents: number | null;
  /** Tabanın ADI: "liste" (fırsat) · "ayrı alınsa" (paket). İndirimin neye göre olduğu vaadin kendisi. */
  wasLabel: string;
  percentOff: number | null;
  tone: string;
}) {
  return (
    <span className="flex flex-col gap-0.5 pt-0.5">
      {wasCents !== null ? (
        <span className="flex items-baseline gap-1.5 font-ops-body text-ops-xs text-ops-muted">
          <span>{wasLabel}</span>
          <span className="font-ops-mono line-through">{money(wasCents)}</span>
        </span>
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
