import { AddressService, DeliveryZoneService } from '@lezzet/database';
import { notificationToken } from '@lezzet/domain-core';
import { an, tabloDolu, type Db, type Kisiler } from './shared';
import type { Depolar } from './warehouse';

// ── Teslimat bölgesi + adres (07) ────────────────────────────────────────────────────────────────
// Rota içi/dışı saklanmaz: adresin posta kodu aktif bir bölgeye düşüyorsa rota içidir, bu yüzden adreslerin bir kısmı bilerek hiçbir
// bölgeye düşmez ("kargoya düşen adres" hâli).

// Bölge tek depoya bağlanır (DOMAIN §17) ve bir kod bir işte tek bölgededir (tekillik veride); yer çözümü daima (ülke, kod) ikilisidir.
const BOLGELER: Array<{
  name: string;
  depo: keyof Depolar;
  codes: Array<{ country: 'FR' | 'DE'; postalCode: string }>;
  weekdays: number[];
  isActive?: boolean;
}> = [
  // Lezzet'in dört hattı dört ayrı yöne uzanır ve uçları birbirinden 100+ km ayrıdır: duraklar tek noktaya çökseydi rota sıralaması
  // sınanamazdı. Mesafeler depoya kuş uçuşudur (`postal_code_place`).
  { name: 'Kuzey Hattı — Frankfurt', depo: 'str', weekdays: [1, 4], // pazartesi + perşembe
    codes: [fr('67000'), fr('67500'), fr('67160'), de('76829'), de('60311')] }, // 0 · 22 · 48 · 71 · 183 km
  // İki şehir içi kod aynı merkezdedir: kısmi çakışma (`precision: mixed`) yolu ancak böyle beslenir.
  { name: 'Batı Hattı — Metz', depo: 'str', weekdays: [2, 5], // salı + cuma
    codes: [fr('67100'), fr('67200'), fr('67700'), fr('57400'), fr('57000')] }, // 0 · 0 · 30 · 54 · 130 km
  { name: 'Güney Hattı — Mulhouse', depo: 'str', weekdays: [3, 6], // çarşamba + cumartesi
    codes: [fr('67600'), fr('68000'), fr('68100')] }, // 39 · 63 · 98 km
  // Gün seti Batı ile aynıdır: aynı gün iki rota koşmazsa kuryenin rota seçimi hiç sınanmaz.
  { name: 'Doğu Hattı — Stuttgart', depo: 'str', weekdays: [2, 5], // salı + cuma
    codes: [de('77694'), de('77652'), de('70173')] }, // 5 · 19 · 107 km
  // QUALITE'nin hattı şehrin restoran ve marketlerine gider; bir posta kodu her işte ayrı bölgede olabilir, Lezzet'in kodlarıyla örtüşür.
  { name: 'QUALITE Hattı — Strasbourg', depo: 'qlt', weekdays: [2, 4], // salı + perşembe
    codes: [fr('67000'), fr('67100'), fr('67200'), fr('67300'), fr('67400')] },
];

function fr(postalCode: string) {
  return { country: 'FR' as const, postalCode };
}

function de(postalCode: string) {
  return { country: 'DE' as const, postalCode };
}

export async function seedDeliveryZones(db: Db, depolar: Depolar): Promise<void> {
  if (await tabloDolu(db, 'delivery_zone')) {
    console.log('▸ bölgeler zaten dolu — atlandı');
    return;
  }
  console.log('▸ TESLİMAT BÖLGESİ seed');
  const zones = new DeliveryZoneService(db);
  for (const b of BOLGELER) {
    const zone = await zones.insert({
      name: b.name,
      warehouseId: depolar[b.depo],
      weekdays: b.weekdays,
      isActive: b.isActive,
    });
    await zones.replacePostalCodes(zone.id, b.codes);
    const kodlar = b.codes.map((c) => `${c.country}-${c.postalCode}`).join(', ');
    console.log(`  ✓ ${b.name} · ${kodlar} · gün ${b.weekdays.join(',')}${b.isActive === false ? ' · PASİF' : ''}`);
  }
  console.log(`✓ bölge: ${BOLGELER.length} kayıt (Lezzet dört yön · QUALITE şehir içi)`);
}

export async function seedAddresses(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'address')) {
    console.log('▸ adresler zaten dolu — atlandı');
    return;
  }
  console.log('▸ ADRES seed');
  const addresses = new AddressService(db);
  // `label` müşterinin verdiği addır ve checkout adres kartının başlığıdır; bir adres bilerek etiketsizdir, kalanlar tam doludur, çünkü
  // kurye ekranı ve fatura eksik alanla denenirse yalancı sonuç verir.
  const tanimlar: Array<{
    kisi: string;
    label?: string;
    /** Zorunlu: adres teslim alacak kişi ve numarayla kaydedilir (`not null`); besleme de bu değişmeze uyar. */
    recipient: string;
    line1: string;
    line2?: string;
    postalCode: string;
    city: string;
    /** E.164, boşluksuz: tek sütunda iki biçim birikmesin; okunaklı hâl görünümün işidir. */
    phone: string;
    country?: 'FR' | 'DE';
    isDefault?: boolean;
    /*
      Koordinat bir kez çekilip sabit yazılır: besleme ağa çıkmaz ve belirlenimci olmalıdır, yazılmasaydı rota sıralaması posta kodu
      merkezine düşerdi. FR değerleri BAN'dan (`housenumber`), DE değerleri kodun merkezidir (`municipality`), çünkü BAN yalnız Fransa'yı bilir.
    */
    lat?: number;
    lng?: number;
    geoPrecision?: 'housenumber' | 'street' | 'locality' | 'municipality';
    geoSource?: 'ban' | 'manual';
  }> = [
    // Rota içi (aktif bölge posta kodları)
    { kisi: 'b2bOnayli', label: 'Dükkân', recipient: 'Mehmet Aydın', line1: '12 rue du Faubourg de Pierre', lat: 48.587548, lng: 7.746365, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67000', city: 'Strasbourg', phone: '+33388123456', isDefault: true },
    { kisi: 'b2bOnayli', label: 'Depo', recipient: 'Depo görevlisi', line1: '4 quai Kléber', lat: 48.586183, lng: 7.74191, geoPrecision: 'housenumber', geoSource: 'ban', line2: 'Dépôt arrière', postalCode: '67000', city: 'Strasbourg', phone: '+33388123457' }, // ikinci adres
    { kisi: 'b2cSadik', label: 'Ev', recipient: 'Ayşe Yılmaz', line1: '8 rue de Bischwiller', lat: 48.568726, lng: 7.763366, geoPrecision: 'housenumber', geoSource: 'ban', line2: '3. kat, zil: Yılmaz', postalCode: '67100', city: 'Strasbourg', phone: '+33612345678', isDefault: true },
    { kisi: 'b2cKapaliKapida', label: 'Ev', recipient: 'Fatma Demir', line1: '31 route de Lyon', lat: 48.56184, lng: 7.704935, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67200', city: 'Strasbourg', phone: '+33698765432', isDefault: true },
    // QUALITE rotasının durağı; kod Lezzet'in hattında da var ve yer müşterinin işinin bölgelerinden çözülür.
    { kisi: 'qualiteRestoran', label: 'Restoran', recipient: 'Jean-Marc Haller', line1: '6 place des Orphelins', lat: 48.578751, lng: 7.754382, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67000', city: 'Strasbourg', phone: '+33388327720', isDefault: true },
    // Rota dışı, kargo yolu; alıcı hesabın sahibi değil (hediye ya da iş adresi hâli).
    { kisi: 'b2cSadik', label: 'İş', recipient: 'Zeynep Kaya', line1: '17 avenue Jean Jaurès', lat: 45.75259, lng: 4.846418, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '69007', city: 'Lyon', phone: '+33745221109' },
    // Etiketsiz adres: ekranın "etiket yoksa şehri başlık yap" hâli buradan denenir.
    { kisi: 'b2cAlman', recipient: 'Klaus Müller', line1: 'Hauptstraße 45', lat: 48.4765, lng: 7.9438, geoPrecision: 'municipality', geoSource: 'manual', postalCode: '77652', city: 'Offenburg', country: 'DE', phone: '+49781223344', isDefault: true },
    // Kehl (DE), Doğu Hattının ilk durağı.
    { kisi: 'b2bAlman', label: 'Marktplatz', recipient: 'Stefan Weber', line1: 'Marktplatz 3', lat: 48.573, lng: 7.8152, geoPrecision: 'municipality', geoSource: 'manual', postalCode: '77694', city: 'Kehl', country: 'DE', phone: '+497851445566', isDefault: true },
    { kisi: 'b2bBekleyen', label: 'Ev', recipient: 'Ali Şahin', line1: '22 rue de la Krutenau', lat: 48.581303, lng: 7.757079, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67000', city: 'Strasbourg', phone: '+33655443322', isDefault: true },
    // Güney Hattının orta durağı: ortada durağı olmayan hat rota sıralamasını sınamaz.
    { kisi: 'b2cKapaliKapida', label: 'Colmar evi', recipient: 'Julien Fischer', line1: '5 rue des Marchands', lat: 48.077328, lng: 7.356656, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '68000', city: 'Colmar', phone: '+33698765432' },
    // Rota dışı Fransız adresi: kargoyla Strasbourg'dan gider; aynı müşterinin rota içi adresleriyle yolun adres değişince yeniden
    // hesaplandığı hâl tek hesapta denenir.
    { kisi: 'b2cKapaliKapida', label: 'Bordeaux dükkân', recipient: 'Julien Fischer', line1: '12 rue Sainte-Catherine', lat: 44.8404, lng: -0.5805, geoPrecision: 'municipality', geoSource: 'manual', postalCode: '33000', city: 'Bordeaux', phone: '+33556334455' },
    // Rota dışı Almanya adresi: Almanya'nın öteki adresleri Doğu ve Kuzey hatlarında olduğu için Kehl teslim noktalı kargo yolu ancak
    // buradan denenir.
    { kisi: 'b2cAlman', label: 'München', recipient: 'Klaus Müller', line1: 'Sendlinger Straße 12', lat: 48.1345, lng: 11.571, geoPrecision: 'municipality', geoSource: 'manual', postalCode: '80331', city: 'München', country: 'DE', phone: '+49781223344' },

    // Hatların uçları: tek duraklı hat rota sıralamasını sınamaz. Şehir adları `postal_code_place` kayıtlarıyla birebirdir, çünkü uydurma
    // ad "şehir bu koda ait mi" doğrulamasını düşürürdü.

    // Kuzey Hattı — Frankfurt'a kadar
    { kisi: 'b2cSadik', label: 'Haguenau şubesi', recipient: 'Nathalie Roux', line1: '3 rue de la Gare', lat: 48.780466, lng: 7.710003, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67500', city: 'Batzendorf', phone: '+33388937711' },
    { kisi: 'b2bOnayli', label: 'Wissembourg bayi', recipient: 'Pierre Muller', line1: '9 rue de la République', lat: 49.035657, lng: 7.944338, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67160', city: 'Cleebourg', phone: '+33388947722' },
    { kisi: 'b2bAlman', label: 'Landau deposu', recipient: 'Sabine Braun', line1: 'Königstraße 12', lat: 49.1925, lng: 8.0549, geoPrecision: 'municipality', geoSource: 'manual', postalCode: '76829', city: 'Landau in der Pfalz', country: 'DE', phone: '+496341556677' },
    { kisi: 'b2bAlman', label: 'Frankfurt şube', recipient: 'Thomas Vogel', line1: 'Zeil 88', lat: 50.1112, lng: 8.6831, geoPrecision: 'municipality', geoSource: 'manual', postalCode: '60311', city: 'Frankfurt am Main', country: 'DE', phone: '+496921998877' },

    // Batı Hattı — Metz'e kadar
    { kisi: 'b2cKapaliKapida', label: 'Saverne', recipient: 'Camille Petit', line1: '14 Grand Rue', lat: 48.757771, lng: 7.35096, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67700', city: 'Eckartswiller', phone: '+33388917733' },
    { kisi: 'b2cSadik', label: 'Sarrebourg', recipient: 'Lucas Bernard', line1: '6 rue de France', lat: 48.722241, lng: 7.08398, geoPrecision: 'street', geoSource: 'ban', postalCode: '57400', city: 'Buhl-Lorraine', phone: '+33387037744' },
    { kisi: 'b2bOnayli', label: 'Metz market', recipient: 'Émilie Girard', line1: '21 rue Serpenoise', lat: 49.116925, lng: 6.17513, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '57000', city: 'Metz', phone: '+33387757755' },

    // Güney Hattı — Mulhouse'a kadar
    { kisi: 'b2cSadik', label: 'Sélestat', recipient: 'Marc Leroy', line1: '2 place du Marché', lat: 48.259514, lng: 7.455437, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67600', city: 'Baldenheim', phone: '+33388587766' },
    { kisi: 'b2bBekleyen', label: 'Mulhouse dükkân', recipient: 'Hakan Çelik', line1: '18 rue du Sauvage', lat: 47.746875, lng: 7.340736, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '68100', city: 'Mulhouse', phone: '+33389457788' },

    // Doğu Hattı — Stuttgart'a kadar
    { kisi: 'b2cAlman', label: 'Stuttgart', recipient: 'Anna Schmidt', line1: 'Königstraße 40', lat: 48.77265, lng: 9.18, geoPrecision: 'municipality', geoSource: 'manual', postalCode: '70173', city: 'Stuttgart', country: 'DE', phone: '+497112239900' },
  ];

  let sayi = 0;
  // Ölçüm anı besleme anıdır: tarama işi bu damgadan satırın çözülmüş olduğunu okur.
  const olcumAni = new Date().toISOString();
  for (const { kisi, ...alanlar } of tanimlar) {
    const customerId = kisiler.get(kisi);
    if (!customerId) continue;
    const geoAt = alanlar.lat === undefined ? undefined : olcumAni;
    await addresses.addForCustomer({ ...alanlar, geoAt, geoCheckedAt: geoAt, customerId });
    sayi += 1;
  }
  const noktali = tanimlar.filter((t) => t.lat !== undefined).length;
  console.log(`✓ adres: ${sayi} kayıt (${noktali} koordinatlı · rota içi · rota dışı)`);
}

// ── Bölge dışı talep sayacı (0029) ───────────────────────────────────────────────────────────────
// "Nereye getirelim" sorulan her posta kodu sayılır, kim sorduğu tutulmaz; dağılım bilerek düz değildir, çünkü pano "yeni bölgeyi nereye
// açalım" sorusunu ancak talebin yoğunlaştığı yeri görerek cevaplar. Bölge içi kodlar da sayılır: rota sıklığının girdisidir.

const POSTA_TALEPLERI: Array<{ kod: string; adet: number; not: string }> = [
  { kod: '67500', adet: 47, not: 'Haguenau — açık ara önde, bölge açma adayı' },
  { kod: '67200', adet: 31, not: 'Strasbourg batı — bölge İÇİ, rota sıklığı sinyali' },
  // "Talep birikti, bölge açıldı" hâli: kod Güney Hattının orta durağı.
  { kod: '68000', adet: 18, not: 'Colmar — talep birikti, Güney Hattına girdi' },
  { kod: '67600', adet: 12, not: 'Sélestat' },
  { kod: '77694', adet: 9, not: 'Kehl (DE) — Doğu Hattının durağı, rota sıklığı sinyali' },
  { kod: '54000', adet: 4, not: 'Nancy — tek tük' },
  { kod: '75011', adet: 2, not: 'Paris — kargo müşterisi' },
];

export async function seedPostalDemand(db: Db): Promise<void> {
  if (await tabloDolu(db, 'postal_code_demand')) {
    console.log('▸ posta kodu talepleri zaten dolu — atlandı');
    return;
  }
  console.log('▸ POSTA KODU TALEBİ seed');
  const zones = new DeliveryZoneService(db);
  let toplam = 0;
  for (const t of POSTA_TALEPLERI) {
    // Sayaç tek tek, RPC'den artar: toplu yazım sayacın normalleştirme kuralını denemeden bırakırdı.
    for (let i = 0; i < t.adet; i += 1) await zones.recordDemand(t.kod);
    toplam += t.adet;
    console.log(`  ✓ ${t.kod} · ${t.adet} talep — ${t.not}`);
  }
  // İlk görülme tarihleri: "üç aydır birikiyor" ile "dün başladı" farklı kararlar doğurur.
  const { error } = await db.from('postal_code_demand').update({ first_seen_at: an(-90) }).eq('postal_code', '67500');
  if (error) throw error;
  console.log(`✓ posta kodu talebi: ${POSTA_TALEPLERI.length} kod · ${toplam} istek`);
}

// ── "Bölge açılınca haber ver" (0030) ────────────────────────────────────────────────────────────
// Talep sayacından farklıdır: müşteri adını bırakır ve bir söz verilmiştir, bölge açılınca listeye haber gider. Kayıt posta kodu ve
// e-posta çiftinde tekildir ki aynı kişiye iki mektup gitmesin.

export async function seedZoneNotices(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'zone_notice')) {
    console.log('▸ bölge haber-ver kayıtları zaten dolu — atlandı');
    return;
  }
  console.log('▸ BÖLGE HABER-VER seed');

  // Ülke, yer adı, kaynak ve dil çeşitlendirilir: hepsi aynı değeri taşısaydı ekranlar ve haber işi tek dalı görürdü.
  type Kayit = {
    postal_code: string;
    country: 'FR' | 'DE';
    place_name?: string | null;
    source?: string;
    locale?: 'fr' | 'de' | 'tr' | null;
    email: string;
    customer_id?: string | null;
    notified_at?: string | null;
    not: string;
  };
  const kayitlar: Kayit[] = [
    // En çok talep gören kodda BEKLEYEN liste — bölge açılınca gidecek mektupların kuyruğu.
    { postal_code: '67500', country: 'FR', place_name: 'Haguenau', locale: 'fr', email: 'nathalie.roux@example.fr', not: 'bekliyor · kayıtsız ziyaretçi' },
    // Dili kayıtsız: haber işi profile, sonra fr'ye düşer.
    { postal_code: '67500', country: 'FR', place_name: 'Haguenau', locale: null, email: 'kemal.ozturk@example.fr', not: 'bekliyor · dili bilinmiyor' },
    { postal_code: '67500', country: 'FR', place_name: 'Haguenau', locale: 'tr', email: 'claire.weber@example.fr', customer_id: kisiler.get('b2cSadik') ?? null, not: 'bekliyor · KAYITLI müşteri' },
    // Yer adı ÇÖZÜLEMEMİŞ kayıt — kolonun null hâli de görünsün.
    { postal_code: '68000', country: 'FR', place_name: null, locale: 'fr', email: 'sophie.klein@example.fr', not: 'bekliyor · yer adı yok' },
    // Alman kod, ülke ayrımının denek taşı: Fransız bölge açılışında bu kayda haber gitmemeli.
    { postal_code: '77694', country: 'DE', place_name: 'Kehl', locale: 'de', source: 'app-onboarding', email: 'einkauf.vihado@example.de', customer_id: kisiler.get('b2bAlman') ?? null, not: 'bekliyor · ALMAN kayıt (ülke ayrımı)' },
    // Haber verilmiş kayıt, kodu aktif bölgede: hepsi bekliyor olsaydı gönderim akışının çalıştığı hiç görülmezdi.
    { postal_code: '67200', country: 'FR', place_name: 'Strasbourg', locale: 'fr', source: 'app-account', email: 'julien.fischer@example.fr', customer_id: kisiler.get('b2cKapaliKapida') ?? null, notified_at: an(-15), not: 'HABER VERİLDİ (bölge açıldı)' },
  ];

  const { error } = await db.from('zone_notice').insert(
    kayitlar.map((k) => ({
      postal_code: k.postal_code,
      country: k.country,
      place_name: k.place_name ?? null,
      source: k.source ?? 'web',
      locale: k.locale ?? null,
      email: k.email,
      customer_id: k.customer_id ?? null,
      notified_at: k.notified_at ?? null,
      // Tercih bağının anahtarı kayıtla doğar: hesapsız kaydın tercih sayfası yalnız bununla açılır.
      token: notificationToken(),
      created_at: an(-30),
    })),
  );
  if (error) throw error;
  for (const k of kayitlar) console.log(`  ✓ ${k.postal_code} · ${k.email} — ${k.not}`);
  console.log(`✓ haber-ver: ${kayitlar.length} kayıt (${kayitlar.filter((k) => !k.notified_at).length} bekliyor · 1 gönderildi · kayıtlı + kayıtsız)`);
}

// ── "Stok gelince haber ver" (0045) ──────────────────────────────────────────────────────────────
// Kayıt varyant düzeyindedir ve yeri saklar, çünkü mal bir depoya gelir ve o depo her yere bakmaz; kimlik zorunlu değildir, "haber ver"in
// önüne giriş duvarı koymak vazgeçmeye en yakın anda ikinci bir engel olurdu.

export async function seedStockNotices(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'variant_stock_notice')) {
    console.log('▸ stok bildirimleri zaten dolu — atlandı');
    return;
  }
  console.log('▸ STOK GELİNCE HABER VER seed');

  // Bekleyecek varyantlar: GERÇEKTEN tükenmiş olanlar önce. Stokta bol duran bir ürüne "haber ver"
  // kaydı koymak, ekranın hemen tetiklenmesi gereken bir satır göstermesi demekti — bekleme listesi
  // dolu ama sebebi yok.
  const { data: tukenen, error } = await db
    .from('available_stock_total')
    .select('variant_id,available_qty')
    .lte('available_qty', 0)
    .limit(4);
  if (error) throw error;
  let varyantlar = ((tukenen ?? []) as Array<{ variant_id: string }>).map((r) => r.variant_id);

  // Tükenen yoksa (stok bol kurulmuşsa) herhangi bir varyanta düşülür — liste boş kalmasın; ama
  // bu bir TAVİZDİR ve söylenir, sessizce yapılmaz.
  if (varyantlar.length === 0) {
    const { data: herhangi } = await db.from('product_variant').select('id').limit(3);
    varyantlar = ((herhangi ?? []) as Array<{ id: string }>).map((r) => r.id);
    console.log('  ▸ tükenmiş varyant yok — bildirimler stoklu varyantlara bağlandı');
  }
  if (varyantlar.length === 0) {
    console.log('  ▸ varyant yok — atlandı');
    return;
  }

  const kayitlar: Array<{ variant_id: string; country: 'FR' | 'DE'; postal_code: string; email: string; customer_id?: string | null; notified_at?: string | null; not: string }> = [
    // Aynı varyantı bekleyen ÜÇ kişi: mal gelince kaç kişiye haber gideceği ancak yığılma varsa görünür.
    { variant_id: varyantlar[0]!, country: 'FR', postal_code: '67000', email: 'claire.weber@example.fr', customer_id: kisiler.get('b2cSadik') ?? null, not: 'bekliyor · KAYITLI müşteri' },
    { variant_id: varyantlar[0]!, country: 'FR', postal_code: '67300', email: 'passant@example.fr', not: 'bekliyor · ziyaretçi (kimliksiz)' },
    { variant_id: varyantlar[0]!, country: 'FR', postal_code: '67000', email: 'compta.oberjaegerhof@example.fr', customer_id: kisiler.get('b2bOnayli') ?? null, not: 'bekliyor · B2B müşteri' },
    // Başka ülke: yer süzgeci posta kodunu ülkesiyle birlikte okur.
    ...(varyantlar[1]
      ? [{ variant_id: varyantlar[1], country: 'DE' as const, postal_code: '77694', email: 'einkauf.vihado@example.de', customer_id: kisiler.get('b2bAlman') ?? null, not: 'bekliyor · ALMANYA (yer süzgeci)' }]
      : []),
    // HABER VERİLMİŞ kayıt: söz tutulmuş hâli de görünsün. Damgalı satıra ikinci kez yazılmaz —
    // "tek hatırlatma" sözü bu alanla tutulur.
    ...(varyantlar[2]
      ? [{ variant_id: varyantlar[2], country: 'FR' as const, postal_code: '67400', email: 'julien.fischer@example.fr', customer_id: kisiler.get('b2cKapaliKapida') ?? null, notified_at: an(-6), not: 'HABER VERİLDİ (mal geldi)' }]
      : []),
  ];

  const { error: yazmaHatasi } = await db.from('variant_stock_notice').insert(
    kayitlar.map((k) => ({
      variant_id: k.variant_id,
      country: k.country,
      postal_code: k.postal_code,
      email: k.email,
      customer_id: k.customer_id ?? null,
      notified_at: k.notified_at ?? null,
      created_at: an(-12),
    })),
  );
  if (yazmaHatasi) throw yazmaHatasi;
  for (const k of kayitlar) console.log(`  ✓ ${k.postal_code} ${k.country} · ${k.email} — ${k.not}`);
  console.log(`✓ stok bildirimi: ${kayitlar.length} kayıt (${kayitlar.filter((k) => !k.notified_at).length} bekliyor · 1 gönderildi · kayıtlı + ziyaretçi · iki ülke)`);
}

