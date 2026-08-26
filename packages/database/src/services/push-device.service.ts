import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PushDeviceInsertSchema,
  PushDeviceSchema,
  PushDeviceUpdateSchema,
  type PushDevice,
  type PushDeviceInsert,
  type PushDeviceUpdate,
  type PushPlatform,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * **Push cihaz jetonu** (14.14, migration 0050). Servis karar vermez, satır getirir/yazar
 * (STACK §4): "kime gönderilir" sorusu sürücünün (14.16), "izin/devir" kuralı RPC'nin işi.
 */
export class PushDeviceService extends BaseDbService<PushDevice, PushDeviceInsert, PushDeviceUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'push_device', PushDeviceSchema, PushDeviceInsertSchema, PushDeviceUpdateSchema, false);
  }

  /**
   * **Kayıt/tazeleme — sahip devriyle** (`register_push_device`). Çakışmada son giren kazanır:
   * jeton fiziksel cihazı temsil eder ve cihaz şu an son girenin elindedir. "Önce sil sonra yaz"
   * iki deyimdi ve arada düşen süreç jetonu sahipsiz bırakırdı; RPC kısıtın üstünde atomik.
   */
  async register(input: { profileId: string; token: string; platform: PushPlatform; enabled: boolean }): Promise<PushDevice> {
    const rows = await this.executeRpc<unknown[]>('register_push_device', {
      p_profile_id: input.profileId,
      p_token: input.token,
      p_platform: input.platform,
      p_enabled: input.enabled,
    });
    const row = this.parseRows(rows ?? [])[0];
    if (!row) throw new Error('register_push_device boş döndü');
    return row;
  }

  /**
   * **Sahiplik süzgeçli silme** (çıkış ucu) — jeton VE sahip birlikte eşleşmezse hiçbir şey
   * silinmez. Süzgeç pazarlık konusu değil: cihaz bu arada başka hesaba devrolduysa, eski sahibin
   * gecikmiş çıkış isteği YENİ sahbin kaydını söküp onu sağır bırakırdı.
   */
  async removeOwned(token: string, profileId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('push_device')
      .delete()
      .eq('token', token)
      .eq('profile_id', profileId)
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Jetonuyla tek kayıt — izin/bakım teşhisi (test dahil): "kayıt duruyor mu, kim tutuyor". */
  findByToken(token: string): Promise<PushDevice | null> {
    return this.getOneBy({ token });
  }

  /**
   * Kişinin GÖNDERİLEBİLİR cihazları — izni kapalı olanlar dışarıda (sürücünün tek okuması).
   * İzni kapalı cihaza "gönderdim" demek sessiz kara deliktir: Expo kabul eder, kimse görmez.
   */
  listSendable(profileId: string): Promise<PushDevice[]> {
    return this.getAll({ profileId }, { isNullFields: ['disabled_at'], orderBy: 'lastSeenAt', orderDirection: 'desc' });
  }
}
