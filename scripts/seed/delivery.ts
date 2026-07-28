import { AddressService, DeliveryZoneService } from '@lezzet/database';
import { tabloDolu, type Db, type Kisiler } from './shared';

// ── Teslimat bölgesi + adres (07) ────────────────────────────────────────────────────────────────
// Rota içi/dışı SAKLANMAZ: adresin posta kodu aktif bir bölgeye düşüyorsa rota içidir. Bu yüzden
// adreslerin bir kısmı bilinçli olarak HİÇBİR bölgeye düşmez — "kargoya düşen adres" hâli.

const BOLGELER = [
  { name: 'Strasbourg Merkez', postalCodes: ['67000', '67100', '67200'], weekdays: [2, 5] }, // salı + cuma
  { name: 'Schiltigheim / Bischheim', postalCodes: ['67300', '67800'], weekdays: [4] }, // perşembe
  { name: 'Illkirch / Ostwald', postalCodes: ['67400', '67540'], weekdays: [3, 6] },
  { name: 'Kehl (DE) — hazırlanıyor', postalCodes: ['77694'], weekdays: [5], isActive: false }, // pasif bölge
];

export async function seedDeliveryZones(db: Db): Promise<void> {
  if (await tabloDolu(db, 'delivery_zone')) {
    console.log('▸ bölgeler zaten dolu — atlandı');
    return;
  }
  console.log('▸ TESLİMAT BÖLGESİ seed');
  const zones = new DeliveryZoneService(db);
  for (const b of BOLGELER) {
    await zones.insert(b);
    console.log(`  ✓ ${b.name} · ${b.postalCodes.join(', ')} · gün ${b.weekdays.join(',')}${b.isActive === false ? ' · PASİF' : ''}`);
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

