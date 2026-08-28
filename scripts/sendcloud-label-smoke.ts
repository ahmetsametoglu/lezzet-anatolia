/**
 * Kargo ETİKETİ duman testi — `pnpm sendcloud:label:smoke`
 *
 * ⚠ **GERÇEK BİR GÖNDERİ AÇAR.** Bu yüzden yalnız ÜCRETSİZ seçenekle (`sendcloud:letter`, canlı
 * ölçümde 0,00 €) koşar ve seçenek listede yoksa DURUR — pahalı bir seçeneğe sessizce düşmez.
 *
 * Amacı tek: elimize GERÇEK bir etiket PDF'i geçirmek, ki 4×6 kâğıtla fiziksel prova yapılabilsin
 * (23.5'in iğne deneyi çizgisi — kâğıda basılmadan "oldu" denmez).
 *
 * Alıcı KENDİ DEPOMUZDUR: yanlışlıkla kargoya verilirse bize döner, kimsenin adresine gitmez.
 */
import { writeFileSync } from 'node:fs';
import { announceShipment, cancelShipment, fetchShippingQuotes, isSendcloudError } from '@lezzet/sendcloud';

const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
try {
  load?.('apps/web/.env.local');
} catch {
  // ortamdan gelmiş olabilir
}

const config = {
  publicKey: process.env.SENDCLOUD_PUBLIC_KEY ?? '',
  secretKey: process.env.SENDCLOUD_SECRET_KEY ?? '',
  baseUrl: process.env.SENDCLOUD_API_BASE_URL,
};
if (!config.publicKey || !config.secretKey) {
  console.error('SENDCLOUD anahtarları yok — apps/web/.env.local.');
  process.exit(2);
}

const depo = {
  countryCode: 'FR',
  postalCode: '67000',
  city: 'Strasbourg',
  name: 'Lezzet Anatolia',
  addressLine1: '12 rue du Marche',
  email: 'test@lezzet-anatolia.fr',
};
const koli = { weightG: 1200, lengthMm: 300, widthMm: 200, heightMm: 150 };

const quotes = await fetchShippingQuotes(config, { from: depo, to: depo, parcels: [koli] });
const bedava = quotes.find((q) => q.priceCents === 0);
if (!bedava) {
  console.error('✗ ücretsiz seçenek (0,00 €) listede yok — bu script pahalı seçenekle koşmaz.');
  process.exit(1);
}
console.log(`✓ ücretsiz seçenek: ${bedava.code} (${bedava.carrierName})`);

const ref = `TEST-${new Date().toISOString().slice(0, 10)}`;
const gonderi = await announceShipment(config, {
  externalReferenceId: crypto.randomUUID(),
  orderNumber: ref,
  reference: 'FIZIKSEL PROVA — sevk etmeyin',
  from: depo,
  to: { ...depo, name: 'TEST — sevk etmeyin' },
  parcels: [koli],
  shippingOptionCode: bedava.code,
}).catch((err: unknown) => {
  console.error(isSendcloudError(err) ? `✗ ${err.code}: ${err.message}` : err);
  process.exit(1);
});

const parcel = gonderi.parcels[0]!;
console.log(`✓ gönderi ${gonderi.providerShipmentId} · takip ${parcel.trackingNumber} · ${gonderi.carrierName}`);

if (!parcel.labelPdf) {
  console.error('✗ etiket PDF gelmedi (belge bağlantısından indirilmesi gerekebilir).');
  process.exit(1);
}
const out = process.argv[2] ?? '.test-results/kargo-etiketi.pdf';
writeFileSync(out, parcel.labelPdf);
console.log(`✓ etiket kaydedildi: ${out} (${parcel.labelPdf.length} bayt)`);

if (process.argv.includes('--cancel')) {
  await cancelShipment(config, gonderi.providerShipmentId);
  console.log('✓ test gönderisi iptal edildi');
}
