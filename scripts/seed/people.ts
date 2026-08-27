import { CustomerPhoneService, UserProfileService } from '@lezzet/database';
import type { UserProfile } from '@lezzet/types';
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
    // Kimlik ÇÖZÜMÜ (bağlan / oluştur / çakışma) motorun işidir — servis yalnız aday getirir. Seed'in
    // ona ihtiyacı yok: telefonlar zaten E.164 yazılı ve tek beklenti "varsa dokunma, yoksa taslak aç"
    // (idempotent). Bu yüzden doğrudan arama + ekleme; iş kuralı burada hesaplanmıyor (STACK §4).
    //
    // Varlık ölçütü KANIT DEFTERİ (04.10): bu kayıtlar WhatsApp'tan gelmiş sayılıyor, yani kimlikleri
    // `customer_phone` satırında yaşıyor. `user_profiles.phone` artık tekil değil — oradan aramak
    // "zaten var mı" sorusuna güvenilir cevap vermezdi.
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

// ── Müşteri kartları + personel (04) ─────────────────────────────────────────────────────────────
// Ticari alanlar (vade, limit, kapıda ödeme, KDV no, indirim) checkout'un ödeme seçeneklerini
// belirler — hepsi aynı satırdadır (user_profiles). Kanal SAKLANMAZ: `companyInfo` varlığından
// türetilir, o yüzden B2B kartlarında künye dolu, B2C'de null.
//
// ADMIN SEED'LENMEZ: 0002 trigger'ı "hiç admin yoksa ilk giren admin olur" der; buraya admin rolü
// koymak o bootstrap'ı sessizce kapatırdı. Depo/kurye/muhasebe rolleri bootstrap'ı engellemez.

interface SeedKisi {
  key: string;
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
  /** Doğrulamanın yaşı — onay kartının "taze / bayat" ayrımının kovası (`b2b-approval`). */
  vatNumberCheckedAt?: string;
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
    // ── NUMARA GERÇEK VE GEÇERLİ, ve bu ÖLÇÜLEREK seçildi (27.08) ──────────────────────────────
    // Buradaki numara `FR81812345678` idi, yani uydurma. Zararsız görünüyordu ama onay kartı artık
    // VIES'i kart açılışında SORUYOR: ilk açılışta uydurma numara `Geçersiz` damgalanıyor ve
    // satıra `false` yazılıyor (ölçüldü — üç seed müşterisinin üçü de bir turda kırmızıya döndü).
    // Sonuç, kartın NORMAL hâlinin yerelde hiç görülememesiydi: her B2B başvurusu "Geçersiz".
    // Seed'in ürettiği hâl, dış dünyanın söylediğiyle çelişmemeli — yoksa kova bir kez bakılınca
    // buharlaşır. `FR27552032534` VIES'te VALID (ölçüldü 27.08); kamuya açık bir işletme numarası,
    // kişisel veri değil ve ekranda hiçbir yerde gösterilmiyor (yalnız bayrak okunuyor).
    vatNumber: 'FR27552032534',
    vatNumberValid: true,
    // TAZE doğrulama kovası — kart "Geçerli · N gün önce" der ve yeşil kalır.
    vatNumberCheckedAt: an(-3),
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
    // Gerçek ve geçerli (VIES'te VALID, ölçüldü 27.08) — gerekçe `b2bOnayli` satırında.
    // ALMAN kaydında ayrıca ZORUNLU: ters yükümlülüğü (%0 KDV) açan tek yol bu bayrak ve o dal
    // yalnız DE + b2b + geçerli numarada koşuyor. Uydurma numarayla checkout'un reverse charge
    // dalı yerelde hiç denenemezdi.
    vatNumber: 'DE129274202',
    vatNumberValid: true,
    // BAYAT doğrulama kovası (27.08): geçen yıl doğrulanmış numara. Kart "bayat" der ve sararır —
    // ters yükümlülüğü açan bayrağın yaşlanabildiği tek yerde bu hâl görülebilsin.
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
  // — YÖNETİCİ: operasyonun tek admin'i ve seed'in AKTÖRÜ (sipariş geçişleri, kapatılan hata
  //   kaydı). 21.32'de bunun yanında bir `dev-admin@lezzet.local` satırı daha vardı — webin auth
  //   bypass'ının gerçek profiliydi ve ondan AYRI durmak zorundaydı, çünkü `.local` uzantılı adres
  //   `generateLink`ten geçmiyordu (yani o hesap hiç giriş yapamıyordu, zaten yapmasına da gerek
  //   yoktu: bypass auth'u atlıyordu). Bypass 19.08'de söküldü (`apps/web/lib/guard.ts` künyesi),
  //   o satır da onunla birlikte gitti. Geriye giriş YAPABİLEN tek admin kaldı — hem web hem mobil
  //   hızlı-giriş kapılarının yöneticisi bu.
  { key: 'yonetici', name: 'Selin Kaya', email: 'yonetim@lezzetanatolia.fr', phone: '+33600000104', roles: ['admin'], preferredLanguage: 'tr' },
  // — Personel: operasyon rolleri. Sipariş geçişlerinin AKTÖRÜ ve kuryesi bunlar.
  // Depocu TEK depoya bağlı: ekranında depo seçici görmez, kendi deposunun kuyruğunu görür.
  // **Depocu TEK kapsamlı, Colmar'ın depocusu AYRI** (düzeltme 22.08, cihazda ölçüldü): 19.25 bir
  // gün depocuya çift kapsam vermişti (str+colmar) ve mobil depo bölümü ÇOK kapsamlı depocuda
  // kapanıyor — depo seçim listesi uçtan henüz gelmiyor, ekran bunu dürüstçe söylüyor ama bölüm
  // fiilen kilitli kalıyordu. Günlük hâl zaten tek depodur (v2: "DEPO · STRASBOURG (SABİT)");
  // Colmar kendi depocusunu aldı — hazırlık ekranının personel şartı (setup gap) da böyle dolu
  // kalıyor. Çok kapsamlı DEPO ROLÜ hâli kaybolmadı: `muhasebe` (accounting+warehouse, str+kehl)
  // o ekran hâlini taşımaya devam ediyor.
  //
  // **Kurye ÇİFT kapsamlı KALIR** (19.25): kurye akışı rota SEÇİMLİ (K1) — çok kapsam onu
  // kilitlemez, Colmar rotasının koşulabilmesi için şarttır (11.7: kapsam dışı rota görünmez).
  { key: 'depocu', name: 'Deniz Arslan', email: 'depo@lezzetanatolia.fr', phone: '+33600000101', roles: ['warehouse'], depolar: ['str'], preferredLanguage: 'tr' },
  { key: 'depocuColmar', name: 'Claire Muller', email: 'depo.colmar@lezzetanatolia.fr', phone: '+33600000105', roles: ['warehouse'], depolar: ['colmar'], preferredLanguage: 'fr' },
  // Kapsama ARAÇ da girdi (26.08 · 21.119): yerinde satışın depo çözümü kuryenin kapsamındaki tek
  // araçtır (`sale.ts` `courierVehicleFirst`) — araçsız kuryede satış ekranı hiç açılamaz (ölçüldü:
  // {str, colmar} kapsamı `400 warehouse_required` veriyordu). Tesisler rota seçimi için kalır.
  { key: 'kurye', name: 'Marc Lemoine', email: 'kurye@lezzetanatolia.fr', phone: '+33600000102', roles: ['courier'], depolar: ['str', 'colmar', 'van'], preferredLanguage: 'fr' },
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


const ayniKume = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/**
 * **"Zaten var" YETMEZ — kimliğin DOĞRU olduğu da doğrulanır** (mobil şeridin bulgusu 26.08).
 *
 * `findByEmail` bir satır döndürdüğünde seed bugüne dek onu koşulsuz benimsiyordu. Satırın seed'in
 * kendi kişisi olduğu bir VARSAYIMDI ve bir kez yanlış çıktı: `db:refresh` penceresinde basılan dev
 * giriş düğmesi `auth.users`a satır açtı, `0002` trigger'ı boş tabloda **adsız, `{admin}`, kapsamsız**
 * bir profil doğurdu, seed de onu "Marc Lemoine zaten var" diye kabul etti. Kurye hiç doğmadı;
 * ortada kurye e-postalı bir yönetici vardı ve hiçbir yerde hata yoktu.
 *
 * Kapı artık kapandı (dev giriş kimlik yaratmıyor — `@lezzet/application` `auth/dev-login.ts`), ama
 * **profili e-postadan açabilen tek yol o değil**: gerçek OTP akışı da açar, elle yazılan bir satır
 * da. Yani ölçüt kapıda değil BURADA da durmalı — seed'in kişisi seed'in tanımına uymak zorunda.
 *
 * Onarılan alanlar seed'in SAHİP olduğu üç kimlik alanı: ad, roller, depo kapsamı. Sessiz değil,
 * gürültülü: her onarım satır satır basılır, yoksa tuzak yine görünmez kalırdı — yalnız bu sefer
 * seed'in içinde. Sapma yoksa hiç yazılmaz (idempotent).
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

/** Kartları açar (varsa TANIMA UYDURUR) ve `key → profil id` haritasını döner. */
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
 * ── BİR MÜŞTERİYE DE AÇILIR (kullanıcı kararı 19.08) ────────────────────────
 * Burada eskiden *"müşteri hesabı AÇILMAZ"* yazıyordu; gerekçesi şuydu: müşterinin girişi OTP
 * akışının kendisidir ve hazır bir auth satırı o akışın yarısını atlatır. Gerekçe hâlâ doğru ama
 * SONUCU yanlıştı — dayandığı sessiz varsayım, dev girişinin müşteri düğmesinin bastığı adresin
 * (kullanıcının kendi adresi) bir müşteri olduğuydu. Değildi: o adres `auth.users`ın en eski
 * satırı, yani `0002`nin *"hiç admin yoksa ilk hesap admin olur"* açılışı onu ADMİN yapmıştı.
 * Yani "Müşteri" düğmesi ta baştan beri operasyona giriyordu (kullanıcı bulgusu 19.08) — 21.32'de
 * personel düğmeleri için ölçülen arızanın aynısı, aynanın öteki yüzü.
 *
 * Bir hesabı seed'lemek OTP yolunu KAPATMIYOR: o yol her yeni e-postayla açık kalıyor ve `0002`
 * artık admin varken `{customer}` doğuruyor. Kazanılan şey, tek tıkla GERÇEK bir müşteri oturumu.
 * Aynı gerekçeyle 21.32 personel düğmelerini seed'e taşımıştı.
 *
 * İdempotent: bağlı profil atlanır, yani seed tekrar tekrar koşabilir.
 *
 * **Ad artık davranıştan dar** — bu fonksiyon personelin yanında bir müşteri hesabı da açıyor.
 * `seedDevLogins`e çevrilmesi `scripts/seed.ts`in import+çağrı satırlarına dokunmayı gerektiriyor
 * ve o dosyada şu an başka şeridin commit'lenmemiş işi duruyor; yol adıyla commit kuralı gereği
 * (CLAUDE §0) oraya dokunulmadı. Dosya boşalınca ad düzeltilecek.
 */
/**
 * Giriş hesabı açılacak MÜŞTERİ — dev girişinin "Müşteri" düğmesinin bastığı hesap.
 *
 * `b2cSadik` seçildi çünkü müşteri yüzeyinin en DOLU hâlini o gösteriyor: siparişleri, adresi,
 * pazarlama izni ve puan geçmişi var. Boş bir müşteriyle girmek, ekranların yalnız boş hâlini
 * denemek olurdu — `seedObservability` künyesindeki aynı gerekçe.
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

