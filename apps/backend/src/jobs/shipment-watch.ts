import { serviceDb } from '@lezzet/database';
import { notifyOrderStatus, sendcloudProvider, shippingProviderConfigured, sweepStuckShipments } from '@lezzet/application';
import { captureError, SOURCES } from '@lezzet/observability';
import type { ShippingRateProvider } from '@lezzet/application';

export const SHIPMENT_WATCH = 'shipment_watch';

/**
 * TAKILI GÖNDERİ NÖBETİ (07.12) — **webhook'un kaçırdığını yakalayan emniyet kemeri**.
 *
 * Webhook "at least once" DEĞİLDİR: Sendcloud başarısız çağrıyı 10 kez dener (5 dk → 1 saat),
 * sonra pes eder ve yalnız kendi Failed Request kaydına yazar (doküman). Yarım günlük bir kesinti
 * webhook'ları kalıcı olarak yutar — ve o gönderiler bizde `created`ta donar, sipariş de `ready`de.
 *
 * **Taramalı:** "şu saatin olayları" değil, "terminal olmayan ve N saatten eski TÜM gönderiler".
 * Kaçan tik bir sonraki turda telafi olur; ikinci tarama no-op'tur (defter yalnız DEĞİŞİM yazar).
 *
 * **Saatte bir, ve sıklık bir ÖLÇÜ kararı:** taşıyıcı olayları saat mertebesinde doğuyor, dakikada
 * bir sormak oran sınırını (GET 1000/dk) boş turlarla yerdi. Webhook zaten anlık yolu; bu tur
 * anlık yolun düştüğü hâli kapatıyor.
 *
 * ── HÂLÂ TAKILI OLAN NE OLUYOR ──────────────────────────────────────────────
 * Uzlaştırmadan sonra da terminal olmayan gönderi `error_log`'a **warning** olarak düşer ve
 * operasyon `/operations/system`de görür. `error` DEĞİL: gönderinin yolda olması bir arıza değil,
 * izlenmesi gereken bir hâldir — hata sayacını şişirseydi gerçek arızaları gizlerdi.
 *
 * **Sayı değil KİMLİK yazılır** (OBSERVABILITY §5): kaç tane olduğu `job_run`'da zaten var;
 * ekranda gereken "hangisi" — o kimlikle veritabanına bakılır.
 */

/**
 * **Sağlayıcı ENJEKTE EDİLEBİLİR — tek sebebi TESTİN AĞA ÇIKMAMASI** (`sweepPushReceipts`ın
 * `fetcher` parametresiyle aynı desen ve aynı gerekçe). Üretimde parametre geçilmez; varsayılanı
 * env'den kurulan gerçek sağlayıcıdır.
 */
export async function shipmentWatchJob(opts: { provider?: ShippingRateProvider } = {}): Promise<Record<string, unknown>> {
  // Anahtarsız ortamda tur kendini atlar ve bunu SÖYLER: sessiz no-op, "nöbet tutuluyor" diye
  // okunurdu (`CLAUDE §1` — ölçülemeyen değer sıfır değildir).
  if (!shippingProviderConfigured()) return { skipped: 'not_configured' };

  const db = serviceDb();
  const hours = Number(process.env.SHIPMENT_STUCK_HOURS) || 24;
  const result = await sweepStuckShipments(db, opts.provider ?? sendcloudProvider(), {
    olderThanHours: hours,
    limit: 50,
    effects: { notifyStatus: (orderId, status) => notifyOrderStatus(db, orderId, status) },
  });

  if (result.stillStuck.length > 0) {
    await captureError(new Error(`${result.stillStuck.length} gönderi ${hours} saattir ilerlemiyor`), {
      source: SOURCES.backendCron,
      level: 'warning',
      context: { job: SHIPMENT_WATCH, shipmentIds: result.stillStuck.slice(0, 20), thresholdHours: hours },
    });
  }

  return { checked: result.checked, advanced: result.advanced, unreachable: result.unreachable, stillStuck: result.stillStuck.length };
}
