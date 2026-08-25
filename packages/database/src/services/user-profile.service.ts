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

  /**
   * ⚠ `findByPhone` **KALDIRILDI** (04.10) ve geri gelmemeli. İki gerekçe, ikisi de sert:
   *
   *   1. **Artık tekil değil.** `user_profiles_phone_key` kalktı (0001) — aynı iletişim numarasını
   *      taşıyan iki müşteri meşru (aile telefonu). "Telefonla ara" tek satır döndürmeye devam
   *      etseydi ikisinden birini rastgele seçerdi ve hangisi olduğu sorguya göre değişirdi.
   *   2. **Bu kolon kimlik değil.** Doğrulanmamış bir dizeyle kimlik çözmek 04.10'un kapattığı
   *      açığın ta kendisi. Kimlik anahtarı `CustomerPhoneService.findActive` ile okunur.
   */

  /** E-postayla arar — küçük harfe indirgenmiş gelmeli (DB indeksi de öyle). */
  findByEmail(email: string): Promise<UserProfile | null> {
    return this.getOneBy({ email: normalizeEmail(email) });
  }

  findByAuthUserId(authUserId: string): Promise<UserProfile | null> {
    return this.getOneBy({ authUserId });
  }

  /**
   * Davet kodunun sahibi (17.7). Kod tekildir (kısmi unique indeks), yani en fazla bir satır döner.
   *
   * Bulunamayan kod bir HATA DEĞİL `null`'dır: bağlantı yanlış kopyalanmış ya da kodun sahibi
   * silinmiş olabilir. Çağıran kaydı yine de açar, yalnız getiren bağını kurmaz — geçersiz bir kod
   * yüzünden müşteriyi kayıttan çevirmek, kazanılmış bir müşteriyi bir dize yüzünden kaybetmektir.
   */
  findByReferralCode(code: string): Promise<UserProfile | null> {
    const temiz = code.trim().toUpperCase();
    if (!temiz) return Promise.resolve(null);
    return this.getOneBy({ referralCode: temiz });
  }

  /**
   * Bildirim jetonunun sahibi (22.08) — tercih sayfasının oturumsuz girişi.
   *
   * `findByReferralCode` ile aynı şekil, **ama büyük harfe ÇEVİRMEZ**: davet kodu telefonda elle
   * yazılabilsin diye okunabilir alfabededir ve harf kutusu önemsizdir; bu jeton yalnız
   * tıklanır — dönüştürmek, üretilenden başka bir dize aramak olurdu.
   *
   * Bulunamayan jeton `null`'dır, hata değil: mail eski olabilir ya da kimlik silinmiş olabilir
   * (`anonymize_customer` jetonu düşürüyor).
   */
  findByNotificationToken(token: string): Promise<UserProfile | null> {
    const temiz = token.trim();
    if (!temiz) return Promise.resolve(null);
    return this.getOneBy({ notificationToken: temiz });
  }

  /**
   * **WhatsApp bağlama jetonunun sahibi** (04.10) — gelen mesajın hangi hesaba ait olduğu sorusu.
   *
   * `findByNotificationToken` ile aynı şekil ama **süreyi BURADA sormaz**: geçerlilik bir iş
   * kuralıdır ve uygulama katmanında yaşıyor (`consumeWhatsappLink`). Servise koysaydık, süresi
   * geçmiş jeton "hiç yok" ile aynı cevaba düşerdi ve çağıran onu temizleyemezdi — ölü satırlar
   * tekillik indeksinde sonsuza dek dururdu.
   */
  findByWaLinkToken(token: string): Promise<UserProfile | null> {
    const temiz = token.trim().toUpperCase();
    if (!temiz) return Promise.resolve(null);
    return this.getOneBy({ waLinkToken: temiz });
  }

  /**
   * ⚠ `findIdentityCandidates` de **KALDIRILDI** (04.10) — aynı kökten.
   *
   * İki anahtarı tek turda arıyordu ve o hâliyle doğruydu; yanlış olan, ikisinin de AYNI TABLODA
   * olduğu varsayımıydı. Telefon anahtarı `customer_phone`a taşınınca bileşim iki servise yayıldı
   * ve yeri de değişti: kimlik kararının kurulduğu tek yer (`find-or-create`). Servisin içinde
   * kalsaydı `UserProfileService` kimlik anahtarının nerede yaşadığını bilmek zorunda kalırdı.
   */

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
   * Fiyat grubu ÜYESİ müşteriler (20.08) — grup yönetiminin "kaç üye var" sayısı ve müşteri
   * kartındaki üyelik görünümü. `listWithDiscount`un aynı deseni: üyelik profil kaydında yaşar,
   * fiyat ekranı yazmaz, kimlerde olduğunu izler. Sayfalanmaz — üyelik elle verilir (CLAUDE §1).
   */
  async listWithPriceGroup(): Promise<UserProfile[]> {
    return this.getAll({}, { isNotNullFields: ['price_group_id'], orderBy: 'createdAt', orderDirection: 'desc' });
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
      /**
       * Onay KUYRUĞU — reddedilenler dışarıda. `b2bApproved === false` ile süzmek yanlış olurdu:
       * reddedilen kayıt da o değeri taşıyor (09.11: ret silmez) ve operatör onay bekleyenler
       * listesinde kararını çoktan verdiği başvuruları görürdü.
       */
      b2bPending?: boolean;
      /** Vade yetkisi açık olanlar (`credit_enabled`) — "vadeli müşteriler" daraltması. */
      creditEnabled?: boolean;
      /**
       * **Pazarlama izni olanlar** — analitikteki "N kişi" sayısının gittiği liste (`ANALYTICS §6`:
       * analitik "kaç" der, Müşteriler "kim" der).
       *
       * **Kanal ayrımı ŞART:** e-postaya izin verenle WhatsApp'a izin veren aynı küme değildir ve
       * kampanya kanal seçerek kurulur. Tek bir "izinli" kovası, e-posta listesine WhatsApp'çıları
       * karıştırırdı — izinsiz gönderim demek.
       *
       * `'any'` ikisinden BİRİ (or), `'email'`/`'whatsapp'` tek kanal. İzin yoksa ya da hiç
       * sorulmamışsa satır düşer; ikisi arasındaki fark burada değil ekranda taşınır (09.10:
       * "reddetti" ile "hiç sorulmadı" ayrı gösterilir, birleştirmek GDPR kanıtını bozar).
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
      // Tek `or` grubu: üç alandan biri tutarsa satır kalır. Ayrı süzgeç olarak yazılsalar
      // AND'lenirdi ve hiçbir müşteri hem adında hem telefonunda terimi taşımadığı için liste
      // her aramada boş dönerdi.
      // İzin `any` ise KENDİ or grubu olur — arama grubuyla birleştirilseydi ikisi VEYA ile
      // bağlanır ve "izinli VE aranan" yerine "izinli VEYA aranan" süzülürdü.
      orFilters: [...(term ? [PROFILE_SEARCH_FIELDS.map((f) => ilikeContains(f, term)).join(',')] : []), ...izin.orFilters],
      jsonPathFilters: izin.jsonPathFilters,
    });
  }

  /**
   * Pazarlama izni sayacı — analitiğin "N kişi" satırı.
   *
   * **Listeyle AYNI ölçütten çıkar** (`consentFilter`) ve bu şart: köprünün iki ucu farklı sayı
   * gösterirse köprü zaten çalışmıyor demektir (operasyon şeridinin talebi, 04.08). Ölçüt iki yere
   * yazılsaydı biri gün gelip ötekinden ayrışırdı ve fark hiçbir yerde hata vermezdi.
   */
  countByMarketingConsent(channel: MarketingChannel | 'any'): Promise<number> {
    const izin = consentFilter(channel);
    return this.count({}, { ...CUSTOMERS_ONLY, orFilters: izin.orFilters, jsonPathFilters: izin.jsonPathFilters });
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
   * @deprecated `approveB2b` / `rejectB2b` kullanın.
   *
   * **Ret hâlini ÜRETEMEZ** ve imzası gereği üretemez: reddin damgası, gerekçesi ve kararı veren
   * personel bu çağrıya sığmıyor. `false` yazdığında kayıt "onay bekliyor" olarak kalır — 08.7'nin
   * kapattığı tam da bu davranıştı (aday ekranda hiç gelmeyecek bir cevabı bekler).
   *
   * Silmedim çünkü çağıranı operasyon yüzeyinde (`customers/actions.ts`) ve o dosya benim şeridimde
   * değil; kaldırmak üç şerit için derlemeyi kırardı. Çağrı yeri `rejectB2b`'ye geçince silinecek —
   * `docs/talep/not-operasyon-b2b-ret-hali.md`.
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
   * B2B başvurusunu REDDEDER (09.11) — kayıt B2C olarak kalır, silinmez.
   *
   * **Gerekçe zorunlu, ve bunu tip DEĞİL veri zorluyor** (`user_profiles_b2b_reject_stamp`): ret
   * e-postayla bildiriliyor, "neden" sorusunun cevabı yoksa soru desteğe düşer. Damgayı atıp
   * gerekçeyi atlamak verilmiş kararı kayıt dışı bırakır.
   *
   * `b2bApproved` `false`'ta KALIR; hâli ret damgası ayırır. Reddedilen aday kuyruktan düşer
   * (kısmi indeks), künyesini düzeltip yeniden başvurursa geri gelir — o damgayı tetikleyici atar.
   */
  // `async` şart: gövde erken FIRLATIYOR ve async olmasaydı hata eşzamanlı çıkardı — `Promise`
  // döndüren bir imzaya bakıp `.catch()` yazan çağıran onu hiç yakalayamazdı.
  async rejectB2b(profileId: string, opts: { actorId: string; reason: string }): Promise<UserProfile> {
    const reason = opts.reason.trim();
    if (!reason) throw new Error('user_profiles: gerekçesiz B2B reddi yazılamaz');
    // Ret DAMGASI burada yazılmaz — tetikleyici atar. Gerekçe: damga başvuru damgasıyla
    // karşılaştırılıyor ve ikisi ayrı saatten gelirse (uygulama ↔ veritabanı) aradaki kayma hâli
    // ters çevirebilir. Uygulama "reddedildi" der, "ne zaman"ı veritabanı söyler.
    return this.update({ id: profileId, b2bApproved: false, b2bRejectedBy: opts.actorId, b2bRejectReason: reason });
  }

  /**
   * **Çeviri kuyruğu** (20.2) — gerekçesi yazılmış ama çevirisi koşmamış retler, en eski önce.
   * Kısmi indeksle birebir (`user_profiles_reject_reason_untranslated_idx`).
   *
   * Ret gerekçesi personelin Türkçe cümlesidir ve müşteriye e-postayla gider; çevrilmezse
   * Fransızca konuşan aday "neden" sorusunun cevabını okuyamaz ve soru desteğe düşer — yani
   * gerekçe alanının var oluş sebebi boşa çıkar.
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
   * **GDPR silme** (05.08) — kişisel alanları boşaltır, kişiye ait kayıtları siler, giriş yolunu kapatır.
   *
   * Kararın TAMAMI `anonymize_customer` (0037) içinde: hangi tablo silinir, hangisi kimliksizleşir,
   * hangisi yasal saklama yüzünden kalır. Servis o kararı tekrarlamaz, yalnız çağırır — burada
   * tablo tablo silme yazsaydık aynı liste iki yerde yaşar ve yarın eklenen bir tablo birinde
   * unutulurdu; unutulduğunda da hata vermez, silme sessizce yarım kalırdı.
   *
   * **İki taraf ayrı ayrı kapatılır ve sıra bilinçli:** önce profil (veri), sonra `auth.users`
   * (giriş). Ters sırada auth satırı gittiği an profildeki bağ `set null` olur ve fonksiyonun
   * göreceği bir kimlik kalmazdı. Auth silinmesi başarısız olursa **hata fırlatır**: veri
   * anonimleşmiş ama giriş açık kalmış bir hesap, ikisinin de yapılmamasından beterdir — çağıran
   * bunu görmeli, yeniden çalıştırmalı. `anonymize_customer` idempotent olduğu için tekrar zararsız.
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
   * **Birleştirme ön izlemesi** (09.10) — onay diyaloğunun okuduğu döküm.
   *
   * Taşımanın kendisiyle AYNI kaynaktan türüyor (`preview_customer_merge`): sayıları ekranda tek tek
   * saymak beş ayrı okuma olurdu ve daha kötüsü, iki liste bir gün ayrışınca operatör onayladığından
   * farklı bir şey taşınmış olurdu.
   */
  async previewMerge(targetId: string, sourceId: string): Promise<CustomerMergePreview> {
    const rows = await this.executeRpc<unknown[]>('preview_customer_merge', {
      p_target_id: targetId,
      p_source_id: sourceId,
    });
    return CustomerMergePreviewSchema.parse(dbToApp((rows ?? [])[0]));
  }

  /**
   * **Müşteri birleştirme** (09.10) — kaynağın kayıtları hedefe taşınır, kaynak KAPANIR.
   *
   * Kararın tamamı `merge_customers` (0040) içinde ve **başka hiçbir yerde tekrarlanmaz**: hangi
   * tablo taşınır, hangi çakışma nasıl çözülür, hangi kimlik anahtarı hedefe geçer. Uygulama
   * katmanına dağıtılsaydı yarın eklenen bir tablo birinde unutulur ve birleştirme sessizce yarım
   * kalırdı — üstelik hata vermeden.
   *
   * **Yön çağıranındır, kapı sormaz:** hangi kaydın kalacağı bir iş kararıdır (operatör hangisinin
   * adresi/vadesi doğru diye bakar). Servis yalnız verileni uygular.
   */
  async merge(input: { targetId: string; sourceId: string; actorId?: string | null }): Promise<void> {
    await this.executeRpc('merge_customers', {
      p_target_id: input.targetId,
      p_source_id: input.sourceId,
      p_actor_id: input.actorId ?? null,
    });
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
