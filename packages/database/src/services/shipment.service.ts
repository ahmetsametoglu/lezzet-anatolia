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

  /**
   * **Tanınmayan kod sayısı** — operasyon sistem ekranının okuduğu sayı ve eşleme tablosunun
   * büyüme sinyali. Sıfırdan büyükse `mapCarrierStatus` eksik demektir.
   */
  async countUnmapped(): Promise<number> {
    const { count, error } = await this.supabase
      .from('shipment_event')
      .select('id', { count: 'exact', head: true })
      .is('mapped_status', null);
    if (error) throw error;
    return count ?? 0;
  }
}
