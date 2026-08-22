import { DeliveryZoneService, SettingsService } from '@lezzet/database';
import type { Db } from './shared';
import type { Depolar } from './warehouse';

// ── Kapsamlı işletme ayarları (02.6 · STACK §10) ─────────────────────────────────────────────────
// Ayarın asıl kabiliyeti değeri tutmak değil, **bağlama göre değişmesi**: en özgül kapsam kazanır
// (bölge → kanal → ülke → global). Migration yalnız `global` satırları kuruyor; o hâlde ezme kuralı
// hiç çalışmıyor ve ekran her bağlamda aynı sayıyı gösteriyor — kural var, kanıtı yok.
//
// Buradaki satırlar o zinciri görünür kılar: aynı anahtar üç ayrı kapsamda üç ayrı cevap verir.
// Yanlış bir çözümleme (özgülü atlayıp global'e düşme) ancak böyle bir veriyle fark edilir.
//
// `warehouse` KAPSAMI ARTIK YAZILIYOR (23.7): bu başlıktaki eski "okunmaz" notu bayattı —
// `SCOPE_PRIORITY` 03.08'den beri `warehouse` ile BAŞLIYOR (en dar kapsam kazanır). İlk gerçek
// depo-kapsamlı ayar etiket yazıcısı: kutu kapanışında basımın hedefi depoya göre değişir ve
// değerler 22.08 iğne deneyinin ÖLÇÜMÜdür (QL-1110NWB · 192.168.1.90 · DieCutW103H164) — cihaz
// turu refresh sonrası da basabilsin diye seed taşıyor; gerçek kurulumda Depolar ekranından yazılır.

export async function seedScopedSettings(db: Db, depolar: Depolar): Promise<void> {
  const settings = new SettingsService(db);

  // Kapsamlı satır zaten varsa dokunma — bölüm guard'ı `settings` tablosuna bakamaz, çünkü tablo
  // migration'dan dolu geliyor.
  //
  // Ölçüt "global OLMAYAN satır var mı" DEĞİL, "kanal/bölge satırı var mı" (19.08). Migration artık
  // **ülke** kapsamlı gerçek tarife satırları da kuruyor (`0013_settings.sql` → FR/DE kargo); eski
  // ölçüt onları görüp seed'i her koşuda atlardı ve kanal/bölge örnekleri **hiç yazılmazdı**. Guard
  // ancak seed'in kendi yazdığı kapsamlara bakarsa dürüst olur.
  const { count, error } = await db
    .from('settings')
    .select('*', { count: 'exact', head: true })
    .in('scope_type', ['channel', 'zone']);
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

  // ÜLKE KAPSAMI ARTIK BURADA DEĞİL (19.08) — gerçek kargo tarifesi `0013_settings.sql`'e taşındı.
  //
  // Buradaki iki satır (DE 12,90 € / eşik 90 €) uydurmaydı ve daha kötüsü **yalnız `extend`+
  // katmanında** yazılıyordu: üretime çıkacak `base` katmanında Almanya satırı hiç doğmuyor, Alman
  // müşteri sessizce Fransa tarifesini ödüyordu. Gerçek bir ticari şart seed'in insafına bırakılamaz.
  // Kanal ve bölge kapsamları burada kalıyor çünkü onlar mekanizmayı GÖSTEREN örnekler.

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

  // BÖLGE: çevre bölgede araç bir tur daha atıyor — kesim saati oraya özel erken.
  //
  // **BÖLGEYE ÖZEL ASGARİ SEPET SATIRI KALDIRILDI (kullanıcı kararı 10.08).** Buradaki satır
  // açıkça "ÖRNEK — gerçek bir iş kuralı değil" etiketiyle duruyordu (09.08: *"böyle bir uygulamam
  // yok ama mekanizma dursun"*). Bugün gerçek bir kural konuldu ve **küresel satıra** yazıldı
  // (`0013_settings.sql` → 40 €): kargo yolunda okunmayacağı kod tarafından güvence altına
  // alındığı için taban artık bölge bölge tekrarlanmak zorunda değil.
  //
  // Sahte satırın bedeli ölçüldü: kullanıcı kendi ödeme sayfasında "Sipariş onayla" düğmesini
  // pasif buldu, sebebi Illkirch'e yazılmış bu gösterim satırıydı ve gerçek bir kural sanıldı.
  // Mekanizma yine sınanabilir — bölge kapsamının çalıştığını `order_cutoff_time` satırı gösteriyor
  // ve o GERÇEK bir kural (araç erken çıkar).
  await yaz('order_cutoff_time', '10:00', {
    scopeType: 'zone',
    scopeId: cevreBolge?.id ?? null,
    description: `Çevre bölge kesim saati — araç erken çıkar (${cevreBolge?.name ?? '—'})`,
  });

  // DEPO: Strasbourg'un etiket yazıcısı (23.7) — üç anahtar BİRLİKTE (yarımı `labelPrinterFor`
  // tanımsız okur). Öteki depolara bilerek yazılmıyor: "yazıcısız depo" hâli de coverage'dır
  // (telefon basımı atlar, kart önizleme kalır).
  const yazici = async (key: string, value: string, description: string): Promise<void> => {
    await settings.set(key, value, { scopeType: 'warehouse', scopeId: depolar.str, description });
    sayi += 1;
    console.log(`  ✓ ${key} · warehouse · ${JSON.stringify(value)} — ${description}`);
  };
  await yazici('label_printer_address', '192.168.1.90', 'Etiket yazıcısının ağ adresi (iğne deneyi ölçümü)');
  await yazici('label_printer_model', 'QL-1110NWB', 'Brother QL model adı');
  await yazici('label_printer_label_size', 'DieCutW103H164', 'Takılı kâğıt — 103×164 mm kalıp kesim (DK-1247)');

  console.log(`✓ kapsamlı ayar: ${sayi} satır (kanal · bölge · depo) — aynı anahtar bağlama göre başka cevap verir`);
}
