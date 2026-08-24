import { CategoryService, CollectionService, DiscountCodeService, DiscountService } from '@lezzet/database';
import type { DiscountInsert, PreferredLanguage } from '@lezzet/types';
import { an, tabloDolu, type Db, type Kisiler } from './shared';

// ── Kupon ve kampanya (0031 · sepet indirimi) ────────────────────────────────────────────────────
// Kupon ile kampanya TEK varlıktır; ayrımları yalnız TETİK: kupon kodla çalışır, kampanya
// kendiliğinden. Bu yüzden seed ikisini de aynı listede kurar — ekranın da tek listesi vardır.
//
// Kupon kutusunun her CEVABI ancak o cevabı doğuran bir satır varsa denenebilir: "geçersiz kod",
// "süresi doldu", "henüz başlamadı", "hakkınız kalmadı", "bu kupon size ait değil", "asgari sepet
// tutmadı" — altısı da aşağıda karşılığı olan bir tanımdan gelir. Tek bir "çalışan kupon" koymak,
// kutunun yalnız mutlu yolunu görünür kılardı.
//
// KULLANIM KAYDI burada YAZILMAZ (`discount_use`): kupon bir siparişte kullanılır, sipariş bölümü
// yazar (`orders.ts`). Tek istisna "hakkı tükenmiş" kupondur — onu tüketen sipariş oradadır.
//
// MÜŞTERİYE GÖRÜNEN AD (`publicLabel`) ARTIK HEPSİNDE DOLU (23.08). İkisi ("Sınırlı deneme
// kuponu", "Büyük sepet indirimi") bilerek boştu — yüzeyin adsız hâli de bir hâldi ve sepet o
// zaman "İndirim — kampanya %8" diyordu. **Kullanıcı kararıyla o hâl artık ÜRETİLEMİYOR:** operatör
// formu ve kaydetme kapısı en az bir dilde ad istiyor, puan çevriminin RPC'si de kendi adını
// yazıyor. Üretilemeyen bir hâli beslemede tutmak, hiç doğmayacak bir ekranı denemek olurdu —
// adres alıcısında aynı ders alındı (22.08).
//
// KODLAR ayrı satırlardır (`discount_code`) ve bir kuponun BİRDEN ÇOK kodu olur. İlk kupon üç dilde
// üç kod taşıyor — kurulumun görünmesi gereken hâli bu: aynı kural, aynı kota, üç ayrı kapı. Geri
// kalanlar tek kodlu, çünkü tek kapılı kupon da meşrudur (matbu kart, iç deneme).

/** Sipariş bölümünün koda göre kupon bulabilmesi için: `code → discount id`. Her kapı ayrı kayıt. */
export type Kuponlar = Map<string, string>;

/** Kuralın kapıları — dil verilmezse "dilden bağımsız" kod (matbu kart üstündeki tek kod gibi). */
type Kod = { code: string; locale?: PreferredLanguage };

export async function seedDiscounts(db: Db, kisiler: Kisiler): Promise<Kuponlar> {
  const discounts = new DiscountService(db);
  const codes = new DiscountCodeService(db);
  const harita: Kuponlar = new Map();

  if (await tabloDolu(db, 'discount')) {
    console.log('▸ indirimler zaten dolu — atlandı');
    const rules = await discounts.list();
    for (const [id, kodlar] of await codes.listByDiscounts(rules.map((r) => r.id))) {
      for (const kod of kodlar) harita.set(kod.code, id);
    }
    return harita;
  }
  console.log('▸ KUPON + KAMPANYA seed');

  // Kapsam hedefleri: kategori/koleksiyon kapsamlı kampanya hedefsiz kurulamaz (DB kısıtı).
  const kategoriler = await new CategoryService(db).list();
  const koleksiyonlar = await new CollectionService(db).list();
  const baklava = kategoriler[0]?.id ?? null;
  const bayram = koleksiyonlar[0]?.id ?? null;

  const tanimlar: Array<DiscountInsert & { etiket: string; kodlar?: Kod[] }> = [
    // ── Kuponlar (müşteri kodu yazar) ─────────────────────────────────────────────────────────
    // Serbest test kuponu: hep geçerli, bol haklı. Kupon kutusunun MUTLU yolu — ve ÇOK KODLU hâlin
    // örneği: üç dil, üç kapı, tek kota (500 kullanım hepsinin toplamıdır).
    {
      etiket: 'Geçerli · %10 sepet · ÜÇ DİLDE KOD',
      name: 'Hoş geldin indirimi',
      publicLabel: { tr: 'Hoş geldin indirimi', fr: 'Offre de bienvenue', de: 'Willkommensrabatt' },
      trigger: 'coupon',
      kodlar: [
        { code: 'HOSGELDIN10', locale: 'tr' },
        { code: 'BIENVENUE10', locale: 'fr' },
        { code: 'WILLKOMMEN10', locale: 'de' },
      ],
      type: 'percent',
      percent: 10,
      scope: 'cart',
      minBasketCents: 2500,
      maxUses: 500,
    },
    // Sabit tutar + İLK SİPARİŞ koşulu: sadık müşteride reddedilir, yeni müşteride geçer.
    {
      etiket: 'Geçerli · 5 € · yalnız ilk sipariş',
      name: 'İlk sipariş jesti',
      publicLabel: { tr: 'İlk sipariş hediyesi', fr: 'Cadeau première commande', de: 'Geschenk zur Erstbestellung' },
      trigger: 'coupon',
      kodlar: [{ code: 'ILK5', locale: 'tr' }],
      type: 'fixed',
      amountCents: 500,
      scope: 'cart',
      firstOrderOnly: true,
      minBasketCents: 2000,
    },
    // Süresi DOLMUŞ: "bu kupon artık geçerli değil" cevabının kaynağı.
    {
      etiket: 'SÜRESİ DOLDU',
      name: 'Ramazan kampanyası (bitti)',
      publicLabel: { tr: 'Ramazan indirimi', fr: 'Offre du Ramadan', de: 'Ramadan-Rabatt' },
      trigger: 'coupon',
      kodlar: [{ code: 'RAMAZAN20', locale: 'tr' }],
      type: 'percent',
      percent: 20,
      scope: 'cart',
      validFrom: an(-60),
      validTo: an(-10),
    },
    // Henüz BAŞLAMAMIŞ: aynı ekranda "ileride geçerli" hâli — dolmuş kuponla aynı görünmemeli.
    {
      etiket: 'HENÜZ BAŞLAMADI',
      name: 'Kurban Bayramı ön kaydı',
      publicLabel: { tr: 'Bayram indirimi', fr: 'Offre de fête', de: 'Fest-Rabatt' },
      trigger: 'coupon',
      kodlar: [
        { code: 'BAYRAM15', locale: 'tr' },
        { code: 'FETE15', locale: 'fr' },
      ],
      type: 'percent',
      percent: 15,
      scope: 'cart',
      validFrom: an(20),
      validTo: an(35),
    },
    // TEK HAKLI: sipariş bölümü bunu kullanır → ekranda "hakkı tükendi" hâli doğar. Sayaç
    // tutulmuyor, kullanım satırlarından türetiliyor (0031) — tükenmişlik de öyle görünür.
    {
      etiket: 'TEK HAK (siparişle tükenecek)',
      name: 'Sınırlı deneme kuponu',
      publicLabel: { tr: 'Deneme kuponu', fr: 'Coupon découverte', de: 'Probier-Gutschein' },
      trigger: 'coupon',
      // Dilsiz kod (`locale` verilmedi): matbu bir kart üstündeki tek kodun karşılığı — kodun bir
      // dile ait olması ZORUNLU değil ve formun o hâli de görünmeli.
      kodlar: [{ code: 'TEKSEFER' }],
      type: 'fixed',
      amountCents: 800,
      scope: 'cart',
      maxUses: 1,
    },
    // KİŞİYE ÖZEL: yalnız Claire kullanabilir; başkasında "size ait değil". Puan çevriminden doğan
    // kuponlar da (17.4) aynı biçimde kişiseldir — bu onun elle kurulmuş kardeşi.
    {
      etiket: 'KİŞİYE ÖZEL (Claire)',
      name: 'Özür kuponu — geciken teslimat',
      publicLabel: { tr: 'Size özel jest', fr: 'Un geste pour vous', de: 'Eine Geste für Sie' },
      trigger: 'coupon',
      kodlar: [{ code: 'OZUR10', locale: 'tr' }],
      type: 'fixed',
      amountCents: 1000,
      scope: 'cart',
      customerId: kisiler.get('b2cSadik') ?? null,
      perCustomerLimit: 1,
    },
    // KAPATILMIŞ kupon: tanım duruyor ama operatör kapattı. Liste rozetinin pasif hâli.
    {
      etiket: 'PASİF',
      name: 'Kara Cuma (kapatıldı)',
      publicLabel: { tr: 'Kara Cuma', fr: 'Black Friday', de: 'Black Friday' },
      trigger: 'coupon',
      kodlar: [
        { code: 'KARACUMA25', locale: 'tr' },
        { code: 'BLACKFRIDAY25', locale: 'fr' },
      ],
      type: 'percent',
      percent: 25,
      scope: 'cart',
      isActive: false,
    },
    // MÜŞTERİ BAŞINA SINIR: kupon herkese açık ama kişi başı iki kez. "Kaç hak kaldı" ayrımı
    // toplam hak ile kişisel hakkın FARKLI sorular olduğunu gösterir.
    {
      etiket: 'Kişi başı 2 hak',
      name: 'Her ay bir kez',
      publicLabel: { tr: 'Aylık indirim', fr: 'Offre mensuelle', de: 'Monatsrabatt' },
      trigger: 'coupon',
      kodlar: [{ code: 'HERAY', locale: 'tr' }],
      type: 'percent',
      percent: 12,
      scope: 'cart',
      perCustomerLimit: 2,
      maxUses: 200,
    },

    // ── Otomatik kampanyalar (kod YOK — sepette kendiliğinden iner) ───────────────────────────
    // Kategori kapsamı: yalnız o kategorinin kalemleri matraha girer. En-büyük-kazanır kuralı
    // (motor) ancak birden çok geçerli kampanya varsa denenebilir — o yüzden üç tane.
    ...(baklava
      ? [
          {
            etiket: 'Kampanya · kategori %15',
            name: 'Baklava haftası',
            publicLabel: { tr: 'Baklava haftası', fr: 'Semaine du baklava', de: 'Baklava-Woche' },
            trigger: 'automatic' as const,
            type: 'percent' as const,
            percent: 15,
            scope: 'category' as const,
            categoryId: baklava,
            validFrom: an(-3),
            validTo: an(14),
          },
        ]
      : []),
    ...(bayram
      ? [
          {
            etiket: 'Kampanya · koleksiyon 3 €',
            name: 'Bayram Sofrası seçkisi',
            publicLabel: { tr: 'Bayram Sofrası', fr: 'Table de fête', de: 'Festtafel' },
            trigger: 'automatic' as const,
            type: 'fixed' as const,
            amountCents: 300,
            scope: 'collection' as const,
            collectionId: bayram,
          },
        ]
      : []),
    // Sepet kapsamı + eşik: 60 € altındaki sepette İNMEZ. "Az daha ekle, indirim insin" hâli.
    {
      etiket: 'Kampanya · 60 € üstü %8',
      name: 'Büyük sepet indirimi',
      publicLabel: { tr: 'Büyük sepet indirimi', fr: 'Remise gros panier', de: 'Großer-Warenkorb-Rabatt' },
      trigger: 'automatic',
      type: 'percent',
      percent: 8,
      scope: 'cart',
      minBasketCents: 6000,
    },
  ];

  let kapiSayisi = 0;
  for (const { etiket, kodlar, ...alanlar } of tanimlar) {
    const created = await discounts.insert(alanlar);
    // Kodlar kuraldan SONRA yazılır: bağlanacağı satır olmadan kod satırı yazılamaz.
    for (const kod of kodlar ?? []) {
      await codes.insert({ discountId: created.id, code: kod.code, locale: kod.locale ?? null });
      harita.set(kod.code, created.id);
      kapiSayisi += 1;
    }
    console.log(`  ✓ ${created.name} · ${etiket}`);
  }
  console.log(`✓ indirim: ${tanimlar.length} tanım (8 kupon · ${tanimlar.length - 8} otomatik kampanya) · ${kapiSayisi} kod`);
  return harita;
}
