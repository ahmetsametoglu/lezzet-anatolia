import { AddressService, DeliveryZoneService } from '@lezzet/database';
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
  { name: 'Strasbourg Merkez', depo: 'str', codes: [fr('67000'), fr('67100'), fr('67200')], weekdays: [2, 5] }, // salı + cuma
  { name: 'Schiltigheim / Bischheim', depo: 'str', codes: [fr('67300'), fr('67800')], weekdays: [4] }, // perşembe
  { name: 'Illkirch / Ostwald', depo: 'str', codes: [fr('67400'), fr('67540')], weekdays: [3, 6] },
  // Sınır ötesi bölge (ADR-002) — Kehl deposuna bağlı, henüz pasif. Ülke BÖLGEDE değil kodda durur:
  // bir bölge iki devletin kodlarını kapsayabilir, depo kapsayamaz.
  { name: 'Kehl (DE) — hazırlanıyor', depo: 'kehl', codes: [de('77694')], weekdays: [5], isActive: false },
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
  console.log(`✓ bölge: ${BOLGELER.length} kayıt (3 aktif + 1 pasif)`);
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
    recipient?: string;
    line1: string;
    line2?: string;
    postalCode: string;
    city: string;
    phone?: string;
    country?: 'FR' | 'DE';
    isDefault?: boolean;
  }> = [
    // Rota içi (aktif bölge posta kodları)
    { kisi: 'b2bOnayli', label: 'Dükkân', recipient: 'Mehmet Aydın', line1: '12 rue du Faubourg de Pierre', postalCode: '67000', city: 'Strasbourg', phone: '+33 3 88 12 34 56', isDefault: true },
    { kisi: 'b2bOnayli', label: 'Depo', recipient: 'Depo görevlisi', line1: '4 quai Kléber', line2: 'Dépôt arrière', postalCode: '67000', city: 'Strasbourg', phone: '+33 3 88 12 34 57' }, // ikinci adres
    { kisi: 'b2cSadik', label: 'Ev', recipient: 'Ayşe Yılmaz', line1: '8 rue de Bischwiller', line2: '3. kat, zil: Yılmaz', postalCode: '67300', city: 'Schiltigheim', phone: '+33 6 12 34 56 78', isDefault: true },
    { kisi: 'b2cKapaliKapida', label: 'Ev', recipient: 'Fatma Demir', line1: '31 route de Lyon', postalCode: '67400', city: 'Illkirch-Graffenstaden', phone: '+33 6 98 76 54 32', isDefault: true },
    // Rota DIŞI — hiçbir aktif bölgeye düşmez → kargo yolu
        // ALICI hesabın sahibi DEĞİL — hediye/iş adresi hâli (kurye kapıda bu adı sorar).
    { kisi: 'b2cSadik', label: 'İş', recipient: 'Zeynep Kaya', line1: '17 avenue Jean Jaurès', postalCode: '69007', city: 'Lyon', phone: '+33 7 45 22 11 09' },
    { kisi: 'b2cAlman', line1: 'Hauptstraße 45', postalCode: '77652', city: 'Offenburg', country: 'DE', isDefault: true }, // etiketsiz + alıcısız/telefonsuz: üç boş alanın da ekran hâli denenebilsin
    // Pasif bölgeye düşen adres: bölge açılınca rota içi olacak, bugün değil
    { kisi: 'b2bAlman', label: 'Marktplatz', recipient: 'Stefan Weber', line1: 'Marktplatz 3', postalCode: '77694', city: 'Kehl', country: 'DE', phone: '+49 7851 44 55 66', isDefault: true },
    { kisi: 'b2bBekleyen', label: 'Ev', recipient: 'Ali Şahin', line1: '22 rue de la Krutenau', postalCode: '67000', city: 'Strasbourg', phone: '+33 6 55 44 33 22', isDefault: true },
  ];

  let sayi = 0;
  for (const { kisi, ...alanlar } of tanimlar) {
    const customerId = kisiler.get(kisi);
    if (!customerId) continue;
    await addresses.addForCustomer({ ...alanlar, customerId });
    sayi += 1;
  }
  console.log(`✓ adres: ${sayi} kayıt (rota içi · rota dışı · pasif bölgede)`);
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
  { kod: '68000', adet: 18, not: 'Mulhouse — uzak, tek başına bölge açtırmaz' },
  { kod: '67600', adet: 12, not: 'Sélestat' },
  { kod: '77694', adet: 9, not: 'Kehl (DE) — bölge var ama PASİF; talep birikiyor' },
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
    // PASİF bölgedeki ALMAN kod: ülke ayrımının tek gerçek denek taşı — kod FR'de de geçerli olsa
    // haber işi bunu Fransız bölge açılışında GÖNDERMEMELİ (21.16).
    { postal_code: '77694', country: 'DE', place_name: 'Kehl', locale: 'de', source: 'app-onboarding', email: 'einkauf@anadolu-markt.de', customer_id: kisiler.get('b2bAlman') ?? null, not: 'bekliyor · ALMAN kayıt, pasif bölge (Kehl)' },
    // HABER VERİLMİŞ kayıt: bölge açıldı, mektup gitti. Listenin "bitmiş" ucu da görünsün —
    // hepsi bekliyorsa gönderim akışının çalıştığı hiç görülmez.
    { postal_code: '67400', country: 'FR', place_name: 'Illkirch-Graffenstaden', locale: 'fr', source: 'app-account', email: 'julien.fischer@example.fr', customer_id: kisiler.get('b2cKapaliKapida') ?? null, notified_at: an(-15), not: 'HABER VERİLDİ (bölge açıldı)' },
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
    { variant_id: varyantlar[0]!, country: 'FR', postal_code: '67000', email: 'compta@bosphore-strasbourg.fr', customer_id: kisiler.get('b2bOnayli') ?? null, not: 'bekliyor · B2B müşteri' },
    // BAŞKA ÜLKE: mal Strasbourg'a gelirse bu kayda haber gitmemeli — yer süzgecinin sınavı.
    ...(varyantlar[1]
      ? [{ variant_id: varyantlar[1], country: 'DE' as const, postal_code: '77694', email: 'einkauf@anadolu-markt.de', customer_id: kisiler.get('b2bAlman') ?? null, not: 'bekliyor · ALMANYA (yer süzgeci)' }]
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

