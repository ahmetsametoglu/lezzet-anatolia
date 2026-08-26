import type { AssistantProposalKind, AssistantProposalStatus } from '@lezzet/types';
import { gun, an, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';

/*
  ── ASİSTAN ONAY KUYRUĞU (Modül 22) ─────────────────────────────────────────

  NEDEN VAR: kuyruk `db:refresh` sonrası HER SEFERİNDE boştu ve bu, modülün ekran doğrulamalarını
  aylardır kilitliyordu. Görev satırları *"kuyrukta iki `product_draft` önerisi var"* diye o günkü
  hâli anlatıyor, kullanıcı ekranı açtığında boş bir sayfa görüyordu — yani onbir gövdenin hiçbiri
  gözle sınanamıyordu (`BEKLEYEN(22.10/22.11/22.14/22.33/22.34/22.35)` hepsi aynı kökten).

  Barkod modülünün 23.14'te öğrendiği ders burada da geçerli: **test verisi sabit ve refresh'e
  dayanıklı olmalı.** Orada kâğıt etiket kodları sabitlendi; burada kuyruğa her tipten bir dilekçe
  düşüyor.

  ── PAYLOAD GERÇEK KAYITLARDAN TÜRER, UYDURULMAZ ────────────────────────────
  Her dilekçe seed'in kurduğu GERÇEK kimlikleri taşır (varyant, depo, hesap, bölge, parti). Sahte
  bir uuid yazmak iki şeyi birden bozardı: gövde açılırken ad çözümü boşa düşer ("—" görünür) ve
  onaylandığında uygulayıcı `23503` ile kesilir. Kimlik seçimi de sıraya değil ROLE bağlı
  (`test-labels.ts` dersi): "eldeki en yakın tarihli parti", "ilk açık tedarik siparişi" gibi.

  ── ONBİR TİPİN ONBİRİ DE VAR, VE BU BİR KAPSAM KURALI ──────────────────────
  Eksik tip = o gövdenin ekranda hiç açılmaması demek. `coverage.ts` bunu zorluyor: kuyruk tip
  sayısı onbirin altına düşerse seed çıkış kodu 1 verir.

  ── KARAR GEÇMİŞİ DE DOLU (kullanıcı kararı 26.08) ──────────────────────────
  Yalnız `pending` yazsaydık kuyruğun üç sekmesinden ikisi boş kalırdı ve iki davranış hiç
  sınanamazdı: karar verilmiş öneride formun KİLİTLİ görünmesi (22.19) ve tip süzgecinin geçmiş
  üzerinde çalışması (22.37). Bu yüzden dört dilekçe karara bağlanmış doğuyor — biri de `expired`,
  çünkü TTL'i geçmiş bir dilekçenin nasıl göründüğü de bir hâldir.
*/

/** Dilekçenin kuyruğa düşme şekli — durum + karar izi tek yerde. */
interface Dilekce {
  kind: AssistantProposalKind;
  summary: string;
  reason: string | null;
  payload: Record<string, unknown>;
  status?: AssistantProposalStatus;
  /** Kaç gün sonra sönecek; `expired` dilekçede GEÇMİŞ bir değer verilir. */
  ttlGun?: number;
}

/** Seed'in kurduğu gerçek kayıtlardan toplanan çapa kümesi — hepsi ROL ile seçilir, sırayla değil. */
export interface Capalar {
  depoId: string;
  depoKod: string;
  ikinciDepoId: string;
  tedarikciId: string | null;
  tedarikciAd: string | null;
  hesapId: string;
  hesapAd: string;
  karsiHesapId: string | null;
  karsiHesapAd: string | null;
  bolgeId: string;
  bolgeAd: string;
  kategoriId: string;
  kategoriAd: string;
  koleksiyonId: string | null;
  koleksiyonAd: string | null;
  parti: { id: string; variantId: string; expiryDate: string; physicalQty: number } | null;
  acikSiparisId: string | null;
  /**
   * Varyant → geçerli b2c fiyatı (**cent**). Paket ve fırsat dilekçeleri buradan kurulur.
   *
   * Uydurulmuş fiyat ekranda YALAN söyler ve bunu ölçerek gördük (26.08): elle yazılan 24,90 €'luk
   * paket, kalemleri ayrı almaktan pahalıya düşünce kart *"%−149 indirim"* çizdi. Kartın hesabı
   * doğruydu — girdi saçmaydı. Öneri gerçekçi olmalı ki onaylandığında işe yarasın.
   */
  fiyatlar: Map<string, number>;
}

/** Üç varyantı ROLLE seçer: dilekçelerin kalemleri bunlardan kurulur. */
function kalemVaryantlari(varyantlar: VaryantRef[]): VaryantRef[] {
  // SATIŞTAKİ varyantlar önce: aday (`candidate`) bir ürünü paket kalemine koymak, satılamayan bir
  // paket önerirdi — öneri gerçekçi olmalı ki onaylandığında işe yarasın.
  const satista = varyantlar.filter((v) => v.status === 'active');
  return (satista.length >= 3 ? satista : varyantlar).slice(0, 3);
}

async function capalariTopla(db: Db): Promise<Capalar | null> {
  const { data: depolar } = await db.from('warehouse').select('id, code, name').eq('kind', 'facility').order('sort_order');
  if (!depolar || depolar.length === 0) return null;

  const { data: tedarikciler } = await db.from('supplier').select('id, name').limit(1);
  const { data: hesaplar } = await db.from('account').select('id, name').order('created_at').limit(2);
  if (!hesaplar || hesaplar.length === 0) return null;

  const { data: bolgeler } = await db.from('delivery_zone').select('id, name').eq('is_active', true).limit(1);
  const { data: kategoriler } = await db.from('category').select('id, name').limit(1);
  const { data: koleksiyonlar } = await db.from('collection').select('id, name').limit(1);
  if (!bolgeler?.length || !kategoriler?.length) return null;

  // Parti ROLLE seçilir: eldeki EN YAKIN tarihli olan — fırsat kararının gerçek konusu odur.
  const { data: partiler } = await db
    .from('stock')
    .select('id, variant_id, expiry_date, physical_qty')
    .gt('physical_qty', 0)
    .not('expiry_date', 'is', null)
    .order('expiry_date')
    .limit(1);

  const { data: acikSiparisler } = await db
    .from('purchase_order')
    .select('id')
    .in('status', ['sent', 'partially_received'])
    .limit(1);

  const ad = (v: unknown): string => (typeof v === 'string' ? v : ((v as { tr?: string })?.tr ?? '—'));
  const parti = partiler?.[0];

  // Fiyatlar: kanal b2c, en SON yazılan kayıt kazanır (aynı varyantın birden çok dönem fiyatı var).
  const { data: fiyatSatirlari } = await db
    .from('price')
    .select('variant_id, amount, created_at')
    .eq('channel', 'b2c')
    .order('created_at');
  const fiyatlar = new Map<string, number>();
  for (const satir of fiyatSatirlari ?? []) {
    fiyatlar.set(satir.variant_id as string, Math.round(Number(satir.amount) * 100));
  }

  return {
    depoId: depolar[0]!.id,
    depoKod: depolar[0]!.code,
    ikinciDepoId: depolar[1]?.id ?? depolar[0]!.id,
    tedarikciId: tedarikciler?.[0]?.id ?? null,
    tedarikciAd: tedarikciler?.[0]?.name ?? null,
    hesapId: hesaplar[0]!.id,
    hesapAd: hesaplar[0]!.name,
    karsiHesapId: hesaplar[1]?.id ?? null,
    karsiHesapAd: hesaplar[1]?.name ?? null,
    bolgeId: bolgeler[0]!.id,
    bolgeAd: bolgeler[0]!.name,
    kategoriId: kategoriler[0]!.id,
    kategoriAd: ad(kategoriler[0]!.name),
    koleksiyonId: koleksiyonlar?.[0]?.id ?? null,
    koleksiyonAd: koleksiyonlar?.[0] ? ad(koleksiyonlar[0].name) : null,
    parti: parti
      ? {
          id: parti.id,
          variantId: parti.variant_id,
          expiryDate: parti.expiry_date as string,
          physicalQty: Number(parti.physical_qty),
        }
      : null,
    acikSiparisId: acikSiparisler?.[0]?.id ?? null,
    fiyatlar,
  };
}

/** Onbir tipin dilekçeleri — hepsi gerçek kimliklerle. */
export function dilekceler(c: Capalar, kalemler: VaryantRef[], varyantlar: VaryantRef[]): Dilekce[] {
  const [birinci, ikinci, ucuncu] = kalemler;
  const partiVaryanti = c.parti ? varyantlar.find((v) => v.id === c.parti!.variantId) : undefined;
  const liste: Dilekce[] = [];

  liste.push({
    kind: 'purchase_order',
    summary: `${c.tedarikciAd ?? 'Tedarikçi'} — 3 kalem yeniden sipariş (${c.depoKod})`,
    reason: 'Üç varyantın kullanılabilir stoğu yeniden sipariş eşiğinin altına indi.',
    payload: {
      warehouseId: c.depoId,
      warehouseCode: c.depoKod,
      supplierId: c.tedarikciId,
      supplierName: c.tedarikciAd,
      lines: kalemler.map((v, i) => ({
        variantId: v.id,
        productName: v.ad,
        qty: [24, 36, 12][i] ?? 12,
        lastPurchasePriceCents: [420, 780, 1150][i] ?? null,
      })),
      note: 'Eşik altı üç kalem tek siparişte toplandı.',
    },
  });

  // Paket fiyatı kalemlerin GERÇEK fiyatından türer, elle yazılmaz — %15 indirimli. Uydurulmuş bir
  // toplam kalemlerin altına düşerse kart "%−149 indirim" çizer (ölçüldü 26.08); hesap doğru,
  // girdi saçmaydı.
  const paketKalemleri = [birinci!, ikinci!].map((v) => ({ v, cent: c.fiyatlar.get(v.id) ?? 900 }));
  const paketHam = paketKalemleri.reduce((t, k) => t + k.cent, 0);
  const paketToplam = Math.round(paketHam * 0.85);
  liste.push({
    kind: 'bundle_draft',
    summary: `Paket önerisi — "${birinci!.ad}" ve "${ikinci!.ad}"`,
    reason: 'İki ürün son 30 günde sık birlikte sipariş edildi.',
    payload: {
      name: { tr: 'Kahvaltı İkilisi', fr: 'Duo petit-déjeuner', de: 'Frühstücks-Duo' },
      description: { tr: 'İki klasik bir arada.', fr: 'Deux classiques réunis.', de: 'Zwei Klassiker vereint.' },
      totalPrice: paketToplam / 100,
      serves: 4,
      // Kalem payı ORANSAL: pahalı kalem indirimden daha çok pay alır. Eşit bölmek, ucuz kalemin
      // payını fiyatının üstüne çıkarabilirdi.
      items: paketKalemleri.map((k) => ({
        variantId: k.v.id,
        productName: k.v.ad,
        qty: 1,
        allocatedUnitPrice: Math.round(paketToplam * (k.cent / paketHam)) / 100,
      })),
    },
  });

  liste.push({
    kind: 'featured_flag',
    summary: `Vitrine çıkar — ${c.koleksiyonAd ?? c.kategoriAd}`,
    reason: 'Bu hafta en çok tıklanan seçki; vitrinde yeri yok.',
    payload: c.koleksiyonId
      ? { target: 'collection', id: c.koleksiyonId, isFeatured: true, name: c.koleksiyonAd, currentlyFeaturedCount: 2 }
      : { target: 'category', id: c.kategoriId, isFeatured: true, name: c.kategoriAd, currentlyFeaturedCount: 2 },
  });

  liste.push({
    kind: 'discount_draft',
    summary: 'Kupon — sepette %10 (yeni müşteri)',
    reason: 'İlk siparişini vermemiş 42 kayıtlı müşteri var.',
    payload: {
      name: 'Hoş geldin %10',
      publicLabel: { tr: 'Hoş geldin indirimi', fr: 'Remise de bienvenue', de: 'Willkommensrabatt' },
      trigger: 'coupon',
      type: 'percent',
      percent: 10,
      amountCents: null,
      scope: 'cart',
      categoryId: null,
      collectionId: null,
      scopeName: null,
      minBasketCents: 3000,
      firstOrderOnly: true,
      maxUses: 200,
      perCustomerLimit: 1,
      validFrom: gun(0),
      validTo: gun(30),
      code: 'HOSGELDIN10',
    },
  });

  liste.push({
    kind: 'money_movement',
    summary: `Gider — ${c.tedarikciAd ?? 'tedarikçi'} faturası 486,20 €`,
    reason: 'Banka kuyruğunda eşleşmemiş bir çıkış duruyor.',
    payload: {
      accountId: c.hesapId,
      accountName: c.hesapAd,
      direction: 'out',
      amountCents: 48_620,
      type: 'expense',
      category: 'Hammadde',
      description: 'Ağustos ikinci yarı sevkiyatı',
      supplierId: c.tedarikciId,
      counterpartyName: c.tedarikciAd,
      counterAccountId: null,
      counterAccountName: null,
      valueDate: gun(-2),
    },
  });

  // Transfer, `money_movement`ın İKİNCİ hâli (22.22) — kendi tipi yok, gövdesi ayrı çiziliyor.
  if (c.karsiHesapId) {
    liste.push({
      kind: 'money_movement',
      summary: `Virman — ${c.hesapAd} → ${c.karsiHesapAd}`,
      reason: 'Kasadaki nakit bankaya yatırılmamış görünüyor.',
      payload: {
        accountId: c.hesapId,
        accountName: c.hesapAd,
        direction: 'out',
        amountCents: 120_000,
        type: 'transfer',
        category: null,
        description: 'Gün sonu kasa devri',
        supplierId: null,
        counterpartyName: null,
        counterAccountId: c.karsiHesapId,
        counterAccountName: c.karsiHesapAd,
        valueDate: gun(-1),
      },
    });
  }

  liste.push({
    kind: 'zone_extend',
    summary: `${c.bolgeAd} — 2 posta koduna genişleme`,
    reason: 'Bu iki kodda karşılanamayan talep birikti.',
    payload: {
      zoneId: c.bolgeId,
      zoneName: c.bolgeAd,
      country: 'FR',
      postalCodes: [
        { postalCode: '67300', placeName: 'Schiltigheim', requestCount: 14, waitingCount: 9 },
        { postalCode: '67500', placeName: 'Haguenau', requestCount: 6, waitingCount: 4 },
      ],
    },
  });

  liste.push({
    kind: 'product_draft',
    summary: `Beyan tamamlama — ${ucuncu!.ad}`,
    reason: 'Ambalaj fotoğrafından okunan alanlar kayıtta boş.',
    payload: {
      productId: ucuncu!.productId,
      productName: ucuncu!.ad,
      fields: {
        ingredients: {
          tr: 'Un, tereyağı, şeker, ceviz, su, tuz.',
          fr: 'Farine, beurre, sucre, noix, eau, sel.',
          de: 'Mehl, Butter, Zucker, Walnüsse, Wasser, Salz.',
        },
        storageInstructions: {
          tr: 'Serin ve kuru yerde saklayın.',
          fr: 'Conserver au frais et au sec.',
          de: 'Kühl und trocken lagern.',
        },
      },
      uncertainFields: ['nutrition'],
      remainingGaps: ['nutrition'],
    },
  });

  liste.push({
    kind: 'product_create',
    summary: 'Yeni ürün — Antep Fıstıklı Kurabiye (ambalajdan)',
    reason: 'Rafta okunan ambalaj katalogda yok.',
    payload: {
      name: { tr: 'Antep Fıstıklı Kurabiye', fr: 'Sablé à la pistache', de: 'Pistazien-Gebäck' },
      categoryId: c.kategoriId,
      categoryName: c.kategoriAd,
      dateType: 'DDM',
      shelfLifeDays: 120,
      vatRate: 5.5,
      description: {
        tr: 'Antep fıstığıyla hazırlanmış tereyağlı kurabiye.',
        fr: 'Sablé au beurre garni de pistaches.',
        de: 'Buttergebäck mit Pistazien.',
      },
      // Enum anahtarları ASCII-TÜRKÇE (`ProductAllergenEnum`), İngilizce değil — testin yakaladığı
      // ilk kusur buydu ve ekranda gövde hiç açılmayacaktı (`parseProposalPayload` reddederdi).
      allergens: ['gluten', 'sut', 'sert_kabuklu'],
      // Boy en az bir tane ZORUNLU: ürün varyantsız açılamaz (kayıt satılabilir bir şey olmalı).
      variants: [
        { label: { tr: '250 g', fr: '250 g', de: '250 g' }, netWeightG: 250, piecesCount: null },
        { label: { tr: '500 g', fr: '500 g', de: '500 g' }, netWeightG: 500, piecesCount: null },
      ],
      uncertainFields: ['nutrition'],
      remainingGaps: ['nutrition', 'ingredients'],
    },
  });

  liste.push({
    kind: 'recipe_draft',
    summary: 'Tarif — Fırında Peynirli Börek',
    reason: 'Bu iki malzemenin stoğu yüksek; tarif satışa yön verebilir.',
    payload: {
      name: { tr: 'Fırında Peynirli Börek', fr: 'Börek au fromage', de: 'Käse-Börek' },
      description: {
        tr: 'Yirmi dakikada hazır, kalabalık sofralara.',
        fr: 'Prêt en vingt minutes, pour les grandes tablées.',
        de: 'In zwanzig Minuten fertig, für große Runden.',
      },
      steps: {
        tr: '1. Fırını 200°C ısıtın.\n2. Yufkaları yağlayın.\n3. Peyniri yayın ve rulo yapın.\n4. 25 dakika pişirin.',
        fr: "1. Préchauffez à 200 °C.\n2. Huilez les feuilles.\n3. Étalez le fromage et roulez.\n4. Cuisez 25 minutes.",
        de: '1. Ofen auf 200 °C.\n2. Teigblätter einölen.\n3. Käse verteilen und rollen.\n4. 25 Minuten backen.',
      },
      serves: { tr: '4 kişilik', fr: '4 personnes', de: '4 Portionen' },
      duration: { tr: '25 dakika', fr: '25 minutes', de: '25 Minuten' },
      items: [
        { variantId: birinci!.id, productName: birinci!.ad, qty: 1 },
        { variantId: ikinci!.id, productName: ikinci!.ad, qty: 2 },
      ],
    },
  });

  if (c.parti && partiVaryanti) {
    liste.push({
      kind: 'batch_offer',
      summary: `Fırsat — ${partiVaryanti.ad} (${c.parti.expiryDate})`,
      reason: 'Partinin raf ömrü eşiğin altına indi; indirimle eritilebilir.',
      payload: {
        batchId: c.parti.id,
        variantId: c.parti.variantId,
        productName: partiVaryanti.ad,
        warehouseCode: c.depoKod,
        expiryDate: c.parti.expiryDate,
        // Teklif fiyatı LİSTEDEN türer (%40 indirim) — ikisi de uydurulsaydı kart olmayan bir
        // indirim oranı çizerdi. Liste okunamıyorsa teklif de tahmin edilmez: eldeki tek gerçek
        // sayıya oran uygulanır.
        offerPriceCents: Math.round((c.fiyatlar.get(c.parti.variantId) ?? 1150) * 0.6),
        listPriceCents: c.fiyatlar.get(c.parti.variantId) ?? null,
        physicalQty: c.parti.physicalQty,
      },
    });
  }

  liste.push({
    kind: 'stock_intake',
    summary: `Mal kabul — ${c.tedarikciAd ?? 'tedarikçi'} irsaliyesi (2 kalem)`,
    reason: 'Fatura fotoğrafından okunan satırlar stoğa girilmemiş.',
    payload: {
      warehouseId: c.depoId,
      warehouseCode: c.depoKod,
      supplierId: c.tedarikciId,
      supplierName: c.tedarikciAd,
      purchaseOrderId: c.acikSiparisId,
      documentNo: 'IRS-2026-0841',
      date: gun(-1),
      totalAmountCents: 27_400,
      lines: [
        {
          variantId: birinci!.id,
          productName: birinci!.ad,
          qty: 20,
          expiryDate: gun(90),
          lotNumber: 'L-26-0841',
          unitCostCents: 820,
        },
        {
          variantId: ikinci!.id,
          productName: ikinci!.ad,
          qty: 12,
          expiryDate: gun(60),
          lotNumber: 'L-26-0842',
          unitCostCents: 925,
        },
      ],
    },
  });

  return liste;
}

/**
 * **Karar geçmişi** — kuyruğun öteki iki sekmesi (kullanıcı kararı 26.08).
 *
 * Dört dilekçe karara bağlanmış doğar. `expired` olanın TTL'i GEÇMİŞTİR: sönmüş bir dilekçenin
 * nasıl göründüğü de bir hâldir ve yalnız burada üretilebilir (kuyruk süpürücüsü onu bekleyenden
 * çekemez, çünkü kuyruk her refresh'te yeni doğuyor).
 */
export function kararlilar(c: Capalar, kalemler: VaryantRef[]): Dilekce[] {
  const [birinci, ikinci] = kalemler;
  // Sönmüş paket de gerçek fiyattan kurulur: arşivdeki bir kart da saçma bir oran çizebilir.
  const birinciCent = c.fiyatlar.get(birinci!.id) ?? 900;
  const ikinciCent = c.fiyatlar.get(ikinci!.id) ?? 900;
  const sonmusHam = birinciCent * 2 + ikinciCent;
  const sonmusToplam = Math.round(sonmusHam * 0.85);
  return [
    {
      kind: 'featured_flag',
      summary: `Vitrinden çıkar — ${c.kategoriAd}`,
      reason: 'Sezon bitti, tıklanma düştü.',
      status: 'applied',
      payload: { target: 'category', id: c.kategoriId, isFeatured: false, name: c.kategoriAd },
    },
    {
      kind: 'discount_draft',
      summary: 'Kampanya — kategoride %25',
      reason: 'Stok eritme önerisi.',
      status: 'rejected',
      payload: {
        name: 'Sezon sonu %25',
        publicLabel: { tr: 'Sezon sonu', fr: 'Fin de saison', de: 'Saisonende' },
        trigger: 'automatic',
        type: 'percent',
        percent: 25,
        amountCents: null,
        scope: 'category',
        categoryId: c.kategoriId,
        collectionId: null,
        scopeName: c.kategoriAd,
        minBasketCents: null,
        validFrom: gun(-10),
        validTo: gun(-3),
        code: null,
      },
    },
    {
      kind: 'purchase_order',
      summary: `${c.tedarikciAd ?? 'Tedarikçi'} — 1 kalem acil sipariş`,
      reason: 'Stok tükendi.',
      status: 'applied',
      payload: {
        warehouseId: c.ikinciDepoId,
        warehouseCode: c.depoKod,
        supplierId: c.tedarikciId,
        supplierName: c.tedarikciAd,
        lines: [{ variantId: birinci!.id, productName: birinci!.ad, qty: 48, lastPurchasePriceCents: 410 }],
      },
    },
    {
      kind: 'bundle_draft',
      summary: 'Paket önerisi — süresi doldu',
      reason: 'Karara bağlanmadan TTL geçti.',
      status: 'expired',
      ttlGun: -2,
      payload: {
        name: { tr: 'Akşam Sofrası', fr: 'Table du soir', de: 'Abendtisch' },
        totalPrice: sonmusToplam / 100,
        items: [
          {
            variantId: birinci!.id,
            productName: birinci!.ad,
            qty: 2,
            allocatedUnitPrice: Math.round(sonmusToplam * ((birinciCent * 2) / sonmusHam)) / 100 / 2,
          },
          {
            variantId: ikinci!.id,
            productName: ikinci!.ad,
            qty: 1,
            allocatedUnitPrice: Math.round(sonmusToplam * (ikinciCent / sonmusHam)) / 100,
          },
        ],
      },
    },
  ];
}

/**
 * Asistan onay kuyruğunu doldurur — onbir tip bekliyor, dördü karara bağlanmış.
 *
 * Çapalardan biri bulunamazsa (katalog boş, hesap yok) bölüm SESSİZCE atlanmaz: bir uyarı basar ve
 * geri döner — kapsam kovası zaten boş kuyruğu yakalar, ama sebebini burada okumak teşhisi kısaltır.
 */
export async function seedAssistantProposals(db: Db, varyantlar: VaryantRef[], kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'assistant_proposal')) return;

  const capalar = await capalariTopla(db);
  if (!capalar) {
    console.warn('  ⚠ asistan kuyruğu atlandı — çapa kayıtları (depo/hesap/bölge/kategori) eksik');
    return;
  }

  const kalemler = kalemVaryantlari(varyantlar);
  if (kalemler.length < 3) {
    console.warn('  ⚠ asistan kuyruğu atlandı — kalem kurmaya yetecek varyant yok');
    return;
  }

  // Kararı VEREN gerçek bir personel: `decided_by` boş bırakılsaydı ekran "kim karar verdi"
  // sorusuna cevap veremezdi ve arşiv satırı yarım görünürdü.
  const yonetici = kisiler.get('yonetici') ?? kisiler.get('admin') ?? null;

  const bekleyen = dilekceler(capalar, kalemler, varyantlar);
  const kararli = kararlilar(capalar, kalemler);

  const satirlar = [...bekleyen, ...kararli].map((d) => {
    // `expired` bir KARAR DEĞİL, sönmedir — kural veride duruyor
    // (`assistant_proposal_decided_status`: `decided_at` yalnız applied/rejected/failed'de dolu
    // olabilir) ve seed'in ilk denemesini o kısıt kesti. Karar izi yalnız gerçekten karar
    // verilmiş dilekçeye yazılır; TTL'i geçen dilekçenin kararı yoktur, çünkü kimse bakmamıştır.
    const karar = d.status === 'applied' || d.status === 'rejected';
    return {
      kind: d.kind,
      source_session: 'seed',
      payload: d.payload,
      summary: d.summary,
      reason: d.reason,
      status: d.status ?? 'pending',
      // Doğum TTL'den yedi gün öncesi. Sabit `now()` bırakılamazdı: sönmüş dilekçenin `expires_at`i
      // geçmişte ve veri `expires_at > created_at` istiyor (`assistant_proposal_ttl`) — kısıt haklı,
      // çünkü sönme tarihi doğumdan önce olan bir dilekçe hiç var olmamış demektir.
      created_at: an((d.ttlGun ?? 7) - 7),
      expires_at: an(d.ttlGun ?? 7),
      decided_by: karar ? yonetici : null,
      decided_at: karar ? an(-1) : null,
      applied_at: d.status === 'applied' ? an(-1) : null,
    };
  });

  const { error } = await db.from('assistant_proposal').insert(satirlar);
  if (error) throw error;

  const tipler = new Set(bekleyen.map((d) => d.kind)).size;
  console.log(`  ✓ asistan kuyruğu: ${bekleyen.length} bekleyen (${tipler} tip) + ${kararli.length} karar geçmişi`);
}
