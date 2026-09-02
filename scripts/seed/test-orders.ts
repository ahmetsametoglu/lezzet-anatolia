import { transitionOrder } from '@lezzet/application';
import { AddressService, DeliveryZoneService, OrderService, PriceService, ReservationService, UserProfileService } from '@lezzet/database';
import { resolveVatTreatment } from '@lezzet/domain-core';
import { type Db, type VaryantRef } from './shared';
import type { Depolar } from './warehouse';

/*
  ── DENEME SİPARİŞLERİ (kullanıcı kararı 02.09) ─────────────────────────────────────────────────

  **Bu blok 01.09'un "besleme HİÇ sipariş yazmaz" kararını DARALTIYOR ve gerekçesi yaşandı.**

  O kararın konusu bir ZİNCİRDİ: sipariş beslemenin en çok türeten kaydıydı ve peşinden rezervasyon,
  kutu, gönderi, sefer, kapanış, geri bildirim, puan, tahsilat geliyordu — kullanıcının cümlesi
  *"sipariş yoksa o siparişle alakalı sonraki tüm kayıtların da olmaması lazım"*dı. Zincir kalktı ve
  KALKMIŞ durumda: aşağıdaki siparişler `confirmed`te durur, hiçbir şey türetmez.

  Kalkmasının bedeli hemen görüldü: her `db:refresh`ten sonra kurye akışını denemek için önce
  müşteri yüzeyinden sipariş vermek gerekiyordu. Kullanıcı bunun yerine *"sipariş oluşturmayı sen
  yap… doğrudan besleme üzerinden"* dedi.

  ── NEDEN TAM OLARAK BU HÂL: `confirmed` ─────────────────────────────────────
  Kullanıcının kendi çizdiği akış: *"Siparişler önce depo kısmında toplamaya, toplama bittikten
  sonra kurye tarafına düşsün."* `confirmed` o akışın BAŞLANGICIDIR — toplama kuyruğunda görünür,
  kutusu yoktur, kuryesi yoktur. Bir adım ötesini (`ready`, kutulu) yazmak denenecek adımı atlamak
  olurdu; bir adım berisi (`draft`) ödeme bekleyen bir taslaktır ve kuyruğa hiç düşmez.

  ── MÜŞTERİLERİN AUTH HESABI YOK, ve bu bilinçli ────────────────────────────
  Kullanıcı bu e-postalarla KENDİ giriş yapıyor. `0002` tetikleyicisi girişte e-postayla EŞLEŞTİRİR
  (`lower(email) = lower(new.email) and auth_user_id is null`), yani buradaki profil hazır hesap
  değil bir BEKLEYEN kayıttır: giriş anında aynı kişiye bağlanır ve siparişler o hesabın altında
  görünür. Hesabı burada açsaydık OTP akışı atlanır, denenmek istenen yol hiç koşmazdı.

  ── ADRESLER GERÇEK, KOORDİNATLAR ÖLÇÜLDÜ (kullanıcı kararı 02.09) ──────────
  *"Adresler gerçek olsun. Koordinatları gerçek olsun."* Hepsi **BAN**'dan (Base Adresse Nationale,
  `api-adresse.data.gouv.fr`) tek tek çekildi ve buraya SABİTLENDİ; dokuzunun dokuzu da
  `type: housenumber` ve skoru 0,96+ — yani kapı numarası düzeyinde çözülmüş gerçek adresler.

  **Çekim BİR KEZ, yazım anında yapıldı; besleme ağa ÇIKMAZ** (`seed/delivery.ts` künyesinin aynı
  kuralı: *"'ağa çıkma' ilkesinin doğru sonucu koordinat yazmamak değil, bir kez çekip
  sabitlemek"*). Uydurma bir kapı koordinatı gerçek bir ölçüm gibi okunur ve rota sıralaması onun
  üstünde yanlış bir doğru üretirdi.

  ── HEPSİ TEK ROTADA, ÇÜNKÜ SINANAN ŞEY SIRALAMA ────────────────────────────
  *"Bir rota hesaplaması yapabilecek kadar fazla durak olsun ve bu posta kodları da aynı rota
  içerisinde olsun."* Dokuz adresin dokuzu da Güney Hattının kendi kodlarında: 67600 Sélestat ·
  68000 Colmar · 68100 Mulhouse. Şehirler arası mesafe 30-40 km, şehir içi adresler ise birbirine
  birkaç yüz metre — sıralama motoru (11.9) ancak böyle bir yayılımda gerçekten sınanır: kaba sıra
  şehirlerden, ince sıra sokaklardan gelir.

  ── FİYAT KATALOGDAN GELİR, UYDURULMAZ ──────────────────────────────────────
  Kullanıcı *"ürün adedi fazla olsun, fiyat da fazla olsun ki testimiz rahat olsun"* dedi. Sayıyı
  büyütmenin iki yolu vardı: fiyatı elle yazmak ya da GERÇEK kalemleri sepete koymak. İkincisi
  seçildi — kalem fiyatı `PriceService.findApplicableMap` ile katalogdan okunuyor (vitrinin okuduğu
  aynı kapı), adet 1-4 arasında. Elle yazılan bir fiyat, katalog değiştiği gün sessizce yalan olur.

  **Kapıda nakit tutarında bir SINIR YOK** (kullanıcının sorusu): sistemde kapıda ödeme için bir üst
  limit ayarı bulunmuyor — arandı, yok. Önceki turun 20-26 €'su bilinçli bir eşik değil, uydurma bir
  formülün sonucuydu.
*/

/**
 * Denemenin müşterileri ve adresleri — **hepsi BAN'dan ölçüldü** (02.09, `type: housenumber`).
 *
 * Beş kişi, dokuz adres: üç kişinin İKİ adresi var (ev + dükkân/ofis) ve ikisine de sipariş çıkıyor.
 * Kullanıcının cümlesi: *"Bir kişinin birden fazla siparişi de olabilir."* Aynı hesabın iki ayrı
 * kapıya düşmesi, kurye ekranında "aynı müşteri ama başka durak" hâlini de doğuruyor.
 */
const DENEME_MUSTERILERI = [
  {
    email: 'test1@example.fr',
    name: 'Hugo Bernard',
    phone: '+33611223344',
    adresler: [
      { label: 'Ev', line1: '5 Boulevard du Général Leclerc', postalCode: '67600', city: 'Sélestat', lat: 48.261083, lng: 7.451767 },
      { label: 'Dükkân', line1: '18 Rue des Clefs', postalCode: '68000', city: 'Colmar', lat: 48.078325, lng: 7.360146 },
    ],
  },
  {
    email: 'test2@example.fr',
    name: 'Léa Girard',
    phone: '+33622334455',
    adresler: [{ label: 'Ev', line1: '3 Rue des Chevaliers', postalCode: '67600', city: 'Sélestat', lat: 48.259592, lng: 7.455364 }],
  },
  {
    email: 'test3@example.fr',
    name: 'Camille Roux',
    phone: '+33633445566',
    adresler: [
      { label: 'Ev', line1: '7 Rue des Têtes', postalCode: '68000', city: 'Colmar', lat: 48.078975, lng: 7.35633 },
      { label: 'Ofis', line1: '11 Rue du Sauvage', postalCode: '68100', city: 'Mulhouse', lat: 47.746725, lng: 7.340567 },
    ],
  },
  {
    email: 'test4@example.fr',
    name: 'Antoine Muller',
    phone: '+33644556677',
    adresler: [{ label: 'Ev', line1: '24 Avenue de la République', postalCode: '68000', city: 'Colmar', lat: 48.07696, lng: 7.352575 }],
  },
  {
    email: 'test5@example.fr',
    name: 'Sophie Klein',
    phone: '+33655667788',
    adresler: [
      { label: 'Ev', line1: '9 Rue de la Sinne', postalCode: '68100', city: 'Mulhouse', lat: 47.743755, lng: 7.334883 },
      { label: 'Yazlık', line1: '14 Rue du Président Poincaré', postalCode: '67600', city: 'Sélestat', lat: 48.257146, lng: 7.454996 },
    ],
  },
] as const;

/** Siparişlerin düştüğü rota — bugünü ya da sonraki koşu gününü kendisi veriyor. */
const ROTA_ADI = 'Güney Hattı — Mulhouse';

/**
 * Rotanın BUGÜNDEN İTİBAREN ilk koşu günü (`YYYY-MM-DD`).
 *
 * Bugün koşuyorsa bugün: kullanıcı `db:refresh`ten hemen sonra akışı deneyebilmeli. Koşmuyorsa
 * sonraki gün aranır — en fazla bir hafta, çünkü haftanın günleri yedi tanedir ve bulunamaması
 * bölgenin gününün hiç olmadığı anlamına gelir (veri hatası, sessiz geçilmez).
 */
function ilkKosuGunu(weekdays: readonly number[]): string {
  const bugun = new Date();
  for (let offset = 0; offset < 7; offset += 1) {
    const gun = new Date(bugun.getTime() + offset * 24 * 60 * 60 * 1000);
    // `getDay()` pazar=0; bölgenin ölçeği pazartesi=1…pazar=7 (`delivery_zone.weekdays`).
    const gunNo = gun.getDay() === 0 ? 7 : gun.getDay();
    if (weekdays.includes(gunNo)) return gun.toISOString().slice(0, 10);
  }
  throw new Error(`seed: "${ROTA_ADI}" hiçbir güne koşmuyor — bölge günleri boş mu?`);
}

export async function seedTestOrders(db: Db, varyantlar: VaryantRef[], depolar: Depolar): Promise<void> {
  const orders = new OrderService(db);
  const { count } = await db.from('order').select('*', { count: 'exact', head: true });
  if ((count ?? 0) > 0) {
    console.log('▸ sipariş tablosu dolu — deneme siparişleri atlandı');
    return;
  }
  console.log('▸ DENEME SİPARİŞİ seed');

  const zones = new DeliveryZoneService(db);
  const bolge = (await zones.list()).find((z) => z.name === ROTA_ADI);
  if (!bolge) throw new Error(`seed: "${ROTA_ADI}" bölgesi yok — deneme siparişi kurulamaz`);
  const teslimGunu = ilkKosuGunu(bolge.weekdays);

  const profiles = new UserProfileService(db);
  const addresses = new AddressService(db);
  const reservations = new ReservationService(db);

  /* Kalem adayları: AKTİF ve STR'de BOLCA duran varyantlar. Rezervasyon kullanılabilir stoğa bakar
     ve yetmezse reddeder — eşik yüksek tutuluyor (>20) çünkü siparişler 1-4 adetli ve aynı varyant
     birden çok siparişe girebiliyor. */
  const { data: stokSatirlari } = await db
    .from('stock')
    .select('variant_id,physical_qty')
    .eq('warehouse_id', depolar.str)
    .gt('physical_qty', 20);
  const stokta = new Set(((stokSatirlari ?? []) as { variant_id: string }[]).map((s) => s.variant_id));
  const adaylar = varyantlar.filter((v) => v.status === 'active' && stokta.has(v.id));

  /* Fiyat UYGULANABİLİR olanı (`findApplicableMap`) — kanal ve geçerlilik seçimi orada tek yerde
     yaşıyor ve vitrinin okuduğuyla aynı. Fiyatsız varyant sipariş kalemi OLAMAZ: sıfır yazmak,
     ekranda "0,00 €" diye görünen bir veri hatası üretirdi. */
  const fiyatlar = await new PriceService(db).findApplicableMap(
    adaylar.map((v) => v.id),
    'b2c',
  );
  const fiyatli = adaylar.filter((v) => (fiyatlar.get(v.id)?.channelPrice?.amountCents ?? 0) > 0);
  if (fiyatli.length < 12) throw new Error(`seed: deneme siparişi için yeterli stoklu+fiyatlı varyant yok (${fiyatli.length})`);

  let kalemImleci = 0;
  let siparisNo = 0;
  const ozet: string[] = [];

  for (const musteri of DENEME_MUSTERILERI) {
    const mevcut = await profiles.findByEmail(musteri.email);
    const profil =
      mevcut ??
      (await profiles.insert({
        email: musteri.email,
        name: musteri.name,
        phone: musteri.phone,
        roles: ['customer'],
        preferredLanguage: 'fr',
      }));

    for (const [k, tanim] of musteri.adresler.entries()) {
      const adres = await addresses.addForCustomer({
        ...tanim,
        recipient: musteri.name,
        phone: musteri.phone,
        customerId: profil.id,
        isDefault: k === 0,
        /* BAN'ın kendi cevabı: kapı numarası düzeyinde çözüldü. Kaynak da yazılıyor ki tarama işi
           (`geocode_addresses`) bu satırları yeniden çözmeye kalkmasın. */
        geoPrecision: 'housenumber',
        geoSource: 'ban',
      });

      /* ÜÇ İLA BEŞ KALEM, 1-4 ADET: tek kalemli sipariş ne kutuyu ne toplamayı çoğul hâliyle
         gösterir. İmleç adaylar arasında ilerliyor, yani her sipariş başka ürünler taşıyor — hepsi
         aynı iki üründen olsaydı toplama ekranı tek bir satırı tekrar ederdi. */
      const kalemSayisi = 3 + (siparisNo % 3);
      const kalemler = Array.from({ length: kalemSayisi }, (_, i) => {
        const v = fiyatli[(kalemImleci + i) % fiyatli.length]!;
        return {
          variantId: v.id,
          qty: 1 + ((siparisNo + i) % 4),
          vatRate: 5.5,
          unitPriceCents: fiyatlar.get(v.id)!.channelPrice!.amountCents,
        };
      });
      kalemImleci += kalemSayisi;
      const toplam = kalemler.reduce((sum, kalem) => sum + kalem.unitPriceCents * kalem.qty, 0);

      const vergi = resolveVatTreatment({ channel: 'b2c', deliveryCountry: 'FR' });
      const { order, items } = await orders.create(
        {
          customerId: profil.id,
          warehouseId: depolar.str,
          deliveryCountry: 'FR',
          vatTreatment: vergi.treatment,
          channel: 'b2c',
          orderSource: 'web',
          deliveryType: 'route',
          deliveryZoneId: bolge.id,
          deliveryDate: teslimGunu,
          locale: 'fr',
          addressId: adres.id,
          /* KOPYA TAM OLMALI (21.08'in dersi): checkout adresin tamamını yayıyor ve eksik kopya
             sessizce yalancı ekran üretiyor — alıcı adı boş kalırsa sipariş detayı "hesap sahibine
             düşüldü" der, koordinat boş kalırsa rota sıralaması posta kodu MERKEZİNE düşer. */
          addressSnapshot: {
            label: adres.label,
            recipient: adres.recipient,
            line1: adres.line1,
            line2: adres.line2,
            postalCode: adres.postalCode,
            city: adres.city,
            phone: adres.phone,
            country: adres.country,
            lat: adres.lat,
            lng: adres.lng,
            geoPrecision: adres.geoPrecision,
            geoSource: adres.geoSource,
          },
          courierId: null,
          onAccount: false,
          /* Hepsi KAPIDA NAKİT: kuryenin tahsilat adımı ve akşam mutabakatı ancak sayılacak para
             varsa sınanır. Çevrimiçi ödenmiş bir sipariş yazmak, ödeme kaydı da yazmak demekti — o
             zincir bilerek kapalı (dosya baş künyesi). */
          paymentMethod: 'cash',
          isGiftOrder: false,
          shippingFeeCents: 0,
          /* ALAN ADI `orderedTotalCents` (ölçüldü 02.09): ilk yazımda `totalCents` denmişti, şema o
             adı tanımıyor ve sessizce düşürdü — sipariş `ordered_total = 0` ile doğdu. Sıfır tutarlı
             sipariş ekranda "0,00 €" yazar ve bu, CLAUDE §0'ın 05.08'de kayda geçen tuzağının
             aynısı: belirti bir veri hatasını değil, olmayan bir ürün sorununu düşündürür. */
          orderedTotalCents: toplam,
        },
        kalemler,
      );

      /* Rezervasyon SÜRESİZ: sipariş onaylandı, mal artık müşteriye söz verildi. TTL yalnız ödeme
         bekleyen taslakta olur (`draft`) ve o hâl bu blokta yok. */
      for (const item of items) {
        await reservations.reserve({ orderId: order.id, variantId: item.variantId, warehouseId: depolar.str, qty: item.qty });
      }
      /*
        GEÇİŞ UYGULAMA KAPISINDAN (ölçüldü 02.09): ilk yazımda `OrderService.transition` doğrudan
        çağrılıyordu ve siparişler REFERANSSIZ doğdu (`reference_no: null`) — depo ve kurye ekranları
        siparişi "—" diye gösterirdi. Referans ilk KALICI durumda üretilir ve o kuralın yeri uygulama
        kapısıdır (`transitionOrder` → `producesReferenceNo`); servis düz yazım yapar, kuralı bilmez.
      */
      const gecis = await transitionOrder(db, { orderId: order.id, to: 'confirmed', expectedFrom: 'draft', actorId: profil.id });
      if (gecis.status !== 'ok') throw new Error(`seed: deneme siparişi onaylanamadı (${musteri.email} · ${gecis.status})`);

      siparisNo += 1;
      ozet.push(
        `  ✓ ${gecis.referenceNo ?? '—'} · ${musteri.name} <${musteri.email}> · ${kalemSayisi} kalem · ${(toplam / 100).toFixed(2)} € · ${tanim.postalCode} ${tanim.city}`,
      );
    }
  }

  for (const satir of ozet) console.log(satir);
  console.log(`✓ deneme siparişi: ${siparisNo} sipariş · ${DENEME_MUSTERILERI.length} müşteri · "confirmed" · hepsi ${ROTA_ADI} · teslim ${teslimGunu}`);
}
