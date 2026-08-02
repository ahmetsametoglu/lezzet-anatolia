/**
 * Yer çözümü (19.3) — DOMAIN §17. **Posta kodu → bölge → warehouse.**
 *
 * Zincirin tamamı burada, tek yerde: adres bir bölgeye düşerse o bölgenin deposu, düşmezse shipping
 * deposu. Kargo dalı da tek depoya iner (K9: ülke başına en fazla bir aktif shipping deposu), bu
 * yüzden ortada bir "warehouse seçim algoritması" yoktur.
 *
 * ── BELİRSİZLİK ARTIK SESSİZ DEĞİL ───────────────────────────────────────────
 * `findZoneForPostalCode` aynı kodu içeren iki bölgede "ilki kazanır" diyordu. Tek depoda bunun
 * bedeli yanlış bir rota günüydü; çok depoda **siparişin yanlış depoya düşmesi** demek — mal bir
 * şehirde, sipariş başka şehirde. Bu yüzden burada belirsizlik bir cevap değil bir HATA'dır.
 * (Veritabanı da aynı şeyi söylüyor: posta kodu bağ tablosunda birincil anahtar. Motor onun saf
 * karşılığıdır — kural iki yerde de aynı, çünkü ikisi de kuralın kendisi.)
 *
 * ── ÜLKE ZİNCİRİN PARÇASIDIR, AMA MÜŞTERİYE SORULMAZ (19.8) ──────────────────
 * Posta kodu ülkeler arası benzersiz değildir — ölçtük: FR 6.065 + DE 10.813 kodun **610'u ikisinde
 * de geçerli**. Yani `(ülke, kod)` ikilisi zincirin gerçek girdisidir ve `resolveWarehouseForPostalCode`
 * ülkeyi zorunlu ister.
 *
 * Ama ülkeyi MÜŞTERİYE sormuyoruz. İki gerekçe: sürtünme (cevabı zaten elimizde olan bir soru) ve
 * **vergi** — serbestçe seçilen ülke KDV oranını ve Alman B2B muafiyetini etkiler (`DOMAIN §5`);
 * müşterinin doldurduğu bir alanın vergi sonucu doğurması kabul edilemez. Ülke bir beyan değil,
 * veriden türeyen bir **sonuç**tur. Türetmeyi `resolvePlaceByPostalCode` yapar.
 *
 * Saf: satırları çağıran getirir, karar burada verilir.
 */

import type { Country } from '@lezzet/types';
import { normalizePostalCode } from '@lezzet/helper';
import { matchZones, type DeliveryZoneCandidate } from './delivery-days';
import { placeLabel } from './place-name';

/** Motorun gördüğü asgari warehouse alanları (DB karşılığı `Warehouse`). */
export interface WarehouseCandidate {
  id: string;
  code: string;
  countryCode: Country;
  /** Kargo çıkış deposu mu — bölge dışı adresler buraya düşer. */
  shipsOnline: boolean;
  isActive: boolean;
}

/**
 * Bölge + bağlı warehouse (DB karşılığı `DeliveryZoneWithCodes`).
 *
 * `DeliveryZoneCandidate`'i GENİŞLETİR, kopyalamaz: rota günü kararı ile warehouse kararı aynı bölge
 * satırını okur; iki ayrı tip yazsaydık alan eklendiğinde biri güncellenip öteki unutulurdu.
 */
export interface ZoneWithWarehouse extends DeliveryZoneCandidate {
  warehouseId: string;
  isActive: boolean;
}

export type PlaceResolution =
  /** Adres bir rota bölgesine düştü: teslimat araçla, ücretsiz, kapıda ödeme mümkün. */
  | { kind: 'route'; warehouseId: string; zoneId: string; weekdays: readonly number[] }
  /** Bölge dışı: shipping deposundan gönderilir. */
  | { kind: 'shipping'; warehouseId: string }
  /**
   * Çözülemedi. `reason` ekranın ne diyeceğini belirler ve ikisi AYRI şeylerdir:
   * `no_shipping_warehouse` bizim eksiğimizdir (shipping deposu tanımlı değil) ve müşteriye "bölge
   * dışısınız" dedirtmemelidir — o bir yapılandırma arızasıdır, operatöre bildirilir.
   * `ambiguous_zone` ise veri çakışmasıdır: aynı kod iki bölgede.
   */
  | { kind: 'unresolved'; reason: 'no_shipping_warehouse' | 'ambiguous_zone' };

/**
 * Adresin (ülke + posta kodu) hangi depodan karşılanacağı.
 *
 * Pasif bölge YOK sayılır (rota kapalı) ama bu "shipping" demektir, "hizmet yok" değil: kapalı
 * bölgedeki müşteri kargoyla alışveriş yapabilir.
 */
export function resolveWarehouseForPostalCode(
  place: { country: Country; postalCode: string },
  zones: readonly ZoneWithWarehouse[],
  warehouses: readonly WarehouseCandidate[],
): PlaceResolution {
  // Eşleştirme TEK KAYNAKTAN (`matchZones`): kod normalizasyonu ve aktiflik kuralı iki yerde
  // yazılsaydı biri güncellenip öteki unutulurdu — ve fark ancak yanlış depoya düşen bir siparişle
  // görünürdü. Bu okumanın kendine ait olan tek şey belirsizliğe verdiği CEVAP.
  const matched = matchZones(place, zones);

  // İki aktif bölge aynı kodu tutuyorsa hangisinin geçerli olduğu BİLİNMEZ. Birini seçmek, yanlış
  // seçme ihtimalini sessizce kabul etmektir; sipariş yanlış depoya düşerse kimse sebebini aramaz.
  if (matched.length > 1) return { kind: 'unresolved', reason: 'ambiguous_zone' };

  const zone = matched[0];
  if (zone) {
    // Bölgenin deposu kapatılmışsa rota fiilen yoktur — müşteri kargoya düşer, hizmetsiz kalmaz.
    const warehouse = warehouses.find((w) => w.id === zone.warehouseId && w.isActive);
    if (warehouse) return { kind: 'route', warehouseId: warehouse.id, zoneId: zone.id, weekdays: zone.weekdays };
  }

  const shipping = findShippingWarehouse(place.country, warehouses);
  if (!shipping) return { kind: 'unresolved', reason: 'no_shipping_warehouse' };
  return { kind: 'shipping', warehouseId: shipping.id };
}

/**
 * Ülkenin kargo çıkış deposu — **ülke başına en fazla bir tane** (K9; kural veritabanında, kısmi
 * unique indeks). Bu yüzden "seçim algoritması" yok, tek satır aranıyor.
 *
 * Ayrı fonksiyon çünkü iki soru bunu sorar ve ikisi FARKLI: yer çözümü "bu adres nereden gider"
 * diye sorar (rota yoksa buraya düşer), vitrin ise "rota deposunda olmayan bu ürün kargoyla
 * gelebilir mi" diye — rota İÇİNDEKİ müşteri için bile. İkinci soruyu yer çözümünün içinden
 * cevaplayamayız: orası rota bulduğunda kargo deposunu hiç aramaz.
 *
 * `null` gerçek bir arızadır (kargo deposu tanımlı değil) ve çağıran onu açıkça söylemeli.
 */
export function findShippingWarehouse(
  country: Country,
  warehouses: readonly WarehouseCandidate[],
): WarehouseCandidate | null {
  return warehouses.find((w) => w.isActive && w.shipsOnline && w.countryCode === country) ?? null;
}

/**
 * Hizmet verdiğimiz ülkeler — aktif depoların ve aktif bölgelerin kapsadığı küme.
 *
 * Cevap VERİDEN türer, bir ayardan değil: Almanya'da depo açıldığı gün küme kendiliğinden büyür,
 * kimsenin bir bayrak açması gerekmez (açmayı unutması da mümkün olmaz). `resolvePlaceByPostalCode`
 * bunu bir SÜZGEÇ olarak kullanır — asıl işi orada.
 */
export function activeCountries(
  zones: readonly ZoneWithWarehouse[],
  warehouses: readonly WarehouseCandidate[],
): Country[] {
  const countries = new Set<Country>();
  for (const w of warehouses) if (w.isActive) countries.add(w.countryCode);
  for (const z of zones) {
    if (!z.isActive) continue;
    for (const c of z.postalCodes) countries.add(c.country);
  }
  return [...countries].sort();
}

/** Posta kodu referansının bir satırı — `postal_code_place` tablosunun motor karşılığı. */
export interface PostalCodeMatch {
  country: Country;
  /**
   * Kodun o ülkede kapsadığı yerleşimler (19.17).
   *
   * **Boş olabilir ve bu normaldir (19.16a):** kod yalnız KENDİ bölge tablomuzda varsa (dış
   * referansta yoksa) ülkesini biliriz ama coğrafi adlarını bilmeyiz — ve uydurmayız. O hâlde ekran
   * bölge adını gösterir (`zoneName`), ki zaten daha bilgilendiricidir.
   *
   * Gösterilecek ad buradan `placeLabel` ile türetilir; ayrı bir alan olarak taşınmaz.
   */
  places: readonly string[];
}

/** `ambiguous` hâlinde müşteriye sunulan seçenek — ülke DEĞİL, tanınabilir bir YER. */
export interface PlaceCandidate extends PostalCodeMatch {
  /** Rota bölgemize düşüyor mu — sıralamada önce gelir (daha olası cevap). */
  inRoute: boolean;
}

/**
 * Ülkesiz posta kodu çözümünün sonucu. `PlaceResolution`'ın üstünde bir katman: o `(ülke, kod)`
 * ikilisini çözer, bu ülkeyi de türetir.
 */
export type PostalCodeResolution =
  /**
   * Zincir çözüldü: `PlaceResolution`'ın aynısı + türetilmiş ülke, kodun yerleşimleri ve
   * gösterilebilir ad.
   *
   * `placeName` bir ALAN değil `places`'in TÜREVİDİR (`placeLabel`) ve burada bir kez hesaplanır:
   * her çağıranın aynı kuralı yeniden yazması, kuralın bir gün bir yerde farklı uygulanması
   * demekti — tam olarak 19.8'in yanlış adı üretmesinin sebebi.
   */
  | (Extract<PlaceResolution, { kind: 'route' | 'shipping' }> & {
      country: Country;
      places: readonly string[];
      placeName: string | null;
    })
  /** Çözülemedi (bizim eksiğimiz ya da veri çakışması) — ülke yine de biliniyor, sebep ayrık kalır. */
  | (Extract<PlaceResolution, { kind: 'unresolved' }> & { country: Country })
  /** Kod birden çok hizmet ülkemizde geçerli — tek soru, iki somut yer. */
  | { kind: 'ambiguous'; candidates: readonly PlaceCandidate[] }
  /** Hiçbir ülkede geçerli değil: büyük olasılıkla yazım hatası. Bir KAPI değil, bir uyarıdır. */
  | { kind: 'unknown' };

/**
 * Posta kodundan yer çözümü — **ülke sorulmadan** (19.8).
 *
 * `matches` referans tablosundan gelir (`postal_code_place`): kodun geçerli olduğu ülkeler ve
 * gösterilecek yer adları. Çağıran satırları getirir, karar burada verilir.
 *
 * ── BELİRSİZLİK HİZMET ALANIMIZLA KESİŞİR ────────────────────────────────────
 * 610 kod iki ülkede birden geçerli, ama bu 610 sorunun hepsi BİZİM sorunumuz değil: kod Almanya'da
 * da geçerliyken biz Almanya'ya hizmet vermiyorsak ortada bir seçim yoktur. Bu yüzden önce hizmet
 * ülkelerimizle kesiştiriyoruz — bugün (yalnız FR aktifken) çakışmaların HİÇBİRİ soru doğurmaz,
 * Almanya açıldığı gün yalnız gerçekten iki anlama gelenler sorar.
 *
 * ── NEDEN "ROTA KAZANSIN" DEMİYORUZ ──────────────────────────────────────────
 * İki aday varsa ve biri rota bölgemizdeyse, onu seçmek cazip: müşterilerimizin çoğu oradadır.
 * Ama iki adayın sonucu yalnız teslimat yolu değil **KDV oranı** da: yanlış ülke yanlış vergi
 * demektir ve bu sessizce tahmin edilemez. Rota adayı yalnız SIRALAMADA öne alınır (daha olası
 * cevap önce görünür); kararı müşteri verir.
 */
export function resolvePlaceByPostalCode(
  postalCode: string,
  matches: readonly PostalCodeMatch[],
  zones: readonly ZoneWithWarehouse[],
  warehouses: readonly WarehouseCandidate[],
): PostalCodeResolution {
  // ── KENDİ BÖLGE TABLOMUZ HİZMET ALANIMIZ İÇİN OTORİTEDİR (19.16a) ──────────
  // İlk sürüm doğrudan `matches.length === 0 → unknown` diyordu ve `zones`'a hiç bakmıyordu. Sonuç
  // bir ÇELİŞKİYDİ: operatörün elle girdiği, fiilen aracımızla gittiğimiz bir kod dış referansta
  // yoksa vitrin "tanımadık" derken checkout aynı kodu kabul edip siparişi açıyordu (`resolveDelivery`
  // referansa hiç bakmaz). Tek sistem, aynı koda iki cevap.
  //
  // Referans tablosunun işi ad çözümü ve hizmet vermediğimiz yerlerdir; nereye gittiğimizi
  // kendi tablomuz bilir. Bağ satırı `(ülke, kod)` taşıdığı için ülke referanssız da türer.
  // Pasif bölge de sayılır: rota kapalı olabilir ama kod bizim kaydımızdır ve ülkesi bellidir.
  const code = normalizePostalCode(postalCode);
  const own = new Map<Country, PostalCodeMatch>();
  for (const zone of zones) {
    for (const entry of zone.postalCodes) {
      if (normalizePostalCode(entry.postalCode) === code && !own.has(entry.country)) {
        // Yerleşim adı YOK ve uydurulmaz: kendi tablomuz bölge adını bilir (`zoneName`, ayrı alan),
        // coğrafi yer adını değil. Referansta karşılığı varsa aşağıda o kazanır.
        own.set(entry.country, { country: entry.country, places: [] });
      }
    }
  }

  // Birleşim: referanstaki ad daha bilgilendirici olduğu için ONA öncelik verilir; kendi
  // kaydımızdan gelen ülke, referansta hiç yoksa da ayakta kalır.
  const merged = new Map(own);
  for (const m of matches) merged.set(m.country, m);
  const all = [...merged.values()];

  // Ne kendi kaydımızda ne referansta — büyük olasılıkla yazım hatası.
  if (all.length === 0) return { kind: 'unknown' };

  const served = new Set(activeCountries(zones, warehouses));
  // Kesişim boşsa referanstaki adaylarla devam edilir: kod geçerlidir ama hizmet alanımızda
  // değildir ve bunun doğru cevabı `no_shipping_warehouse`'tur — aşağıdaki çözüm onu zaten üretir.
  // "Tanımadık" (`unknown`) demek YANLIŞ olurdu: kodu tanıyoruz, oraya gidemiyoruz.
  const candidates = all.filter((m) => served.has(m.country));
  const effective = candidates.length > 0 ? candidates : all;

  if (effective.length > 1) {
    const scored = effective.map((m) => ({
      ...m,
      inRoute: resolveWarehouseForPostalCode({ country: m.country, postalCode }, zones, warehouses).kind === 'route',
    }));
    // Rota adayı önce; eşitlikte ülke kodu — sıra RASTGELE olmamalı, aynı kod her seferinde aynı
    // ekranı üretsin (aksi hâlde müşteri iki denemede iki farklı liste görür).
    scored.sort((a, b) => Number(b.inRoute) - Number(a.inRoute) || a.country.localeCompare(b.country));
    return { kind: 'ambiguous', candidates: scored };
  }

  // Tek aday: ülke artık BİLİNİYOR, zincirin geri kalanı mevcut motorun işi.
  const only = effective[0]!;
  const resolved = resolveWarehouseForPostalCode({ country: only.country, postalCode }, zones, warehouses);
  return resolved.kind === 'unresolved'
    ? { ...resolved, country: only.country }
    : { ...resolved, country: only.country, places: only.places, placeName: placeLabel(only.places) };
}
