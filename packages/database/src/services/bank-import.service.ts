import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BankImportProfileSchema,
  BankImportProfileInsertSchema,
  BankImportProfileUpdateSchema,
  BankImportSchema,
  BankImportInsertSchema,
  BankImportUpdateSchema,
  type BankImport,
  type BankImportInsert,
  type BankImportProfile,
  type BankImportProfileInsert,
  type BankImportProfileUpdate,
  type BankImportUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Banka import şablonu (12.4) — **hesaba özel**: her bankanın dosya düzeni farklıdır. Bir kez
 * çıkarılır (yapay zekâ ya da elle), sonraki dosyalarda otomatik uygulanır; her ay aynı soruyu
 * sormak memurluktur.
 */
export class BankImportProfileService extends BaseDbService<BankImportProfile, BankImportProfileInsert, BankImportProfileUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'bank_import_profile', BankImportProfileSchema, BankImportProfileInsertSchema, BankImportProfileUpdateSchema);
  }

  /** Hesabın şablonları — en yeni önce. Doğal tavanı var (banka başına birkaç), sayfalanmaz. */
  listByAccount(accountId: string): Promise<BankImportProfile[]> {
    return this.getAll({ accountId }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /** Hesabın en son kullanılan şablonu — ikinci import "aynı bankada otomatik uygulanır" demek. */
  async latestFor(accountId: string): Promise<BankImportProfile | null> {
    return (await this.listByAccount(accountId))[0] ?? null;
  }
}

/**
 * Yükleme kaydı (12.4) — "bu satır nereden geldi". Denetlenemeyen import korkutucudur: yanlış dosya
 * yüklendiğinde neyin geri alınacağı bilinmelidir.
 */
export class BankImportService extends BaseDbService<BankImport, BankImportInsert, BankImportUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'bank_import', BankImportSchema, BankImportInsertSchema, BankImportUpdateSchema);
  }

  /** Hesabın yükleme geçmişi — en yeni önce. */
  listByAccount(accountId: string, limit = 20): Promise<BankImport[]> {
    return this.getAll({ accountId }, { orderBy: 'createdAt', orderDirection: 'desc', limit });
  }
}
