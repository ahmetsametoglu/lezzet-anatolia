import { ShipmentService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isTerminalShipmentStatus } from '@lezzet/domain-core';
import { syncShipmentStatus } from './sync-status';
import type { ShippingRateProvider } from './port';
import type { OrderEffects } from '../order/effects';

/**
 * **GÖNDERİ NÖBETİ** (07.12) — webhook'un kaçırdığını yakalayan iki tarama.
 *
 * Webhook "at least once" değil "best effort"tur: Sendcloud başarısız çağrıyı 10 kez dener, sonra
 * PES EDER ve yalnız kendi Failed Request kaydına yazar. Sekiz saatlik bir kesinti webhook'ları
 * kalıcı olarak yutabilir. İki tarama bu yüzden var ve ikisi de **taramalı + idempotent**:
 * kaçan tik bir sonraki turda telafi olur.
 */

export interface StuckSweepResult {
  /** Bakılan gönderi sayısı. */
  checked: number;
  /** Durumu gerçekten değişen. */
  advanced: number;
  /** Sağlayıcıya ulaşılamayan — bu tur cevap alınamadı. */
  unreachable: number;
  /** Hâlâ terminal olmayan ve eşiği aşmış olanlar — operatörün bakması gereken küme. */
  stillStuck: string[];
}

/**
 * **TAKILI GÖNDERİLER** — terminal olmayan ve N saatten eski gönderileri sağlayıcıya yeniden sor.
 *
 * `limit` bir emniyet freni: tur başına sorulan gönderi sayısı sınırlı, çünkü her biri bir REST
 * çağrısı ve oran sınırı var (GET 1000/dk). Sınıra dayanan tur bunu SÖYLER — sessizce kesilen bir
 * tarama, "hepsi bakıldı" diye okunurdu.
 */
export async function sweepStuckShipments(
  db: SupabaseClient,
  provider: ShippingRateProvider,
  opts: { olderThanHours?: number; limit?: number; effects?: OrderEffects } = {},
): Promise<StuckSweepResult> {
  const stuck = await new ShipmentService(db).listStuck(opts.olderThanHours ?? 24, opts.limit ?? 50);
  const result: StuckSweepResult = { checked: 0, advanced: 0, unreachable: 0, stillStuck: [] };

  for (const shipment of stuck) {
    result.checked += 1;
    const outcome = await syncShipmentStatus(db, provider, { shipmentId: shipment.id, effects: opts.effects });
    if (outcome.status === 'provider_error') {
      result.unreachable += 1;
      continue;
    }
    if (outcome.status !== 'ok') continue;
    if (outcome.changed) result.advanced += 1;
    // Uzlaştırmadan sonra HÂLÂ terminal değilse gerçekten takılıdır. `error` de buraya girer:
    // düzelme ihtimali var ama kendiliğinden düzelmediyse insan bakmalı.
    if (!isTerminalShipmentStatus(outcome.shipmentStatus ?? shipment.status)) result.stillStuck.push(shipment.id);
  }

  return result;
}

export interface OrphanScanResult {
  /** Sağlayıcıda bulunan gönderi sayısı (taranan pencere içinde). */
  remote: number;
  /**
   * **ÖKSÜZ**: sağlayıcıda var, bizde satırı YOK. Referans projenin runbook'unun sebebi buydu —
   * koli açıldı, para ödendi, kayıt yazılamadı.
   */
  orphans: string[];
  /**
   * **HAYALET**: bizde duyurulmuş görünüyor ama sağlayıcının listesinde yok. Ters yöndeki arıza;
   * takip numarası müşteriye verilmiş ama karşılığı olmayabilir.
   */
  ghosts: string[];
  /** Sağlayıcı listesi sonuna kadar taranamadı — sayılar EKSİK. */
  truncated: boolean;
}

/**
 * **ÖKSÜZ / HAYALET GÖNDERİ TARAMASI** — yalnız TESPİT eder, hiçbir şeyi düzeltmez.
 *
 * Düzeltme bilerek elle: gerçek para söz konusu ve otomatik iptal riskli (bir gönderi yolda
 * olabilir). Runbook `docs/runbook/kargo-oksuz-gonderi.md`.
 *
 * Eşleşme **`external_reference_id`** üzerinden: duyuruda oraya kendi `shipment.id`'mizi yazıyoruz
 * (`announce.ts`). Sağlayıcının kendi kimliğine bakan bir karşılaştırma, duyuru yazımı düştüğünde
 * hiçbir şey bulamazdı — çünkü o kimliği ancak yazabilseydik biliyor olurduk.
 *
 * **Hayalet taraması pencereyle sınırlı ve bu bir ödün:** yalnız taranan pencerede duyurulmuş
 * bizim gönderilerimiz karşılaştırılır. Daha eskisi için sağlayıcı listesi eksik olurdu ve her
 * eski gönderi "hayalet" diye görünürdü — yanlış alarm, alarmsızlıktan kötüdür.
 */
export async function scanOrphanShipments(
  db: SupabaseClient,
  provider: ShippingRateProvider,
  opts: { sinceDays?: number; maxPages?: number } = {},
): Promise<OrphanScanResult> {
  const since = new Date(Date.now() - (opts.sinceDays ?? 8) * 86_400_000);
  const { shipments: remote, truncated } = await provider.listRecent({ announcedAfter: since, pageSize: 100, maxPages: opts.maxPages ?? 10 });

  const shipments = new ShipmentService(db);
  const bizimkiler = await shipments.listAnnouncedSince(since.toISOString());
  const bizimKimlikler = new Set(bizimkiler.map((s) => s.id));
  const uzakKimlikler = new Set(remote.map((r) => r.providerShipmentId));

  const orphans = remote.filter((r) => !r.externalReferenceId || !bizimKimlikler.has(r.externalReferenceId)).map((r) => r.providerShipmentId);
  const ghosts = bizimkiler
    .filter((s) => s.providerShipmentId !== null && !uzakKimlikler.has(s.providerShipmentId))
    .filter((s) => s.status !== 'cancelled')
    .map((s) => s.id);

  return { remote: remote.length, orphans, ghosts, truncated };
}
