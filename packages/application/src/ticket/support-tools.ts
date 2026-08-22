// `z` de porttan geliyor ve gerekçesi teknik: SDK aracın şemasını doğrularken tek zod örneği
// bekliyor, ikinci bir kopya sessizce tutmaz (`@lezzet/ai` barrel künyesi).
import { tool, z, type ToolSet } from '@lezzet/ai';
import { AddressService, OrderService, type Db } from '@lezzet/database';
import { formatPrice, formatShortDate } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import { COUNTRY_LABELS, ORDER_STATUS_LABELS, type Address, type StockStatus } from '@lezzet/types';
import { getCatalogData } from '../catalog/catalog';
import { pricingViewerOf } from '../catalog/pricing-viewer';
import { resolvePlaceWarehouses, UNRESOLVED_PLACE } from '../delivery/place';
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
 */
export function customerSupportTools(db: Db, customerId: string): ToolSet {
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

    urun_ara: tool({
      description:
        'Katalogda ürün arar ve müşterinin KENDİ fiyatıyla, KENDİ adresine göre satın alınabilirliğini söyler. ' +
        '"X var mı", "fiyatı ne", "kaça", "hangi boyları var" sorularında MUTLAKA bunu çağır. Tahmin etme.',
      inputSchema: z.object({
        terim: z.string().min(2).describe('Aranacak ürün adı ya da anahtar kelime — örn. "baklava", "su böreği"'),
      }),
      execute: async ({ terim }) => {
        try {
          /*
            İKİ BAĞLAM ZORUNLU ve ikisi de MÜŞTERİDEN çözülür — katalog kapısının kendi kuralı:
            `place` (hangi depo) ve `viewer` (hangi kanal/kademe). Varsayılan geçmek, B2B müşteriye
            B2C fiyatı ya da başka deponun stoğunu okutmak olurdu; kapı bu yüzden ikisini de
            zorunlu istiyor (`CatalogInput` künyesi) ve araç da uydurmuyor.

            Adres yoksa `place` DEPO-ÜSTÜ okunur (`UNRESOLVED_PLACE`): "hiç var mı" sorusu
            cevaplanabilir, "sana gelir mi" sorusu cevaplanamaz — ve model bunu bilsin diye
            cevapta ayrıca söyleniyor (`adresBilinmiyor`).
          */
          const adres = birincilAdres(await new AddressService(db).listByCustomer(customerId));
          const [place, viewer] = await Promise.all([
            adres ? resolvePlaceWarehouses(db, adres.postalCode) : Promise.resolve(UNRESOLVED_PLACE),
            pricingViewerOf(db, customerId),
          ]);

          const katalog = await getCatalogData(db, {
            // Operasyon dili Türkçe ve model Türkçe yazıyor; cevabın müşteri diline çevrilmesi
            // gönderim anında, tek kapıdan yapılıyor (20.2). Araç ikinci bir dil kararı vermez.
            locale: 'tr',
            place,
            viewer,
            query: { search: terim },
          });

          const urunler = katalog.products.slice(0, PRODUCT_HITS).map((p) => ({
            ad: p.name,
            birim: p.unitLabel,
            // `null` fiyat = bu kanalda SATIŞA KAPALI (DOMAIN §5) — "0 €" demek yanlış olurdu.
            fiyat: p.priceCents === null ? 'bu kanalda satışa kapalı' : formatPrice(p.priceCents, 'tr'),
            durum: STOK_SOZLUGU[p.stockStatus],
            ...(p.variantCount > 1 ? { boySayisi: p.variantCount } : {}),
          }));

          if (urunler.length === 0) return { bilinmiyor: `"${terim}" için katalogda eşleşen ürün yok.` };
          return adres ? { urunler } : { urunler, adresBilinmiyor: 'Müşterinin adresi yok — stok "hiç var mı" düzeyinde okundu, adrese göre değil.' };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'urun_ara', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Katalog şu an okunamadı.' };
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

    siparislerim: tool({
      description:
        'Müşterinin son siparişlerini listeler: sipariş numarası, durumu ve teslim günü. ' +
        'Sipariş durumu, "nerede kaldı", "ne zaman gelecek" sorularında çağır. Tutar bilgisi VERMEZ.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const sayfa = await new OrderService(db).listByCustomer(customerId, { limit: 5 });
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
