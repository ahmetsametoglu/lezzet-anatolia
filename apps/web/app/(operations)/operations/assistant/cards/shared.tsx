'use client';

import type { ReactNode } from 'react';
import { DECLARATION_GAP_LABELS, LOCALIZED_TEXT_KEYS, type DeclarationGap, type LocalizedText } from '@lezzet/types';
import { money, num, percent } from '@/components/operation/ui/format';
import { MEDIA_H, SubjectCard } from '@/components/operation/ui/subject-card';
import { CardFact } from '../assistant-card';
import { DECLARATION_FIELD_LABEL } from '../assistant-labels';
import type { AssistantRowView } from '../assistant-types';

/**
 * KART GÖVDELERİNİN ORTAK YAPI TAŞLARI (22.11).
 *
 * ── NEDEN AYRI DOSYA ────────────────────────────────────────────────────────
 * On bir tipin gövdesi tek dosyada 926 satıra çıkmıştı ve bedeli ölçüldü (kullanıcı, 11.08): tek
 * bir kartı düzeltmek için ajanın bütün dosyayı bağlama alması gerekiyordu. Tip başına dosya, o
 * maliyeti ~80 satıra indiriyor. Burada yalnız BİRDEN ÇOK tipin paylaştığı parçalar var — bir
 * bileşen tek tipte kullanılıyorsa kendi dosyasında durur, buraya taşınmaz.
 */

/**
 * Asistanın kurduğu cümle — kendi dili olmayan tiplerin gövdesi.
 *
 * Tutar da BURADA yazılıyor (varsa): ortak iskeletten kalktı, çünkü kendi dili olan tipte para iki
 * kez görünüyordu (`ProposalCard` künyesi). Cümlenin altında ve büyük — kendi dili olmayan bir
 * tipte okunacak tek sayı odur.
 */
export function SummaryLine({ summary, amountCents }: { summary: string; amountCents?: number | null }) {
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
export function PriceBlock({
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
export function Facts({ children }: { children: ReactNode }) {
  return <span className="flex flex-col gap-1 border-t border-ops-line-soft pt-2.5">{children}</span>;
}

/**
 * KONU KUTUSU — kartın başındaki beyaz çerçeve (ürün · paket · kategori…).
 *
 * Beyaz kutu içinde duruyor: renkli üst şeridin altında yükseliyor ve "bu kartın konusu bu" demiş
 * oluyor. Kutu bütün tiplerde aynı olduğu için burada tek yerde — `SubjectCard` içeriği çiziyor,
 * burası yalnızca çerçeve. Ayrı ayrı yazılsaydı fırsat ile paketin kutusu bir gün ayrışırdı ve
 * ızgarada iki farklı çerçeve dolgusu görünürdü.
 *
 * Görselin boyu `SubjectCard`ın kendi standardından geliyor (`MEDIA_H`), buradan verilmiyor:
 * yükseklik kararı çizen tarafın, çerçeve çizenin değil.
 */
export function SubjectBox({ subject }: { subject: NonNullable<AssistantRowView['subject']> }) {
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
 * DİL KAPSAMASI — müşteri yüzeyine çıkacak metinler üç dilde var mı (22.11).
 *
 * ── NEDEN KARARIN PARÇASI ───────────────────────────────────────────────────
 * Katalog üç dilli (`fr` · `de` · `tr`) ve eksik dil sessiz bir arıza üretir: kayıt onaylanır,
 * vitrine çıkar, Fransız müşteri Türkçe bir tarif adı görür. Onay anında sorulacak soru "metin
 * yazıldı mı" değil, **"hangi dillerde yazıldı"**dır — asistan çoğu zaman üçünü birden yazıyor
 * ama yazmadığında bunu kimse söylemiyordu.
 *
 * Ölçüt SIKI: bir dil ancak VERİLEN METİNLERİN HEPSİNDE doluysa tam sayılır. Adı üç dilde olup
 * açıklaması yalnız Türkçe olan bir kayıt "üç dilli" değildir; gevşek ölçüt, eksiği tam gösterirdi.
 */
export function LocaleFact({ texts }: { texts: (LocalizedText | null | undefined)[] }) {
  const present = texts.filter((t): t is LocalizedText => Boolean(t));
  if (present.length === 0) return null;

  const missing = LOCALIZED_TEXT_KEYS.filter((locale) => !present.every((text) => text[locale]?.trim()));
  return (
    <CardFact
      label="Dil"
      value={missing.length === 0 ? LOCALIZED_TEXT_KEYS.join(' · ') : `eksik: ${missing.join(', ')}`}
      tone={missing.length > 0 ? 'text-ops-amber' : undefined}
    />
  );
}

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
export function UncertainFact({ fields }: { fields: string[] }) {
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
 * ONAY SONRASI HÂLÂ EKSİK KALACAK BEYANLAR. Ölçüt motordan (`missingDeclarations`) gelir.
 *
 * `showEmpty` YENİ ürün içindir: orada "eksik beyan yok" gerçek bir cevaptır (kayıt tam doğacak).
 * Tamamlama önerisinde ise satır yalnız doluyken çiziliyor — zaten eksikleri kapatmak için açılmış
 * bir öneride "eksik yok" demek, kartın söylediği işi tekrar etmekten başka şey değil.
 */
export function GapFact({ gaps, showEmpty = false }: { gaps: DeclarationGap[]; showEmpty?: boolean }) {
  if (gaps.length === 0 && !showEmpty) return null;
  return (
    <CardFact
      label="Eksik beyan"
      // ── SAYI, LİSTE DEĞİL (kullanıcı kararı 11.08) ────────────────────────
      // Dört eksik alanın adı ("içindekiler · besin değerleri · saklama koşulları · alerjen
      // beyanı") dar sütunda üç satıra sarıyor ve kartın yüksekliğini tek başına belirliyordu.
      // Kararı değiştiren şey hangi alanların eksik olduğu DEĞİL, kaç tanesinin eksik olduğu:
      // "onaylarsan kayıt tam olmayacak" uyarısı sayıyla da tamdır. Adlar diyalogda, orada
      // düzeltilecekleri yerde duruyor — adların sözlüğü `DECLARATION_GAP_LABELS`.
      value={gaps.length === 0 ? 'yok' : `${num(gaps.length)} alan`}
      tone={gaps.length > 0 ? 'text-ops-amber' : undefined}
      title={gaps.length > 0 ? gaps.map((g) => DECLARATION_GAP_LABELS[g]).join(' · ') : undefined}
    />
  );
}

/** Kalemlerin toplam adedi — künyedeki "N çeşit · M ad." ikilisinin ikinci yarısı. */
export function totalQty(lines: { qty: number }[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

/**
 * Tarihe kalan gün. `null` = tarih okunamadı; o hâlde satır tarihi yalnız gösterir, süre demez —
 * ölçülemeyen değer sıfır DEĞİLDİR (`CLAUDE §1`).
 */
export function daysLeft(iso: string): number | null {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  return Math.round((target.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86_400_000);
}

/** "3 gün" · "bugün" · "6 gün geçti" — geçmiş tarih ayrı bir cümle, eksi sayı değil. */
export function leftLabel(days: number): string {
  if (days < 0) return `${num(-days)} gün geçti`;
  if (days === 0) return 'bugün';
  return `${num(days)} gün`;
}

/**
 * BANT KUTUSU — görseli olmayan tiplerin (para · yeni ürün · indirim · bölge) üst bloğu.
 *
 * Fotoğraflı tiplerde bandı `SubjectBox` dolduruyor; burada onun yerini kararın kendisi alıyor.
 * Yükseklik yine standart (`MEDIA_H`) ve gerekçesi ızgaranın kendisi: bandı boş bırakmak ya da
 * içeriğe göre büyütmek, kartların fiyat/künye satırlarını farklı hizalara düşürürdü.
 */
export function BandBox({ children }: { children: ReactNode }) {
  return (
    <span
      className={`flex ${MEDIA_H} flex-col justify-center gap-1.5 rounded-ops-card border border-ops-line bg-ops-white px-3.5`}
    >
      {children}
    </span>
  );
}

/** Bandın üst etiketi — tip/kategori/tür adı; küçük, seyrek harf aralıklı, sönük. */
export function BandLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-muted">
      {children}
    </span>
  );
}

/** Bandın alt satırı — hesap adı, kampanya adı, bölge adı; tek satır, sönük. */
export function BandNote({ children }: { children: ReactNode }) {
  return <span className="truncate font-ops-body text-ops-sm text-ops-muted">{children}</span>;
}

/**
 * Bandın altındaki ANLATI satırı — kapsam cümlesi, talep cümlesi, tanıtım metni.
 *
 * Kartın tek serbest metni burasıdır ve iki satırla sınırlı: üçüncü satır künyeyi aşağı iter,
 * ızgarada da kartların dibini hizasız bırakır.
 */
export function CardLead({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={`line-clamp-2 font-ops-body text-ops-base leading-snug text-ops-ink ${muted ? '' : 'font-medium'}`}
    >
      {children}
    </span>
  );
}
