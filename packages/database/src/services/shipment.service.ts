import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ShipmentEventInsertSchema,
  ShipmentEventSchema,
  ShipmentEventUpdateSchema,
  ShipmentInsertSchema,
  ShipmentSchema,
  ShipmentUpdateSchema,
  type Shipment,
  type ShipmentEvent,
  type ShipmentEventInsert,
  type ShipmentEventUpdate,
  type ShipmentInsert,
  type ShipmentStatus,
  type ShipmentUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Gönderi (`shipment`, 0053) — SAF I/O. Duyuru orkestrasyonu uygulama katmanında. */
export class ShipmentService extends BaseDbService<Shipment, ShipmentInsert, ShipmentUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'shipment', ShipmentSchema, ShipmentInsertSchema, ShipmentUpdateSchema, false);
  }

  /** Siparişin gönderileri, eskiden yeniye — "Koli 1/3" sırası bu sıradan türer. */
  async listByOrder(orderId: string): Promise<Shipment[]> {
    return this.getAll({ orderId }, { orderBy: 'createdAt' });
  }

  /**
   * Sağlayıcı GÖNDERİ kimliğiyle bul — iptal ve durum sorgusu bu anahtarı taşır.
   * Webhook'un anahtarı BAŞKADIR (`OrderBoxService` tarafında `provider_parcel_ref`).
   */
  async findByProviderId(providerShipmentId: string): Promise<Shipment | null> {
    return this.getOneBy({ providerShipmentId });
  }

  async setStatus(id: string, status: ShipmentStatus): Promise<Shipment> {
    return this.update({ id, status });
  }

  /**
   * Belirli bir tarihten SONRA açılmış gönderiler — öksüz nöbetinin bizim taraftaki okuması.
   * Pencere sağlayıcı sorgusuyla AYNI olmalı; farklı olsaydı iki listenin farkı "öksüz" değil
   * "pencere kayması" olurdu.
   */
  async listSince(since: Date, limit = 1000): Promise<Shipment[]> {
    return this.getAll({}, { rangeFilters: [{ field: 'createdAt', operator: 'gte', value: since.toISOString() }], orderBy: 'createdAt', limit });
  }

  /**
   * Belirli bir andan sonra AÇILMIŞ gönderiler — öksüz/hayalet taramasının bizim tarafı.
   *
   * Süzgeç `created_at` üzerinden ve sağlayıcı listesi `announced_after` ile aynı pencereyi
   * okuyor: iki taraf farklı pencerelere baksaydı fark, arıza değil pencere kayması olurdu.
   */
  async listAnnouncedSince(since: string): Promise<Shipment[]> {
    return this.getAll({}, { rangeFilters: [{ field: 'createdAt', operator: 'gte', value: since }], orderBy: 'createdAt' });
  }

  /**
   * **TAKILI GÖNDERİLER** — terminal olmayan ve N saatten eski. Webhook kaçtığında ya da geç
   * geldiğinde tek emniyet kemeri budur (nöbet cron'u bunları REST'ten yeniden sorar).
   *
   * `error` terminal SAYILMAZ ve bu bilinçli: düzelme ihtimali var, nöbetin gözünden düşmemeli.
   */
  async listStuck(olderThanHours: number, limit = 100): Promise<Shipment[]> {
    const before = new Date(Date.now() - olderThanHours * 3_600_000).toISOString();
    return this.getAll(
      { status: ['created', 'handed_over', 'in_transit', 'out_for_delivery', 'error'] },
      { rangeFilters: [{ field: 'createdAt', operator: 'lt', value: before }], orderBy: 'createdAt', limit },
    );
  }
}

/**
 * Taşıyıcı olay defteri (`shipment_event`) — **append-only**.
 *
 * Güncelleme kapısı YOK ve bilinçli: olay olmuş bir şeydir, düzeltilmez. Referans projenin
 * `raw_payload`ı tek kolonda tutup her webhook'ta ezmesi tam bu yüzden sorun oluyordu — geçmiş
 * kayboluyordu.
 */
export class ShipmentEventService extends BaseDbService<ShipmentEvent, ShipmentEventInsert, ShipmentEventUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'shipment_event', ShipmentEventSchema, ShipmentEventInsertSchema, ShipmentEventUpdateSchema, false);
  }

  /** Gönderinin zaman çizgisi — yeniden eskiye (müşteri ekranı en son olayı üstte gösterir). */
  async listByShipment(shipmentId: string): Promise<ShipmentEvent[]> {
    return this.getAll({ shipmentId }, { orderBy: 'occurredAt', orderDirection: 'desc' });
  }

  /*
    ⚠ `countUnmapped` SİLİNDİ (28.08) — çağıranı hiç doğmadan daha iyisi bulundu.

    Tasarım `/operations/system`de "N tanınmayan kod" sayacı öngörüyordu; yazarken görüldü ki sayaç
    kaç tane olduğunu söyler, operatörün ihtiyacı ise HANGİ kod olduğudur — eşleme tablosuna
    yazılacak şey odur. Uzlaştırma artık her tanınmayan kod için `error_log`'a **warning** düşüyor
    (`sync-status.ts`): parmak izine göre gruplanır, sayılır ve çözülmemiş kayıt SÜRESİZ durur.
    Bir sayaç ise pencere geçince sıfıra dönerdi.

    Tanınmayan kodların TAMAMINI dökmek gerekirse (geçmişi yeniden okuma turu) `shipment_event`
    `recognized = false` ile sorgulanır — kısmi indeks o okuma için duruyor.
  */
}
