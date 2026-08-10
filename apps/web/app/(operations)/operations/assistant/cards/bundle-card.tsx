'use client';

import { toCents } from '@lezzet/helper';
import type { BundleDraftPayload } from '@lezzet/types';
import { money, num, percent } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import type { AssistantRowView } from '../assistant-types';
import { Facts, PriceBlock, SubjectBox, SummaryLine } from './shared';

/**
 * PAKET — konusu kendisi ama YÜZÜ kalemleri (22.11).
 *
 * ── İKİ SAYI, İKİ MUHATAP ───────────────────────────────────────────────────
 * Paket kararı tek sayıyla verilmiyor ve ikisi farklı kişilere bakıyor:
 *
 * · **Avantaj** (`%15`) müşterinin gördüğü şey — kalemleri ayrı ayrı almaya göre ne kazanıyor.
 *   Paketin SATILABİLİR olup olmadığını bu söylüyor; avantajsız bir paket vitrinde durur ama
 *   kimse almaz.
 * · **Kâr** patronun gördüğü şey — bu paket para kazandırıyor mu. Kârlılık kapısı zaten canlı bir
 *   zararlı paket yakalamıştı (10.08, "Baklava İkili Lezzet" −6 cent), yani soru teorik değil.
 *
 * Biri olmadan öteki yanıltır: yüksek avantajlı bir paket zararına satılıyor olabilir, yüksek kârlı
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
export function BundleCard({ payload, row }: { payload: BundleDraftPayload; row: AssistantRowView }) {
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
          yüksekliklere düşürüyordu. Bandın deste oluşu ve kırpma `SubjectCard`ın işi. */}
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
            diyaloğundaki künyeyle aynı dil. Okunacak şey paketin kaç euro bıraktığı; oran onu
            tartıyor, yerine geçmiyor. */}
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
