import type { UserRole } from '@lezzet/types';

/*
  OPERASYON BÖLÜMLERİ — rolden yüzeye giden SAF kural (21.9).

  Karar `docs/uygulama/02 §4` (kullanıcı kararı 07.08): TEK uygulama, rol-bazlı yüzey. Oturumsuz
  kullanım müşteri gezinmesidir; operasyon hakkı `/me`nin `roles` alanından okunur. ROL DEĞİŞTİRME
  ANAHTARI YOKTUR — kullanıcı hangi şapkaları taşıyorsa hepsini aynı anda görür, "şu an kurye
  gibiyim" diye bir kip yok.

  DOSYA SAF: React yok, ağ yok, tema yok. Ekran testinden bağımsız birim testi olması bunun içindir
  — süzme kuralı arayüzün değil, yüzeyin kuralıdır ve bir gün ekran değişse de aynı kalır.
*/

/**
 * Dört bölüm — SIRA tasarımın sırasıdır, alfabetik değil.
 *
 * **DEPO BAŞA ALINDI (v3 · kullanıcı bulgusu 30.08).** v2 kuryeyi başa koyuyordu ve kod onu
 * izliyordu; v3'ün ortak zemini (`00-ortak`) sekme çubuğunu **Depo · Kurye · Yönetim · Para**
 * diye çiziyor. Sıra bir süs değil: çubuğun ilk sekmesi çok bölümlü personelin uygulamayı her
 * açtığında düştüğü yerdir ve günün en çok açılan bölümü depodur.
 */
export const OPERATIONS_SECTIONS = ['warehouse', 'courier', 'management', 'money'] as const;

export type OperationsSection = (typeof OPERATIONS_SECTIONS)[number];

/**
 * Rol → bölüm eşlemesi. `satisfies Record<UserRole, …>` BİLEREK: `UserRoleEnum`e yeni bir rol
 * eklendiği gün bu dosya DERLENMEZ ve o rolün hangi bölüme (ya da hiçbirine) düştüğü karara
 * bağlanır. Eksik bir eşleme sessizce "operasyon hakkı yok" diye okunsaydı, yeni bir personel
 * rolü uygulamada görünmez olurdu ve kimse fark etmezdi.
 *
 * `customer` → `null`: müşteri rolü bir operasyon bölümü AÇMAZ. Personelin `roles` dizisinde
 * `customer` de bulunabilir (herkes aynı zamanda bir hesaptır) — bu yüzden kapı "dizide customer
 * var mı" diye değil, "operasyon bölümü doğuran bir rol var mı" diye sorulur.
 */
const SECTION_OF_ROLE = {
  customer: null,
  courier: 'courier',
  warehouse: 'warehouse',
  /* Tasarımın "Yönetim" sekmesi (v2:1086) — karar kutusu, şikâyet, istisna, gün özeti. */
  admin: 'management',
  /* Tasarımın "Para" sekmesi — SALT OKUMA (v2:721); muhasebe rolünün mobildeki karşılığı. */
  accounting: 'money',
  /* Makine hesabı (yerinde satışın anonim alıcısı, 21.119) — oturum açamaz, bölüm doğurmaz. */
  system: null,
} as const satisfies Record<UserRole, OperationsSection | null>;

/**
 * Kullanıcının açabildiği bölümler — tasarımın sırasında, tekrarsız.
 *
 * Süzme `OPERATIONS_SECTIONS` üstünden yapılır (roller üstünden değil): sıra böylece rollerin
 * dizideki sırasından bağımsız olur. Aksi hâlde aynı kullanıcı, sunucu `roles`u farklı sırayla
 * döndürdüğü gün sekmelerini başka sırada görürdü.
 */
export function operationsSectionsOf(roles: readonly UserRole[]): OperationsSection[] {
  return OPERATIONS_SECTIONS.filter((section) => roles.some((role) => SECTION_OF_ROLE[role] === section));
}

/**
 * Sekme çubuğu görünür mü? Tasarımın kuralı birebir (v2:1097 `tabsVisible: … rolTabs.length > 1`):
 * TEK bölümü olan kullanıcıya çubuk ÇİZİLMEZ — tek seçenekli bir gezinme çubuğu, seçim varmış gibi
 * görünen bir süstür ve ekranın 60 px'ini yer.
 */
export function showsSectionTabs(sections: readonly OperationsSection[]): boolean {
  return sections.length > 1;
}

/**
 * Bildirim süzmesi. Tasarımın demo mantığı iki hâli çiziyor (v2:1077): çok rollüde TÜMÜ akar, tek
 * rollüde yalnız kendi bölümü. Buradaki kural ikisini de BİREBİR üretir ve arasını da doldurur —
 * kullanıcının bölümlerine ait olan bildirimler görünür.
 *
 * Neden "çok rollüyse hepsi" diye yazılmadı: dört rolden ikisini taşıyan bir kullanıcıya, açamadığı
 * iki bölümün bildirimleri gösterilirdi. Bildirim bir HIZLANDIRICIDIR (zemin brief kuralı) — basınca
 * gidilecek bir yer yoksa hızlandırdığı bir şey de yoktur.
 */
export function visibleNotifications<T extends { section: OperationsSection }>(
  items: readonly T[],
  sections: readonly OperationsSection[],
): T[] {
  return items.filter((item) => sections.includes(item.section));
}

/**
 * Bildirim ekranının üstbaşlığı hangi cümleyi kuracak (v2:1140 `bilKapsam`). Fonksiyon CÜMLE
 * DÖNDÜRMEZ, kararı döndürür: metin `messages.json`'da yaşar, kural burada. Karışsalardı süzme
 * kuralının testi bir çeviri dizesine bağlanırdı.
 *
 * `all` yalnız kullanıcı DÖRT bölümü de taşıyorsa: "tüm bölümler" diyip iki bölüm göstermek,
 * ekranın kendi künyesinde yalan söylemesi olurdu.
 */
export function notificationScopeOf(
  sections: readonly OperationsSection[],
): { kind: 'all' } | { kind: 'filtered'; sections: OperationsSection[] } {
  return sections.length === OPERATIONS_SECTIONS.length ? { kind: 'all' } : { kind: 'filtered', sections: [...sections] };
}
