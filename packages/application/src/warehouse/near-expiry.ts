import { SettingsService, StockService } from '@lezzet/database';
import type { NearExpiryBatchContract } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import { readExpiryThresholds, toBatchViews } from './batch-view';

/*
  D3 · YAKIN-SKT TURU — depocunun ömrü azalan partileri gezdiği liste.

  ── NİÇİN YENİ BİR DOSYA, MOTORUN İÇİNE DEĞİL ──────────────────────────────
  `batch-view.ts` SAF bir dönüştürücü: satırları alır, karar ve yüzde ekler, geri verir. Veritabanı
  bilmez ve bilmemeli (STACK §4 — domain saf karar, database saf I/O). Buradaki iş ikisini
  BİRLEŞTİRMEK: partileri oku, eşikleri oku, motora ver, depo yüzeyinin göreceği şekle indir.
  Uygulama katmanının tanımı budur.

  ── LİSTE NEYİ TAŞIR: KARAR BEKLEYEN PARTİ ─────────────────────────────────
  Ekran "bütün stok" değil "bugün bakılacaklar" listesidir. Süzgeç `decision`dan geçiyor: kararı
  olmayan parti (`none`) listeye girmez. Eşik SUNUCUDA uygulanıyor, ekranda değil — yoksa depo
  ekranı binlerce partiyi indirip kendi eleyecekti ve eşiği değiştiren operatör ekranın hâlâ eski
  ölçütle çizdiğini fark edemezdi.

  ── PARA SINIRDA KALIR ─────────────────────────────────────────────────────
  Motor fiyat da üretiyor (liste fiyatı, önerilen teklif). Dönen tipte para alanı YOK: depo yüzeyi
  tutar görmez (CLAUDE §2) ve alanı taşımamak, ekranın onu bir gün "bilgi olsun" diye çizmesinin
  önünü kapatıyor.
*/

/**
 * **Bir deponun karar bekleyen partileri** (D3).
 *
 * SIRA ACİLİYETE GÖRE: en az günü kalan önce. Depocu listeyi yukarıdan aşağı geziyor ve elindeki
 * ilk iş en acil olan olmalı; parti kimliğine ya da ada göre sıralamak, o turu rastgele bir gezintiye
 * çevirirdi.
 */
export async function listNearExpiry(
  db: SupabaseClient,
  warehouseId: string,
  opts: { now?: Date } = {},
): Promise<NearExpiryBatchContract[]> {
  const now = opts.now ?? new Date();

  // Partiler ve eşikler birbirini beklemez: ikisi de ötekinin girdisi değil.
  const [rows, thresholds] = await Promise.all([
    new StockService(db).listInStockDetailed(undefined, [warehouseId]),
    readExpiryThresholds(new SettingsService(db)),
  ]);
  if (rows.length === 0) return [];

  /* AD VE RAF ÖMRÜ AYRICA OKUNMUYOR: parti satırı ürünü GÖMÜLÜ taşıyor
     (`StockBatchDetailSchema.variant.product`) ve motor onu oradan okuyor. Varyant başına ikinci
     bir tur, elli partilik bir turda elli uçuş demekti — şema bu N+1'i zaten kapatmış. */
  const views = toBatchViews(rows, { now, thresholds });

  /* ÜRÜNÜN DEPODAKİ TOPLAMI — imha çekmecesinin bağlamı (tasarım 31.08). Ayrı bir okuma İSTEMİYOR:
     `rows` zaten bu deponun bütün partileri, yani toplam onların içinde. İkinci bir sorgu, elde
     duran veriyi yeniden sormaktı. */
  const stockOfVariant = new Map<string, number>();
  for (const row of rows) {
    stockOfVariant.set(row.variantId, (stockOfVariant.get(row.variantId) ?? 0) + row.physicalQty);
  }

  return views
    .filter((view) => view.decision !== 'none')
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map((view) => ({
      stockId: view.id,
      batchNo: view.batchNo,
      lotNumber: view.lotNumber,
      productName: view.productName,
      variantLabel: view.variantLabel,
      qty: view.physicalQty,
      expiryDate: view.expiryDate,
      daysLeft: view.daysLeft,
      remainingPercent: view.remainingPercent,
      decision: view.decision,
      belowMlor: view.belowMlor,
      /* Rejim ürünün alanı, partinin değil — parti tarihi taşır, "o tarih ne demek" ürünün kuralı. */
      dateType: view.variant.product.dateType,
      shelfLabel: view.storageArea?.name ?? null,
      productStockQty: stockOfVariant.get(view.variantId) ?? 0,
    }));
}
