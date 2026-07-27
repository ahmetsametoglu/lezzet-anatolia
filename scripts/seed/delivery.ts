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
  const tanimlar: Array<{ kisi: string; line1: string; line2?: string; postalCode: string; city: string; country?: 'FR' | 'DE'; isDefault?: boolean }> = [
    // Rota içi (aktif bölge posta kodları)
    { kisi: 'b2bOnayli', line1: '12 rue du Faubourg de Pierre', postalCode: '67000', city: 'Strasbourg', isDefault: true },
    { kisi: 'b2bOnayli', line1: '4 quai Kléber', line2: 'Dépôt arrière', postalCode: '67000', city: 'Strasbourg' }, // ikinci adres
    { kisi: 'b2cSadik', line1: '8 rue de Bischwiller', postalCode: '67300', city: 'Schiltigheim', isDefault: true },
    { kisi: 'b2cKapaliKapida', line1: '31 route de Lyon', postalCode: '67400', city: 'Illkirch-Graffenstaden', isDefault: true },
    // Rota DIŞI — hiçbir aktif bölgeye düşmez → kargo yolu
    { kisi: 'b2cSadik', line1: '17 avenue Jean Jaurès', postalCode: '69007', city: 'Lyon' },
    { kisi: 'b2cAlman', line1: 'Hauptstraße 45', postalCode: '77652', city: 'Offenburg', country: 'DE', isDefault: true },
    // Pasif bölgeye düşen adres: bölge açılınca rota içi olacak, bugün değil
    { kisi: 'b2bAlman', line1: 'Marktplatz 3', postalCode: '77694', city: 'Kehl', country: 'DE', isDefault: true },
    { kisi: 'b2bBekleyen', line1: '22 rue de la Krutenau', postalCode: '67000', city: 'Strasbourg', isDefault: true },
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

