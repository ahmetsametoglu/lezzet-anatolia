import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmail } from '@lezzet/helper';
import {
  UserProfileInsertSchema,
  UserProfileSchema,
  UserProfileUpdateSchema,
  DEFAULT_PAGE_SIZE,
  STAFF_ROLES,
  type CustomerType,
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
 * Serbest aramanın baktığı alanlar — liste (`list`) ve seçici (`search`) AYNI kümeye bakar.
 * Ayrışsalardı operatör seçicide bulduğu müşteriyi listede bulamazdı; aynı terim, aynı sonuç kümesi.
 * Telefon burada çünkü KİMLİK anahtarıdır: WhatsApp'tan gelen müşteri telefonla bulunur.
 */
const PROFILE_SEARCH_FIELDS = ['name', 'phone', 'email'] as const;

/**
 * Müşteri listesinin kapsamı: rol kümesinde `customer` olanlar.
 *
 * `user_profiles` müşteriyi VE personeli birlikte taşıyor (tek tablo, rol ayırır). Süzgeç olmadan
 * müşteri ekranı depocuyu, kuryeyi ve patronu da listeler — hem yanlış hem de "312 müşteri" sayacını
 * şişirir. `contains` (içerir) gerekiyor, eşitlik değil: personelin rolü `['staff','admin']` gibi
 * çoklu olabilir ve eşitlik onları düşürürdü (bkz. `containsFilters`).
 */
/**
 * Hiçbir satırın taşımayacağı kimlik — "eşleşme yok" süzgeci. Boş bir sayfa döndürmek için ayrı bir
 * kod yolu açmak yerine sorgu doğal yoluyla boş döner (imleç mantığı da bozulmaz).
 */
const IMPOSSIBLE_ID = '00000000-0000-0000-0000-000000000000';

const CUSTOMERS_ONLY = { containsFilters: [{ field: 'roles', values: ['customer'] as const }] } as const;

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

  /**
   * Tek para alanı: vade tavanı. `discountPercent` de `numeric` ama YÜZDE'dir — 02.9'un kapsamı
   * yalnız para kolonları, oran çevirenler bilerek dışarıda.
   */
  protected override readonly moneyFields = ['creditLimitCents'];

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

  /**
   * Verilen kimlikler TEK sorguda — "bu kaydı kim girdi" gibi sorular için. FK taşımayan alanlar
   * (ör. `stock_adjustment.created_by`) gömülü `select` ile çözülemez; satır başına sorgu atmak
   * yerine sayfadaki kimlikler toplanıp bir kez okunur.
   */
  async listByIds(ids: readonly string[]): Promise<UserProfile[]> {
    if (ids.length === 0) return [];
    return this.getAll({ id: [...ids] });
  }

  /**
   * Genel indirim oranı TANIMLI müşteriler (09.5). Oran müşteri kaydında yaşar; fiyat ekranı onu
   * yazmaz, **kimlerde olduğunu** izler — özel fiyatla aynı ekranda görünmesi gerekir, çünkü ikisi
   * fiyat çözümünde arka arkaya gelen iki basamaktır (özel fiyat → indirim oranı → kanal fiyatı).
   *
   * Sayfalanmaz: oran elle verilir, küme admin'in eliyle büyür (CLAUDE.md §1).
   */
  async listWithDiscount(): Promise<UserProfile[]> {
    return this.getAll({}, { isNotNullFields: ['discount_percent'], orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Profil listesi (admin) — en yeni önce, sonsuz kaydırma.
   *
   * **Süzme ve arama SUNUCUDA** (09.9). Müşteri kümesi veriyle büyür, yani client'ta süzülemez:
   * yüklenmiş sayfada arayan bir kutu, ikinci sayfada duran müşteriyi "yok" gösterirdi. `search()`
   * bu işi YAPMAZ ve yapmamalı — o bir seçicinin bulma aracıdır, tavanlıdır ve tavanı bilinçlidir.
   * Ekranın listesi ile seçicinin havuzu farklı sorular; ortak olan yalnız süzgeç dizesidir
   * (`ilikeContains`), o da tek yerde.
   */
  async list(
    opts: {
      /** Ad · telefon · e-posta üzerinde harf-ayrımsız arama. Telefon KİMLİK anahtarıdır (WhatsApp). */
      query?: string;
      type?: CustomerType;
      isDraft?: boolean;
      b2bPending?: boolean;
      /** Vade yetkisi açık olanlar (`credit_enabled`) — "vadeli müşteriler" daraltması. */
      creditEnabled?: boolean;
      cursor?: KeysetCursor;
      limit?: number;
    } = {},
  ): Promise<Page<UserProfile>> {
    const filters: Record<string, unknown> = {};
    if (opts.type) filters.type = opts.type;
    if (opts.isDraft !== undefined) filters.isDraft = opts.isDraft;
    if (opts.creditEnabled !== undefined) filters.creditEnabled = opts.creditEnabled;
    if (opts.b2bPending) filters.b2bApproved = false;

    // Terim VERİLDİ ama kaçıştan sonra boşaldıysa (yalnız `"` `(` `)` `,` yazılmış) liste
    // SÜZGEÇSİZ dönmemeli: operatör aradığını bulduğunu sanır, oysa 312 satırın hepsi orada.
    // Eşleşmesi imkânsız bir kimlikle süzülür — "sonuç yok" doğru cevaptır.
    const term = ilikeTerm(opts.query);
    const bosalanTerim = Boolean(opts.query?.trim()) && term === '';
    if (bosalanTerim) filters.id = IMPOSSIBLE_ID;

    return this.getPage(filters, {
      ...CUSTOMERS_ONLY,
      orderBy: 'createdAt',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      // Tek `or` grubu: üç alandan biri tutarsa satır kalır. Ayrı süzgeç olarak yazılsalar
      // AND'lenirdi ve hiçbir müşteri hem adında hem telefonunda terimi taşımadığı için liste
      // her aramada boş dönerdi.
      orFilters: term ? [PROFILE_SEARCH_FIELDS.map((f) => ilikeContains(f, term)).join(',')] : undefined,
    });
  }

  /**
   * Müşteri ekranının başlık sayaçları — `head: true` ile satır TAŞINMADAN sayılır.
   *
   * Sayılar TÜM müşteri kümesine aittir, süzgeçli listeye değil: çip "3 taslak" derken kendi
   * süzgecini saymamalı, yoksa "Taslak" çipine basan operatör sayının değişmesini bekler ve
   * değişmeyince ekrana güvenmez. Aynı gerekçe sipariş ve ürün ekranlarında da yazılı.
   */
  async counts(): Promise<{ total: number; draft: number }> {
    const [total, draft] = await Promise.all([this.count({}, CUSTOMERS_ONLY), this.count({ isDraft: true }, CUSTOMERS_ONLY)]);
    return { total, draft };
  }

  /**
   * MÜKERRER ADAYLARI — "bu başvuru zaten kayıtlı bir işletme olabilir mi".
   *
   * **Birebir kopya aramıyoruz, çünkü mümkün değil:** telefon ve e-posta kısmî TEKİL indeksli, aynı
   * değer ikinci kez yazılamaz. Gerçek risk başka — aynı işletme farklı yazımla iki kez giriyor:
   * WhatsApp'tan `+33 3 88 12 34 56` ile açılmış bir taslak, sonra web formundan `0388123456` ile
   * yapılan bir B2B başvurusu. İkisi ayrı satır, ayrı sipariş geçmişi, ayrı cari bakiye.
   *
   * Bu yüzden ölçüt İKİ TARAFLI:
   *  · **telefonun son haneleri** — ülke kodu/boşluk/tire farkını yok sayar (formatlama farkı)
   *  · **ad benzerliği** — aynı işletmenin "Bosphore" ve "Restaurant Bosphore" olarak girilmesi
   *
   * Kesinlik iddiası YOK ve olmamalı: dönen şey ADAY, karar admin'in. Bu yüzden servis "mükerrer mi"
   * demiyor, satır getiriyor (STACK §4).
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
   * Rol kümesini — ve gerekiyorsa DEPO KAPSAMINI — yazar.
   *
   * **Kümenin geçerliliğini SERVİS denetlemez** (STACK §4) — kuralı motor bilir (`validateRoleSet`),
   * son emniyet DB kısıtındadır.
   *
   * Kapsam neden AYNI çağrıda: depocu/kurye rolü kapsamsız olamaz (DB kısıtı, DOMAIN §17). Rol ile
   * kapsam iki ayrı yazımla gitseydi arada geçersiz bir hâl doğardı ve ilk yazım kısıtta patlardı —
   * yani "önce rolü ver, sonra depoyu seç" akışı hiç çalışmazdı. İkisi tek gerçektir.
   *
   * `warehouseIds` verilmezse mevcut kapsam korunur: yalnız rol düzeltmesi yapan çağıran (ör.
   * muhasebe rolü ekleme) kapsamı sıfırlamak zorunda kalmaz.
   */
  setRoles(profileId: string, roles: UserRole[], warehouseIds?: string[]): Promise<UserProfile> {
    return this.update(warehouseIds ? { id: profileId, roles, warehouseIds } : { id: profileId, roles });
  }

  /**
   * Depo kapsamını yazar (19.5 kapsam atama ekranı).
   *
   * **Boş dizi = HİÇBİR depo, "hepsi" değil** (fail-closed): kapsamı boşaltmak depocuyu kapıya
   * kilitler, tüm depolara açmaz. Depocu/kurye için boş kapsam DB'de zaten reddedilir — rolü
   * kaldırmadan kapsamı boşaltmak mümkün değildir ve bu bilinçlidir.
   */
  setWarehouseScope(profileId: string, warehouseIds: string[]): Promise<UserProfile> {
    return this.update({ id: profileId, warehouseIds });
  }

  /**
   * Müşteri arama (operasyon seçicileri) — ad · telefon · e-posta üzerinde tek `or` grubu.
   *
   * Sonuç TAVANLIDIR ve tavan çağırana bildirilir: seçici bir liste değil, bir bulma aracıdır.
   * Sayfalamak yerine sınırlamak doğru — operatör aradığını ilk on satırda görmüyorsa terimini
   * daraltır, kaydırmaz.
   */
  async search(term: string, limit = 10): Promise<UserProfile[]> {
    const safe = ilikeTerm(term);
    if (!safe) return [];
    return this.getAll(
      {},
      {
        orFilters: [PROFILE_SEARCH_FIELDS.map((f) => ilikeContains(f, safe)).join(',')],
        orderBy: 'name',
        limit,
      },
    );
  }

  /** Bir role sahip tüm profiller (personel listesi, kurye ataması) — dizi araması GIN indeksli. */
  async listByRole(role: UserRole): Promise<UserProfile[]> {
    const { data, error } = await this.supabase.from('user_profiles').select('*').contains('roles', [role]);
    if (error) throw error;
    return this.parseRows(data ?? []);
  }

  /**
   * OPERASYON rolü taşıyan tüm profiller — Depolar (19.5) ve Ayarlar (09.16) ekranlarının kişi kümesi.
   *
   * `list()` müşteri kümesine kilitli, `listByRole` tek rol alıyor; çağıranlar bu yüzden dört tur
   * atıp kimliğe göre tekilleştiriyordu (aynı kişi birden çok rol taşıyabilir — `admin` + `courier`
   * sık). Tek turda doğrusu bu: **`overlaps` (`?|`) kesişim sorar** ve `contains` ile aynı GIN
   * indeksinden yararlanır, yani dört tur bir tura inerken indeks kaybı yok.
   *
   * Tekilleştirme de kayboluyor: kesişim sorgusu satırı bir kez döndürür, `Map`'e gerek kalmaz.
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
