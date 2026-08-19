import { DeliveryRunCollectionService, DeliveryRunService } from '@lezzet/database';
import { deliveryRunReferenceNo } from '@lezzet/domain-core';
import { fromCents } from '@lezzet/helper';
import { tabloDolu, type Db, type Kisiler } from './shared';

// ── SEFER + sefer kapanışı (0046 · 11.7 · 18.08) ─────────────────────────────────────────────────
// Kapanış bir MUTABAKAT kaydıdır, para hareketi değil: para kapıda tahsil edilirken zaten yazıldı
// (12.2). Eksen 18.08'de kurye×gün'den SEFERE indi ("fark hangi seferde doğdu" cevaplanabilmeli).
//
// SEFERLER HAM INSERT'LE KURULUR ve bu bilinçli: `start_delivery_run` RPC'si sabahın gerçeğini
// yaşar (departed_at = now, claim yalnız açık durumlar) — seed ise günü SONDAN kurar: teslim
// edilmiş siparişler çoktan var ve geçmiş çıkış/dönüş damgaları gerekir. Tarihi geriye kurmanın
// serviste karşılığı yok ve olmamalı (cart.updated_at emsali) — o yalnız seed'in derdi.
//
// Beklenen tutar UYDURULMAZ: `delivery_run_collection` görünümünden gelir ve kapanış RPC'si onu
// kendisi okur. Seed'in tek söylediği "kurye ne saydı"dır — mutabakatın anlamı da zaten budur.
//
// Üç hâl kurulur, çünkü ekran üçünü ayrı gösterir:
//   · MUTABIK sefer     → sayılan = beklenen; yeşil satır
//   · FARKLI sefer      → nakit eksik çıkmış + kuryenin açıklaması; fark gizlenmez, AÇIKLANIR
//   · KAPANMAMIŞ sefer  → teslimatı olan ama sayımı yapılmamış sefer; "açık sefer" uyarısı

/**
 * Kuryeli rota siparişlerini (zone, gün) başına SEFERE bağlar. Sipariş seed'inden SONRA koşar:
 * hangi günler sürülmüş, siparişlerin kendisi söylüyor — seed tarihle gizlice anlaşmaz.
 */
export async function seedDeliveryRuns(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'delivery_run')) {
    console.log('▸ seferler zaten dolu — atlandı');
    return;
  }
  console.log('▸ SEFER seed');
  const kurye = kisiler.get('kurye');
  if (!kurye) {
    console.log('  · kurye profili yok — atlandı');
    return;
  }

  // Kuryeli, bölgeli, günlü rota siparişleri — seferin duraklarını bunlar tanımlar.
  const { data, error } = await db
    .from('order')
    .select('id,delivery_zone_id,delivery_date,warehouse_id')
    .eq('courier_id', kurye)
    .eq('delivery_type', 'route')
    .not('delivery_zone_id', 'is', null)
    .not('delivery_date', 'is', null);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; delivery_zone_id: string; delivery_date: string; warehouse_id: string }>;
  if (rows.length === 0) {
    console.log('  · kuryeli rota siparişi yok — sefer kurulmadı');
    return;
  }

  // (zone, gün) grupları — rota+gün başına TEK sefer (0046 kısıtının aynısı).
  const gruplar = new Map<string, { zoneId: string; date: string; warehouseId: string; orderIds: string[] }>();
  for (const row of rows) {
    const key = `${row.delivery_zone_id}·${row.delivery_date}`;
    const grup = gruplar.get(key);
    if (grup) grup.orderIds.push(row.id);
    else gruplar.set(key, { zoneId: row.delivery_zone_id, date: row.delivery_date, warehouseId: row.warehouse_id, orderIds: [row.id] });
  }

  const yil = new Date().getFullYear();
  for (const grup of gruplar.values()) {
    // Çıkış sabah 08:30, dönüş 16:45 — kapanış ekranındaki süre hesabı gerçekçi dursun.
    const departed = `${grup.date}T08:30:00+02:00`;
    const returned = `${grup.date}T16:45:00+02:00`;
    const { data: run, error: runErr } = await db
      .from('delivery_run')
      .insert({
        reference_no: deliveryRunReferenceNo(yil),
        delivery_zone_id: grup.zoneId,
        delivery_date: grup.date,
        warehouse_id: grup.warehouseId,
        courier_id: kurye,
        created_at: departed,
        departed_at: departed,
        returned_at: returned,
      })
      .select('id,reference_no')
      .single();
    if (runErr) throw runErr;

    const { error: stampErr } = await db
      .from('order')
      .update({ delivery_run_id: (run as { id: string }).id })
      .in('id', grup.orderIds);
    if (stampErr) throw stampErr;
    console.log(`  ✓ ${(run as { reference_no: string }).reference_no} · ${grup.date} · ${grup.orderIds.length} durak`);
  }
  console.log(`✓ sefer: ${gruplar.size} sefer kuruldu (rota+gün başına tek)`);
}

/** Sefer kapanışları — kapanış RPC'den geçer (yazım tek yol), yalnız sayılan tutarlar seed'indir. */
export async function seedRunCloses(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'delivery_run_close')) {
    console.log('▸ sefer kapanışları zaten dolu — atlandı');
    return;
  }
  console.log('▸ SEFER KAPANIŞI seed');
  const kurye = kisiler.get('kurye');
  const admin = kisiler.get('devAdmin') ?? null;
  if (!kurye) {
    console.log('  · kurye profili yok — atlandı');
    return;
  }

  const runs = new DeliveryRunService(db);
  const collections = new DeliveryRunCollectionService(db);

  // Kapıda tahsilatı OLAN seferler — görünüm zaten "hangi sefer, ne kadar" diyor. Sıralama sefer
  // gününe göre: en yeni mutabık kapanır, önceki farklı, kalanlar açık kalır.
  const seferler = await runs.listByCourier(kurye, { limit: 30 });
  const tahsilatli: Array<{ runId: string; date: string }> = [];
  for (const sefer of seferler) {
    if (await collections.getByRun(sefer.id)) tahsilatli.push({ runId: sefer.id, date: sefer.deliveryDate });
  }

  if (tahsilatli.length === 0) {
    console.log('  · kapıda tahsilatlı sefer yok — kapanış kurulmadı');
    return;
  }

  // 1) EN YENİ sefer: mutabık kapanış — sayılan tutar beklenenin aynısı.
  const mutabik = tahsilatli[0];
  if (mutabik) {
    const beklenen = await collections.getByRun(mutabik.runId);
    const sonuc = await runs.close({
      runId: mutabik.runId,
      countedCashCents: beklenen?.expectedCashCents ?? 0,
      countedCardCents: beklenen?.expectedCardCents ?? 0,
      countedChequeCents: beklenen?.expectedChequeCents ?? 0,
      actorId: admin,
    });
    console.log(
      sonuc.ok
        ? `  ✓ ${mutabik.date} · MUTABIK · teslim ${sonuc.deliveredCount} · devreden ${sonuc.pendingCount} · nakit ${fromCents(sonuc.countedCashCents ?? 0)} €`
        : `  · ${mutabik.date} atlandı (${sonuc.reason})`,
    );
  }

  // 2) BİR ÖNCEKİ sefer: FARK VAR — kuryede 15 € eksik nakit. Fark açıklamasız kalmaz: operatörün
  // sorduğu soru "neden" olduğu için seed o cevabı da kurar.
  const farkli = tahsilatli[1];
  if (farkli) {
    const beklenen = await collections.getByRun(farkli.runId);
    const sonuc = await runs.close({
      runId: farkli.runId,
      countedCashCents: Math.max(0, (beklenen?.expectedCashCents ?? 0) - 1500),
      countedCardCents: beklenen?.expectedCardCents ?? 0,
      countedChequeCents: beklenen?.expectedChequeCents ?? 0,
      note: 'Bir müşteri 15 € eksik ödedi, kalanı bir sonraki teslimatta verecek. Kendisiyle konuşuldu.',
      actorId: admin,
    });
    console.log(
      sonuc.ok
        ? `  ✓ ${farkli.date} · FARK VAR · nakit fark ${fromCents(sonuc.differenceCashCents ?? 0)} € · mutabık: ${sonuc.reconciled}`
        : `  · ${farkli.date} atlandı (${sonuc.reason})`,
    );
  }

  // 3) Kalan seferler KAPATILMADAN bırakılır — "sayımı bekleyen sefer" uyarısının zemini.
  const acik = tahsilatli.length - Math.min(2, tahsilatli.length);
  console.log(`✓ sefer kapanışı: ${Math.min(2, tahsilatli.length)} sefer kapandı (1 mutabık · 1 FARKLI) · ${acik} sefer açık`);
}
