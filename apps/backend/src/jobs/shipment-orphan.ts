import { serviceDb } from '@lezzet/database';
import { scanOrphanShipments, sendcloudProvider, shippingProviderConfigured } from '@lezzet/application';
import { captureError, SOURCES } from '@lezzet/observability';
import type { ShippingRateProvider } from '@lezzet/application';

export const SHIPMENT_ORPHAN = 'shipment_orphan';

/**
 * ÖKSÜZ / HAYALET GÖNDERİ TARAMASI (07.12) — **yalnız TESPİT, düzeltme YOK.**
 *
 * İki yönlü arıza aranıyor:
 * - **öksüz**: sağlayıcıda gönderi var, bizde satırı yok. Koli açıldı, para ödendi, kayıt
 *   yazılamadı — referans projenin runbook'unun sebebi tam olarak buydu.
 * - **hayalet**: bizde duyurulmuş görünüyor, sağlayıcıda yok. Ters yön; takip numarası müşteriye
 *   verilmiş ama karşılığı olmayabilir.
 *
 * **Düzeltme bilerek elle** (`docs/runbook/kargo-oksuz-gonderi.md`): gerçek para söz konusu ve
 * otomatik iptal riskli — yolda olan bir koliyi iptal etmek, teslim edilecek malı yolundan
 * çevirmek demektir. Cron'un işi insanı masaya çağırmak.
 *
 * **Haftada bir:** aranan şey nadir ve pahalı bir arıza; günlük tarama aynı listeyi yedi kez okur,
 * hiçbir şey bulmaz ve oran sınırını yerdi. Pencere (8 gün) turdan bir gün GENİŞ — tam bir haftaya
 * ayarlansaydı, gecikmiş bir tur o günün gönderilerini hiç görmeden geçerdi.
 */

/**
 * **Sağlayıcı ENJEKTE EDİLEBİLİR — tek sebebi TESTİN AĞA ÇIKMAMASI** (`sweepPushReceipts`ın
 * `fetcher` parametresiyle aynı desen ve aynı gerekçe). Üretimde parametre geçilmez; varsayılanı
 * env'den kurulan gerçek sağlayıcıdır.
 */
export async function shipmentOrphanJob(opts: { provider?: ShippingRateProvider } = {}): Promise<Record<string, unknown>> {
  if (!shippingProviderConfigured()) return { skipped: 'not_configured' };

  const result = await scanOrphanShipments(serviceDb(), opts.provider ?? sendcloudProvider(), { sinceDays: 8 });

  if (result.orphans.length > 0 || result.ghosts.length > 0) {
    await captureError(new Error(`kargo mutabakatı: ${result.orphans.length} öksüz, ${result.ghosts.length} hayalet gönderi`), {
      source: SOURCES.backendCron,
      level: 'warning',
      // Kimlik yazılır, içerik yazılmaz. Öksüzler SAĞLAYICININ kimliğiyle (bizde satırı yok,
      // başka kimliği de yok), hayaletler BİZİM kimliğimizle.
      context: { job: SHIPMENT_ORPHAN, orphans: result.orphans.slice(0, 20), ghosts: result.ghosts.slice(0, 20), truncated: result.truncated },
    });
  }

  /*
    SESSİZ KESME YOK (CLAUDE §1): sağlayıcı listesi sonuna kadar taranamadıysa sayılar EKSİKTİR ve
    "öksüz yok" diye okunmamalıdır. Ayrı bir uyarı, çünkü bu bir bulgu değil bir KÖRLÜK — bulguyla
    aynı satıra yazılsaydı "0 öksüz" cevabıyla karışırdı.
  */
  if (result.truncated) {
    await captureError(new Error('kargo mutabakatı: sağlayıcı listesi sonuna kadar taranamadı — sayılar eksik'), {
      source: SOURCES.backendCron,
      level: 'warning',
      context: { job: SHIPMENT_ORPHAN, scanned: result.remote },
    });
  }

  return { remote: result.remote, orphans: result.orphans.length, ghosts: result.ghosts.length, truncated: result.truncated };
}
