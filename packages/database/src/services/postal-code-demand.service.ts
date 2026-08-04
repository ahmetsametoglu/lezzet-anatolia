import type { SupabaseClient } from '@supabase/supabase-js';
import { PostalCodeDemandSchema, type PostalCodeDemand } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Bölge dışı talep sayacı okuması (19.21) — *"hangi kodlar bizi arıyor."*
 *
 * **Yazma buradan GEÇMEZ:** sayacı `record_postal_code_demand` RPC'si artırıyor
 * (`DeliveryZoneService.recordDemand`) ve öyle kalmalı — okuyup-yazan iki adımlı bir güncelleme
 * eşzamanlı iki istekte birini kaybeder. Bu servis yalnız okur; `allowDelete` de kapalı, çünkü
 * sayacın silinmesi diye bir iş yok.
 *
 * **Neden ayrı servis:** kendi tablosu var ve `delivery_zone`'un bir parçası değil — bölge
 * operatörün kurduğu bir tanım, bu ise ziyaretçilerin bıraktığı bir iz. İkisini tek servise
 * toplamak, tanım ile ölçümü aynı sözleşmede yaşatmak olurdu.
 */
export class PostalCodeDemandService extends BaseDbService<PostalCodeDemand, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'postal_code_demand', PostalCodeDemandSchema, PostalCodeDemandSchema as never, PostalCodeDemandSchema as never, false);
  }

  /**
   * En çok sorulan kodlar — **doğal tavanlı bir liderlik tablosu**, sayfalanmıyor.
   *
   * `CLAUDE §1`'in sayfalama ölçütü "liste olmak" değil "sınırsız büyümek": bu okuma tablonun
   * tamamını değil, kararın gerektirdiği kadarını istiyor ("burayı açmalı mıyım"). Kuyruğun
   * tamamını görmek gerekirse sınır büyütülür — sessiz kırpma yok, sınır çağrı yerinde yazılı.
   */
  listTop(limit = 50): Promise<PostalCodeDemand[]> {
    return this.getAll({}, { orderBy: 'requestCount', orderDirection: 'desc', limit });
  }
}
