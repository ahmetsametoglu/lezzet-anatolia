import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmail } from '@lezzet/helper';
import { dbToApp } from '../utils/case-transformers';
import {
  UserProfileInsertSchema,
  UserProfileSchema,
  UserProfileUpdateSchema,
  CustomerMergePreviewSchema,
  DEFAULT_PAGE_SIZE,
  MarketingChannelEnum,
  STAFF_ROLES,
  type CustomerMergePreview,
  type CustomerType,
  type MarketingChannel,
  type KeysetCursor,
  type Page,
  type UserProfile,
  type UserProfileInsert,
  type UserProfileUpdate,
  type UserRole,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { ilikeContains, ilikeTerm } from '../utils/filter-term';

/**
 * Serbest aramanın alanları; liste ve seçici aynı kümeye bakar ki seçicide bulunan listede de bulunsun. Telefon kimlik anahtarıdır.
 */
const PROFILE_SEARCH_FIELDS = ['name', 'phone', 'email'] as const;

/**
 * Hiçbir satırın taşımayacağı kimlik: "eşleşme yok" süzgeci, boş sayfa için ayrı kod yolu açmadan.
 */
const IMPOSSIBLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Müşteri kapsamı: rol kümesinde `customer` olanlar; personel aynı tabloda olduğu için süzgeç şart. `contains`, çünkü
 * personel rolü çoklu olabilir.
 */
const CUSTOMERS_ONLY = { containsFilters: [{ field: 'roles', values: ['customer'] as const }] } as const;

/**
 * Karar verilmiş başvurunun ikinci şartı: `b2b_pending = false` hiç başvurmamış müşteride de doğrudur, bu yüzden künye dolu olmalı.
 */
const B2B_DECIDED = { isNotNullFields: ['companyInfo'] };

/** İzin bayrağının jsonb yolu — `marketing_consent -> <kanal> ->> granted`. */
const consentPath = (channel: MarketingChannel) => `marketing_consent->${channel}->>granted`;

/**
 * Pazarlama izni süzgecini PostgREST parçalarına çevirir — **liste ve sayaç bunu PAYLAŞIR.**
 *
 * Tek kanal düz bir yol eşitliğidir (VE ile bağlanır); `'any'` bir `or` grubudur. İkisinin ayrı
 * çıkması şart: `'any'`ı yol eşitlikleri olarak yazsaydık ikisi VE ile bağlanır ve yalnız HER İKİ
 * kanala birden izin verenler dönerdi — istenenin tersi.
 */
function consentFilter(channel?: MarketingChannel | 'any'): { orFilters: string[]; jsonPathFilters: Array<{ path: string; value: string }> } {
  if (!channel) return { orFilters: [], jsonPathFilters: [] };
  if (channel === 'any') {
    return { orFilters: [MarketingChannelEnum.options.map((c) => `${consentPath(c)}.eq.true`).join(',')], jsonPathFilters: [] };
  }
  return { orFilters: [], jsonPathFilters: [{ path: consentPath(channel), value: 'true' }] };
}

/**
 * Kullanıcı profili erişimi: müşteri ve personel tek tabloda, rolle ayrılır; silme kapalı. Karar vermez, satır getirir ve yazar;
 * kimlik kararı motordadır (`domain-core/identity.resolveIdentity`).
 */
export class UserProfileService extends BaseDbService<UserProfile, UserProfileInsert, UserProfileUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'user_profiles', UserProfileSchema, UserProfileInsertSchema, UserProfileUpdateSchema, false);
  }

  /**
   * Tek para alanı vade tavanıdır; fiyat kuralı yüzdesi `numeric` ama orandır, çevrilmez.
   */
  protected override readonly moneyFields = ['creditLimitCents'];

  /** E-postayla arar — küçük harfe indirgenmiş gelmeli (DB indeksi de öyle). */
  findByEmail(email: string): Promise<UserProfile | null> {
    return this.getOneBy({ email: normalizeEmail(email) });
  }

  findByAuthUserId(authUserId: string): Promise<UserProfile | null> {
    return this.getOneBy({ authUserId });
  }

  /**
   * Davet kodunun sahibi (kod tekildir). Bulunamayan kod `null`dur, çünkü geçersiz kod yüzünden müşteri kayıttan çevrilmez.
   */
  findByReferralCode(code: string): Promise<UserProfile | null> {
    const temiz = code.trim().toUpperCase();
    if (!temiz) return Promise.resolve(null);
    return this.getOneBy({ referralCode: temiz });
  }

  /**
   * Bildirim jetonunun sahibi; davet kodundan farklı olarak büyük harfe çevirmez, çünkü jeton yalnız tıklanır. Yoksa `null`.
   */
  findByNotificationToken(token: string): Promise<UserProfile | null> {
    const temiz = token.trim();
    if (!temiz) return Promise.resolve(null);
    return this.getOneBy({ notificationToken: temiz });
  }

  /**
   * WhatsApp bağlama jetonunun sahibi; süre burada sorulmaz, çünkü süresi geçen jetonu çağıran temizleyebilmeli.
   */
  findByWaLinkToken(token: string): Promise<UserProfile | null> {
    const temiz = token.trim().toUpperCase();
    if (!temiz) return Promise.resolve(null);
    return this.getOneBy({ waLinkToken: temiz });
  }

  /**
   * Verilen kimlikler tek sorguda; FK taşımayan alanlar gömülü `select` ile çözülemez.
   */
  async listByIds(ids: readonly string[]): Promise<UserProfile[]> {
    if (ids.length === 0) return [];
    return this.getAll({ id: [...ids] });
  }

  /**
   * Genel fiyat kuralı tanımlı müşteriler; kural müşteri kaydında yaşar, fiyat ekranı yalnız kimlerde olduğunu izler.
   * Sayfalanmaz, küme admin'in eliyle büyür.
   */
  async listWithPriceRule(): Promise<UserProfile[]> {
    return this.getAll({}, { isNotNullFields: ['price_rule_basis'], orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Fiyat grubu üyesi müşteriler; üyelik profil kaydında yaşar, fiyat ekranı izler. Sayfalanmaz.
   */
  async listWithPriceGroup(): Promise<UserProfile[]> {
    return this.getAll({}, { isNotNullFields: ['price_group_id'], orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Profil listesi, en yeni önce, sonsuz kaydırma; süzme ve arama sunucuda, çünkü müşteri kümesi veriyle büyür.
   * `search()` tavanlı bir seçici aracıdır, ortak olan yalnız süzgeç dizesidir (`ilikeContains`).
   */
  async list(
    opts: {
      /** Ad · telefon · e-posta üzerinde harf-ayrımsız arama. Telefon KİMLİK anahtarıdır (WhatsApp). */
      query?: string;
      type?: CustomerType;
      isDraft?: boolean;
      /**
       * Onay kuyruğu; reddedilenler dışarıda, çünkü `b2bApproved === false` reddedilende de doğrudur.
       */
      b2bPending?: boolean;
      /** Vade yetkisi açık olanlar (`credit_enabled`) — "vadeli müşteriler" daraltması. */
      creditEnabled?: boolean;
      /**
       * Pazarlama izni olanlar; kanal ayrımı şart, tek "izinli" kovası izinsiz gönderim demektir. `'any'` ikisinden biri.
       */
      marketingConsent?: MarketingChannel | 'any';
      cursor?: KeysetCursor;
      limit?: number;
    } = {},
  ): Promise<Page<UserProfile>> {
    const filters: Record<string, unknown> = {};
    if (opts.type) filters.type = opts.type;
    if (opts.isDraft !== undefined) filters.isDraft = opts.isDraft;
    if (opts.creditEnabled !== undefined) filters.creditEnabled = opts.creditEnabled;
    if (opts.b2bPending) filters.b2bPending = true;

    // Terim VERİLDİ ama kaçıştan sonra boşaldıysa (yalnız `"` `(` `)` `,` yazılmış) liste
    // SÜZGEÇSİZ dönmemeli: operatör aradığını bulduğunu sanır, oysa 312 satırın hepsi orada.
    // Eşleşmesi imkânsız bir kimlikle süzülür — "sonuç yok" doğru cevaptır.
    const term = ilikeTerm(opts.query);
    const bosalanTerim = Boolean(opts.query?.trim()) && term === '';
    if (bosalanTerim) filters.id = IMPOSSIBLE_ID;

    const izin = consentFilter(opts.marketingConsent);

    return this.getPage(filters, {
      ...CUSTOMERS_ONLY,
      orderBy: 'createdAt',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      // Arama alanları tek `or` grubudur, ayrı süzgeçler AND'lenirdi; `any` izni kendi `or` grubudur, yoksa "izinli VEYA aranan" süzülürdü.
      orFilters: [...(term ? [PROFILE_SEARCH_FIELDS.map((f) => ilikeContains(f, term)).join(',')] : []), ...izin.orFilters],
      jsonPathFilters: izin.jsonPathFilters,
    });
  }

  /**
   * Pazarlama izni sayacı; listeyle aynı ölçütten (`consentFilter`) çıkar ki "kaç" ile "kim" ayrışmasın.
   */
  countByMarketingConsent(channel: MarketingChannel | 'any'): Promise<number> {
    const izin = consentFilter(channel);
    return this.count({}, { ...CUSTOMERS_ONLY, orFilters: izin.orFilters, jsonPathFilters: izin.jsonPathFilters });
  }

  /**
   * Müşteri ekranının başlık sayaçları, satır taşınmadan; sayılar süzgeçli listeye değil tüm müşteri kümesine aittir.
   */
  async counts(): Promise<{ total: number; draft: number }> {
    const [total, draft] = await Promise.all([this.count({}, CUSTOMERS_ONLY), this.count({ isDraft: true }, CUSTOMERS_ONLY)]);
    return { total, draft };
  }

  /**
   * Onay bekleyen başvuru sayısı; `counts()`ten ayrı, çünkü o tüm müşteri kümesini sayar. Sayfadan türetilemez, süzgeç
   * `list({ b2bPending: true })` ile aynıdır.
   */
  async countB2bPending(): Promise<number> {
    return this.count({ b2bPending: true }, CUSTOMERS_ONLY);
  }

  /** Karar VERİLMİŞ başvurular — onaylanmış ya da reddedilmiş. Ölçüt `B2B_DECIDED` künyesinde. */
  async countB2bDecided(): Promise<number> {
    return this.count({ b2bPending: false }, { ...CUSTOMERS_ONLY, ...B2B_DECIDED });
  }

  /**
   * B2B onay kuyruğu, başvuru sırasıyla (`b2b_applied_at`); `list()` profil doğuşuna göre dizer. `decided` künyesi dolu
   * ve bekleyende olmayandır, çünkü hiç başvurmamış müşteri de `b2b_pending = false` taşır.
   */
  async listB2bQueue(opts: { decided?: boolean; cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<UserProfile>> {
    const decided = opts.decided ?? false;
    return this.getPage(
      { b2bPending: !decided },
      {
        ...CUSTOMERS_ONLY,
        ...(decided ? B2B_DECIDED : {}),
        orderBy: 'b2bAppliedAt',
        orderDirection: 'desc',
        keysetAfter: opts.cursor,
        limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      },
    );
  }

  /**
   * Mükerrer adaylar: aynı işletmenin farklı yazımla iki kez girişi, telefonun son haneleri ve ad benzerliğiyle.
   * Kesinlik iddiası yok, dönen şey adaydır ve karar admin'indir.
   */
  async findDuplicateCandidates(opts: {
    excludeId: string;
    phone?: string | null;
    name?: string | null;
  }): Promise<UserProfile[]> {
    const gruplar: string[] = [];

    // Son 8 hane: Fransız sabit/mobil numarasının ulusal kısmını taşır ve ülke kodu ile öndeki
    // sıfırın (0388… ↔ +33388…) farkından etkilenmez. Daha kısası (6) alakasız numaraları eşler.
    const haneler = (opts.phone ?? '').replace(/\D/g, '');
    if (haneler.length >= 8) gruplar.push(ilikeContains('phone', haneler.slice(-8)));

    const ad = ilikeTerm(opts.name);
    if (ad) gruplar.push(ilikeContains('name', ad));

    // Hiçbir ölçüt kurulamadıysa (telefon yok, ad boş) sorgu HİÇ atılmaz: ölçütsüz bir `or` grubu
    // tüm müşterileri "aday" olarak döndürürdü.
    if (gruplar.length === 0) return [];

    const adaylar = await this.getAll({}, { ...CUSTOMERS_ONLY, orFilters: [gruplar.join(',')], limit: 20 });
    return adaylar.filter((p) => p.id !== opts.excludeId);
  }

  /**
   * @deprecated `approveB2b` / `rejectB2b` kullanın; ret hâlini üretemez, çünkü damga ve gerekçe bu imzaya sığmaz.
   */
  setB2bApproval(profileId: string, approved: boolean): Promise<UserProfile> {
    return this.update({ id: profileId, b2bApproved: approved });
  }

  /**
   * B2B başvurusunu ONAYLAR (DOMAIN §10) — onaya kadar toptan fiyat görünmez.
   *
   * Varsa eski ret damgası SİLİNMEZ: onaylanmış bir müşterinin geçmişte bir kez reddedildiği bilgisi
   * onay kartının işine yarar ve `b2bStatusOf` zaten `approved`'ı ret damgasından önce döndürür.
   */
  approveB2b(profileId: string): Promise<UserProfile> {
    return this.update({ id: profileId, b2bApproved: true });
  }

  /**
   * B2B başvurusunu reddeder, kayıt B2C kalır; gerekçe veride zorunludur (`user_profiles_b2b_reject_stamp`) ve damgayı
   * tetikleyici atar. Künyesi düzeltilip yeniden başvurulursa kuyruğa döner.
   */
  async rejectB2b(profileId: string, opts: { actorId: string; reason: string }): Promise<UserProfile> {
    const reason = opts.reason.trim();
    if (!reason) throw new Error('user_profiles: gerekçesiz B2B reddi yazılamaz');
    // Damga başvuru damgasıyla karşılaştırıldığı için DB saatiyle tetikleyici yazar; iki saat karışırsa hâl ters dönebilir.
    return this.update({ id: profileId, b2bApproved: false, b2bRejectedBy: opts.actorId, b2bRejectReason: reason });
  }

  /**
   * Ret gerekçesi çeviri kuyruğu, en eski önce; gerekçe müşteriye e-postayla gittiği için çevrilmeli.
   */
  listUntranslatedRejectReasons(limit = 20): Promise<UserProfile[]> {
    return this.getAll(
      {},
      {
        isNotNullFields: ['b2bRejectReason'],
        isNullFields: ['b2bRejectReasonTranslatedAt'],
        orderBy: 'b2bRejectedAt',
        limit,
      },
    );
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
   * GDPR silme: kararın tamamı `anonymize_customer`da, servis yalnız çağırır. Önce profil, sonra `auth.users`, çünkü ters
   * sırada bağ kopar; auth silinemezse hata fırlatır ve işlem idempotent olduğu için tekrarlanabilir.
   */
  async anonymize(customerId: string): Promise<void> {
    const profile = await this.getById(customerId);
    if (!profile) throw new Error(`anonymize: profil bulunamadı (${customerId})`);
    const authUserId = profile.authUserId;

    const { error } = await this.supabase.rpc('anonymize_customer', { p_customer_id: customerId });
    if (error) throw new Error(`anonymize: ${error.message}`);

    if (authUserId) {
      const { error: authError } = await this.supabase.auth.admin.deleteUser(authUserId);
      // "Zaten yok" bir hata değil, istenen sonucun ta kendisi — yeniden çalıştırmada buraya düşer.
      if (authError && authError.status !== 404) {
        throw new Error(`anonymize: auth kullanıcısı silinemedi (${customerId}): ${authError.message}`);
      }
    }
  }

  /**
   * Birleştirme ön izlemesi, taşımayla aynı kaynaktan (`preview_customer_merge`) ki onaylanan ile taşınan ayrışmasın.
   */
  async previewMerge(targetId: string, sourceId: string): Promise<CustomerMergePreview> {
    const rows = await this.executeRpc<unknown[]>('preview_customer_merge', {
      p_target_id: targetId,
      p_source_id: sourceId,
    });
    return CustomerMergePreviewSchema.parse(dbToApp((rows ?? [])[0]));
  }

  /**
   * Müşteri birleştirme: kaynak kapanır, kararın tamamı `merge_customers`da. Yön çağıranındır, servis yalnız uygular.
   */
  async merge(input: { targetId: string; sourceId: string; actorId?: string | null }): Promise<void> {
    await this.executeRpc('merge_customers', {
      p_target_id: input.targetId,
      p_source_id: input.sourceId,
      p_actor_id: input.actorId ?? null,
    });
  }

  /**
   * Rol kümesini ve gerekiyorsa depo kapsamını tek çağrıda yazar, çünkü depocu/kurye rolü kapsamsız olamaz ve iki yazım
   * arada geçersiz hâl doğururdu. `warehouseIds` verilmezse kapsam korunur; geçerlilik motorda ve DB kısıtında.
   */
  setRoles(profileId: string, roles: UserRole[], warehouseIds?: string[]): Promise<UserProfile> {
    return this.update(warehouseIds ? { id: profileId, roles, warehouseIds } : { id: profileId, roles });
  }

  /**
   * Depo kapsamını yazar; boş dizi hiçbir depo demektir, "hepsi" değil.
   */
  setWarehouseScope(profileId: string, warehouseIds: string[]): Promise<UserProfile> {
    return this.update({ id: profileId, warehouseIds });
  }

  /**
   * Müşteri araması (operasyon seçicileri): ad, telefon ve e-posta üzerinde tek `or` grubu, tavanlı. Rol süzgeci zorunlu
   * (`CUSTOMERS_ONLY`), yoksa seçici personeli ve anonim alıcıyı da döndürürdü.
   */
  async search(term: string, limit = 10): Promise<UserProfile[]> {
    const safe = ilikeTerm(term);
    if (!safe) return [];
    return this.getAll(
      {},
      {
        ...CUSTOMERS_ONLY,
        orFilters: [PROFILE_SEARCH_FIELDS.map((f) => ilikeContains(f, safe)).join(',')],
        orderBy: 'name',
        limit,
      },
    );
  }

  /**
   * Veritabanında hiç yönetici var mı: açılış kuralı ilk auth kullanıcısını admin yaptığı için hızlı giriş bunu önce sorar.
   */
  async hasAdmin(): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .contains('roles', ['admin']);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  /** Bir role sahip tüm profiller (personel listesi, kurye ataması) — dizi araması GIN indeksli. */
  async listByRole(role: UserRole): Promise<UserProfile[]> {
    const { data, error } = await this.supabase.from('user_profiles').select('*').contains('roles', [role]);
    if (error) throw error;
    return this.parseRows(data ?? []);
  }

  /**
   * Operasyon rolü taşıyan tüm profiller, tek turda: `overlaps` kesişim sorar ve aynı GIN indeksini kullanır.
   */
  async listStaff(): Promise<UserProfile[]> {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .overlaps('roles', [...STAFF_ROLES])
      .order('name');
    if (error) throw error;
    return this.parseRows(data ?? []);
  }
}
