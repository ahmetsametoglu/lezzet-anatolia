import { AddressService, DeliveryZoneService } from '@lezzet/database';
import { notificationToken } from '@lezzet/domain-core';
import { an, tabloDolu, type Db, type Kisiler } from './shared';
import type { Depolar } from './warehouse';

// ── Teslimat bölgesi + adres (07) ────────────────────────────────────────────────────────────────
// Rota içi/dışı SAKLANMAZ: adresin posta kodu aktif bir bölgeye düşüyorsa rota içidir. Bu yüzden
// adreslerin bir kısmı bilinçli olarak HİÇBİR bölgeye düşmez — "kargoya düşen adres" hâli.

// Bölge TEK depoya bağlanır (DOMAIN §17): posta kodu → bölge → depo zincirinin orta halkası.
// Kodlar artık bölgenin dizi kolonunda değil kendi tablosunda — aynı kod iki bölgeye yazılamaz
// (tekillik veride) ve yer çözümü daima (ülke, kod) ikilisidir.
const BOLGELER: Array<{
  name: string;
  depo: keyof Depolar;
  codes: Array<{ country: 'FR' | 'DE'; postalCode: string }>;
  weekdays: number[];
  isActive?: boolean;
}> = [
  // ── DÖRT HAT, DÖRT YÖN (kullanıcı kararı 31.08) ─────────────────────────────────────────────
  //
  // **Önceki karar (16.08: "rota sayısını bire indirelim") YÜRÜRLÜKTEN KALKTI** ve gerekçesi
  // ölçülmüş bir arıza: tek rotanın üç kodu da (67000/67100/67200) GeoNames dökümünde **aynı
  // noktayı** taşıyor (`0034:4298-4315` — şehrin merkezi). Yani rota sıralaması (11.9) o veride
  // hiç sınanamıyordu: bütün duraklar tek noktaya çöküyor, her sıralama aynı maliyeti veriyor ve
  // motor haklı olarak "sıralayamadım" diyor (`indistinguishable`).
  //
  // Dört hat DÖRT AYRI YÖNE uzanıyor ve uçları birbirinden 100+ km ayrı — motorun kapalı tur
  // hesabı ancak böyle bir yayılımda görünür hâle geliyor. Uzunluklar gerçek bir günlük rotadan
  // FAZLA (Frankfurt 183 km) ve bu bilinçli: besleme, hesabın çalıştığını gösterebilmeli.
  //
  // Her hatta bir "şehir içi" kod + gittikçe uzaklaşan duraklar var; mesafeler depoya kuş uçuşu
  // (ölçüldü 31.08, `postal_code_place`ten).
  //
  // ── KUZEY: Strasbourg → Haguenau → Wissembourg → Landau → Frankfurt ────────
  { name: 'Kuzey Hattı — Frankfurt', depo: 'str', weekdays: [1, 4], // pazartesi + perşembe
    codes: [fr('67000'), fr('67500'), fr('67160'), de('76829'), de('60311')] }, // 0 · 22 · 48 · 71 · 183 km
  // ── BATI: Strasbourg → Saverne → Sarrebourg → Metz ─────────────────────────
  // İki şehir içi kod (67100 + 67200) BİLEREK aynı hatta: ikisi de aynı merkezde ve bu, kısmi
  // çakışma hâlini (`precision: mixed` yolu) besleyen tek yer — hepsi çakışık olsaydı motor
  // sıralamayı reddederdi, hiçbiri çakışık olmasaydı o dal hiç denenmezdi.
  { name: 'Batı Hattı — Metz', depo: 'str', weekdays: [2, 5], // salı + cuma
    codes: [fr('67100'), fr('67200'), fr('67700'), fr('57400'), fr('57000')] }, // 0 · 0 · 30 · 54 · 130 km
  // ── GÜNEY: Sélestat → Colmar → Mulhouse ────────────────────────────────────
  // Deposu COLMAR ve bu 19.25'ten devralınan bir değişmez: **rota deposu ile kargo çıkışı aynı
  // depo olduğu sürece sepet ikiye bölünemiyor.** Colmar `shipsOnline=false`, kargo çıkışı STR —
  // karma sepet ancak bu ayrımla doğuyor.
  { name: 'Güney Hattı — Mulhouse', depo: 'colmar', weekdays: [3, 6], // çarşamba + cumartesi
    codes: [fr('67600'), fr('68000'), fr('68100')] }, // 39 · 63 · 98 km
  // ── DOĞU: Kehl → Offenburg → Stuttgart ─────────────────────────────────────
  // KEHL deposu ilk kez bir rotaya sahip. Gün seti Batı ile AYNI (salı+cuma) ve bu bilinçli: aynı
  // gün iki rota koşmazsa kuryenin rota SEÇİMİ (K1) hiç sınanmaz — tek adayda ekran soru sormuyor.
  // Sınır ötesi hat ADR-002'nin meşru saydığı şey; sınır rotanın değil devletin çizgisidir.
  { name: 'Doğu Hattı — Stuttgart', depo: 'kehl', weekdays: [2, 5], // salı + cuma
    codes: [de('77694'), de('77652'), de('70173')] }, // 5 · 19 · 107 km
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
  console.log(`✓ bölge: ${BOLGELER.length} kayıt (dört yön — künyedeki gerekçe)`);
}

export async function seedAddresses(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'address')) {
    console.log('▸ adresler zaten dolu — atlandı');
    return;
  }
  console.log('▸ ADRES seed');
  const addresses = new AddressService(db);
  // `label` = müşterinin kendi verdiği ad; checkout adres kartının başlığı odur. Bir adres
  // BİLİNÇLİ etiketsiz, alıcısız ve telefonsuz: ekranın "boş alanı hiç çizme" hâlleri denenebilsin.
  // Kalanlar TAM DOLU — kurye ekranı ve fatura, eksik alanla test edilirse yalancı bir sonuç verir.
  const tanimlar: Array<{
    kisi: string;
    label?: string;
    /* ZORUNLU (22.08): kolonlar `not null` — adres teslim alacak kişi ve numarayla birlikte
       kaydediliyor. Besleme de bu değişmeze uyar; uymayan bir besleme, kuralı ilk delen yol olurdu. */
    recipient: string;
    line1: string;
    line2?: string;
    postalCode: string;
    city: string;
    /* E.164, boşluksuz — tek sütunda iki biçim biriktirmemek için (`0011` künyesi). Ekranda
       okunaklı hâle çevirmek görünümün işi; DEPOLANAN biçim tektir. */
    phone: string;
    country?: 'FR' | 'DE';
    isDefault?: boolean;
    /* ── KOORDİNAT SABİT YAZILIR (11.9 · 31.08) ─────────────────────────────
       Besleme ağa çıkmaz ve belirlenimci olmalı — ama bunun sonucu "koordinat yazma" DEĞİL,
       "koordinatı bir kez çek ve SABİTLE"dir. `postal_code_place` verisi de aynı yolla üretiliyor
       (`postal:build` → dosyaya yazılıyor).
       Aksi hâlde her `db:refresh` sonrası elle bir komut daha gerekirdi ve unutulduğu gün rota
       sıralaması sessizce posta kodu merkezine düşerdi — yani özellik "çalışmıyor" görünürdü.

       FR değerleri BAN'dan bir kez çekildi (31.08, skorlarıyla birlikte doğrulandı) ve
       `housenumber` kademesinde. DE değerleri kod MERKEZİDİR (`postal_code_place`, GeoNames):
       BAN yalnız Fransa'ya bakıyor ve uydurma bir kapı noktası yazmak yerine kademesi dürüstçe
       `municipality` deniyor — kapı değil, yerleşimin ortası. */
    lat?: number;
    lng?: number;
    geoPrecision?: 'housenumber' | 'street' | 'locality' | 'municipality';
    geoSource?: 'ban' | 'manual';
  }> = [
    // Rota içi (aktif bölge posta kodları)
    { kisi: 'b2bOnayli', label: 'Dükkân', recipient: 'Mehmet Aydın', line1: '12 rue du Faubourg de Pierre', lat: 48.587548, lng: 7.746365, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67000', city: 'Strasbourg', phone: '+33388123456', isDefault: true },
    { kisi: 'b2bOnayli', label: 'Depo', recipient: 'Depo görevlisi', line1: '4 quai Kléber', lat: 48.586183, lng: 7.74191, geoPrecision: 'housenumber', geoSource: 'ban', line2: 'Dépôt arrière', postalCode: '67000', city: 'Strasbourg', phone: '+33388123457' }, // ikinci adres
    // **Kodlar 67300/67400'den 67100/67200'e TAŞINDI (16.08, rota tek bölgeye inince).** İkisi de
    // artık rota dışında kalırdı ve bu iki müşteri seed'in en çok sipariş veren kişileri: siparişleri
    // `route` olarak yazılıyor, adresleri kargoya düşseydi veri kendi içinde çelişirdi.
    { kisi: 'b2cSadik', label: 'Ev', recipient: 'Ayşe Yılmaz', line1: '8 rue de Bischwiller', lat: 48.568726, lng: 7.763366, geoPrecision: 'housenumber', geoSource: 'ban', line2: '3. kat, zil: Yılmaz', postalCode: '67100', city: 'Strasbourg', phone: '+33612345678', isDefault: true },
    { kisi: 'b2cKapaliKapida', label: 'Ev', recipient: 'Fatma Demir', line1: '31 route de Lyon', lat: 48.56184, lng: 7.704935, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67200', city: 'Strasbourg', phone: '+33698765432', isDefault: true },
    // Rota DIŞI — hiçbir aktif bölgeye düşmez → kargo yolu
    // ALICI hesabın sahibi DEĞİL — hediye/iş adresi hâli (kurye kapıda bu adı sorar).
    { kisi: 'b2cSadik', label: 'İş', recipient: 'Zeynep Kaya', line1: '17 avenue Jean Jaurès', lat: 45.75259, lng: 4.846418, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '69007', city: 'Lyon', phone: '+33745221109' },
    /* ETİKETSİZ adres — ekranın "etiket yoksa şehri başlık yap" hâli hâlâ buradan deneniyor.
       ALICISIZ/TELEFONSUZ hâli 22.08'de KALKTI: kolonlar `not null` oldu, yani o hâl artık
       veritabanında var olamıyor ve onu beslemede tutmak, üretilemeyecek bir ekranı denemek
       olurdu. Alıcı hesabın sahibiyle AYNI (varsayılanın kaydedildiği yaygın hâl) — hediye
       adresinin ayrı hâli bir üstteki Lyon satırında duruyor. */
    { kisi: 'b2cAlman', recipient: 'Klaus Müller', line1: 'Hauptstraße 45', lat: 48.4765, lng: 7.9438, geoPrecision: 'municipality', geoSource: 'manual', postalCode: '77652', city: 'Offenburg', country: 'DE', phone: '+49781223344', isDefault: true },
    // Kehl (DE) — 31.08'e kadar bölgesizdi, artık DOĞU HATTININ ilk durağı. Rota dışı hâli Lyon
    // (69007) taşımaya devam ediyor: kargo yolu tek bir adresle de sınanabiliyor.
    { kisi: 'b2bAlman', label: 'Marktplatz', recipient: 'Stefan Weber', line1: 'Marktplatz 3', lat: 48.573, lng: 7.8152, geoPrecision: 'municipality', geoSource: 'manual', postalCode: '77694', city: 'Kehl', country: 'DE', phone: '+497851445566', isDefault: true },
    { kisi: 'b2bBekleyen', label: 'Ev', recipient: 'Ali Şahin', line1: '22 rue de la Krutenau', lat: 48.581303, lng: 7.757079, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '67000', city: 'Strasbourg', phone: '+33655443322', isDefault: true },
    // COLMAR rotası (19.25) — karma sepetin YAŞADIĞI adres. Buraya bir adres düşmezse ikinci rota
    // yalnız kâğıt üstünde kalır: sepet ekranı yeri çerezden çözebilir ama CHECKOUT teslimatı
    // ADRESTEN çözüyor, yani iki gruplu bir siparişin gerçekten açılabilmesi bu satıra bağlı.
    { kisi: 'b2cKapaliKapida', label: 'Colmar evi', recipient: 'Julien Fischer', line1: '5 rue des Marchands', lat: 48.077328, lng: 7.356656, geoPrecision: 'housenumber', geoSource: 'ban', postalCode: '68000', city: 'Colmar', phone: '+33698765432' },

    /* ── HATLARIN UÇLARI (31.08) ───────────────────────────────────────────────
       Dört hat açıldı ama her hat tek duraklı kalsaydı rota sıralaması (11.9) yine sınanamazdı:
       tek durakta sıralanacak bir şey yok. Bu satırlar hatları GERÇEKTEN uzatıyor — her birinin
       posta kodu farklı bir noktada ve uçlar depoya 100+ km.

       Şehir adları `postal_code_place`in kendi kayıtlarıyla birebir: uydurma bir şehir adı, "yazılan
       şehir bu koda ait mi" doğrulamasını sessizce düşürürdü.

       KOORDİNAT YAZILMIYOR ve bu bilinçli: besleme ağa çıkmaz, uydurma bir kapı koordinatı da
       gerçek bir ölçüm gibi okunurdu. Adresler tarama işiyle (`geocode_addresses`) ya da elle
       (`pnpm geo:backfill`) çözülür; o ana kadar sıra posta kodu merkezinden hesaplanır ve
       `precision` bunu söyler. */

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
  // Ölçümün ANI besleme anıdır: nokta sabit yazılıyor ama "ne zaman ölçüldü" sorusu boş kalmasın —
  // tarama işi bu damgaya bakarak satırın çözülmüş olduğunu görüyor.
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
// "Nereye getirelim" sorulan her posta kodu SAYILIR — kim sorduğu tutulmaz, tekilleştirilmez.
// Panonun cevapladığı soru "yeni bölgeyi nereye açalım"dır; o cevap ancak talebin bir yerde
// YOĞUNLAŞTIĞI görülebilirse verilebilir. Bu yüzden dağılım düz değil: bir kod açık ara önde, birkaçı
// ortada, birkaçı tek tük — düz bir dağılımda pano hiçbir şey söylemez.
//
// Bölge İÇİ kodlar da sayılır (67000): talebin nerede yoğunlaştığı rota SIKLIĞININ da girdisidir,
// yalnız yeni bölgenin değil.

const POSTA_TALEPLERI: Array<{ kod: string; adet: number; not: string }> = [
  { kod: '67500', adet: 47, not: 'Haguenau — açık ara önde, bölge açma adayı' },
  { kod: '67200', adet: 31, not: 'Strasbourg batı — bölge İÇİ, rota sıklığı sinyali' },
  // 68000 COLMAR'dır (eski not "Mulhouse" diyordu — 68100'ün koduydu, düzeltildi 21.08). Bu satır
  // artık "talep birikti, bölge AÇILDI" hâlini örnekliyor: 19.25'in rotası tam bu koda kuruldu.
  { kod: '68000', adet: 18, not: 'Colmar — talep birikti, rota açıldı (19.25)' },
  { kod: '67600', adet: 12, not: 'Sélestat' },
  { kod: '77694', adet: 9, not: 'Kehl (DE) — deposu var ama rotası YOK; talep birikiyor' },
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
    // Sayaç ATOMİK olarak artar (RPC) ve seed de tek tek artırır — toplu bir insert, sayacın
    // gerçekte nasıl dolduğunu atlar ve normalleştirme (boşluk/büyük harf) kuralını denemeden bırakır.
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
// Talep sayacından FARKLI bir şeydir: sayaç anonimdir ve yalnız sayar; burada müşteri adını bırakır
// ve bir SÖZ verilmiştir. Bölge açıldığında bu listeye haber gider (`notified_at` damgalanır).
//
// Kayıtlar posta kodu + e-posta çiftinde tekildir (DB indeksi, harf ayrımsız): aynı kişi iki kez
// yazılınca iki mektup gitmemeli.

export async function seedZoneNotices(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'zone_notice')) {
    console.log('▸ bölge haber-ver kayıtları zaten dolu — atlandı');
    return;
  }
  console.log('▸ BÖLGE HABER-VER seed');

  // `country` · `place_name` · `source` · `locale` 21.16'da eklendi. Dördü de ÇEŞİTLENDİRİLİYOR:
  // hepsi aynı değeri taşısaydı ekranlar ve haber işi tek dalı görürdü.
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
    // Dil KAYITSIZ (null): 14.10 öncesi kayıtların hâli — haber işi profile, sonra fr'ye düşer.
    { postal_code: '67500', country: 'FR', place_name: 'Haguenau', locale: null, email: 'kemal.ozturk@example.fr', not: 'bekliyor · dili bilinmiyor' },
    { postal_code: '67500', country: 'FR', place_name: 'Haguenau', locale: 'tr', email: 'claire.weber@example.fr', customer_id: kisiler.get('b2cSadik') ?? null, not: 'bekliyor · KAYITLI müşteri' },
    // Yer adı ÇÖZÜLEMEMİŞ kayıt — kolonun null hâli de görünsün.
    { postal_code: '68000', country: 'FR', place_name: null, locale: 'fr', email: 'sophie.klein@example.fr', not: 'bekliyor · yer adı yok' },
    // ALMAN kod: ülke ayrımının tek gerçek denek taşı — kod FR'de de geçerli olsa haber işi bunu
    // Fransız bölge açılışında GÖNDERMEMELİ (21.16).
    { postal_code: '77694', country: 'DE', place_name: 'Kehl', locale: 'de', source: 'app-onboarding', email: 'einkauf.vihado@example.de', customer_id: kisiler.get('b2bAlman') ?? null, not: 'bekliyor · ALMAN kayıt, Kehl deposu var ama rota yok' },
    // HABER VERİLMİŞ kayıt: bölge açıldı, mektup gitti. Listenin "bitmiş" ucu da görünsün —
    // hepsi bekliyorsa gönderim akışının çalıştığı hiç görülmez.
    //
    // **Kod 67400'den 67200'e taşındı (16.08):** rota tek bölgeye inince 67400 hiçbir bölgeye
    // düşmez oldu ve "bölge açıldı, haber verildi" diyen bir kayıt kapalı bir kodda duruyordu —
    // kendi cümlesini yalanlayan bir satır. 67200 gerçekten aktif bölgede.
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
      // Tercih bağının anahtarı (22.08) — kayıtla birlikte doğar. Beslemede de yazılmalı: hesapsız
      // kaydın tercih sayfası YALNIZ bununla açılıyor ve jetonsuz satır o yolu yerelde
      // denenemez bırakırdı.
      token: notificationToken(),
      created_at: an(-30),
    })),
  );
  if (error) throw error;
  for (const k of kayitlar) console.log(`  ✓ ${k.postal_code} · ${k.email} — ${k.not}`);
  console.log(`✓ haber-ver: ${kayitlar.length} kayıt (${kayitlar.filter((k) => !k.notified_at).length} bekliyor · 1 gönderildi · kayıtlı + kayıtsız)`);
}

// ── "Stok gelince haber ver" (0045 · 19.9) ───────────────────────────────────────────────────────
// Bölge bildirimiyle (`zone_notice`) karıştırılmamalı: orada SEMT kapalıdır, burada ÜRÜN yoktur.
// İkisi de bir söz verir ama farklı sorulara — biri "buraya ne zaman geleceksiniz", diğeri "bu boy
// ne zaman gelecek".
//
// Kayıt VARYANT düzeyindedir: 700 g'ı bekleyene 1,5 kg geldi diye haber vermek sözü tutmak değil
// bozmaktır. Yer de saklanır (ülke + posta kodu), çünkü mal bir depoya gelir ve o depo her yere
// bakmaz — Kehl'e gelen mal Lyon'daki bekleyene "geldi" dedirtmemeli.
//
// KİMLİK ZORUNLU DEĞİL: "haber ver"in önüne giriş duvarı koymak, tam da vazgeçmeye en yakın anda
// ikinci bir engel çıkarmaktır. Bu yüzden kayıtların bir kısmı bilinçli ziyaretçi (customerId null).

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
    // BAŞKA ÜLKE: mal Strasbourg'a gelirse bu kayda haber gitmemeli — yer süzgecinin sınavı.
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

