'use server';

import { suggestPlaces } from '@lezzet/application';
import { DeliveryZoneService, PostalCodePlaceService, WarehouseService, serviceDb } from '@lezzet/database';
import { findZoneForPostalCode, placeLabel, resolvePlaceByPostalCode } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import type { Country, PlaceOption } from '@lezzet/types';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { resolveDelivery } from '@/lib/order/delivery';
import { recordEvent } from '@/lib/analytics/record';
import { isValidPostalCode, normalizePostalCode, type PlaceLookup } from './place-types';

/**
 * Teslimat yeri çözümü (K30-K31) — posta kodu → "ne gönderebiliriz, ne zaman".
 *
 * Guard YOK ve olmamalı: soru ziyaretçiye de açıktır, zaten alışverişin önüne konmamak için var.
 *
 * Checkout'un teslimat çözümünü (`resolveDelivery`, 07.2) YENİDEN YAZMAZ, ona sorar — yoksa aynı
 * "rota içi mi, hangi gün" kuralı iki yerde yaşar ve bir gün ayrışır. Aradaki tek fark kapsam:
 * burada sepet bilinmez, o yüzden "kargo tamamen kapalı mı" sorusu sorulmaz (o karar sepetin
 * içeriğine bağlıdır ve kısıt bloğunun işidir).
 */
export async function resolvePlaceAction(rawPostalCode: string, chosenCountry?: Country): Promise<CustomerResult<PlaceLookup>> {
  try {
    const postalCode = normalizePostalCode(rawPostalCode);
    if (!isValidPostalCode(postalCode)) throw new CustomerError('postal_code_invalid');

    const db = serviceDb();
    const [matches, zones, warehouses] = await Promise.all([
      new PostalCodePlaceService(db).findByPostalCode(postalCode),
      // Bölgeler AKTİFLİK SÜZGECİSİZ okunur (19.16a): pasif bölgedeki kod da bizim kaydımızdır ve
      // ülkesi ondan türer. Rotanın açık olup olmadığına motor karar verir — okuma o kararı
      // önden vermemeli, yoksa kapalı bölgedeki müşteri "tanımadık" cevabı alır.
      new DeliveryZoneService(db).listWithCodes(),
      new WarehouseService(db).list({ activeOnly: true }),
    ]);

    // ── ÜLKE SORULMAZ, TÜRETİLİR (19.8) ──────────────────────────────────────
    // Eskiden burada `country: 'FR'` sabiti vardı. O sabit iki şeyi birden varsayıyordu: tek ülkede
    // hizmet verdiğimizi ve müşterinin Fransa'da olduğunu. İkincisi bir varsayım olarak kalamaz —
    // ülke KDV oranını belirler (`DOMAIN §5`).
    const lookup = resolvePlaceByPostalCode(postalCode, matches, zones, warehouses);

    // ── DÖRT HÂL EKRANA VERİ OLARAK GİDER (19.16b) ────────────────────────────
    // Önceki sürüm bu hâllerde `throw` ediyordu ve `ActionResult` hepsini tek bir `error: string`e
    // indiriyordu. Ekran belirsizlik seçicisini yazamıyordu: adayları göremiyor, hâli ancak hata
    // metnini ayrıştırarak anlayabilirdi — bir dizgi eşleştirmesi, üstelik üç dilde çalışmayan.
    // Metin ekranın işi (i18n orada); buradan çıkan şey VERİ.
    if (lookup.kind === 'unknown') {
      // Huninin İLK adımı burada kapanıyor (08.9): kodunu girip cevap alamayan ziyaretçi, kapının
      // gördüğü ama hiçbir sayacın saymadığı hâldi — `postal_code_demand` yalnız çözülen kodu sayar.
      void recordEvent({ type: 'place_resolved', resolved: false });
      return { data: { kind: 'unknown' }, errorKey: null };
    }

    if (lookup.kind === 'ambiguous') {
      /**
       * Müşterinin ÜLKE CEVABI (19.7) — belirsizlik seçicisinden ya da öneri listesinden gelir.
       *
       * Ülke normalde SORULMAZ, koddan türer (19.8). Tek istisna bu: kod iki hizmet ülkemizde
       * birden geçerliyse türetecek bir şey yoktur, cevap müşterinindir. Seçim burada uygulanıyor,
       * motorda değil — motor "bu kod hangi ülkelere düşüyor" sorusunun cevabıdır; hangi adayın
       * seçildiği bir KULLANICI kararı ve motorun bilmesi gereken bir şey değil.
       *
       * Gelen ülke adaylar arasında yoksa sessizce yok sayılır ve seçici yeniden çizilir: uydurma
       * bir ülkeyle çözmek, müşterinin vermediği kararı vermek olurdu (KDV oranı buna bağlı).
       */
      const picked = chosenCountry ? lookup.candidates.find((c) => c.country === chosenCountry) : undefined;
      if (picked) {
        return await finishResolved(postalCode, { country: picked.country, placeName: placeLabel(picked.places), places: picked.places }, zones, matches);
      }
      // Kayıt tutulur ama HATA değil: müşterinin cevaplayabileceği meşru bir soru. Yine de iz
      // bırakıyoruz — hangi kodların gerçekten sorulduğunu bilmek veri kalitesinin ölçüsü.
      return {
        data: {
          kind: 'ambiguous',
          // Ad TÜRETİLİR, taşınmaz (19.17): tek yerleşimliyse adı, çoksa `null` + tam liste. Kuralı
          // burada yeniden yazmak yerine motorun `placeLabel`'ı çağrılıyor — 19.8'in yanlış adı
          // üretmesinin sebebi kuralın veriye gömülmüş olmasıydı. Listeyi NASIL göstereceği (ilk üç
          // ad + "+X", hepsi, çıplak kod) seçicinin kendi kararı; veri ikisini de veriyor.
          options: lookup.candidates.map((c) => ({
            country: c.country,
            placeName: placeLabel(c.places),
            places: [...c.places],
            inRoute: c.inRoute,
          })),
        },
        errorKey: null,
      };
    }

    if (lookup.kind === 'unresolved') {
      // Bu ikisi BİZİM tarafımızın sorunu, o yüzden iz bırakılır: `no_shipping_warehouse` bir
      // yapılandırma eksiği, `ambiguous_zone` bir veri çakışması. Müşteriye ikisi de "bölge
      // dışısınız" diye görünmemeli — ekran sebebe göre farklı cümle kurar.
      await captureError(new Error(`Yer çözülemedi: ${lookup.reason}`), {
        source: SOURCES.webAction,
        context: { postalCode, country: lookup.country, reason: lookup.reason },
      });
      return { data: { kind: 'unresolved', reason: lookup.reason }, errorKey: null };
    }

    return await finishResolved(postalCode, { country: lookup.country, placeName: lookup.placeName, places: lookup.places }, zones, matches);
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Çözülmüş yerin son hâli — **iki giriş, tek yol.** Kimlik ya motorun tek adayından gelir ya
 * müşterinin belirsizlik seçiminden; ötesi (teslimat yolu, bölge adı, en yakın gün, talep sayacı)
 * ikisinde de aynı kapılardan çıkar. İki yerde yazılsaydı biri değiştiğinde öteki eskirdi.
 */
async function finishResolved(
  postalCode: string,
  identity: { country: Country; placeName: string | null; places: readonly string[] },
  zones: Awaited<ReturnType<DeliveryZoneService['listWithCodes']>>,
  /**
   * Kodun referans satırları — noktayı buradan okuyoruz (08.41). Satırlar çağıranda ZATEN
   * okunmuş durumda (`findByPostalCode`), yani ikinci bir sorgu yok. Ülkeye göre seçiliyor:
   * 610 kod iki ülkede birden geçerli ve iki ülkenin noktası aynı yer değil.
   */
  matches: readonly { country: Country; lat: number | null; lng: number | null }[],
): Promise<CustomerResult<PlaceLookup>> {
  const row = matches.find((m) => m.country === identity.country);
  const point = row?.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null;
  const delivery = await resolveDelivery({ postalCode, country: identity.country });

  // Bölge adı yalnız rota içinde bilinir. Motor aday tipini döndürür (ad taşımaz — karar için
  // gereksiz); adı kendi listemizden okuruz.
  const matched = findZoneForPostalCode({ country: identity.country, postalCode }, zones);
  const zone = matched ? zones.find((z) => z.id === matched.id) : undefined;
  const inRoute = delivery.deliveryType === 'route';

  // Talep sayacı sonucu BEKLETMEZ ve hata verirse akışı kesmez: müşterinin sorusuna cevap
  // vermek asıl iş, sayaç yan üründür. Sayamamak yüzünden ekranın boş kalması saçma olurdu.
  void recordDemand(postalCode);

  // **Huninin İLK adımı** (13.1 · `ANALYTICS §3`): yer kapısında çözülen ziyaretçi. `postal_code_demand`
  // yalnız burayı sayıyordu; huni için kaç kişinin kapıya gelip ÇÖZDÜĞÜ de gerekiyor — çözmeden
  // düşenin karşılığı bu olayın yokluğudur. Posta kodu deftere GİRMEZ (`ANALYTICS §3`: yer ekseni
  // depo granülünde); iki kayıt aynı niyetten çıkar ama aynı şeyi saymaz.
  void recordEvent({ type: 'place_resolved', resolved: true });

  return {
    data: {
      kind: 'resolved',
      place: {
        postalCode,
        country: identity.country,
        // Rota dışında da dolu: "75011 Paris · kargo" artık yazılabiliyor (19.8). Çok yerleşimli
        // kodda `null` kalır ve ekran `places`'ten kendi etiketini kurar (19.17); kendi bölge
        // tablomuzda olan kodda da null — orada bölge adı zaten daha bilgilendirici.
        placeName: identity.placeName,
        places: [...identity.places],
        zoneName: inRoute ? (zone?.name ?? null) : null,
        inRoute,
        nextDate: delivery.availableDates[0] ?? null,
        point,
      },
    },
    errorKey: null,
  };
}

/**
 * Posta kodu önerileri (19.7 · autocomplete) — müşteri yazarken gösterilen aday listesi.
 *
 * **`resolvePlaceAction`'ın bir kipi DEĞİL, ayrı bir kapı.** O eylemin içinde `recordDemand` var ve
 * her tuşlanan kod "bölge dışı talep" sayacına düşerdi — bölge açma kararını besleyen sayaç.
 * Ayrım yapısal: **öneri bir OKUMA, onay bir NİYET**; sayaç niyete bağlı kalır (19.7'nin kayıtlı
 * kararı: *"kapıya bayrak eklemek yetmez, o bayrağı unutan ilk çağrı sayacı yine kirletir"*).
 *
 * Guard yok — `resolvePlaceAction` gibi, soru ziyaretçiye de açık.
 *
 * Kısa önekte sunucuya HİÇ gidilmez: iki haneden kısa önek hiçbir yeri işaret etmiyor (kapı da
 * aynı eşiği uyguluyor, ama boşa gidiş-dönüş yapmanın anlamı yok).
 *
 * Hata hâlinde boş liste döner, `error` DEĞİL: öneri bir kolaylık. Kapı düşerse müşteri kodu elle
 * yazıp "Göster"e basar ve akış sürer; kırmızı bir satır göstermek çalışan bir yolu arızalı gibi
 * okuturdu.
 */
export async function suggestPostalCodesAction(prefix: string): Promise<PlaceOption[]> {
  const normalized = normalizePostalCode(prefix);
  /**
   * **EŞİK TERİMİN TÜRÜNE GÖRE** (08.41): kodda iki hane, adda üç harf. İkisi de servisin kendi
   * ölçümünden geliyor (`PostalCodePlaceService`): tek harflik kod öneki 16.9k satırın onda birini
   * gezip hiçbir şey ayırt etmiyor, iki harflik ad parçası ("st") yüzlerce yerleşime uyup tavana
   * takılıyor ve rastgele bir kesit dönüyor — cevap gibi görünen bir gürültü. Trigram indeksinin
   * kendi birimi de üç harf.
   *
   * Eşiği burada da uygulamak kopya bir kural değil, boşa gidiş-dönüşten kaçınmak: servis aynı
   * terimi zaten reddedecek, ama bunu bir sunucu turu harcadıktan sonra yapardı.
   */
  if (normalized.length < (/\p{L}/u.test(normalized) ? 3 : 2)) return [];
  try {
    /**
     * **AD ARAMASI AÇIK** (08.41 · kullanıcı kararı 10.08'in müşteri yüzeyindeki karşılığı).
     *
     * Ölçülen çıkmaz şuydu: yer hapının alanı harfi KABUL ediyor (`maxLength=5` yüzünden
     * "Strasbourg" → "Stras"), kapı harfi REDDEDİYORDU — müşteri sıfır öneri alıyor, "Göster"e
     * basınca da *"posta kodu 5 hane olmalı"* okuyordu. Oysa yazdığı şey geçerli bir yer adı ve
     * motor onu 15.08'den beri biliyor (`OB-03`, iki dallı `search`). Ölçüm: `Strasbourg` → 3
     * öneri, `hoenheim` → `67800 (Bischheim, Hœnheim)`.
     *
     * **Neden servise değil `suggestPlaces`e:** ad türetme kuralı (`placeLabel` — tek yerleşimse
     * adı, çoksa `null`) tek yerde durmalı. Web burayı ham okuduğu sürece o kuralın ikinci bir
     * kopyası doğuyordu ve 19.8'in yanlış ad üretmesi tam olarak böyle olmuştu. Aynı kapı mobil
     * ucu da besliyor (`21.28`); iki yüzey artık aynı cevabı görüyor.
     */
    return await suggestPlaces(serviceDb(), normalized);
  } catch (err) {
    await captureError(err, { source: SOURCES.webAction, context: { prefix: normalized } });
    return [];
  }
}

async function recordDemand(postalCode: string): Promise<void> {
  try {
    await new DeliveryZoneService(serviceDb()).recordDemand(postalCode);
  } catch {
    // Sessiz: sayaç bir yan kayıt, müşterinin gördüğü hiçbir şeyi değiştirmez.
  }
}
