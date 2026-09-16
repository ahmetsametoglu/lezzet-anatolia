import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OauthCodeSchema,
  OauthCodeInsertSchema,
  OauthCodeUpdateSchema,
  type OauthCode,
  type OauthCodeInsert,
  type OauthCodeUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Tek kullanımlık yetkilendirme kodları. Geçerlilik kararı (süre, kullanılmışlık) çağıranda. */
export class OauthCodeService extends BaseDbService<OauthCode, OauthCodeInsert, OauthCodeUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'oauth_code', OauthCodeSchema, OauthCodeInsertSchema, OauthCodeUpdateSchema);
  }

  async findByCodeHash(codeHash: string): Promise<OauthCode | null> {
    return this.getOneBy({ codeHash });
  }

  /** Tüketim: ilk damga korunur, ikinci çağrı `null` döner — yarış hâlinde kod bir kez geçer. */
  async markUsed(id: string): Promise<OauthCode | null> {
    return this.updateIfNull(id, 'usedAt', { usedAt: new Date().toISOString() });
  }
}
