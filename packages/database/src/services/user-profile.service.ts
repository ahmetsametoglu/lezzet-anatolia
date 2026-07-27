import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmail } from '@lezzet/helper';
import {
  UserProfileInsertSchema,
  UserProfileSchema,
  UserProfileUpdateSchema,
  DEFAULT_PAGE_SIZE,
  type KeysetCursor,
  type Page,
  type UserProfile,
  type UserProfileInsert,
  type UserProfileUpdate,
  type UserRole,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Kullanıcı profili erişimi (kimlik) — TEK tablo `user_profiles`; müşteri + personel, ROL ayırır.
 * "customer" bir ROLDÜR, ayrı tablo değil. Kimlik anahtarları telefon/e-posta (DOMAIN §10);
 * silme kapalı.
 *
 * **Karar vermez, satır getirir/yazar** (STACK §4). "Bu kişi kim, bağlanmalı mı yeni mi açılmalı,
 * iki anahtar farklı profillere düşerse ne olur" kararı saf motordadır
 * (`domain-core/identity.resolveIdentity`); ikisini birleştiren kapı uygulama katmanındadır
 * (`apps/web/lib/identity`). Kural daha önce bu servisin içindeydi ("telefon birincildir") —
 * motora taşındı.
 */
export class UserProfileService extends BaseDbService<UserProfile, UserProfileInsert, UserProfileUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'user_profiles', UserProfileSchema, UserProfileInsertSchema, UserProfileUpdateSchema, false);
  }

  /** Telefonla arar — anahtar E.164 NORMALİZE gelmeli (normalize eden motordur). */
  findByPhone(phone: string): Promise<UserProfile | null> {
    return this.getOneBy({ phone });
  }

  /** E-postayla arar — küçük harfe indirgenmiş gelmeli (DB indeksi de öyle). */
  findByEmail(email: string): Promise<UserProfile | null> {
    return this.getOneBy({ email: normalizeEmail(email) });
  }

  findByAuthUserId(authUserId: string): Promise<UserProfile | null> {
    return this.getOneBy({ authUserId });
  }

  /**
   * Kimlik çözümünün DB yarısı: iki anahtar TEK turda aranır. Motor bu iki adaya bakıp
   * bağlan/oluştur/çakışma kararını verir — servis hangisinin kazandığını bilmez.
   */
  async findIdentityCandidates(phone?: string | null, email?: string | null): Promise<{ byPhone: string | null; byEmail: string | null; byAuthUser?: string | null }> {
    const [byPhone, byEmail] = await Promise.all([
      phone ? this.findByPhone(phone) : Promise.resolve(null),
      email ? this.findByEmail(email) : Promise.resolve(null),
    ]);
    return { byPhone: byPhone?.id ?? null, byEmail: byEmail?.id ?? null };
  }

  /** Profil listesi (admin) — en yeni önce, sonsuz kaydırma. */
  async list(opts: { isDraft?: boolean; b2bPending?: boolean; cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<UserProfile>> {
    const filters: Record<string, unknown> = {};
    if (opts.isDraft !== undefined) filters.isDraft = opts.isDraft;
    if (opts.b2bPending) filters.b2bApproved = false;

    return this.getPage(filters, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
    });
  }

  /**
   * B2B başvurusunu onaylar/reddeder (DOMAIN §10). Onaya kadar toptan fiyat görünmez; reddedilen
   * kayıt B2C olarak kalır — silinmez.
   */
  setB2bApproval(profileId: string, approved: boolean): Promise<UserProfile> {
    return this.update({ id: profileId, b2bApproved: approved });
  }

  /** Auth kullanıcısını mevcut profile bağlar (giriş doğrulandığında); taslağı kapatır. */
  linkAuthUser(profileId: string, authUserId: string): Promise<UserProfile> {
    return this.update({ id: profileId, authUserId, isDraft: false });
  }

  // ── Roller (dizi; kural DB kısıtında + motorda — bkz. domain-core/identity/roles) ──────────────

  /** Auth kullanıcısının rol kümesi (profil yoksa boş). */
  async getRoles(authUserId: string): Promise<UserRole[]> {
    const profile = await this.findByAuthUserId(authUserId);
    return profile?.roles ?? [];
  }

  /** Personel mi (operasyon rollerinden en az biri) — Operasyon yüzeyi giriş kapısı. */
  async isStaff(authUserId: string): Promise<boolean> {
    return (await this.getRoles(authUserId)).some((r) => r !== 'customer');
  }

  async hasRole(authUserId: string, role: UserRole): Promise<boolean> {
    return (await this.getRoles(authUserId)).includes(role);
  }

  /**
   * Rol kümesini yazar. **Kümenin geçerliliğini SERVİS denetlemez** (STACK §4) — kuralı motor
   * bilir (`validateRoleSet`), son emniyet DB kısıtındadır: geçersiz küme yazılamaz, yazılmaya
   * çalışılırsa hata döner.
   */
  setRoles(profileId: string, roles: UserRole[]): Promise<UserProfile> {
    return this.update({ id: profileId, roles });
  }

  /** Bir role sahip tüm profiller (personel listesi, kurye ataması) — dizi araması GIN indeksli. */
  async listByRole(role: UserRole): Promise<UserProfile[]> {
    const { data, error } = await this.supabase.from('user_profiles').select('*').contains('roles', [role]);
    if (error) throw error;
    return this.parseRows(data ?? []);
  }
}
