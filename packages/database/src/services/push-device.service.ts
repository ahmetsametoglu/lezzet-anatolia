import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PushDeviceInsertSchema,
  PushDeviceSchema,
  PushDeviceUpdateSchema,
  type PushApp,
  type PushDevice,
  type PushDeviceInsert,
  type PushDeviceUpdate,
  type PushPlatform,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Servis karar vermez: "kime gönderilir" sorusu dağıtım kapısının, izin ve devir kuralı RPC'nin işidir. */
export class PushDeviceService extends BaseDbService<PushDevice, PushDeviceInsert, PushDeviceUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'push_device', PushDeviceSchema, PushDeviceInsertSchema, PushDeviceUpdateSchema, false);
  }

  /**
   * Çakışmada sahip devreder (son giren kazanır, cihaz onun elindedir). Önce silip sonra yazmak iki deyimdi ve arada düşen süreç
   * jetonu sahipsiz bırakırdı.
   */
  async register(input: { profileId: string; token: string; platform: PushPlatform; app: PushApp; enabled: boolean }): Promise<PushDevice> {
    const rows = await this.executeRpc<unknown[]>('register_push_device', {
      p_profile_id: input.profileId,
      p_token: input.token,
      p_platform: input.platform,
      p_app: input.app,
      p_enabled: input.enabled,
    });
    const row = this.parseRows(rows ?? [])[0];
    if (!row) throw new Error('register_push_device boş döndü');
    return row;
  }

  /**
   * **Sahiplik süzgeçli silme** (çıkış ucu) — jeton VE sahip birlikte eşleşmezse hiçbir şey
   * silinmez. Süzgeç pazarlık konusu değil: cihaz bu arada başka hesaba devrolduysa, eski sahibin
   * gecikmiş çıkış isteği YENİ sahibin kaydını söküp onu sağır bırakırdı.
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

  /**
   * Sahipsiz silme, çünkü taşıyıcının "cihaz kayıtlı değil" beyanı sahiplikten üstündür. Kullanıcı eylemi değildir; çıkış ucu
   * `removeOwned` kullanır.
   */
  async pruneByToken(token: string): Promise<boolean> {
    const { data, error } = await this.supabase.from('push_device').delete().eq('token', token).select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Jetonuyla tek kayıt — izin/bakım teşhisi (test dahil): "kayıt duruyor mu, kim tutuyor". */
  findByToken(token: string): Promise<PushDevice | null> {
    return this.getOneBy({ token });
  }

  /**
   * İzni kapalı cihaz dışarıda, çünkü Expo onu da kabul eder ve kimse görmez. Uygulama süzgeci müşteri bildiriminin operasyon
   * uygulamasına düşmesini önler.
   */
  listSendable(profileId: string, app: PushApp): Promise<PushDevice[]> {
    return this.getAll({ profileId, app }, { isNullFields: ['disabled_at'], orderBy: 'lastSeenAt', orderDirection: 'desc' });
  }
}
