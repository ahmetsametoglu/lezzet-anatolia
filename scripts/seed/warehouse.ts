import { WarehouseService, WarehouseTransferService } from '@lezzet/database';
import { tabloDolu, type Db } from './shared';

// ── Depo ağı (19) ────────────────────────────────────────────────────────────────────────────────
// Sistem tek depo varsayımıyla kuruldu, artık kurulmuyor. Seed **iki** depo açar: tek depolu bir
// veri setinde depo hatalarının hiçbiri görünmez — süzgeci unutulan sorgu doğru cevap verir, yanlış
// depoya düşen sipariş fark edilmez. İkinci depo o hataların görünür olduğu yerdir.
//
// STR kargo deposudur (`shipsOnline`): bölge dışı müşteriler ve rota müşterilerinin kargo dolgusu
// oradan gider. Ülke başına EN FAZLA BİR aktif kargo deposu olabilir — kural veritabanında.

export interface Depolar {
  /** Strasbourg — ana depo, aynı zamanda kargo çıkış deposu. */
  str: string;
  /** Kehl (DE) — ikinci depo. Sınır ötesi rota ve transfer buradan denenir. */
  kehl: string;
}

export async function seedWarehouses(db: Db): Promise<Depolar> {
  const warehouses = new WarehouseService(db);

  if (await tabloDolu(db, 'warehouse')) {
    console.log('▸ depolar zaten dolu — atlandı');
    const mevcut = await warehouses.list();
    const bul = (code: string) => mevcut.find((w) => w.code === code)?.id ?? mevcut[0]!.id;
    return { str: bul('STR'), kehl: bul('KEHL') };
  }

  console.log('▸ DEPO seed');
  const str = await warehouses.insert({
    code: 'STR',
    name: 'Strasbourg — ana depo',
    countryCode: 'FR',
    address: { line1: '12 rue du Marché', postalCode: '67000', city: 'Strasbourg', country: 'FR' },
    shipsOnline: true,
    sortOrder: 1,
  });
  const kehl = await warehouses.insert({
    code: 'KEHL',
    name: 'Kehl — sınır deposu',
    countryCode: 'DE',
    address: { line1: 'Hauptstraße 8', postalCode: '77694', city: 'Kehl', country: 'DE' },
    // Almanya'da HENÜZ kargo yok: DE deposundan DE müşterisine satış "yerel satış"tır ve vergi
    // modelini değiştirir (DOMAIN §5/§17). Mali danışmana sorulmadan açılmaz.
    shipsOnline: false,
    sortOrder: 2,
  });

  console.log(`  ✓ ${str.code} · ${str.name} · kargo deposu`);
  console.log(`  ✓ ${kehl.code} · ${kehl.name}`);
  console.log('✓ depo: 2 kayıt (biri kargo çıkışı)');
  return { str: str.id, kehl: kehl.id };
}

/**
 * Bir transfer — sevk edilmiş ama HENÜZ KABUL EDİLMEMİŞ (`in_transit`).
 *
 * Bilinçli yarım bırakılıyor: "yoldaki mal" hâli ancak böyle görünür. O mal kaynaktan düşmüştür,
 * hedefte henüz doğmamıştır ve hiçbir depoda satılamaz — sanal bir transit depo olmadığı için
 * "yolda ne var" sorusunun tek cevabı bu kaydın kendisidir. Kabul ekranının (19.6) da işleyecek
 * bir kaydı olur.
 */
export async function seedTransfer(db: Db, depolar: Depolar): Promise<void> {
  if (await tabloDolu(db, 'warehouse_transfer')) {
    console.log('▸ transfer zaten dolu — atlandı');
    return;
  }
  console.log('▸ TRANSFER seed');

  // STR'de duran, teklife çıpalanmamış, REZERVASYONSUZ ve bol adetli partiler: sevk kullanılabilir
  // stoğa bakar (fiiliye değil), söz verilmiş malı yola çıkaramaz. Rezervasyonu olan varyantı
  // baştan eliyoruz — seçtiğimiz parti RPC'de reddedilirse seed düşerdi.
  const { data: rezerveli, error: rezerveHatasi } = await db
    .from('reservation')
    .select('variant_id')
    .eq('warehouse_id', depolar.str);
  if (rezerveHatasi) throw rezerveHatasi;
  const mesgulVaryantlar = new Set((rezerveli ?? []).map((r) => (r as { variant_id: string }).variant_id));

  const { data, error } = await db
    .from('stock')
    .select('id,variant_id,physical_qty')
    .eq('warehouse_id', depolar.str)
    .is('offer_price', null)
    .gt('physical_qty', 8)
    .order('physical_qty', { ascending: false })
    .limit(40);
  // Hata YUTULMAZ: sessizce boş listeye düşmek "uygun parti yok" gibi görünür ve seed hiçbir şey
  // söylemeden eksik veri bırakır — bir sonraki kişi transfer ekranını boş bulur ve sebebini aramaz.
  if (error) throw error;

  const partiler = ((data ?? []) as Array<{ id: string; variant_id: string; physical_qty: number }>)
    .filter((p) => !mesgulVaryantlar.has(p.variant_id))
    .slice(0, 2);

  if (partiler.length === 0) {
    console.log('  ▸ rezervasyonsuz uygun parti yok — transfer atlandı');
    return;
  }

  const transfers = new WarehouseTransferService(db);
  const sonuc = await transfers.dispatch({
    toWarehouseId: depolar.kehl,
    lines: partiler.map((p) => ({ sourceStockId: p.id, qty: Math.min(4, p.physical_qty) })),
    note: 'Kehl açılış sevkiyatı — kabul bekliyor.',
  });

  console.log(`  ✓ ${sonuc.referenceNo} · ${partiler.length} kalem · STR → KEHL (yolda)`);
  console.log('✓ transfer: 1 kayıt (kabul edilmemiş — "yoldakiler" listesi dolsun)');
}
