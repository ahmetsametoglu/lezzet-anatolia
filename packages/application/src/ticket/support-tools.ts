// `z` de porttan geliyor ve gerekçesi teknik: SDK aracın şemasını doğrularken tek zod örneği
// bekliyor, ikinci bir kopya sessizce tutmaz (`@lezzet/ai` barrel künyesi).
import { tool, z, type ToolSet } from '@lezzet/ai';
import { AddressService, OrderService, PostalCodePlaceService, type Db } from '@lezzet/database';
import { formatPrice, formatShortDate } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import { COUNTRY_LABELS, ORDER_STATUS_LABELS, type Address, type StockStatus } from '@lezzet/types';
import { getCatalogData } from '../catalog/catalog';
import { pricingViewerOf } from '../catalog/pricing-viewer';
import { getProductDetail } from '../catalog/product';
import { resolvePlaceForPostalCode, resolvePlaceWarehouses, UNRESOLVED_PLACE } from '../delivery/place';
import { readDeliveryInputs, resolveDelivery } from '../order/delivery';
import { readPublicDeliveryTerms } from '../settings/public-terms';

/*
  DESTEK AJANININ ARAÇLARI (16.9) — modelin veriye KENDİSİ bakabildiği dar yüzey.

  ── NEDEN MCP DEĞİL ─────────────────────────────────────────────────────────
  MCP sunucusu (`apps/backend/src/mcp`) YÖNETİCİ asistanınındır: araçları toplu iş verisi döndürür
  (satış özeti, talep sinyalleri, bölge haritası) ve kendi talimatı "sahibe konuşursun, müşteriye
  asla" der. O araçları müşteriye yazan bir ajana vermek, işletme rakamlarının bir yazışmada
  ağızdan çıkması demekti. Kapısı da tek paylaşımlı anahtarla korunuyor ve "yalnız bu müşterinin
  verisi" diye daraltılamıyor. Üstelik MCP bir TAŞIMA katmanı; destek ajanı zaten aynı süreçte
  koşuyor, araya ağ koymak yalnız gecikme ve arıza yüzeyi eklerdi.

  ── DEĞİŞMEZ: KİMLİK ARGÜMAN DEĞİL, KAPANIŞTIR ──────────────────────────────
  Hiçbir aracın girdisinde `customerId` YOKTUR ve olmayacak. Araçlar istek başına, müşteri kimliği
  kapatılmış (closure) hâlde kurulur; model yalnız "benim teslimat günlerim" diye sorabilir,
  "şu kişininki" diye soramaz — çünkü soracak alan yok. Uydurulmuş bir kimlikle başkasının verisini
  okuması böylece OLANAKSIZ olur; kural veride değil imzada durur (talep kapılarının "sahiplik
  imzada" kuralının aynısı).

  ── DEĞİŞMEZ: YALNIZ OKUR ───────────────────────────────────────────────────
  Yazan araç yok ve bu bir eksiklik değil, sınırın kendisi: siparişin gününü değiştirmek gerçek bir
  operasyon kararıdır (`dispatch-actions.ts` operatörün elinde) ve sipariş değişikliği zaten devir
  tetikleyicileri arasında. Ajan gerçeği SÖYLER, taahhüdü insan verir.

  ── DEĞİŞMEZ: İŞLEM TUTARI YOK — LİSTE FİYATI VAR (22.08'de netleşti) ────────
  Sipariş aracı numara/durum/teslim günü döndürür, TUTAR döndürmez: sipariş toplamı, iade, telafi,
  indirim pazarlığı insanın işidir (`ticket-support.ts` künyesi).

  Katalog aracı (`urun_ara`) FİYAT döndürür ve bu değişmezi ihlal etmez, çünkü ikisi ayrı şeydir:
  liste fiyatı sitede herkese açık YAYIMLANMIŞ bilgidir, işlem tutarı ise bir karardır. "Baklava
  3,76 €" demek taahhüt değil, katalogu okumaktır; "size 3,00 €'ya veririm" demek karardır ve ajan
  onu yapamaz (prompt bunu ayrıca yasaklıyor: indirim ekleme, pazarlık yapma, "sana özel" rakam yok).

  Fiyat MÜŞTERİNİN KENDİ fiyatıdır, varsayılan değil: `pricingViewerOf` kanalı (B2C/B2B) ve kademeyi
  çözüyor. Ölçüldü (22.08): aynı ürün B2B müşteride 3,76 €, B2C müşteride 4,57 €. Varsayılan bir
  görüntüleyici geçilseydi toptancıya perakende fiyat söylenirdi — sessiz ve ticari bir hata.

  ── BİLİNMEYEN, SIFIR DEĞİLDİR ──────────────────────────────────────────────
  Adres yoksa ya da posta kodu hiçbir aktif bölgeye düşmüyorsa araç "gün yok" DEMEZ, `bilinmiyor`
  der ve sebebini yazar. "Teslimat günü yok" cümlesi müşteriye yanlış bir kesinlik verirdi; prompt
  da bu hâlde gün söylemeyip devretmekle yükümlü (CLAUDE §1).
*/

/**
 * Katalog aramasında modele verilecek EN FAZLA ürün sayısı.
 *
 * Tavan var çünkü araç cevabı prompt'a giriyor: sınırsız bir liste hem maliyeti hem de modelin
 * "hangisini söyleyeyim" belirsizliğini büyütürdü. Beş, müşterinin tek soruda duyabileceği makul
 * sayı — daha fazlası zaten sohbet değil, katalog gezintisidir ve orası sitenin işi.
 */
const PRODUCT_HITS = 5;

/**
 * KATEGORİ aramasının tavanı ayrı ve daha yüksek (07.09 · ölçülmüş arıza).
 *
 * Beş, "baklava var mı" gibi bir İSİM sorusunda doğru sayıydı. Kategori sorusunda değil: müşteri
 * *"ne tip tatlı çeşitleriniz var"* diye sordu, Tatlı kategorisindeki **20 üründen** ilk beşi
 * döndü ve beşi de tesadüfen baklavaydı — ajan da *"tatlı çeşitlerimiz sadece baklavalardan
 * oluşmaktadır"* dedi. Kırpılmış listeden MUTLAK bir hüküm çıkardı.
 *
 * Sayıyı yükseltmek tek başına yetmez ve asıl düzeltme öteki yarıda: kırpma artık SESSİZ değil,
 * çıktı kaç üründen kaçını gösterdiğini söylüyor (`kapsam`). Sayı da yine sonlu — sınırsız liste
 * hem maliyeti hem "hangisini söyleyeyim" belirsizliğini büyütür, ve tam katalog sohbetin değil
 * sitenin işidir.
 */
const CATEGORY_HITS = 20;

/**
 * Stok hâlinin modele söylenen karşılığı — DÖRT hâl, dört ayrı cümle (19.10).
 *
 * `Record` kilit: enum büyüdüğünde derleme durur. Cümleler bilerek KOŞULLU değil AÇIK — "elsewhere"
 * için "yok" demek yanlış olurdu (mal var, ama müşterinin deposunda değil) ve model o farkı ancak
 * kendisine söylenirse bilir.
 */
const STOK_SOZLUGU: Record<StockStatus, string> = {
  available: 'stokta — bu adrese teslim edilebilir',
  shipping: 'stokta — bu adrese kargoyla gider',
  elsewhere: 'başka depoda var; bu adrese bugün verilemiyor',
  out_of_stock: 'tükendi',
};

/** Modelin gördüğü tarih biçimi — "18 Ağustos Salı". İki bilgi tek dizede: gün adı da lazım. */
function tarihAdi(iso: string): string {
  const gun = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(new Date(iso));
  return `${formatShortDate(iso, 'tr')} ${gun}`;
}

/**
 * ISO gün numarası (1=Pazartesi … 7=Pazar) → Türkçe ad.
 *
 * Sabit bir referans haftadan türetiliyor (2024-01-01 bir Pazartesi): elle yazılmış yedi elemanlı
 * bir dizi, sıralaması bir gün kayarsa hiçbir yerde hata vermeden yanlış gün söyletirdi.
 */
function gunAdi(isoGun: number): string {
  const gun = new Date(2024, 0, isoGun); // 1 Ocak 2024 = Pazartesi
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(gun);
}

/** Varsayılan adres, yoksa ilk adres — müşterinin "benim adresim" dediği tek yer. */
function birincilAdres(adresler: Address[]): Address | null {
  return adresler.find((a) => a.isDefault) ?? adresler[0] ?? null;
}

/**
 * Bir müşteriye KAPATILMIŞ araç seti.
 *
 * Çağıran talebin sahibini geçirir; model o kimliği ne görür ne değiştirebilir. Araç gövdesinde
 * hata olursa fırlatmaz — `bilinmiyor` döner ve log'a KİMLİK düşer (içerik değil): fırlatan bir
 * araç koşuyu düşürür ve müşteri cevapsız kalırdı.
 *
 * ── KİMLİK YOKSA SET BOŞ DEĞİL, DAR (28.08 · `CHANNELS §3b`) ────────────────
 * `customerId` **null olabilir** ve bu hâl Messenger/Instagram'da istisna değil KURAL: PSID telefon
 * taşımaz, sohbet kimliksiz doğar. Bir tur boyunca o sohbetlerde HİÇ araç verilmiyordu ve bu,
 * `ai.ts`'in kendi künyesiyle çelişiyordu (*"ajan o hâlde de konuşur ama yalnız herkese açık
 * bilgiyle"*) — ajan herkese açık bilgiyi bile okuyamıyordu. "67000'e geliyor musunuz" sorusunun
 * cevabı sitede ziyaretçiye açıkken sohbette cevapsız kalıyordu.
 *
 * Ayrım kanalda değil SORUDA: kimseye ait olmayan bilgi (katalog, fiyat listesi, teslimat şartları,
 * bir posta koduna gidip gitmediğimiz) kimlik istemez; müşterinin GEÇMİŞİ ister.
 */
export function customerSupportTools(db: Db, customerId: string | null): ToolSet {
  return { ...publicTools(db, customerId), ...(customerId ? identityTools(db, customerId) : {}) };
}

/**
 * Müşterinin KENDİ verisini okuyan araçlar — kimlik çapası açıkken verilir (`ai.ts` kapısı).
 *
 * Girdileri BOŞ ve bilerek: sorulacak tek şey "benimki"dir. Kimlik argüman olsaydı model
 * başkasınınkini sorabilirdi (dosya başındaki değişmez).
 */
function identityTools(db: Db, customerId: string): ToolSet {
  return {
    teslimat_gunleri: tool({
      description:
        'Müşterinin kendi adresine hangi günler teslimat yapıldığını ve yaklaşan somut tarihleri söyler. ' +
        'Teslimat günü, rota günü ya da "ne zaman gelirsiniz" sorularında MUTLAKA bunu çağır.',
      // Girdi BOŞ ve bilerek: sorulacak tek adres müşterinin kendi adresi (künye: kimlik kapanıştır).
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const adres = birincilAdres(await new AddressService(db).listByCustomer(customerId));
          if (!adres) return { bilinmiyor: 'Müşterinin kayıtlı adresi yok — hangi adrese sorulacağı belli değil.' };

          // Rota çözümü MOTORUN işi (`resolveDelivery`): kesim saati, bölge eşleşmesi ve yaklaşan
          // tarihler orada hesaplanıyor. Burada ikinci bir kopya yazmak, checkout ile ajanın farklı
          // gün söylemesi demekti. Bölge listesi bir kez okunup GEÇİLİYOR: haftalık günleri aynı
          // listeden alacağız, iki ayrı okuma iki farklı ana ait olabilirdi.
          const inputs = await readDeliveryInputs(db);
          const cozum = await resolveDelivery(db, {
            postalCode: adres.postalCode,
            country: adres.country,
            inputs,
          });

          if (cozum.deliveryType !== 'route') {
            return {
              bilinmiyor:
                'Bu adres rota dışında (kargo bölgesi) — haftalık teslimat günü yok, gönderi kargoyla gidiyor.',
            };
          }
          const bolge = inputs.zones.find((z) => z.id === cozum.zoneId);
          return {
            adres: `${adres.postalCode} ${adres.city}`,
            haftalikGunler: (bolge?.weekdays ?? []).map(gunAdi),
            yaklasanTarihler: cozum.availableDates.map(tarihAdi),
          };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'teslimat_gunleri', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Teslimat bilgisi şu an okunamadı.' };
        }
      },
    }),

    siparislerim: tool({
      description:
        'Müşterinin son siparişlerini listeler: sipariş numarası, durumu ve teslim günü. ' +
        'Sipariş durumu, "nerede kaldı", "ne zaman gelecek" sorularında çağır. Tutar bilgisi VERMEZ.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const sayfa = await new OrderService(db).listByCustomer(customerId, { limit: 5 });
          /*
            ── BOŞ LİSTE BİR CEVAPTIR, SESSİZLİK DEĞİL (07.09 · ölçülmüş arıza) ────────────────
            Araç sıfır siparişte açıklamasız `{ siparisler: [] }` döndürüyordu ve model bunu
            YORUMLAMAK zorunda kalıyordu. Yorumu da yanlış çıktı: ajan *"sipariş geçmişini
            göremediğimiz için"* diye devretti — yani "veri yok"u "erişemiyorum" sandı. Oysa
            elinde araç vardı ve kapı açıktı; eksik olan tek şey boşluğun ADIYDI.

            Aynı dosyadaki öteki araçlar bunu zaten doğru yapıyor (`urun_ara` boşta *"katalogda
            eşleşen ürün yok"* diye cümle kurar). Bu araç kurmuyordu — tek fark buydu.

            "Okunamadı" ile "yok" AYRI kalıyor: ilki `bilinmiyor`la (catch dalı), ikincisi burada.
            İkisini tek cümleye indirmek, arızayı boşlukmuş gibi göstermek olurdu.
          */
          if (sayfa.rows.length === 0) {
            return { siparisYok: 'Bu müşterinin sistemde kayıtlı siparişi YOK. Bu bir erişim sorunu değil — geçmişi okuyabildin, boş çıktı.' };
          }
          return {
            siparisler: sayfa.rows.map((o) => ({
              numara: o.referenceNo,
              durum: ORDER_STATUS_LABELS[o.status],
              teslimGunu: o.deliveryDate ? tarihAdi(o.deliveryDate) : 'kargo (rota günü yok)',
            })),
          };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'siparislerim', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Sipariş bilgisi şu an okunamadı.' };
        }
      },
    }),
  };
}

/**
 * KİMLİK İSTEMEYEN araçlar — kimliksiz sohbette de verilir.
 *
 * `customerId` yine geçiliyor ama **zorunlu değil**: varsa cevap müşterinin kapsamıyla daralır
 * (B2B fiyatı, kendi bölgesinin stoğu), yoksa ziyaretçi kapsamına düşer — `pricingViewerOf`'un
 * kendi kuralı (`!customerId → VISITOR`). Yani aynı araç iki modda çalışır ve ikisi de dürüsttür;
 * ikinci bir "ziyaretçi seti" yazmak aynı üç aracın ikinci kopyası olurdu.
 */
function publicTools(db: Db, customerId: string | null): ToolSet {
  return {
    urun_ara: tool({
      description:
        'Katalogda ürün arar ve müşterinin KENDİ fiyatıyla, KENDİ adresine göre satın alınabilirliğini söyler. ' +
        '"X var mı", "fiyatı ne", "kaça", "hangi boyları var" sorularında MUTLAKA bunu çağır. Tahmin etme.',
      inputSchema: z.object({
        terim: z
          .string()
          .min(2)
          .describe(
            'Ürün adı YA DA kategori adı — örn. "baklava", "su böreği", "tatlı", "pasta", "dondurma". ' +
              'Terim bir kategoriyle eşleşirse araç o kategorinin ürünlerini döndürür ve bunu `kategori` alanıyla söyler; ' +
              'eşleşmezse adı eşleşen ürünleri döndürür. Hangisi olduğunu ÇIKTIDAKİ `kapsam` alanından oku.',
          ),
        postaKodu: z
          .string()
          .min(4)
          .optional()
          .describe(
            'Müşteri SÖYLEDİYSE posta kodu — stok o bölgenin deposundan okunur. ' +
              'Kayıtlı adresi olan müşteride bile SÖYLENEN kod önceliklidir (başka adrese gönderiyor olabilir). ' +
              'Müşteri söylemediyse BOŞ bırak, uydurma.',
          ),
      }),
      execute: async ({ terim, postaKodu }) => {
        try {
          /*
            İKİ BAĞLAM ZORUNLU — katalog kapısının kendi kuralı: `place` (hangi depo) ve `viewer`
            (hangi kanal/kademe). Varsayılan geçmek, B2B müşteriye B2C fiyatı ya da başka deponun
            stoğunu okutmak olurdu; kapı bu yüzden ikisini de zorunlu istiyor (`CatalogInput`
            künyesi) ve araç da uydurmuyor.

            ── YER ÜÇ KAYNAKTAN, BU SIRAYLA (28.08 · `CHANNELS §3b`) ─────────────
            (1) sohbette SÖYLENEN posta kodu · (2) müşterinin kayıtlı adresi · (3) hiçbiri.
            Söylenen kod öndedir ve bilerek: "annemin evine, 75001'e gelir mi" diyen müşteride
            kayıtlı adres YANLIŞ cevabı verirdi. Posta kodu KİMLİK DEĞİL — herkese açık bir soru
            (`posta_kodu_kontrol` künyesinin kurduğu gerekçe); o yüzden bu araç kimliksiz sohbette
            de tam çalışır ve kimliksizlik yalnız FİYAT kapsamını ziyaretçiye düşürür.

            Yer hiç çözülemezse `place` DEPO-ÜSTÜ okunur (`UNRESOLVED_PLACE`): "hiç var mı" sorusu
            cevaplanabilir, "sana gelir mi" cevaplanamaz — ve model bunu bilsin diye cevapta ayrıca
            söyleniyor (`yerBilinmiyor`), üstelik çaresiyle: posta kodunu SOR ve yeniden çağır.
          */
          const adres = customerId ? birincilAdres(await new AddressService(db).listByCustomer(customerId)) : null;
          const kod = postaKodu?.trim() || adres?.postalCode || null;
          const [place, viewer] = await Promise.all([
            kod ? resolvePlaceWarehouses(db, kod) : Promise.resolve(UNRESOLVED_PLACE),
            pricingViewerOf(db, customerId),
          ]);

          const ortak = {
            // Operasyon dili Türkçe ve model Türkçe yazıyor; cevabın müşteri diline çevrilmesi
            // gönderim anında, tek kapıdan yapılıyor (20.2). Araç ikinci bir dil kararı vermez.
            locale: 'tr' as const,
            place,
            viewer,
            /* REFERANS okuma — vitrin değil (08.46). Vitrin, kanalında satılamayan ürünü hiç
               listelemiyor ve müşteri için doğrusu o. Ama burada müşteri bir ürünü ADIYLA soruyor;
               süzseydik araç VAR OLAN bir ürün için "katalogda eşleşen ürün yok" derdi. Doğru cümle
               aşağıda zaten kurulu: "bu kanalda satışa kapalı". */
            includeUnsellable: true,
          };

          const isimAramasi = await getCatalogData(db, { ...ortak, query: { search: terim } });

          /*
            ── "TATLI" BİR ÜRÜN ADI DEĞİL, BİR KATEGORİDİR (06.09 · ölçülmüş arıza) ────────────
            Müşteri *"başka tatlı çeşitleriniz var mı"* diye sordu; araç yalnız ADDA arayabildiği
            için `Tatlı Simit` döndü ve ajan bir FIRIN ürününü tatlı diye saydı. Model kusuru
            DEĞİLDİ: kategori ne girdide vardı ne çıktıda — "tatlı bir kategoridir" bilgisini
            bilse bile kullanacağı bir kapı yoktu.

            Kapı burada açılıyor ve karar ARAÇTA veriliyor, modelde değil: terim bir kategori
            adıyla eşleşiyorsa arama o kategoriye daraltılır. Modele "önce kategori mi diye bak"
            demek, unutulabilecek bir talimat olurdu; burada unutulamaz.

            Kategori listesi ayrı bir okumadan gelmiyor — `getCatalogData` onu zaten döndürüyor.
            İkinci çağrı yalnız gerçekten kategori eşleştiğinde yapılıyor.
          */
          const normalize = (s: string) => s.trim().toLocaleLowerCase('tr');
          const kategori = isimAramasi.categories.find((c) => normalize(c.name) === normalize(terim)) ?? null;

          const katalog = kategori
            ? await getCatalogData(db, { ...ortak, query: { categorySlug: kategori.slug } })
            : isimAramasi;

          /*
            FİYAT ALANI ADIYLA NE OLDUĞUNU SÖYLER (06.09 · ölçülmüş arıza).

            `p.priceCents` çok boylu üründe **başlangıç fiyatıdır** — en ucuz aktif boyun fiyatı
            (`map.ts` künyesi; sitede "…'dan" diye çizilir). Alan düpedüz `fiyat` diye veriliyordu
            ve ajan onu TEK fiyat sanıp öyle yazdı: müşteri "fıstıklı baklava" diye genel sordu,
            dört boydan yalnız en küçüğünü (225 g · 4,57 €) öğrendi, ötekilerin varlığını hiç
            duymadı. Cevap YANLIŞ değildi — gramaj ve fiyat aynı varyanttan geldiği için eşleşme
            doğruydu — ama eksikti, ve eksikliği doğuran şey alan adının sustuğu bilgiydi.

            Bu, para alanının taşıdığı anlamı adında söyleme kuralının aynısı: tek boyluda `fiyat`,
            çok boyluda `enUcuzBoy`/`fiyatBaslangic`. Model hangisini okuduğunu adından bilir.
          */
          const tavan = kategori ? CATEGORY_HITS : PRODUCT_HITS;
          const urunler = katalog.products.slice(0, tavan).map((p) => {
            const fiyat = p.priceCents === null ? 'bu kanalda satışa kapalı' : formatPrice(p.priceCents, 'tr');
            return {
              ad: p.name,
              durum: STOK_SOZLUGU[p.stockStatus],
              /* KARGO UYGUNLUĞU AYRI BİR GERÇEK (07.09 · ölçülmüş arıza). `durum` "bu adrese gider
                 mi" sorusunu cevaplıyor; bu "kargoyla hiç gider mi". Ajan bu alan yokken *"tüm
                 ürünlerimiz kargo ile gönderime uygundur"* dedi ve sorgulanınca ısrar etti — oysa
                 aktif ürünlerin üçte biri (dondurmalar, taze fırın, çiğ köfte) kargoya verilemiyor.
                 Cümle olarak veriliyor, bayrak olarak değil: `false` bir alanı model "önemsiz"
                 sayıp atlayabilir, cümleyi atlayamaz. */
              kargo: p.shippable ? 'kargoya verilebilir' : 'KARGOYA VERİLEMEZ — yalnız bölge içi kapıya teslim',
              // `null` fiyat = bu kanalda SATIŞA KAPALI (DOMAIN §5) — "0 €" demek yanlış olurdu.
              ...(p.variantCount > 1
                ? { boySayisi: p.variantCount, enUcuzBoy: p.unitLabel, fiyatBaslangic: fiyat }
                : { birim: p.unitLabel, fiyat }),
            };
          });

          if (urunler.length === 0) return { bilinmiyor: `"${terim}" için katalogda eşleşen ürün yok.` };

          /*
            EN İYİ EŞLEŞMENİN BOYLARI — sayı yetmez, LİSTE gerekir.

            Araç bugüne kadar yalnız `boySayisi: 4` diyordu; ajan "dört boy var" bilgisine sahipti
            ama boyların etiketini ve fiyatını BİLMİYORDU, yani isteseydi de sayamazdı. Müşterinin
            "hangi boylar var, kaça" sorusu cevapsız kalıyordu.

            YALNIZ İLK EŞLEŞME için okunuyor ve bu bilinçli: beş ürünün beşine detay çekmek beş
            ekstra sorgu demekti, oysa müşteri genelde tek ürünü soruyor ve arama zaten ilgiye göre
            sıralı. İkinci ürünün boyları gerekirse model onu adıyla yeniden aratır.

            Detay AYNI motordan okunuyor (`getProductDetail`, aynı `place`+`viewer`): ikinci bir
            fiyat kuralı doğmuyor, yani listedeki fiyatla boy fiyatları ayrışamaz.
          */
          const ilk = katalog.products[0];
          const boylar =
            ilk && ilk.variantCount > 1
              ? ((await getProductDetail(db, { locale: 'tr', slug: ilk.slug, place, viewer }))?.variants ?? [])
                  .filter((v) => v.priceCents !== null)
                  .map((v) => ({ boy: v.label, fiyat: formatPrice(v.priceCents!, 'tr') }))
              : [];
          // Boy listesi yalnız DOLUYSA gönderiliyor: boş dizi, modele "boy yok" diye okunabilecek
          // bir gürültüdür — tek boylu üründe alan hiç olmamalı.
          const boyAlani = boylar.length > 0 ? { boylar: { urun: ilk!.name, secenekler: boylar } } : {};

          /*
            ── ÇIKTI HANGİ SORUYU CEVAPLADIĞINI SÖYLER ───────────────────────────────────────
            İki arama aynı şekle sahip ama ANLAMLARI farklı ve model bunu bilmeden doğru cümleyi
            kuramaz:
              · kategori araması → "bunlar o kategorinin ürünleri" (küme TAM)
              · isim araması     → "bunlar adı eşleşen ürünler" (küme kategori DEĞİL)
            06.09'daki arıza tam olarak bu ayrımın yokluğuydu: isim eşleşmesi kategori sanıldı.

            İsim aramasında kategori listesi de veriliyor: model "tatlı" diye bir kategorimiz
            olduğunu görüp doğru soruyu yeniden sorabilsin — ve müşteri "neler satıyorsunuz"
            derse uydurmak yerine gerçek taksonomiyi söylesin.
          */
          /*
            ── KIRPMA SESSİZ OLMAZ (07.09 · ölçülmüş arıza) ───────────────────────────────────
            Liste tavanla kesiliyordu ve çıktı bunu SÖYLEMİYORDU. Model kırpılmış listeyi tam sanıp
            *"tatlı çeşitlerimiz SADECE baklavalardan oluşmaktadır"* dedi — oysa kategoride 20 ürün
            vardı, ilk beşi tesadüfen baklavaydı.

            Eksik veriden mutlak hüküm, hiç veri olmamasından kötüdür: hiç veri olsa ajan
            "bilmiyorum" derdi. O yüzden sayı burada CÜMLEYE giriyor — modelin "sadece/hepsi"
            diyebilmesini yapısal olarak zorlaştırıyor.
          */
          const toplam = katalog.products.length;
          const kirpildi = toplam > urunler.length;
          const kirpmaNotu = kirpildi
            ? ` Toplam ${toplam} ürünün ilk ${urunler.length}'i listelendi — bu liste TAM DEĞİL, "sadece bunlar var" DEME.`
            : '';

          const kapsam = kategori
            ? {
                kategori: kategori.name,
                kapsam: `Bunlar "${kategori.name}" kategorisinin ürünleridir.${kirpmaNotu}`,
              }
            : {
                kapsam:
                  `Bunlar ADI "${terim}" ile eşleşen ürünlerdir — bir kategori listesi DEĞİL. ` +
                  'Eşleşen ürünün o türden olduğunu VARSAYMA (örn. adında "tatlı" geçen bir fırın ürünü tatlı değildir).' +
                  kirpmaNotu,
                mevcutKategoriler: isimAramasi.categories.map((c) => c.name),
              };

          return kod
            ? { urunler, ...boyAlani, ...kapsam, yer: kod }
            : {
                urunler,
                ...boyAlani,
                ...kapsam,
                yerBilinmiyor:
                  'Yer bilinmiyor — stok "hiç var mı" düzeyinde okundu, bir depoya göre değil. ' +
                  'Müşteriden POSTA KODU iste ve bu aracı postaKodu ile yeniden çağır.',
              };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'urun_ara', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Katalog şu an okunamadı.' };
        }
      },
    }),

    posta_kodu_kontrol: tool({
      description:
        'Verilen POSTA KODUNA teslimat yapılıp yapılmadığını söyler: kapıya rota teslimi mi, kargo mu, yoksa hiç gitmiyor mu. ' +
        '"Şu koda geliyor musunuz", "adresime gelir mi", "biz X şehrindeyiz" sorularında ÇAĞIR. ' +
        'Müşterinin KENDİ kayıtlı adresi soruluyorsa teslimat_gunleri aracını kullan; bu araç adresi olmayan ya da BAŞKA bir yeri soran kişi içindir.',
      inputSchema: z.object({
        postaKodu: z
          .string()
          .min(3)
          .describe(
            'Posta kodu YA DA yerleşim adı — "67000", "75001", "Lingolsheim", "Kehl". ' +
              'Müşteri hangisini söylediyse AYNEN geç; ad verildiyse araç kodu kendisi bulur.',
          ),
      }),
      execute: async ({ postaKodu }) => {
        try {
          /*
            ── YER ADI DA KABUL EDİLİR (07.09 · ölçülmüş arıza) ────────────────────────────────
            Araç yalnız POSTA KODU alıyordu ve müşteri *"lingolsheim a geliyor musunuz?"* diye
            sordu — ajan cevaplayamayıp *"kontrol edip size bilgi vereceğiz"* dedi. O bir çıkmaz
            sokaktı: sohbet YZ modundaydı, talep de açılmadı, yani kimse kontrol etmeyecekti.

            Oysa veri elimizdeydi (`postal_code_place.places_search`) ve servis kapısı ikisini de
            çözüyor (`search` — terimin ad mı kod mu olduğunu kendi ayırt ediyor). Eksik olan tek
            şey aracın o kapıyı çağırmamasıydı.

            Ve bu kenar durum DEĞİL: müşteri doğal olarak semtinin adını söyler, posta kodunu
            değil. Kod isteyen bir araç, en sık sorulan biçimi cevapsız bırakıyordu.
          */
          const kodMu = /^\d{4,}$/.test(postaKodu.trim());
          let cozulmusKod = postaKodu.trim();
          if (!kodMu) {
            const adaylar = await new PostalCodePlaceService(db).search(postaKodu, 3);
            if (adaylar.length === 0) {
              return { bilinmiyor: `"${postaKodu}" diye bir yerleşim bulunamadı. Müşteriden POSTA KODUNU iste.` };
            }
            /* BİRDEN ÇOK EŞLEŞMEDE SEÇİM YAPILMAZ, SORULUR: aynı ad birden çok kodda geçebilir
               (mahalle/ilçe) ve yanlışını seçmek "gelmiyoruz" demek olurdu. Model müşteriye sorar. */
            if (adaylar.length > 1) {
              return {
                belirsiz: `"${postaKodu}" birden çok posta koduna denk geliyor. Müşteriye hangisi olduğunu sor.`,
                adaylar: adaylar.map((a) => `${a.postalCode} ${a.places.join(', ')}`),
              };
            }
            cozulmusKod = adaylar[0]!.postalCode;
          }
          const postaKoduCozum = cozulmusKod;
          /*
            BU ARAÇ GİRDİ ALIYOR ve değişmezi çiğnemiyor: alınan şey KİMLİK değil, herkese açık bir
            soru. "67000'e geliyor musunuz" cevabı sitede zaten var (posta kodu adımı ziyaretçiye
            açık) — kimseye ait olmayan bir bilgiyi okumak, başkasının verisini okumak değildir.

            Kimliğe dayalı sorunun aracı ayrı (`teslimat_gunleri`, girdisi boş): "benim adresim"
            sorusunu bu araca postalayan bir model, müşterinin adresini uydurmak zorunda kalırdı.
          */
          const cozum = await resolvePlaceForPostalCode(db, postaKoduCozum);
          switch (cozum.kind) {
            case 'route':
              // En değerli cevap: rota günleri ÇÖZÜMLE BİRLİKTE geliyor, ikinci okuma gerekmiyor.
              return {
                kod: postaKoduCozum,
                teslimat: 'kapıya teslim (haftalık rota)',
                yer: cozum.placeName,
                haftalikGunler: cozum.weekdays.map(gunAdi),
              };
            case 'shipping':
              return {
                kod: postaKoduCozum,
                teslimat: 'kargo ile gönderim (haftalık rota yok)',
                yer: cozum.placeName,
                not: 'Kargo ücreti ve ücretsiz kargo eşiği için teslimat_sartlari aracına bak.',
              };
            case 'unresolved':
              // Ülke biliniyor ama hizmet yok: "yanlış kod" DEĞİL, "buraya henüz gelmiyoruz".
              return {
                kod: postaKoduCozum,
                teslimat: 'yok — bu koda şu an teslimat yapmıyoruz',
                not: 'Kod geçerli; bölgemiz henüz oraya ulaşmıyor. Müşteri isterse haber listesine yazılabilir (bunu operatör yapar).',
              };
            case 'ambiguous':
              // Aynı kod iki hizmet ülkemizde birden geçerli — model UYDURMAZ, SORAR.
              return {
                kod: postaKoduCozum,
                bilinmiyor: 'Bu kod birden çok ülkede geçerli — hangi ülke olduğunu müşteriye SOR, tahmin etme.',
                adaylar: cozum.candidates.map((c) => `${COUNTRY_LABELS[c.country]}${c.inRoute ? ' (rota bölgemizde)' : ''}`),
              };
            case 'unknown':
              return { kod: postaKoduCozum, bilinmiyor: 'Böyle bir posta kodu bulunamadı — büyük olasılıkla yazım hatası. Müşteriden kodu teyit et.' };
          }
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'posta_kodu_kontrol', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Bölge bilgisi şu an okunamadı.' };
        }
      },
    }),

    teslimat_sartlari: tool({
      description:
        'Kargo ücreti, ücretsiz kargo eşiği, asgari sepet tutarı, kapıda ödeme üst sınırı ve kargo gönderdiğimiz ülkeleri söyler. ' +
        '"Kargo kaç para", "asgari sipariş var mı", "ne kadar alırsam kargo bedava", "kapıda ödeyebilir miyim" sorularında ÇAĞIR.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          /*
            Sayılar `settings`ten ve MÜŞTERİNİN KAPSAMIYLA okunuyor (`readPublicDeliveryTerms`
            kimliği alıyor): B2B'nin asgari sepeti B2C'ninkinden farklı olabilir. Aynı kapıyı bilgi
            sayfaları, sepet ve checkout da okuyor — ajanın ikinci bir sayı söylemesi, sitede yazanla
            sohbette söylenenin ayrışması demekti (07.15'in ölçülmüş dersi).
          */
          const s = await readPublicDeliveryTerms(db, customerId);
          return {
            kargoUcreti: formatPrice(s.shippingFeeCents, 'tr'),
            ucretsizKargoEsigi: formatPrice(s.freeShippingCents, 'tr'),
            asgariSepetKapiyaTeslim: formatPrice(s.minBasketRouteCents, 'tr'),
            // 0 = alt sınır YOK (kapının kendi künyesi) — "0,00 €" yazmak "sıfır euroluk sipariş
            // verebilirsiniz" gibi okunurdu; yokluk ile sıfır ayrı şeylerdir.
            asgariSepetKargo: s.minBasketShippingCents > 0 ? formatPrice(s.minBasketShippingCents, 'tr') : 'alt sınır yok',
            kapidaOdemeUstSiniri: formatPrice(s.codMaxCents, 'tr'),
            kargoGonderilenUlkeler: s.shippingCountries.map((c) => COUNTRY_LABELS[c]),
          };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'teslimat_sartlari', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Teslimat şartları şu an okunamadı.' };
        }
      },
    }),
  };
}
