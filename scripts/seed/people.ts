import { UserProfileService } from '@lezzet/database';
import { DEV_ADMIN_PROFILE_ID } from '@lezzet/types';
import { an, type Db, type Kisiler } from './shared';

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
  type?: 'individual' | 'company';
  country?: 'FR' | 'DE';
  preferredLanguage?: 'tr' | 'fr' | 'de';
  companyInfo?: { legalName: string; siret?: string; activityCode?: string; foundedYear?: number; isActive?: boolean };
  vatNumber?: string;
  vatNumberValid?: boolean;
  b2bApproved?: boolean;
  creditEnabled?: boolean;
  creditLimit?: number;
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
    companyInfo: { legalName: 'SARL BOSPHORE', siret: '81234567800019', activityCode: '5610A', foundedYear: 2015, isActive: true },
    vatNumber: 'FR81812345678',
    vatNumberValid: true,
    b2bApproved: true,
    creditEnabled: true,
    creditLimit: 2500,
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
    creditLimit: 1200,
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
  // — Personel: operasyon rolleri. Sipariş geçişlerinin AKTÖRÜ ve kuryesi bunlar.
  { key: 'depocu', name: 'Deniz Arslan', email: 'depo@lezzetanatolia.fr', phone: '+33600000101', roles: ['warehouse'], preferredLanguage: 'tr' },
  { key: 'kurye', name: 'Marc Lemoine', email: 'kurye@lezzetanatolia.fr', phone: '+33600000102', roles: ['courier'], preferredLanguage: 'fr' },
  // Çoklu operasyon rolü olağandır (DOMAIN §2): depo + muhasebe aynı kişide olabilir.
  { key: 'muhasebe', name: 'Ayşe Demir', email: 'muhasebe@lezzetanatolia.fr', phone: '+33600000103', roles: ['accounting', 'warehouse'], preferredLanguage: 'tr' },
];


/** Kartları açar (varsa dokunmaz) ve `key → profil id` haritasını döner. */
export async function seedKisiler(db: Db): Promise<Kisiler> {
  const profiles = new UserProfileService(db);
  const harita: Kisiler = new Map();
  console.log('▸ MÜŞTERİ KARTI + PERSONEL seed');

  for (const k of KISILER) {
    const mevcut = await profiles.findByEmail(k.email);
    if (mevcut) {
      harita.set(k.key, mevcut.id);
      continue;
    }
    const { key, note, ...alanlar } = k;
    const created = await profiles.insert({
      ...alanlar,
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

