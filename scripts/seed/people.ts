import { UserProfileService } from '@lezzet/database';
import { DEV_ADMIN_PROFILE_ID } from '@lezzet/types';
import { an, type Db, type Kisiler } from './shared';
import type { Depolar } from './warehouse';

// Kimlik (04): taslak müşteriler, ticari müşteri kartları, personel.

// ── Taslak müşteriler (04) ───────────────────────────────────────────────────────────────────────

// DOMAIN §10: WhatsApp/manuel gelen müşteri auth'suz TASLAK olarak açılır, ilk girişte auth'a bağlanır.
// findOrCreate tek kapıdır (telefon/e-posta normalize + bul-veya-oluştur) → seed de onu kullanır,
// böylece kimlik anahtarı kuralları seed'de yeniden yazılmaz ve tekrar çalıştırmak güvenlidir.
const DRAFT_CUSTOMERS = [
  { name: 'Élodie Martin', phone: '+33612345678', email: 'elodie.martin@example.fr', country: 'FR' as const, preferredLanguage: 'fr' as const },
  { name: 'Şirket: Anadolu Market GmbH', phone: '+4930123456789', email: 'siparis@anadolumarket.de', country: 'DE' as const, preferredLanguage: 'de' as const, type: 'company' as const },
  { name: 'Mehmet Yıldız', phone: '+33788112233', country: 'FR' as const, preferredLanguage: 'tr' as const },
];

export async function seedDraftCustomers(db: Db): Promise<void> {
  const profiles = new UserProfileService(db);
  console.log('▸ TASLAK MÜŞTERİ seed');
  let created = 0;
  for (const c of DRAFT_CUSTOMERS) {
    // Kimlik ÇÖZÜMÜ (bağlan / oluştur / çakışma) motorun işidir — servis yalnız aday getirir. Seed'in
    // ona ihtiyacı yok: telefonlar zaten E.164 yazılı ve tek beklenti "varsa dokunma, yoksa taslak aç"
    // (idempotent). Bu yüzden doğrudan arama + ekleme; iş kuralı burada hesaplanmıyor (STACK §4).
    if (await profiles.findByPhone(c.phone)) {
      console.log(`  · ${c.name} (zaten var)`);
      continue;
    }
    await profiles.insert({ ...c, type: 'type' in c ? c.type : 'individual', roles: ['customer'], isDraft: true });
    created += 1;
    console.log(`  ✓ ${c.name} (taslak açıldı)`);
  }
  console.log(`✓ taslak müşteri: ${created} yeni / ${DRAFT_CUSTOMERS.length} tanım`);
}

// ── Müşteri kartları + personel (04) ─────────────────────────────────────────────────────────────
// Ticari alanlar (vade, limit, kapıda ödeme, KDV no, indirim) checkout'un ödeme seçeneklerini
// belirler — hepsi aynı satırdadır (user_profiles). Kanal SAKLANMAZ: `companyInfo` varlığından
// türetilir, o yüzden B2B kartlarında künye dolu, B2C'de null.
//
// ADMIN SEED'LENMEZ: 0002 trigger'ı "hiç admin yoksa ilk giren admin olur" der; buraya admin rolü
// koymak o bootstrap'ı sessizce kapatırdı. Depo/kurye/muhasebe rolleri bootstrap'ı engellemez.

interface SeedKisi {
  key: string;
  /** Yalnız dev admin'de sabit: bypass kimliğiyle AYNI olmak zorunda (bkz. `DEV_ADMIN_PROFILE_ID`). */
  id?: string;
  name: string;
  email: string;
  phone: string;
  roles: ('customer' | 'admin' | 'warehouse' | 'courier' | 'accounting')[];
  /**
   * Depo kapsamı (DOMAIN §17) — rolün ikinci ekseni: ne yapar × NEREDE yapar. Depocu ve kurye
   * kapsamsız OLAMAZ (DB kısıtı); admin ve muhasebe depo-üstüdür, kapsamı hiç okunmaz.
   * Değer `Depolar` anahtarıdır; gerçek kimlik seed sırasında çözülür.
   */
  depolar?: (keyof Depolar)[];
  type?: 'individual' | 'company';
  country?: 'FR' | 'DE';
  preferredLanguage?: 'tr' | 'fr' | 'de';
  companyInfo?: { legalName: string; siret?: string; activityCode?: string; foundedYear?: number; isActive?: boolean };
  vatNumber?: string;
  vatNumberValid?: boolean;
  b2bApproved?: boolean;
  creditEnabled?: boolean;
  /** Vade tavanı — CENT (02.9 profil dilimi). 250000 = 2.500,00 €. */
  creditLimitCents?: number;
  paymentTermDays?: number;
  discountPercent?: number;
  codAllowed?: boolean;
  marketingConsent?: { email?: { granted: boolean; at?: string; source?: string } };
  note?: string;
}

const KISILER: SeedKisi[] = [
  // — B2B: onaylı, vadeli, indirimli. Açık bakiye/gecikme testinin öznesi.
  {
    key: 'b2bOnayli',
    name: 'Restaurant Bosphore',
    email: 'compta@bosphore-strasbourg.fr',
    phone: '+33388221100',
    roles: ['customer'],
    type: 'company',
    // TÜRKÇE müşteri — siparişin dili müşteriden kopyalanır (`order.locale`). Bu satır olmadan
    // yerelde hiç `tr` sipariş doğmuyor ve üç dilli mail/belge yolunun üçte biri hiç görülmüyordu.
    preferredLanguage: 'tr',
    companyInfo: { legalName: 'SARL BOSPHORE', siret: '81234567800019', activityCode: '5610A', foundedYear: 2015, isActive: true },
    vatNumber: 'FR81812345678',
    vatNumberValid: true,
    b2bApproved: true,
    creditEnabled: true,
    creditLimitCents: 250000,
    paymentTermDays: 30,
    discountPercent: 5,
    codAllowed: true,
    marketingConsent: { email: { granted: true, at: an(-120), source: 'b2b-kayit' } },
    note: 'Haftalık düzenli alım; perşembe rotası.',
  },
  // — B2B: kaydolmuş ama ONAY BEKLİYOR. Toptan fiyatı görmemeli (b2bApproved=false).
  {
    key: 'b2bBekleyen',
    name: 'Épicerie Anatolia',
    email: 'contact@epicerie-anatolia.fr',
    phone: '+33390445566',
    roles: ['customer'],
    type: 'company',
    companyInfo: { legalName: 'EPICERIE ANATOLIA SAS', siret: '90011223300017', activityCode: '4711B', foundedYear: 2023, isActive: true },
    vatNumber: 'FR90900112233',
    vatNumberValid: null as unknown as undefined, // hiç sorulmadı — VIES çağrısı yapılmamış
    b2bApproved: false,
    codAllowed: true,
    note: 'Self-servis B2B kaydı — onay bekliyor.',
  },
  // — B2B Almanya: yurt içi DEĞİL, reverse charge adayı (geçerli KDV no).
  {
    key: 'b2bAlman',
    name: 'Anadolu Markt Kehl GmbH',
    email: 'einkauf@anadolu-markt.de',
    phone: '+4978519900',
    roles: ['customer'],
    type: 'company',
    country: 'DE',
    preferredLanguage: 'de',
    companyInfo: { legalName: 'Anadolu Markt Kehl GmbH', foundedYear: 2019, isActive: true },
    vatNumber: 'DE811234567',
    vatNumberValid: true,
    b2bApproved: true,
    creditEnabled: true,
    creditLimitCents: 120000,
    paymentTermDays: 14,
    codAllowed: false,
    note: 'Sınır ötesi B2B — reverse charge.',
  },
  // — B2C: sık alan, rota içi, pazarlama izinli.
  {
    key: 'b2cSadik',
    name: 'Claire Weber',
    email: 'claire.weber@example.fr',
    phone: '+33677889900',
    roles: ['customer'],
    preferredLanguage: 'fr',
    codAllowed: true,
    marketingConsent: { email: { granted: true, at: an(-200), source: 'checkout' } },
  },
  // — B2C: kapıda ödemesi KAPALI (geçmişte teslim alınmayan sipariş). Ödeme seçeneği testi.
  {
    key: 'b2cKapaliKapida',
    name: 'Julien Fischer',
    email: 'julien.fischer@example.fr',
    phone: '+33655443322',
    roles: ['customer'],
    preferredLanguage: 'fr',
    codAllowed: false,
    note: 'Kapıda ödeme kapatıldı: iki sipariş kapıda teslim alınmadı.',
  },
  // — B2C Almanya: OSS eşiği izlemi (DE B2C teslimatı).
  {
    key: 'b2cAlman',
    name: 'Sabine Krüger',
    email: 'sabine.krueger@example.de',
    phone: '+4917612345678',
    roles: ['customer'],
    country: 'DE',
    preferredLanguage: 'de',
    codAllowed: true,
  },
  // — Dev admin: auth bypass'ının GERÇEK profil satırı (`apps/web/lib/guard.ts`). Id sabittir ve
  //   bypass kimliğiyle aynıdır; aksi halde operasyon ekranı ilk durum geçişini yazarken
  //   `actor_id` FK'sinden düşerdi. E-posta kimsenin giriş yapmayacağı bir yerel adres.
  { key: 'devAdmin', id: DEV_ADMIN_PROFILE_ID, name: 'Dev Admin (bypass)', email: 'dev-admin@lezzet.local', phone: '+33600000100', roles: ['admin'], preferredLanguage: 'tr' },
  // — YÖNETİCİ: web bypass'ının dev admin'inden AYRI ve bilerek (21.32). Bypass hiç giriş yapmaz,
  //   bu hesap yapar: mobilde bypass yoktur, personel gerçek oturumla girer. Ayrılığın ÖLÇÜLMÜŞ
  //   sebebi adres: `dev-admin@lezzet.local` ile `generateLink` ilk denemede reddedildi (`.local`
  //   uzantısı), gerçek alan adlı personel adreslerinin altısı da ilk denemede geçti. Bypass'ın
  //   e-postasını değiştirmek ise seçenek değil — kimliği webin guard'ına sabit bağlı.
  { key: 'yonetici', name: 'Selin Kaya', email: 'yonetim@lezzetanatolia.fr', phone: '+33600000104', roles: ['admin'], preferredLanguage: 'tr' },
  // — Personel: operasyon rolleri. Sipariş geçişlerinin AKTÖRÜ ve kuryesi bunlar.
  // Depocu TEK depoya bağlı: ekranında depo seçici görmez, kendi deposunun kuyruğunu görür.
  { key: 'depocu', name: 'Deniz Arslan', email: 'depo@lezzetanatolia.fr', phone: '+33600000101', roles: ['warehouse'], depolar: ['str'], preferredLanguage: 'tr' },
  { key: 'kurye', name: 'Marc Lemoine', email: 'kurye@lezzetanatolia.fr', phone: '+33600000102', roles: ['courier'], depolar: ['str'], preferredLanguage: 'fr' },
  // Çoklu operasyon rolü olağandır (DOMAIN §2): depo + muhasebe aynı kişide olabilir.
  // Kapsamı İKİ depo: ekranda kapsamıyla sınırlı depo seçici görür — sistem onun yerine varsayılan
  // seçmez (C2). Tek depolu bir seed'de bu ekran hiç denenemezdi.
  { key: 'muhasebe', name: 'Ayşe Demir', email: 'muhasebe@lezzetanatolia.fr', phone: '+33600000103', roles: ['accounting', 'warehouse'], depolar: ['str', 'kehl'], preferredLanguage: 'tr' },
  // — YALNIZ İKİNCİ DEPOYU gören personel. Depo kapsamı bir yetki sınırıdır ve o sınır ancak
  //   kapsamı DAR birisi varsa denenebilir: herkes ana depoyu (ya da ikisini birden) görüyorsa,
  //   kapsamı hiç uygulamayan bir sorgu da doğru cevap verir. Kehl'e ait kuyruğu, stoğu ve kabul
  //   bekleyen sevkiyatı bu kişi görmeli; Strasbourg'unkileri GÖRMEMELİ.
  { key: 'depocuKehl', name: 'Jonas Weber', email: 'depo.kehl@lezzetanatolia.fr', phone: '+4978519901', roles: ['warehouse'], depolar: ['kehl'], country: 'DE', preferredLanguage: 'de' },
  // Sınır ötesi rotanın kuryesi — kapsamı da Kehl. Kurye kapsamsız olamaz (DB kısıtı).
  { key: 'kuryeKehl', name: 'Stefan Bauer', email: 'kurye.kehl@lezzetanatolia.fr', phone: '+4978519902', roles: ['courier'], depolar: ['kehl'], country: 'DE', preferredLanguage: 'de' },
];


/** Kartları açar (varsa dokunmaz) ve `key → profil id` haritasını döner. */
// **Bu bölüm `base` katmanında HİÇ KOŞMAZ** (kullanıcı kararı 16.08): buradaki altı kişi de uydurma
// ve `seedStaffLogins` onlara giriş hesabı açıyor — üretime gitseydi bilinen e-postalarla sahte
// hesaplar açılmış olurdu. Gerçek personeli üretimde operatör kurar. Künye `seed/tier.ts`.
export async function seedKisiler(db: Db, depolar: Depolar): Promise<Kisiler> {
  const profiles = new UserProfileService(db);
  const harita: Kisiler = new Map();
  console.log('▸ MÜŞTERİ KARTI + PERSONEL seed');

  for (const k of KISILER) {
    const mevcut = await profiles.findByEmail(k.email);
    if (mevcut) {
      harita.set(k.key, mevcut.id);
      continue;
    }
    const { key, note, depolar: kapsam, ...alanlar } = k;
    const created = await profiles.insert({
      ...alanlar,
      warehouseIds: (kapsam ?? []).map((d) => depolar[d]),
      type: k.type ?? 'individual',
      country: k.country ?? 'FR',
      preferredLanguage: k.preferredLanguage ?? 'fr',
      isDraft: false,
    });
    harita.set(key, created.id);
    console.log(`  ✓ ${k.name} · ${k.roles.join('+')}${note ? ` · ${note}` : ''}`);
  }
  console.log(`✓ kişi: ${harita.size} kart (dev admin dâhil — gerçek hesabı admin yapmak: pnpm set-role <e-posta> admin)`);
  return harita;
}

// ── Personelin GİRİŞ hesapları (21.32) ───────────────────────────────────────────────────────────

/**
 * Personel profillerine `auth.users` satırı açar — yani personel gerçekten GİRİŞ YAPABİLİR olur.
 *
 * ── NEDEN SEED'İN İŞİ ────────────────────────────────────────────────────────
 * `db:refresh` = `supabase db reset && seed`, yani `auth.users` da siliniyor. Bağ elle kurulursa
 * her sıfırlamada kayboluyordu ve operasyon yüzeyi yerelde denenemez hâle geliyordu (kullanıcı
 * bulgusu 11.08: *"operasyon tarafına giriş yapamadım"*). Profil satırları zaten seed'in malı;
 * giriş hesabının da burada doğması, "yenilemeden sonra çalışır" sözünü tek yerde tutuyor.
 *
 * ── ROLLERİ BOZMAZ ──────────────────────────────────────────────────────────
 * Satırı biz bağlamıyoruz, `0002` trigger'ı bağlıyor: yeni auth kullanıcısı e-postayla eşleşen ve
 * `auth_user_id`'si boş olan profili bulup kendine bağlar, rolüne DOKUNMAZ. Ölçüldü (11.08):
 * `kurye@lezzetanatolia.fr` bağlandıktan sonra `/me` `roles: ['courier']` döndü, `/courier/day`
 * 200, `/warehouse/preparation` 403. Trigger'ın "ilk hesap admin olur" bootstrap'ı da tetiklenmez:
 * bu fonksiyon `seedKisiler`den SONRA koşar ve o an admin rollü profil zaten vardır.
 *
 * ── MÜŞTERİ HESABI AÇILMAZ ──────────────────────────────────────────────────
 * Yalnız personel: müşterinin girişi OTP akışının kendisidir ve o akış test edilirken hazır bir
 * auth satırı, sınanan şeyin yarısını atlatırdı. Dev girişinin müşteri düğmesi de gerçek bir
 * hesaba (kullanıcının kendi adresine) basar, seed'in ürettiği bir hesaba değil.
 *
 * İdempotent: bağlı profil atlanır, yani seed tekrar tekrar koşabilir.
 */
export async function seedStaffLogins(db: Db): Promise<void> {
  const profiles = new UserProfileService(db);
  console.log('▸ PERSONEL GİRİŞ HESABI seed');
  let created = 0;
  let skipped = 0;

  for (const k of KISILER) {
    if (k.roles.every((role) => role === 'customer')) continue;
    /* `.local` uzantısı ELENİR: `generateLink`/`createUser` onu reddedebiliyor (ölçüldü 11.08 —
       `dev-admin@lezzet.local` ilk denemede düştü). O hesap zaten webin auth'suz bypass'ının
       profil satırı; giriş yapması hiç beklenmiyor (mobilin yöneticisi `yonetici` anahtarı). */
    if (k.email.endsWith('.local')) continue;

    const mevcut = await profiles.findByEmail(k.email);
    if (mevcut?.authUserId) {
      skipped += 1;
      continue;
    }

    // `email_confirm` şart: onaysız kullanıcı giriş yapamaz ve yerelde onay maili diye bir şey yok.
    const { error } = await db.auth.admin.createUser({ email: k.email, email_confirm: true });
    if (error) {
      // SESSİZ GEÇİLMEZ (CLAUDE §1): giriş hesabı açılmadıysa o rol yerelde denenemez ve bunu
      // ancak deneyen fark eder. Seed'i kesmiyoruz — kalan roller yine açılsın.
      console.log(`  ! ${k.email} · giriş hesabı AÇILAMADI: ${error.message}`);
      continue;
    }
    created += 1;
    console.log(`  ✓ ${k.email} · ${k.roles.join('+')} — giriş açıldı`);
  }

  console.log(`✓ personel girişi: ${created} yeni / ${skipped} zaten bağlı`);
}

