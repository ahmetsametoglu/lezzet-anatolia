import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ZoneNoticeInsertSchema,
  ZoneNoticeSchema,
  ZoneNoticeUpdateSchema,
  type ZoneNotice,
  type ZoneNoticeInsert,
  type ZoneNoticeUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Bölge haberi (`zone_notice`, 0030) — *"bölgenize henüz gelmiyoruz, açılınca haber verelim."*
 *
 * `variant_stock_notice` ile karıştırılmaz: o "geliyoruz ama bu ürün burada yok" der, bu "hiç
 * gelmiyoruz" der.
 *
 * ── NEDEN SERVİS (denetim A4) ────────────────────────────────────────────────
 * Tablo üç app dosyasından HAM okunuyordu ve okuma tarafının künyesi *"kendi servisi yok ve
 * gerekmiyor — üzerinde iş kuralı taşımıyor"* diyordu. Gerekçe eksikti: mesele iş kuralı değil,
 * **sözleşme**. Ham erişim ad dönüşümünü ve doğrulamayı her çağrının kendi sorumluluğuna
 * bırakıyordu — okuma `row.postal_code as string` diye elle çeviriyordu, yani kolon adı değişse
 * derleyici değil çalışma zamanı haber verirdi. `STACK §6`'nın kapattığı sınıf tam bu.
 *
 * **Silme AÇIK** (`allowDelete`): müşteri bekleme kaydını hesabından kaldırabiliyor. Bu, verdiğimiz
 * sözü geri alması demek; yumuşak silme tutmanın bir faydası yok.
 */
export class ZoneNoticeService extends BaseDbService<ZoneNotice, ZoneNoticeInsert, ZoneNoticeUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'zone_notice', ZoneNoticeSchema, ZoneNoticeInsertSchema, ZoneNoticeUpdateSchema);
  }

  /**
   * Kaydı bırakır — **aynı bekleyiş ikinci kez yazılmaz.**
   *
   * Düğmeye ikinci kez basmak yeni bir bekleyiş değil, aynı bekleyişin tekrarıdır. Tekillik veride
   * de var (`zone_notice_unique_idx` — `(postal_code, lower(email))`); burada çakışmayı hata
   * saymamak, kullanıcıya sebepsiz bir uyarı göstermemek için.
   *
   * `insertIgnoringConflict` "önce sorgula, yoksa yaz" DEĞİL: iki eşzamanlı tıklama aynı anda
   * sorgularsa ikisi de "yok" görür ve ikisi de yazar. Karar veritabanında kalır.
   */
  async record(input: ZoneNoticeInsert): Promise<ZoneNotice | null> {
    return this.insertIgnoringConflict(input);
  }

  /**
   * Müşterinin beklediği bölgeler — hesap sayfasının listesi, en eski önce.
   *
   * Ziyaretçi kaydı da olabilir (`customerId` null) ama burada YALNIZ müşteriye bağlı olanlar
   * okunur; kimlik oturumdan gelir, parametreden değil.
   */
  listForCustomer(customerId: string): Promise<ZoneNotice[]> {
    return this.getAll({ customerId }, { orderBy: 'createdAt' });
  }

  /**
   * Jetonun sahibi kayıt (22.08) — tercih sayfasının oturumsuz girişi.
   *
   * Bulunamayan jeton bir HATA DEĞİL `null`'dır: bağlantı yanlış kopyalanmış ya da kayıt iptal
   * edilmiş olabilir. Sayfa "geçersiz bağ" der; hangi ihtimalin doğru olduğunu SÖYLEMEZ, çünkü
   * ikisini ayırt etmek "bu adres bizde kayıtlı" bilgisini sızdırırdı.
   */
  findByToken(token: string): Promise<ZoneNotice | null> {
    const temiz = token.trim();
    if (!temiz) return Promise.resolve(null);
    return this.getOneBy({ token: temiz });
  }

  /**
   * Aynı e-postaya bağlı, haberi HENÜZ GİTMEMİŞ kayıtlar — tercih sayfasının listesi.
   *
   * Kimlikle değil E-POSTAYLA aranıyor ve bu bilinçli: bu tablonun kaydı hesapsız olabilir, yani
   * `customerId` çoğu ziyaretçi satırında yok. Jetonun taşıdığı kimlik de zaten bir e-postadır.
   *
   * **Haberi gitmiş kayıtlar dışarıda:** onların sözü tamamlandı, iptal edilecek bir bekleyiş
   * kalmadı. Listede göstermek, müşteriye kapatabileceği bir şey varmış gibi okuturdu.
   */
  listPendingForEmail(email: string): Promise<ZoneNotice[]> {
    const temiz = email.trim().toLowerCase();
    if (!temiz) return Promise.resolve([]);
    return this.getAll({ email: temiz }, { isNullFields: ['notifiedAt'], orderBy: 'createdAt' });
  }

  /**
   * Bir e-postaya bağlı bekleyişlerin TAMAMINI kaldırır — ziyaretçinin "artık haber vermeyin"i.
   *
   * Haberi gitmiş satırlara dokunulmaz: onlar bir bekleyiş değil, olmuş bir olayın kaydıdır ve
   * silinseydi "bu kişiye haber verildi mi" sorusunun cevabı kaybolurdu.
   */
  async removeAllPendingForEmail(email: string): Promise<void> {
    const temiz = email.trim().toLowerCase();
    if (!temiz) return;
    await this.deleteWhere({ email: temiz }, { isNullFields: ['notifiedAt'] });
  }

  /**
   * Müşteri bekleme kaydını kaldırır — verdiğimiz sözü geri alması.
   *
   * Ülke ARANMAZ ve bu bilinçli: aynı müşterinin aynı kodu iki ülkede birden beklemesi gerçek bir
   * hâl değil (kendi adresi tek ülkede). Ülkeyi de şart koşmak, hesap ekranındaki "vazgeç"
   * düğmesine ekranın taşımadığı bir bilgiyi taşıtmak olurdu.
   */
  async removeForCustomer(customerId: string, postalCode: string): Promise<void> {
    await this.deleteWhere({ customerId, postalCode });
  }

  /**
   * **Haberi henüz gitmemiş** bekleyişler (19.21 · 14.x) — en eski önce.
   *
   * `notified_at is null` idempotentliğin dayanağıdır: gönderim damgayı yazar, ikinci tur aynı
   * kişiyi hiç görmez. Damga olmasaydı "kime gitti" sorusunun cevabı kalmaz ve bölge iki kez
   * kaydedildiğinde (ya da bir kod bölgeden çıkıp geri girdiğinde) aynı müşteri iki mail alırdı.
   */
  listPending(limit = 200): Promise<ZoneNotice[]> {
    return this.getAll({}, { isNullFields: ['notifiedAt'], orderBy: 'createdAt', limit });
  }

  /**
   * Haber gönderildi damgası. **Toplu**, çünkü bir bölge açılınca onlarca kişiye birden gider ve
   * satır satır damgalamak turu kişi sayısıyla çarpardı.
   *
   * Kolon adı elle yazılmıyor: taban `notifiedAt` → `notified_at` çevrimini kendisi yapıyor (K4-2).
   * Ham sürümde kolon yeniden adlandırılsa hata **çalışma zamanında** çıkardı ve bu yol bir cron
   * işinin içinde — yani kullanıcının önüne değil, log'a düşerdi.
   */
  async markNotified(ids: readonly string[], at: string): Promise<void> {
    await this.updateWhereIn('id', ids, { notifiedAt: at });
  }

  /**
   * Posta kodu başına BEKLEYEN sayısı — Depolar ekranının ikinci sütunu (19.21).
   *
   * **Anahtar kod, ülke değil** (21.16 sonrası da böyle): ekran kodu gösteriyor ve teslimat
   * bölgemiz Fransa merkezli — aynı kodun iki ülkeye çözüldüğü 610 vakada sayılar burada
   * birleşir. Ayrım gerektiğinde satırın kendisinde duruyor (`country`); bu okuma bir karar
   * girdisi değil, bir yoğunluk göstergesi.
   *
   * Uygulamada sayılıyor, `group by` ile değil: PostgREST'te toplama fonksiyonları bu kurulumda
   * KAPALI ("Use of aggregate functions is not allowed" — aynı sapma katalog sayımında da yazılı).
   * Küme sınırlı (bekleyen kişi sayısı), yani tek turda okunup bellekte sayılması güvenli.
   */
  async pendingCountByPostalCode(): Promise<Map<string, number>> {
    const rows = await this.getAll({}, { isNullFields: ['notifiedAt'] });
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.postalCode, (counts.get(row.postalCode) ?? 0) + 1);
    return counts;
  }
}
