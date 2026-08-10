import { DeliveryZoneService, PostalCodePlaceService, type Db } from '@lezzet/database';
import { CountryEnum, type Country, type DeliveryAreaList } from '@lezzet/types';

/**
 * "ARAÇ NERELERE GİDİYOR" LİSTESİ — soğuk zincir aracının uğradığı POSTA KODLARI
 * (kullanıcı kararı 10.08).
 *
 * Sözleşme künyesi kuralı yazıyor (`DeliveryAreaListSchema`), burası onu okuyan tek kapı: bölge
 * dışı müşterinin *"siz nereye gidiyorsunuz?"* sorusunun cevabı. Kod kod deneyerek haritayı
 * çıkarmak zorunda kalmasın diye var.
 *
 * ── POSTA KODU, BÖLGE ADI DEĞİL (kullanıcı düzeltmesi 10.08) ────────────────
 * İlk yazımda bölgenin ADI gösteriliyordu ve bunun için tabloya müşteri-yüzü bir ad kolonu bile
 * eklenmişti. Kullanıcı ikisini de eledi: **`delivery_zone.name` müşteri için bir şey ifade
 * etmiyor** ("Illkirch / Ostwald" operasyonun rota etiketi), müşterinin elindeki tek ölçü kendi
 * posta kodudur — sorduğu soru da zaten "benim kodum listede var mı". Kodlar ZATEN veride
 * (`delivery_zone_postal_code`), yani cevap için yeni kolona da migration'a da gerek yoktu; eklenen
 * kolon geri alındı.
 *
 * ── ÖBEKLEME SUNUCUDA (kullanıcı sorusu 10.08) ──────────────────────────────
 * Cevap önce düz bir kod dizisiydi ve ölçek sorusunda çöktü: *"yarın iki yüz posta koduna hizmet
 * veriyorum, ellisi Almanya'da"*. 200 satırlık düz liste kimsenin okumadığı bir duvardır ve Alman
 * kodu Fransız kodunun arasına karışır. Şekil bu yüzden **ülke → yer adı** ekseninde öbeklendi ve
 * öbekleme BURADA yapılıyor: iki yüzey (bugün uygulama, yarın web) aynı listeyi kendi kuralıyla
 * öbeklerse biri bir gün ötekinden farklı bir sayfa gösterir.
 *
 * ── YALNIZ AKTİF BÖLGELER ───────────────────────────────────────────────────
 * Pasif bölgeye araç gitmiyor; kodunu listelemek tutmadığımız bir sözü ilan etmek olurdu. Süzgeç
 * veritabanında (`activeOnly`).
 *
 * ── AD REFERANSTAN, TEK TURDA ───────────────────────────────────────────────
 * Yer adı `postal_code_place`ten okunur ve okuma **tek sorgudur** (`listByPostalCodes`): kod başına
 * sorgu 7 kodda görünmez, 200 kodda 200 gidiş-dönüştür. Eşleme `(ülke, kod)` ikilisiyle yapılır —
 * kodların onda biri iki ülkede birden geçerli (610/16.878), yalnız koda bakan bir eşleme Alman
 * satırının adını Fransız koduna yazardı.
 *   Ad = `places[0]`. Burada `placeLabel` KULLANILMIYOR ve bu bilinçli: o motor bir ADRESİN adını
 * verir ve çok yerleşimli kodda ad uydurmamak için `null` döner (19.17) — orada tekil bir yeri
 * işaret ediyoruz. Bu liste ise bir ADRES göstermiyor, bir öbeğe başlık atıyor; "Strasbourg"
 * başlığı altında üç kod görmek müşteriyi hiçbir konuda yanıltmaz, o başlığı silmek ise listeyi
 * yine okunmaz bir kod duvarına çevirirdi. **Kaydı olmayan kod `name: null`** — kod yine listelenir
 * (gittiğimiz yeri saklamak, adı uydurmak kadar yanlış olurdu).
 *
 * ── TEKİLLEŞTİRME VE BELİRLENİMCİ SIRA ──────────────────────────────────────
 * Kod ↔ bölge eşlemesi veride tekil (`(country, postal_code)` birincil anahtar), yani aynı kod iki
 * kez gelemez — yine de küme üzerinden geçiliyor: bu okuma tekilliği VARSAYMAK yerine garanti
 * etmeli, kısıt bir gün gevşerse liste sessizce tekrar basmasın.
 *   Sıranın tamamı belirlenimci; aynı veri her koşuda aynı listeyi verir. Ülke sırası şemanın kendi
 * sırasından türer (`CountryEnum.options` → FR, DE): ikinci bir sıra listesi yazmak, ülke eklendiği
 * gün unutulacak bir kopya olurdu. Yer adı `localeCompare(…, 'fr')` ile — harmanlama açıkça
 * verilmezse çalışma ortamının diline bağlanır ve sıra makineden makineye değişir. **Adsız öbek
 * sona düşer**: adı olanların arasında başlıksız bir satır, sıranın bozulduğu izlenimi verir.
 * Kodlar kendi içinde artan (rakam dizisi, sabit uzunluk — okuyan için doğal olan tek sıra).
 *
 * Sayfalama yok: kod kümesi operatörün elle kurduğu, doğal tavanı olan bir kümedir (CLAUDE §1'in
 * "tek turda" dalı) ve öbeklenmiş hâli 200 kodda bile tek turluk bir gövdedir. **Boş liste geçerli
 * bir cevaptır** — hiç aktif bölge olmayabilir; okuma düşseydi servis fırlatırdı ve zarf hata
 * dönerdi (ikisi karışmaz).
 */
export async function listPublicDeliveryAreas(db: Db): Promise<DeliveryAreaList> {
  const zones = await new DeliveryZoneService(db).listWithCodes({ activeOnly: true });

  const codeKey = (country: Country, postalCode: string) => `${country}:${postalCode}`;

  const served = new Map<string, { country: Country; postalCode: string }>();
  for (const zone of zones) {
    for (const code of zone.postalCodes) served.set(codeKey(code.country, code.postalCode), code);
  }
  if (served.size === 0) return { areas: [] };

  const rows = await new PostalCodePlaceService(db).listByPostalCodes(
    [...served.values()].map((code) => code.postalCode),
  );
  const nameByCode = new Map<string, string>();
  for (const row of rows) {
    const name = row.places[0];
    if (name) nameByCode.set(codeKey(row.country, row.postalCode), name);
  }

  // İki katmanlı öbek: ülke → yer adı. Adsız kodlar ülkenin tek bir `null` öbeğinde toplanır.
  const byCountry = new Map<Country, Map<string | null, string[]>>();
  for (const code of served.values()) {
    const byName = byCountry.get(code.country) ?? new Map<string | null, string[]>();
    const name = nameByCode.get(codeKey(code.country, code.postalCode)) ?? null;
    byName.set(name, [...(byName.get(name) ?? []), code.postalCode]);
    byCountry.set(code.country, byName);
  }

  const areas = [];
  for (const country of CountryEnum.options) {
    const byName = byCountry.get(country);
    if (!byName) continue;

    const places = [...byName]
      .sort(([left], [right]) => {
        if (left === right) return 0;
        // Adsız öbek daima sonda; iki adlı öbek arasında Fransızca harmanlama.
        if (left === null) return 1;
        if (right === null) return -1;
        return left.localeCompare(right, 'fr');
      })
      .map(([name, codes]) => ({ name, codes: [...codes].sort() }));
    areas.push({ country, places });
  }
  return { areas };
}
