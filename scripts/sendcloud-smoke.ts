/**
 * Kargo duman testi — `pnpm sendcloud:smoke`
 *
 * GERÇEK anahtarla TEK teklif çağrısı yapar ve zinciri uçtan uca doğrular: anahtarlar okunuyor mu ·
 * kimlik geçiyor mu · gram/milimetre kabul ediliyor mu · cevap şemamızdan geçiyor mu.
 *
 * **HİÇBİR ŞEY YARATMAZ VE PARA HARCAMAZ:** teklif (`/shipping-options`) salt okumadır — gönderi
 * açılmaz, etiket satın alınmaz. Duyuru (`announce`) bu script'te BİLEREK yok; o gerçek para
 * harcar ve elle, ücretsiz `sendcloud:letter` seçeneğiyle denenir.
 *
 * Neden var: birim testleri sahte `fetch` ile koşuyor (`packages/sendcloud/src/testing.ts`) —
 * "kod doğru" ile "anahtar/sağlayıcı doğru" ayrı sorulardır ve bu script ikincisini cevaplar
 * (`ai-smoke.ts` · `stripe-smoke.ts` ile aynı sınıf).
 */
import { fetchShippingQuotes, isSendcloudError } from '@lezzet/sendcloud';

const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
try {
  load?.('apps/web/.env.local');
} catch {
  // Yoksa sorun değil: değişkenler ortamdan gelmiş olabilir.
}

const publicKey = process.env.SENDCLOUD_PUBLIC_KEY ?? '';
const secretKey = process.env.SENDCLOUD_SECRET_KEY ?? '';
if (!publicKey || !secretKey) {
  console.error('SENDCLOUD_PUBLIC_KEY / SENDCLOUD_SECRET_KEY yok — apps/web/.env.local kontrol edin.');
  process.exit(2);
}

const config = { publicKey, secretKey, baseUrl: process.env.SENDCLOUD_API_BASE_URL };

// Örnek gönderi: Strasbourg → Paris, 1,5 kg, 30×20×15 cm. Kişisel veri YOK (yalnız posta kodu).
const quotes = await fetchShippingQuotes(config, {
  from: { countryCode: 'FR', postalCode: '67000', city: 'Strasbourg' },
  to: { countryCode: 'FR', postalCode: '75001', city: 'Paris' },
  parcels: [{ weightG: 1500, lengthMm: 300, widthMm: 200, heightMm: 150 }],
}).catch((err: unknown) => {
  if (isSendcloudError(err)) {
    console.error(`✗ ${err.code}: ${err.message}`);
  } else {
    console.error('✗ beklenmedik hata:', err);
  }
  process.exit(1);
});

const ucretsiz = quotes.filter((q) => q.priceCents === 0);
const cokKoli = quotes.filter((q) => q.multicollo);

console.log(`✓ ${quotes.length} seçenek · ${cokKoli.length}'i çok koli destekliyor · ${ucretsiz.length} ücretsiz`);
for (const q of [...quotes].sort((a, b) => (a.priceCents ?? 1e9) - (b.priceCents ?? 1e9)).slice(0, 6)) {
  const fiyat = q.priceCents === null ? '—' : (q.priceCents / 100).toFixed(2).padStart(6);
  console.log(`  ${fiyat} €  ${q.code.padEnd(38)} ${q.lastMile ?? '—'}${q.multicollo ? '  ×koli' : ''}`);
}
if (ucretsiz.length === 0) {
  console.warn('⚠ ücretsiz seçenek (sendcloud:letter) listede yok — uçtan uca prova para harcar.');
}
