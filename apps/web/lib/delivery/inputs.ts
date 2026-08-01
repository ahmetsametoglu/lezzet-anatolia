import 'server-only';
import { cache } from 'react';
import { DeliveryZoneService, WarehouseService, serviceDb } from '@lezzet/database';

/**
 * Yer çözümünün girdileri — aktif bölgeler + aktif depolar (19.9).
 *
 * **Tek kaynak:** aynı iki listeyi `resolveDelivery` (checkout) ve `readPlaceContext` (vitrin) ayrı
 * ayrı okuyordu. İki okuma iki farklı ana ait olabilirdi ve o hâlde aynı istekte sepet bir depoyu,
 * katalog başka bir depoyu görürdü. Burada birleştiler.
 *
 * ── NEDEN `cache()` (istek kapsamı), `unstable_cache` (kalıcı) DEĞİL ─────────
 * Amaç TUTARLILIK, hız değil: aynı istekte yer bir kez çözülsün ve her okuma aynı depoyu görsün.
 * Kalıcı önbellek bunu da verirdi ama Next'in istek bağlamına bağlı — `resolveDelivery` doğrudan
 * test ediliyor ve orada "incrementalCache missing" ile patlıyordu. Test edilebilirliği bir
 * mikro-optimizasyona feda etmiyoruz: iki küçük liste sorgusu, sayfanın zaten attığı onlarca
 * sorgunun yanında ölçülemez.
 */
export const readDeliveryInputs = cache(async () => {
  const db = serviceDb();
  const [zones, warehouses] = await Promise.all([
    // Bölgeler AKTİFLİK SÜZGECİSİZ (19.16a): pasif bölgedeki kod da bizim kaydımızdır ve ülkesi
    // ondan türer — süzersek kapalı bölgedeki müşteri "bu kodu tanımadık" cevabı alır, oysa doğru
    // cevap "rota kapalı, kargoyla gönderiyoruz". Rotanın açık olup olmadığına MOTOR karar verir
    // (`matchZones` pasifleri zaten eliyor); okuma o kararı önden vermemeli.
    new DeliveryZoneService(db).listWithCodes(),
    new WarehouseService(db).list({ activeOnly: true }),
  ]);
  return { zones, warehouses };
});
