import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmail, normalizePhone } from '@lezzet/helper';
import {
  UserProfileInsertSchema,
  UserProfileSchema,
  UserProfileUpdateSchema,
  type FindOrCreateInput,
  type UserProfile,
  type UserProfileInsert,
  type UserProfileUpdate,
  type UserRole,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

export interface FindOrCreateResult {
  profile: UserProfile;
  /** Yeni taslak profil açıldıysa true; mevcut profile bağlandıysa false. */
  created: boolean;
  /** Telefon ve e-posta FARKLI profillere düşüyorsa, e-posta eşleşen id (birleştirme adayı). */
  conflictWithId?: string;
}

/**
 * Kullanıcı profili erişimi (kimlik) — TEK tablo `user_profiles`; müşteri + personel, ROL ayırır.
 * Kimlik anahtarları telefon/e-posta (DOMAIN §10); silme kapalı. Tüm erişim BaseDbService üzerinden
 * (ham supabase sorgusu yok). Personel rolleri artık ayrı tabloda değil — `role` alanında (getRole/isStaff).
 */
export class UserProfileService extends BaseDbService<UserProfile, UserProfileInsert, UserProfileUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'user_profiles', UserProfileSchema, UserProfileInsertSchema, UserProfileUpdateSchema, false);
  }

  findByPhone(phone: string): Promise<UserProfile | null> {
    return this.getOneBy({ phone });
  }

  findByEmail(email: string): Promise<UserProfile | null> {
    return this.getOneBy({ email });
  }

  findByAuthUserId(authUserId: string): Promise<UserProfile | null> {
    return this.getOneBy({ authUserId });
  }

  /**
   * Kimlik anahtarıyla profili bulur; yoksa TASLAK müşteri açar (DOMAIN §10). Telefon/e-posta normalize
   * edilir; ikisi farklı profillere düşerse telefon birincildir ve `conflictWithId` ile birleştirme
   * adayı işaretlenir. WhatsApp/web/manuel girişlerin tümünün kullandığı tek kapı. Rol varsayılan customer.
   */
  async findOrCreate(input: FindOrCreateInput): Promise<FindOrCreateResult> {
    const country = input.country ?? 'FR';
    const phone = input.phone ? normalizePhone(input.phone, country) : null;
    const email = input.email ? normalizeEmail(input.email) : null;

    const phoneMatch = phone ? await this.findByPhone(phone) : null;
    const emailMatch = email ? await this.findByEmail(email) : null;

    if (phoneMatch && emailMatch && phoneMatch.id !== emailMatch.id) {
      return { profile: phoneMatch, created: false, conflictWithId: emailMatch.id };
    }
    const matched = phoneMatch ?? emailMatch;
    if (matched) return { profile: matched, created: false };

    const profile = await this.insert({
      type: input.type ?? 'individual',
      name: input.name ?? '',
      email,
      phone,
      preferredLanguage: input.preferredLanguage ?? 'fr',
      country,
      isDraft: true,
    });
    return { profile, created: true };
  }

  /** Auth kullanıcısını mevcut profile bağlar (giriş doğrulandığında); taslağı kapatır. */
  linkAuthUser(profileId: string, authUserId: string): Promise<UserProfile> {
    return this.update({ id: profileId, authUserId, isDraft: false });
  }

  // ── Rol (staff_role tablosu yerine `role` alanı; çok-rol yok) ──────────────────────────────────

  /** Auth kullanıcısının rolü (profil yoksa null). */
  async getRole(authUserId: string): Promise<UserRole | null> {
    const profile = await this.findByAuthUserId(authUserId);
    return profile?.role ?? null;
  }

  /** Personel mi (customer dışı herhangi bir rol) — Operasyon yüzeyi giriş kapısı. */
  async isStaff(authUserId: string): Promise<boolean> {
    const role = await this.getRole(authUserId);
    return role !== null && role !== 'customer';
  }

  async hasRole(authUserId: string, role: UserRole): Promise<boolean> {
    return (await this.getRole(authUserId)) === role;
  }

  /** Rolü ayarlar (dev/admin işlemi; ekranı modül 09). */
  setRole(profileId: string, role: UserRole): Promise<UserProfile> {
    return this.update({ id: profileId, role });
  }
}
