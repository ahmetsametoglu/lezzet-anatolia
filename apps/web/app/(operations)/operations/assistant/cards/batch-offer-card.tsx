'use client';

import type { BatchOfferPayload } from '@lezzet/types';
import { num, shortDate } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import type { AssistantRowView } from '../assistant-types';
import { daysLeft, Facts, leftLabel, PriceBlock, SubjectBox } from './shared';

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
 * yolu fotoğraf. Konu çözülemezse kutu çizilmez — boş bir çerçeve, olmayan bir bilginin yerini
 * tutmaz.
 *
 * ── İNDİRİM YÜZDESİ KARTTA HESAPLANIYOR ─────────────────────────────────────
 * Bilinçli bir istisna: iş kuralı değil, iki sayının oranı. Liste ile teklif zaten dilekçede yan
 * yana ve operatörün gözünde yaptığı bölmeyi ekranın yapmaması, ızgaranın işini görmemesi olurdu.
 * Liste yoksa yüzde hiç yazılmaz (bölünecek taban yok) ve fiyat tek başına durur.
 */
export function BatchOfferCard({ payload, row }: { payload: BatchOfferPayload; row: AssistantRowView }) {
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
