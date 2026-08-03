import { PurchaseOrderService, SupplierProductService, SupplierService } from '@lezzet/database';
import { purchaseOrderReferenceNo } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { tabloDolu, type Db, type VaryantRef } from './shared';

// ── Tedarik zinciri (06) ─────────────────────────────────────────────────────────────────────────
// Tedarikçiye borç SAKLANMAZ, türetilir (Σ giriş − Σ ödeme). Tedarik siparişi TEDARİKÇİNİN DİLİYLE
// yazılır: bizim varyantımız ↔ onun kodu eşlemesi olmadan liste ona bir şey ifade etmez.

const TEDARIKCILER = [
  { key: 'gaziantep', name: 'Gaziantep Baklava Fabrikası', vatNumber: 'TR1234567890', paymentTermDays: 45, contact: { phone: '+903423456789', email: 'ihracat@gaziantepbaklava.com.tr', city: 'Gaziantep' }, note: 'Ana tedarikçi — 45 gün vade, aylık konteyner.' },
  { key: 'alsace', name: 'Alsace Frais Distribution', paymentTermDays: 15, contact: { phone: '+33388991122', email: 'commandes@alsace-frais.fr', city: 'Strasbourg' }, note: 'Yerel taze ürün; haftalık.' },
  { key: 'eskiTedarik', name: 'Marmara Gıda (eski)', paymentTermDays: null, contact: { phone: '+902165550000' }, isActive: false, note: 'Çalışılmıyor — kalite sorunu.' },
];

export async function seedSupply(db: Db, varyantlar: VaryantRef[]): Promise<Map<string, string>> {
  const suppliers = new SupplierService(db);
  const harita = new Map<string, string>();

  if (await tabloDolu(db, 'supplier')) {
    console.log('▸ tedarikçiler zaten dolu — atlandı');
    for (const t of await suppliers.list()) harita.set(t.name, t.id);
    return harita;
  }

  console.log('▸ TEDARİKÇİ + TEDARİK SİPARİŞİ seed');
  const mapping = new SupplierProductService(db);
  const purchases = new PurchaseOrderService(db);

  for (const t of TEDARIKCILER) {
    const { key, ...alanlar } = t;
    const created = await suppliers.insert(alanlar);
    harita.set(key, created.id);
    console.log(`  ✓ ${t.name}${t.isActive === false ? ' · PASİF' : ''}`);
  }

  // Ürün–kod eşlemesi: ilk 18 varyant iki tedarikçiye de bağlanır (fiyat karşılaştırması için),
  // biri TERCİHLİ. Koli içi adet bazılarında dolu — "12 adet = 1 koli" çevirisi telefonda biter.
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate').slice(0, 18);
  const ana = harita.get('gaziantep')!;
  const yerel = harita.get('alsace')!;
  for (const [i, v] of satilabilir.entries()) {
    await mapping.setMapping({
      supplierId: ana,
      variantId: v.id,
      supplierCode: `GZT-${String(1000 + i)}`,
      nameAtSupplier: `${v.ad.split(' · ')[0]} (fabrika)`,
      packQty: i % 3 === 0 ? 12 : i % 3 === 1 ? 6 : null,
      lastPurchasePriceCents: toCents(2.4 + (i % 7) * 0.35),
      isPreferred: true,
    });
    // İkinci kaynak yalnız bir kısmında — hepsinde olsaydı "tek kaynaklı ürün" hâli görünmezdi.
    if (i % 4 === 0) {
      await mapping.setMapping({
        supplierId: yerel,
        variantId: v.id,
        supplierCode: `AF-${String(500 + i)}`,
        nameAtSupplier: `${v.ad.split(' · ')[0]} (local)`,
        packQty: 10,
        lastPurchasePriceCents: toCents(2.9 + (i % 5) * 0.4),
      });
    }
  }

  // Tedarik siparişleri — dört durumun dördü de örneklenir. Gönderilmiş olanın NUMARASI olur
  // (06.12): kural veritabanında, seed de ondan muaf değil — muaf olsaydı seed verisi üretimde
  // imkânsız bir hâli örnekler ve ekranlar o hâle göre yazılırdı.
  const YIL = new Date().getFullYear();
  const taslak = await purchases.createDraft(ana, satilabilir.slice(0, 5).map((v, i) => ({ variantId: v.id, qty: 24 + i * 6, unitPriceCents: toCents(2.4 + i * 0.3) })), 'Bayram öncesi ek sipariş — taslak.');
  const gonderilen = await purchases.createDraft(ana, satilabilir.slice(5, 11).map((v, i) => ({ variantId: v.id, qty: 36 + i * 12, unitPriceCents: toCents(2.6 + i * 0.25) })), 'Aylık ana sipariş.');
  await purchases.markSent(gonderilen.order.id, purchaseOrderReferenceNo(YIL));
  const iptal = await purchases.createDraft(yerel, satilabilir.slice(0, 2).map((v) => ({ variantId: v.id, qty: 10 })), 'Yanlış tedarikçiye açıldı.');
  await purchases.cancel(iptal.order.id);
  // Dördüncüsü (received) mal kabulde kapanır — stok bölümü onu kullanır.
  const kabulBekleyen = await purchases.createDraft(ana, satilabilir.slice(11, 16).map((v, i) => ({ variantId: v.id, qty: 48 + i * 6, unitPriceCents: toCents(2.2 + i * 0.4) })), 'Gelen konteyner — mal kabulde kapanacak.');
  await purchases.markSent(kabulBekleyen.order.id, purchaseOrderReferenceNo(YIL));
  harita.set('kabulBekleyenPo', kabulBekleyen.order.id);

  // BEŞİNCİ durum: TAM teslim alınmış sipariş (`received`). Eksik gelen sipariş
  // (`partially_received`) ile tam gelen aynı ekranda ayrı satırlardır ve ayrı rozet taşırlar;
  // yalnız eksik olanı kurmak, "her şey tam geldi" hâlini hiç göstermemek olurdu — üstelik
  // tedarikçi performansı raporu da tek renkli çıkardı.
  const tamGelen = await purchases.createDraft(
    yerel,
    satilabilir.slice(16, 19).map((v, i) => ({ variantId: v.id, qty: 24 + i * 12, unitPriceCents: toCents(3.1 + i * 0.35) })),
    'Alsace haftalık — eksiksiz teslim alındı.',
  );
  await purchases.markSent(tamGelen.order.id, purchaseOrderReferenceNo(YIL));
  harita.set('tamGelenPo', tamGelen.order.id);

  console.log(`  ✓ tedarik siparişi: taslak(${taslak.items.length}) · gönderildi(${gonderilen.items.length}) · iptal(${iptal.items.length}) · kısmi kabul(${kabulBekleyen.items.length}) · TAM kabul(${tamGelen.items.length})`);
  console.log(`✓ tedarik: ${TEDARIKCILER.length} tedarikçi · ${satilabilir.length} eşleme · 5 sipariş (beş durumun beşi)`);
  return harita;
}

