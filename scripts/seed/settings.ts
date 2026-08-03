import { DeliveryZoneService, SettingsService } from '@lezzet/database';
import type { Db } from './shared';

// ── Kapsamlı işletme ayarları (02.6 · STACK §10) ─────────────────────────────────────────────────
// Ayarın asıl kabiliyeti değeri tutmak değil, **bağlama göre değişmesi**: en özgül kapsam kazanır
// (bölge → kanal → ülke → global). Migration yalnız `global` satırları kuruyor; o hâlde ezme kuralı
// hiç çalışmıyor ve ekran her bağlamda aynı sayıyı gösteriyor — kural var, kanıtı yok.
//
// Buradaki satırlar o zinciri görünür kılar: aynı anahtar üç ayrı kapsamda üç ayrı cevap verir.
// Yanlış bir çözümleme (özgülü atlayıp global'e düşme) ancak böyle bir veriyle fark edilir.
//
// `warehouse` KAPSAMI YAZILMAZ ve bu bilinçli: enum'da var ama `SettingsService`'in öncelik listesi
// (`SCOPE_PRIORITY = zone → channel → country → global`) onu içermiyor. Depo kapsamlı bir satır
// yazılabilir ama HİÇBİR ZAMAN okunmaz — seed onu kurarsa, çalıştığı sanılan ölü bir ayar bırakır.
// (Boşluk `BEKLEYEN` olarak değil, kod tarafında kapatılmalı — bkz. oturum raporu.)

export async function seedScopedSettings(db: Db): Promise<void> {
  const settings = new SettingsService(db);

  // Kapsamlı satır zaten varsa dokunma — bölüm guard'ı `settings` tablosuna bakamaz, çünkü tablo
  // migration'dan dolu geliyor (global satırlar). Ölçüt "global OLMAYAN satır var mı"dır.
  const { count, error } = await db
    .from('settings')
    .select('*', { count: 'exact', head: true })
    .neq('scope_type', 'global');
  if (error) throw error;
  if ((count ?? 0) > 0) {
    console.log('▸ kapsamlı ayarlar zaten dolu — atlandı');
    return;
  }
  console.log('▸ KAPSAMLI AYAR seed');

  const zones = await new DeliveryZoneService(db).list({ activeOnly: true });
  // Uzak bölge: rota maliyeti yüksek olan. Adı değil SIRASI seçilir — bölge adları değişebilir,
  // "üçüncü bölge" ise seed'in kendi kurduğu şeydir.
  const uzakBolge = zones[2] ?? zones[1] ?? zones[0];

  let sayi = 0;
  const yaz = async (
    key: string,
    value: unknown,
    opts: { scopeType: 'channel' | 'country' | 'zone'; scopeId: string | null; description: string },
  ): Promise<void> => {
    if (opts.scopeType === 'zone' && !opts.scopeId) return;
    await settings.set(key, value, opts);
    sayi += 1;
    console.log(`  ✓ ${key} · ${opts.scopeType} · ${JSON.stringify(value)} — ${opts.description}`);
  };

  // ÜLKE: Almanya'ya kargo pahalıdır — sınır ötesi taşıma yurt içiyle aynı fiyata olmaz.
  await yaz('shipping_fee_cents', 1290, {
    scopeType: 'country',
    scopeId: 'DE',
    description: 'DE kargo ücreti (yurt içinden yüksek)',
  });
  await yaz('free_shipping_threshold_cents', 9000, {
    scopeType: 'country',
    scopeId: 'DE',
    description: 'DE ücretsiz kargo eşiği — yurt içinden yüksek',
  });

  // KANAL: toptan müşteri zaten büyük alır; ücretsiz kargo eşiği ve asgari sepet ona göre kurulur.
  await yaz('min_basket_cents', 12000, {
    scopeType: 'channel',
    scopeId: 'b2b',
    description: 'Toptan asgari sepet (perakendeden yüksek)',
  });
  await yaz('free_shipping_threshold_cents', 25000, {
    scopeType: 'channel',
    scopeId: 'b2b',
    description: 'Toptan ücretsiz kargo eşiği',
  });

  // BÖLGE: en özgül kapsam. Uzak bölgede araç bir tur daha atıyor — asgari sepet oraya özel yüksek
  // ve kesim saati erken. Bu satır aynı zamanda ÖNCELİK sınavıdır: b2b müşteri bu bölgeden sipariş
  // verdiğinde kanal değil BÖLGE kazanmalı.
  await yaz('min_basket_cents', 4500, {
    scopeType: 'zone',
    scopeId: uzakBolge?.id ?? null,
    description: `Uzak bölge asgari sepet (${uzakBolge?.name ?? '—'})`,
  });
  await yaz('order_cutoff_time', '10:00', {
    scopeType: 'zone',
    scopeId: uzakBolge?.id ?? null,
    description: `Uzak bölge kesim saati — araç erken çıkar (${uzakBolge?.name ?? '—'})`,
  });

  console.log(`✓ kapsamlı ayar: ${sayi} satır (ülke · kanal · bölge) — aynı anahtar bağlama göre başka cevap verir`);
}
