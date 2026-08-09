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
  /**
   * Bölge kapsamı için örnek bölge.
   *
   * ── SİSTEMDE "UZAK BÖLGE" DİYE BİR ŞEY YOK (ölçüldü 09.08) ────────────────
   * `delivery_zone` dört şey tutuyor: ad · hangi depo bakar · haftanın hangi günleri araç gider ·
   * aktif mi. **Mesafe yok, maliyet yok, "uzak" işareti yok.** Bir bölgeye daha yüksek asgari sepet
   * koymak bir hesaplama değil, operatörün kararıdır — hangi rotanın pahalı olduğunu o bilir.
   * Seed yalnız o kararı TAKLİT eder.
   *
   * ── ÖNCEKİ SEÇİM YANLIŞ BÖLGEYE VURUYORDU ─────────────────────────────────
   * `zones[2]` yazıyordu ve künyesi *"adı değil SIRASI seçilir"* diyordu. Ama o sıra **alfabetik**
   * (`DeliveryZoneService.list` → `orderBy: 'name'`) ve aktif bölgeler şöyle diziliyor:
   * `Illkirch / Ostwald` · `Schiltigheim / Bischheim` · `Strasbourg Merkez`. Yani üçüncü sıradaki
   * MERKEZ bölgeydi ve seed'in yazdığı satır *"Uzak bölge asgari sepet (Strasbourg Merkez)"*
   * oluyordu — merkeze uzaklık zammı. Sıraya güvenmek, ölçmeden karar vermekti.
   *
   * Artık merkez DIŞINDA kalan ilk bölge seçiliyor ve adı da dürüst: "çevre bölge".
   */
  const cevreBolge = zones.find((z) => !/merkez|centre/i.test(z.name)) ?? zones[0];

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

  // BÖLGE: çevre bölgede araç bir tur daha atıyor — asgari sepet oraya özel yüksek ve kesim saati
  // erken.
  //
  // **BU SATIRIN SINAVI DEĞİŞTİ (kullanıcı kararı 09.08).** Eskiden künyesi *"b2b müşteri bu
  // bölgeden sipariş verdiğinde kanal değil BÖLGE kazanmalı"* diyordu. Kural tersine döndü ve
  // gerekçesi ticari: `channel: b2b` 120 € bir TİCARİ ŞARTTIR (toptan fiyat vermenin karşılığı,
  // mesafeyle ilgisi yok), bölge satırı ise bir LOJİSTİK TABANDIR. İkisi rakip değil, birlikte
  // karşılanması gereken iki koşul — `min_basket_cents` artık EN KATISINI uyguluyor
  // (`SettingsService.STRICTEST_WINS`). Yani bu satır hâlâ bir sınav, ama sorusu şu: B2C müşteri
  // bu bölgede 45 € görüyor mu, B2B müşteri yine de 120 €'da kalıyor mu.
  await yaz('min_basket_cents', 4500, {
    scopeType: 'zone',
    scopeId: cevreBolge?.id ?? null,
    description: `Çevre bölge asgari sepet (${cevreBolge?.name ?? '—'}) — operatör kararı`,
  });
  await yaz('order_cutoff_time', '10:00', {
    scopeType: 'zone',
    scopeId: cevreBolge?.id ?? null,
    description: `Çevre bölge kesim saati — araç erken çıkar (${cevreBolge?.name ?? '—'})`,
  });

  console.log(`✓ kapsamlı ayar: ${sayi} satır (ülke · kanal · bölge) — aynı anahtar bağlama göre başka cevap verir`);
}
