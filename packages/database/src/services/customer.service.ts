import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmail, normalizePhone } from '@lezzet/helper';
import {
  CustomerInsertSchema,
  CustomerSchema,
  CustomerUpdateSchema,
  type Customer,
  type CustomerInsert,
  type CustomerUpdate,
  type FindOrCreateInput,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

export interface FindOrCreateResult {
  customer: Customer;
  /** Yeni taslak müşteri açıldıysa true; mevcut müşteriye bağlandıysa false. */
  created: boolean;
  /** Telefon ve e-posta FARKLI müşterilere düşüyorsa, e-posta eşleşen id (birleştirme adayı). */
  conflictWithId?: string;
}

/**
 * Müşteri erişimi. Kimlik anahtarları telefon/e-posta (DOMAIN §10); silme kapalı.
 * Tüm erişim BaseDbService metodları üzerinden (ham supabase sorgusu yok).
 */
export class CustomerService extends BaseDbService<Customer, CustomerInsert, CustomerUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'customer', CustomerSchema, CustomerInsertSchema, CustomerUpdateSchema, false);
  }

  findByPhone(phone: string): Promise<Customer | null> {
    return this.getOneBy({ phone });
  }

  findByEmail(email: string): Promise<Customer | null> {
    return this.getOneBy({ email });
  }

  findByAuthUserId(authUserId: string): Promise<Customer | null> {
    return this.getOneBy({ authUserId });
  }

  /**
   * Kimlik anahtarıyla müşteriyi bulur; yoksa TASLAK müşteri açar (DOMAIN §10).
   * Telefon/e-posta normalize edilir; ikisi farklı müşterilere düşerse telefon birincildir
   * ve `conflictWithId` ile birleştirme adayı işaretlenir (birleştirme RPC'si sonraki modülde).
   * WhatsApp/web/manuel girişlerin tümünün kullandığı tek kapı.
   */
  async findOrCreate(input: FindOrCreateInput): Promise<FindOrCreateResult> {
    const country = input.country ?? 'FR';
    const phone = input.phone ? normalizePhone(input.phone, country) : null;
    const email = input.email ? normalizeEmail(input.email) : null;

    const phoneMatch = phone ? await this.findByPhone(phone) : null;
    const emailMatch = email ? await this.findByEmail(email) : null;

    if (phoneMatch && emailMatch && phoneMatch.id !== emailMatch.id) {
      return { customer: phoneMatch, created: false, conflictWithId: emailMatch.id };
    }
    const matched = phoneMatch ?? emailMatch;
    if (matched) return { customer: matched, created: false };

    const customer = await this.insert({
      type: input.type ?? 'individual',
      name: input.name ?? '',
      email,
      phone,
      preferredLanguage: input.preferredLanguage ?? 'fr',
      country,
      isDraft: true,
    });
    return { customer, created: true };
  }

  /** Auth kullanıcısını mevcut müşteriye bağlar (giriş doğrulandığında); taslağı kapatır. */
  linkAuthUser(customerId: string, authUserId: string): Promise<Customer> {
    return this.update({ id: customerId, authUserId, isDraft: false });
  }
}
