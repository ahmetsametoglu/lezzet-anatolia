import { CustomerPhoneService, UserProfileService } from '@lezzet/database';
import type { CustomerPriceBasis, UserProfile } from '@lezzet/types';
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
  const phones = new CustomerPhoneService(db);
  console.log('▸ TASLAK MÜŞTERİ seed');
  let created = 0;
  for (const c of DRAFT_CUSTOMERS) {
    // Varlık ölçütü kanıt defteridir (`customer_phone`), çünkü `user_profiles.phone` tekil değil; kimlik çözümü motorun işi,
    // seed yalnız "varsa dokunma, yoksa taslak aç" der.
    if (await phones.findActive(c.phone)) {
      console.log(`  · ${c.name} (zaten var)`);
      continue;
    }
    const profile = await profiles.insert({ ...c, type: 'type' in c ? c.type : 'individual', roles: ['customer'], isDraft: true });
    // Taslağın geldiği yer WhatsApp: numarası kanıtlıdır, yoksa seed'in kurduğu sohbetler kimliksiz
    // kalır ve gelen kutusu ekranı hiç bağlı sohbet göstermezdi.
    await phones.recordProof(profile.id, c.phone);
    created += 1;
    console.log(`  ✓ ${c.name} (taslak açıldı)`);
  }
  console.log(`✓ taslak müşteri: ${created} yeni / ${DRAFT_CUSTOMERS.length} tanım`);
}

// ── Müşteri kartları + personel ──────────────────────────────────────────────────────────────────
// B2B kimliği (ad, SIRET, KDV no) gerçek kamu kayıtlarından ve VIES'te doğrulandı, çünkü kart bunları dış dünyaya sorar;
// iletişim kanalı uydurmadır (`@example.*`) ki gerçek işletmeye mail gitmesin.

// Olumsuz anlatı gerçek şirkete bağlanmaz. Admin seed'lenmez, çünkü `0002` "hiç admin yoksa ilk giren admin" açılışını kapatırdı.

interface SeedKisi {
  key: string;
  name: string;
  email: string;
  phone: string;
  roles: ('customer' | 'admin' | 'warehouse' | 'courier' | 'accounting')[];
  /**
   * Depo kapsamı (DOMAIN §17); depocu ve kurye kapsamsız olamaz. Değer `Depolar` anahtarıdır.
   */
  depolar?: (keyof Depolar)[];
  type?: 'individual' | 'company';
  country?: 'FR' | 'DE';
  preferredLanguage?: 'tr' | 'fr' | 'de';
  companyInfo?: { legalName: string; siret?: string; activityCode?: string; foundedYear?: number; isActive?: boolean };
  vatNumber?: string;
  vatNumberValid?: boolean;
  /** Doğrulamanın yaşı — onay kartının "taze / bayat" ayrımının kovası (`b2b-approval`). */
  vatNumberCheckedAt?: string;
  b2bApproved?: boolean;
  creditEnabled?: boolean;
  /** Vade tavanı, cent (250000 = 2 500 €). */
  creditLimitCents?: number;
  paymentTermDays?: number;
  priceRuleBasis?: CustomerPriceBasis;
  priceRulePercent?: number;
  codAllowed?: boolean;
  /** Gel-al izni — depodan teslim yalnız işaretli müşteriye sunulur; besleme iki kişide açar ki kapı iki kanalda da denensin. */
  pickupAllowed?: boolean;
  marketingConsent?: { email?: { granted: boolean; at?: string; source?: string } };
  note?: string;
}

const KISILER: SeedKisi[] = [
  // — B2B: onaylı, vadeli, indirimli. Açık bakiye/gecikme testinin öznesi.
  {
    key: 'b2bOnayli',
    name: 'Restaurant Oberjaegerhof',
    email: 'compta.oberjaegerhof@example.fr',
    phone: '+33388221100',
    roles: ['customer'],
    type: 'company',
    // TÜRKÇE müşteri — siparişin dili müşteriden kopyalanır (`order.locale`). Bu satır olmadan
    // yerelde hiç `tr` sipariş doğmuyor ve üç dilli mail/belge yolunun üçte biri hiç görülmüyordu.
    preferredLanguage: 'tr',
    companyInfo: { legalName: 'RESTAURANT OBERJAEGERHOF', siret: '38790452700018', activityCode: '56.10A', foundedYear: 1992, isActive: true },
    vatNumber: 'FR34387904527',
    vatNumberValid: true,
    // TAZE doğrulama kovası — kart "Geçerli · N gün önce" der ve yeşil kalır.
    vatNumberCheckedAt: an(-3),
    b2bApproved: true,
    creditEnabled: true,
    creditLimitCents: 250000,
    paymentTermDays: 30,
    priceRuleBasis: 'list',
    priceRulePercent: 5,
    codAllowed: true,
    pickupAllowed: true,
    marketingConsent: { email: { granted: true, at: an(-120), source: 'b2b-kayit' } },
    note: 'Haftalık düzenli alım; perşembe rotası.',
  },
  // — B2B: kaydolmuş ama ONAY BEKLİYOR. Toptan fiyatı görmemeli (b2bApproved=false).
  {
    key: 'b2bBekleyen',
    name: 'Épicerie Madame',
    email: 'contact.epicerie-madame@example.fr',
    phone: '+33390445566',
    roles: ['customer'],
    type: 'company',
    companyInfo: { legalName: 'EPICERIE MADAME', siret: '82532201900043', activityCode: '47.11B', foundedYear: 2017, isActive: true },
    vatNumber: 'FR38825322019',
    vatNumberValid: null as unknown as undefined, // hiç sorulmadı — VIES çağrısı yapılmamış
    b2bApproved: false,
    codAllowed: true,
    note: 'Self-servis B2B kaydı — onay bekliyor.',
  },
  // — B2B Almanya: yurt içi DEĞİL, reverse charge adayı (geçerli KDV no).
  {
    key: 'b2bAlman',
    name: 'Vihado Kehl',
    email: 'einkauf.vihado@example.de',
    phone: '+4978519900',
    roles: ['customer'],
    type: 'company',
    country: 'DE',
    preferredLanguage: 'de',
    // Almanya'da resmî kayıt SORGUSU YOK (Fransa'nın `recherche-entreprises`i gibi anahtarsız bir
    // uç bulunmuyor) — künye elle giriliyor ve `isActive` bilerek boş: kartın "Sinyal yok (DE)"
    // hâli buradan doğuyor. Kaynak şirketin kendi künye (Impressum) sayfası, yani kamuya açık.
    companyInfo: { legalName: 'Vihado GmbH & Co. KG', foundedYear: 2019, isActive: true },
    // Alman kaydında gerçek numara zorunlu, çünkü ters yükümlülük (%0 KDV) dalı yalnız geçerli numarada koşar; kaynak şirketin
    // künyesidir (Vihado, Kehl) ve VIES'in DE düğümü kapalıyken doğrulanamadığı için ilk kart açılışında damgalanır.
    vatNumber: 'DE315300442',
    vatNumberValid: true,
    // Bayat doğrulama: geçen yıl doğrulanmış numara, kart "bayat" der.
    vatNumberCheckedAt: an(-400),
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
    // Giriş hesabı olan tek müşteri (`GIRIS_ACILAN_MUSTERI`): gel-al kartı web ve native checkout'ta onunla görülür.
    pickupAllowed: true,
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
  // Yönetici: operasyonun tek admin'i ve seed'in aktörü; web ve mobil hızlı girişin yöneticisi.
  { key: 'yonetici', name: 'Selin Kaya', email: 'yonetim@lezzetanatolie.com', phone: '+33600000104', roles: ['admin'], preferredLanguage: 'tr' },
  // Personel operasyon rolleri, sipariş geçişlerinin aktörü. Depocu tek kapsamlıdır, çünkü mobil depo bölümü çok kapsamlı
  // depocuda kilitlenir; çok kapsamlı hâl `muhasebe` hesabında denenir.
  { key: 'depocu', name: 'Deniz Arslan', email: 'depo@lezzetanatolie.com', phone: '+33600000101', roles: ['warehouse'], depolar: ['str'], preferredLanguage: 'tr' },
  { key: 'depocuBordeaux', name: 'Claire Muller', email: 'depo.bordeaux@lezzetanatolie.com', phone: '+33600000105', roles: ['warehouse'], depolar: ['bdx'], preferredLanguage: 'fr' },
  // Kurye kapsamı tek tesis ({str}): kurye rotaları kapsamla süzülür ve dört hattın dördü de STR'ye bağlı. Araç deposu
  // kapsamda değil, çünkü yerinde satış aracı seferden çözer (`vehicleWarehouseOf`).
  { key: 'kurye', name: 'Marc Lemoine', email: 'kurye@lezzetanatolie.com', phone: '+33600000102', roles: ['courier'], depolar: ['str'], preferredLanguage: 'fr' },
  // Çoklu operasyon rolü ve iki depo kapsamı: depo seçicinin kapsamla sınırlı hâli burada denenir.
  { key: 'muhasebe', name: 'Ayşe Demir', email: 'muhasebe@lezzetanatolie.com', phone: '+33600000103', roles: ['accounting', 'warehouse'], depolar: ['str', 'kehl'], preferredLanguage: 'tr' },
  // Yalnız ikinci depoyu gören personel, çünkü kapsam sınırı ancak kapsamı dar biri varsa denenebilir.
  { key: 'depocuKehl', name: 'Jonas Weber', email: 'depo.kehl@lezzetanatolie.com', phone: '+4978519901', roles: ['warehouse'], depolar: ['kehl'], country: 'DE', preferredLanguage: 'de' },
  // Dört bölümü de gören hesap, sekme çubuğunun dolu hâli için; kapsamı kuryeninkiyle aynı.
  { key: 'hepsi', name: 'Emre Yıldız', email: 'hepsi@lezzetanatolie.com', phone: '+33600000106', roles: ['admin', 'warehouse', 'courier', 'accounting'], depolar: ['str'], preferredLanguage: 'tr' },
  // Sınır ötesi rotanın kuryesi — kapsamı da Kehl. Kurye kapsamsız olamaz (DB kısıtı).
  { key: 'kuryeKehl', name: 'Stefan Bauer', email: 'kurye.kehl@lezzetanatolie.com', phone: '+4978519902', roles: ['courier'], depolar: ['kehl'], country: 'DE', preferredLanguage: 'de' },
];


const ayniKume = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/**
 * "Zaten var" yetmez, kimliğin doğru olduğu da doğrulanır: e-postadan açılmış yabancı bir profil seed'in kişisi sanılabilir.
 * Seed'in sahip olduğu ad, roller ve depo kapsamı onarılır ve her onarım basılır.
 */
async function onarSapan(profiles: UserProfileService, mevcut: UserProfile, k: SeedKisi, depolar: Depolar): Promise<string[]> {
  const beklenenKapsam = (k.depolar ?? []).map((d) => depolar[d]);
  const sapma: string[] = [];
  if ((mevcut.name ?? '') !== k.name) sapma.push(`ad "${mevcut.name || '(boş)'}" → "${k.name}"`);
  if (!ayniKume(mevcut.roles, k.roles)) sapma.push(`rol {${mevcut.roles.join(',')}} → {${k.roles.join(',')}}`);
  if (!ayniKume(mevcut.warehouseIds, beklenenKapsam)) sapma.push(`depo kapsamı ${mevcut.warehouseIds.length} → ${beklenenKapsam.length} depo`);
  if (sapma.length === 0) return sapma;

  await profiles.update({ id: mevcut.id, name: k.name, roles: k.roles, warehouseIds: beklenenKapsam });
  return sapma;
}

/** Kartları açar (varsa tanıma uydurur) ve `key → profil id` haritasını döner. */
// `base` katmanında koşmaz, çünkü uydurma kişilere giriş hesabı açılır; gerçek personeli üretimde operatör kurar.
export async function seedKisiler(db: Db, depolar: Depolar): Promise<Kisiler> {
  const profiles = new UserProfileService(db);
  const harita: Kisiler = new Map();
  console.log('▸ MÜŞTERİ KARTI + PERSONEL seed');

  for (const k of KISILER) {
    const mevcut = await profiles.findByEmail(k.email);
    if (mevcut) {
      harita.set(k.key, mevcut.id);
      const onarilan = await onarSapan(profiles, mevcut, k, depolar);
      if (onarilan.length > 0) console.log(`  ⟳ ${k.email} · profil ONARILDI: ${onarilan.join(' · ')}`);
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
  console.log(`✓ kişi: ${harita.size} kart (gerçek hesabı admin yapmak: pnpm set-role <e-posta> admin)`);
  return harita;
}

// ── Personelin giriş hesapları ───────────────────────────────────────────────────────────────────

/**
 * Personel profillerine ve dev girişinin müşterisine `auth.users` satırı açar ki `db:refresh` sonrası giriş yapılabilsin; bağı
 * `0002` kurar ve rollere dokunmaz. Müşteri en dolu hâli gösteren `b2cSadik`tir; işlem idempotenttir.
 */
const GIRIS_ACILAN_MUSTERI = 'claire.weber@example.fr';
export async function seedStaffLogins(db: Db): Promise<void> {
  const profiles = new UserProfileService(db);
  console.log('▸ GİRİŞ HESABI seed (personel + bir müşteri)');
  let created = 0;
  let skipped = 0;

  for (const k of KISILER) {
    // Personelin tamamı + adı geçen TEK müşteri. Öteki müşteriler auth'suz kalır ve bilerek: OTP
    // akışı ancak hazır hesabı OLMAYAN biriyle sınanabilir.
    const girisAcilir = k.roles.some((role) => role !== 'customer') || k.email === GIRIS_ACILAN_MUSTERI;
    if (!girisAcilir) continue;

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

  console.log(`✓ giriş hesabı: ${created} yeni / ${skipped} zaten bağlı`);
}

