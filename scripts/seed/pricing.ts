import { PriceService } from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import { euro, gun, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';
import { tahminiKiloMaliyeti, tedarikciFiyatlari, type TedarikciFiyatlari } from './supplier-prices';
import { enAz, type Katman } from './tier';

// ── Fiyat (03/05) ────────────────────────────────────────────────────────────────────────────────
// Aynı tablo üç işi görür: kanal listesi · müşteriye özel fiyat · tarihli geçerlilik. Üçü de
// örneklenir, yoksa fiyat çözücünün "en özgül kazanır" kuralı hiç denenmez.
//
// TABAN FARKI (DOMAIN §5): b2c satırı KDV DAHİL (TTC), b2b satırı KDV HARİÇ (HT). Aynı ürünün iki
// satırı bu yüzden birbirine eşit değildir — b2b sayısının küçük görünmesi hata değil, tabandır.
//
// ── FİYAT ARTIK MALİYETTEN TÜRÜYOR (kullanıcı kararı 19.08) ──────────────────────────────────────
// Eskiden b2c fiyatı uydurma bir kilo tabanından geliyordu (`14,5 €/kg + 1,20 €`, ±%12 sapma) ve
// b2b ondan %18 indirimle türüyordu. İki sayı da kimsenin vermediği bir karardı.
//
// Bugün elimizde GERÇEK iki belge var (`data/sources/prices-supplier-2025-12.json`): tedarikçinin
// 22.12.2025 tarihli fiyat teklifi (34 SKU, alış) ve kendi toptan satış listemiz (6'sı emin şekilde
// eşleşti). Fiyat o maliyetin üstüne kurulan bir POLİTİKA olarak hesaplanıyor — aşağıdaki iki eğri.
//
// Belgeyi okuma işi `supplier-prices.ts`te: aynı listeye katalog (aday/aktif kararı) ve stok
// (neyin gerçekten stoklanacağı) da bakıyor, üç kopya bir gün ayrışırdı.


/**
 * TOPTAN (b2b) markup'ı — maliyetin üstüne %20…%30, pahalıda az ucuzda çok (kullanıcı kararı 19.08).
 *
 * Gerekçe ticari: 45 €'luk bir tepsiye %30 koymak 13,5 € eklemektir ve alıcı onu ödemez; 0,33 €'luk
 * bir simide %30 koymak 10 kuruştur. Eksen **birim fiyat değil €/kg** — 2,5 kg'lık su böreği ucuz
 * bir üründür ama birim fiyatı 10,50 €'dur, birim fiyatla bakılsaydı "pahalı" bandına düşerdi.
 *
 * Geçiş log-doğrusal: 2,5 €/kg'da %30, 20 €/kg'da %20, arası yumuşak. Uçlarda sabitlenir.
 */
function b2bMarkup(kgMaliyet: number): number {
  const alt = Math.log10(2.5);
  const ust = Math.log10(20);
  const t = Math.min(1, Math.max(0, (Math.log10(kgMaliyet) - alt) / (ust - alt)));
  return 0.3 - 0.1 * t;
}

/**
 * PERAKENDE (b2c) çarpanı — PİYASADAN ÖLÇÜLDÜ, uydurulmadı (19.08).
 *
 * Üç rakip dükkânın tam kataloğu çekildi (`anadoludanikram.com` ve `dogaltakil.com` Shopify
 * `/products.json`, `degrandbazaar.be` Lightspeed `?format=json` — 923 satır). Bizim ürünlerimizle
 * örtüşen 11 raf fiyatı, kendi alış fiyatımıza bölünüp çarpan olarak alındı; sonuç bir güç yasasına
 * oturuyor (`çarpan = 4,13 · (€/kg)^-0,40`, R² = 0,81). Ucuz ürün yüksek çarpan taşır (simit 3,4×),
 * pahalı ürün düşük (fıstıklı baklava 1,5×) — kategoriye göre değil, FİYATA göre.
 *
 * `PIYASA_ALTI` kullanıcı kararıdır: piyasanın ~%8 altında konumlanıyoruz (yeni dükkân, giriş
 * fiyatı avantajı). `PERAKENDE_TABANI` ise bir GÜVENLİK: güç yasası gözlem aralığının (2,4–14 €/kg)
 * dışına taşınca hızla çöküyor ve 36 €/kg'lık fıstıklı baklavada çarpanı 1'in altına indiriyordu —
 * yani maliyetin altına. Taban, perakendenin toptandan en az %15 yukarıda kalmasını zorluyor.
 */
const B2C_KATSAYI = 4.13;
const B2C_US = -0.4;
const PIYASA_ALTI = 0.92;
const PERAKENDE_TABANI = 1.15;

function b2cCarpan(kgMaliyet: number, vatRate: number): number {
  const piyasa = B2C_KATSAYI * kgMaliyet ** B2C_US;
  const taban = (1 + b2bMarkup(kgMaliyet)) * (1 + vatRate / 100) * PERAKENDE_TABANI;
  return Math.max(piyasa * PIYASA_ALTI, taban);
}

const kiloMaliyeti = (birimHt: number, netWeightG: number): number => birimHt / (netWeightG / 1000);

/**
 * TAHMİNİ maliyet — teklifte olmayan varyantın kategorisinden ölçülür (`supplier-prices.ts` künyesi).
 *
 * Eskiden burada uydurma bir formül vardı (`kg × 14,50 € + 1,20 €`) ve gerçek fiyatların yanında
 * bariz yanlış duruyordu: sabit paketleme payı küçük boyda kilo fiyatını 31,7 €/kg'a çıkarıyor,
 * aynı dondurmanın sade dilimi 0,98 € iken kakaolusu 1,95 € oluyordu. Artık fikstür de GERÇEK
 * fiyatla aynı eğriden geçiyor; değişen tek şey eğrinin girdisi — ölçülmüş maliyet yerine
 * kategorisinden tahmin edilmiş maliyet.
 */
/** Bir varyantın iki kanal fiyatı — gerçek maliyet varsa ondan, yoksa fikstürden. */
function fiyatlar(
  v: VaryantRef,
  kaynak: TedarikciFiyatlari,
  tahmin: Map<string, number>,
): { b2cTtc: number; b2bHt: number; gercek: boolean } | null {
  const gercekAlis = v.sku ? kaynak.purchase[v.sku]?.unitHt : undefined;
  // Tahminî maliyet kategorinin ölçülmüş medyanından; gramaj yoksa fiyat da yok (aşağıdaki nöbet).
  const tahminKg = v.sku ? tahmin.get(v.sku) : undefined;
  const alisHt = gercekAlis ?? (v.netWeightG && tahminKg ? euro(tahminKg * (v.netWeightG / 1000)) : undefined);
  if (alisHt === undefined) return null;
  const gercek = gercekAlis !== undefined;
  // GRAMAJSIZ VARYANTA GERÇEK FİYAT YAZILMAZ — uydurma bir referans boy KONMAZ (`CLAUDE §1`:
  // ölçülemeyen değer sıfır/varsayılan değildir). Bugün böyle bir varyant YOK: basılı katalogda
  // duran 12 gramaj üretece bağlandı (19.08) ve 175 varyantın hepsi boyunu aldı. Nöbet yine de
  // duruyor — kaynak bir gün eksilirse fiyat sessizce yanlış çıkmasın, gürültü yapsın.
  if (v.netWeightG === null) {
    console.log(`  ⚠ ${v.ad}: alış fiyatı var ama GRAMAJ yok — fiyat hesaplanamadı, varyant fiyatsız kaldı`);
    return null;
  }
  const kg = kiloMaliyeti(alisHt, v.netWeightG);
  // TOPTAN — bant TABANDIR, TAVAN DEĞİL (kullanıcı kararı 19.08). Kendi satış listemizdeki fiyat
  // bandın üstündeyse KORUNUR; altındaysa banda yükselir. Şikâyet "marjlar düşük" idi, "yüksek"
  // değil: bandı tavan gibi uygulamak en kârlı kalemlerimizi ucuzlatırdı (ör. su böreği %33 → %27).
  // Ölçülen tek yükselme Maraş dondurma dilimi: %4,8 → %24.
  const listeHt = v.sku ? kaynak.salesB2bHt[v.sku]?.unitHt : undefined;
  const bantHt = euro(alisHt * (1 + b2bMarkup(kg)));
  return {
    b2cTtc: euro(alisHt * b2cCarpan(kg, v.vatRate)),
    b2bHt: listeHt === undefined ? bantHt : Math.max(listeHt, bantHt),
    gercek,
  };
}

export async function seedPrices(db: Db, varyantlar: VaryantRef[], katman: Katman): Promise<void> {
  if (await tabloDolu(db, 'price')) {
    console.log('▸ fiyatlar zaten dolu — atlandı');
    return;
  }
  console.log('▸ FİYAT seed');
  const kaynak = tedarikciFiyatlari();
  const tahmin = tahminiKiloMaliyeti();
  const prices = new PriceService(db);
  // Geçmiş, ileri tarihli zam ve b2b seyreltmesi SAHNEDİR — `base` üretime çıkacak veri, orada
  // "eski liste" ya da "planlanmış zam" diye bir şey YOKTUR (kullanıcı kararı 16.08).
  const sahne = enAz(katman, 'extend');
  /**
   * **`full` KATALOĞU EKSİKSİZDİR** (kullanıcı kararı 19.08).
   *
   * *"Full'de hepsinde fiyat olsun… bilgiler eksik geliyor, bu böyle olsun istemiyorum."* Ölçüldü:
   * 167 varyantın 80'i (aday olanların tamamı) hiç fiyatsızdı, 15 aktif varyantta toptan fiyatı
   * yoktu. `full` "her senaryodan bir örnek" katmanı; "kataloğun yarısı fiyatsız" bir senaryo değil,
   * bir boşluk. Seyreltme ve aday atlaması artık YALNIZ `extend`te — demo hâli orada duruyor.
   *
   * Tek istisna gramajsız varyant: fiyatı hesaplanamıyor (aşağıdaki nöbet) ve o yokluk uydurmayla
   * kapatılmaz. Kapsam denetiminin "fiyatsız varyant" kovası da onunla doluyor.
   */
  const eksiksiz = enAz(katman, 'full');
  let satir = 0;
  let gercekSayi = 0;
  /**
   * SATILABİLİR sıra — aday atlandıkça artar, `i` ile aynı şey DEĞİLDİR.
   *
   * Aşağıdaki "ilk 45" penceresi sipariş bölümüne verilmiş bir SÖZ ve o bölüm kalemlerini
   * `satilabilir` (adaysız) dizisinden seçiyor. Pencere `i` üzerinden sayılsaydı arada kalan her
   * aday sözü bir adım kısaltırdı: 16.08'de aday sayısı 4'ten 25'e çıkınca pencere gerçekte ~34
   * kaleme iniyordu ve **toptan siparişin son kalemleri b2b fiyatı olmayan varyantlara düşerdi.**
   * İki indis uzayını aynı sanmak — bu dosyanın da, stok dosyasının da aynı gün düzeltilen hatası.
   */
  let satilabilirSira = 0;

  for (const [i, v] of varyantlar.entries()) {
    // Aday ürün satışta değildir; `extend`te fiyatı da yoktur (fiyatsız aday = gerçekçi boş durum).
    // `full`te VAR: aday panosunda "bunu satsak kaça satardık" sorusunun cevabı fiyattır ve o soru
    // adayı etkinleştirme kararının kendisi (DOMAIN §13). Ürün yine satılabilir katalogda değil —
    // `listSellable` durumu süzüyor, fiyat satırı onu vitrine sokmuyor.
    if (v.status === 'candidate' && !eksiksiz) continue;
    // Sıra YALNIZ satılabilir varyantları sayar: aşağıdaki "ilk 45" penceresi sipariş bölümüne
    // verilmiş bir söz ve o bölüm kalemlerini adaysız diziden seçiyor (künyesi bildirimde).
    const sira = satilabilirSira;
    if (v.status !== 'candidate') satilabilirSira += 1;

    // ── KANAL SAYGISI (kullanıcı kararı 19.08) ────────────────────────────────────────────────
    // Kaynak her ürünün hangi kanalda satıldığını söylüyor ve seed bunu yok sayıyordu: aday
    // olmayan HER varyanta b2c fiyatı yazılıyordu. Üreticinin horeca kalemleri böylece perakende
    // vitrinine düşüyordu — tek parça 200 g E-börek 1,39 €, dökme simit 0,88 €. Kullanıcı bunu
    // ekranda gördü. Fiyatın kendisi doğruydu (€/kg olarak piyasada), yanlış olan SATIŞ FORMATI.
    // ── TEDARİKÇİ BİZE KİME NE SATACAĞIMIZI SÖYLEYEMEZ (kullanıcı kararı 19.08) ────────────────
    // Kaynak katalog her ürünü `horeca` / `retail` diye işaretliyor ve bu alan bir ara fiyat
    // yazmanın KAPISI yapılmıştı. Kaldırıldı — o işaret ÜRETİCİNİN kendi dağıtım kararıdır, bizim
    // assortiman kararımız değil. Kanıtı verinin kendisindeydi: Artisan kek 9x90 g'lık kutu onlarda
    // `b2b`, tek 90 g'lık mono paket `b2c` — dükkâna satan için doğru, eve teslim eden için ters.
    // Ölçülen bedel: Pasta kategorisinde 31 üründen yalnız 1'inin perakende fiyatı kalmıştı.
    //
    // **Dökme paket bir KUSUR değil, bir SEÇENEKTİR.** Kimi müşterinin dondurucusu geniştir; 50'lik
    // ya da 100'lük paketi alır. Doğru cevap onu vitrinden gizlemek değil, VARYANT olarak sunmak —
    // müşteri istiyorsa alır. Bugün seed tek satılabilir birim taşıyor; koli boyunun ayrı bir varyant
    // olarak sunulması ayrı bir iştir. → BEKLEYEN(BACKLOG §2): dökme koli varyantı
    //
    // `channels` alanı kaynakta DURUYOR (`data/sources/README.md`): ambalaj hakkında fikir verir —
    // hangi boy tek tek paketlenmiş, hangisi dökme. Satış kanalı kararı olarak okunmaz.

    const f = fiyatlar(v, kaynak, tahmin);
    if (!f) continue;
    // `base`: gerçek maliyeti olmayan varyant FİYATSIZ kalır. Uydurma bir sayı yazmak, üretime
    // çıkacak katmana kimsenin vermediği bir fiyat kararını sokmak olurdu.
    if (!f.gercek && !sahne) continue;
    if (f.gercek) gercekSayi += 1;

    // Her 11'incisinde ESKİ bir liste bırakılır: fiyat geçmişi ve "hangi listeden çıktı" görünür.
    if (sahne && i % 11 === 0) {
      await prices.setPrice({ variantId: v.id, channel: 'b2c', amountCents: toCents(euro(f.b2cTtc * 0.92)), validFrom: gun(-120) });
      satir += 1;
    }
    // **b2c fiyatı HERKESE, b2b fiyatı `extend`te bir bölüme** (16.08: fiyat satırları incelsin).
    //
    // b2c'yi seyreltmek olmazdı: fiyatsız ürün vitrinde alınamaz kart olur ve katalogun üçte biri
    // öyle olsaydı ekran boşalırdı. **b2b farklı bir soru soruyor** — "bu ürün toptan satışta mı?" —
    // ve bir demo katalogunda cevabın her üründe evet olmaması gerçekçidir. Seyreltme hem satır
    // düşürüyor hem "toptan fiyatı girilmemiş ürün" hâlini doğuruyor.
    //
    // **Seyreltme artık YALNIZ `extend`te** (kullanıcı kararı 19.08, `eksiksiz` künyesi): `base`te
    // b2b fiyatı gerçek satış listemizden geliyor ve "girilmemiş" hâli taklit edilecek bir şey
    // değil; `full`te ise kullanıcı kataloğun eksiksiz olmasını istedi (ölçülmüştü: 15 aktif
    // varyantta toptan fiyatı yoktu).
    //
    // İlk 45 SATILABİLİR varyant her hâlde b2b fiyatı alır: sipariş bölümü toptan kalemlerini o
    // aralıktan seçiyor (`kalem(0…38)`) ve fiyatsız bir varyant oraya düşerse sipariş tutarı
    // sıfırlanırdı. Ölçüt `sira` — gerekçesi künyede.
    await prices.setPrice({ variantId: v.id, channel: 'b2c', amountCents: toCents(f.b2cTtc), validFrom: gun(-30) });
    satir += 1;
    // **GERÇEK alış fiyatı olan varyant SEYRELTİLMEZ** (ölçüldü 19.08, `db:refresh` sonrası):
    // seyreltme bir FİKSTÜR aracıdır — "toptan fiyatı girilmemiş ürün" hâlini doğurmak için var.
    // Satın aldığımız mala uygulanınca anlamsızlaşıyor: gerçek maliyeti ve gerçek satış fiyatı olan
    // 34 varyantın **11'i hiç fiyatsız kaldı** (simit, çubuk börek, cheesecake, trileçe…), yani
    // aldığımız mal satılamaz göründü. Hâl kaybolmuyor — fikstür varyantlarında bolca doğuyor.
    // `full`te seyreltme YOK (`eksiksiz` künyesi): kullanıcı kataloğun eksiksiz görünmesini istedi.
    if (!sahne || eksiksiz || f.gercek || sira < 45 || sira % 3 === 0) {
      await prices.setPrice({ variantId: v.id, channel: 'b2b', amountCents: toCents(f.b2bHt), validFrom: gun(-30) });
      satir += 1;
    }

    // Her 17'ncisinde İLERİ TARİHLİ zam: "zam önceden planlanır" kuralı denenebilsin.
    if (sahne && i % 17 === 0) {
      await prices.setPrice({ variantId: v.id, channel: 'b2c', amountCents: toCents(euro(f.b2cTtc * 1.08)), validFrom: gun(30) });
      satir += 1;
    }
  }

  console.log(
    `✓ fiyat: ${satir} satır · ${gercekSayi} varyant GERÇEK alış fiyatından türedi (teklif 22.12.2025)` +
      `${sahne ? ' · kalanı fikstür · geçmiş + ileri tarihli dahil' : ' · fikstür YOK (base)'}`,
  );
}

/**
 * PAZARLIKLI müşteri fiyatı — kanal listesini ezer ("en özgül kazanır").
 *
 * `extend`+ katmanına ait: `base`te müşteri yoktur, pazarlık da yoktur.
 */
export async function seedNegotiatedPrices(db: Db, varyantlar: VaryantRef[], kisiler: Kisiler): Promise<void> {
  const ozelMusteri = kisiler.get('b2bOnayli');
  if (!ozelMusteri) return;
  const kaynak = tedarikciFiyatlari();
  const tahmin = tahminiKiloMaliyeti();
  const prices = new PriceService(db);
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate');
  let satir = 0;
  for (const v of satilabilir.slice(0, 6)) {
    // Liste fiyatı AYNI fonksiyondan okunur: iki formül olsaydı "özel fiyat listeden iyi" kuralı
    // bir gün kendiliğinden bozulur ve pazarlıklı müşteri listeden pahalıya alırdı.
    const f = fiyatlar(v, kaynak, tahmin);
    if (!f) continue;
    await prices.setPrice({
      variantId: v.id,
      channel: 'b2b',
      customerId: ozelMusteri,
      amountCents: toCents(euro(f.b2bHt * 0.9)), // listeden daha iyi
      validFrom: gun(-60),
    });
    satir += 1;
  }
  console.log(`✓ pazarlıklı fiyat: ${satir} satır (müşteriye özel — kanal listesini ezer)`);
}
