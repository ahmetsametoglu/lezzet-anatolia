import { transitionOrder } from '@lezzet/application';
import { AddressService, DeliveryZoneService, OrderService, PriceService, ReservationService, UserProfileService } from '@lezzet/database';
import { resolveVatTreatment } from '@lezzet/domain-core';
import { SESSIZ_ETKILER, type Db, type VaryantRef } from './shared';
import type { Depolar } from './warehouse';

/*
  Deneme siparişleri `confirmed`te durur ve hiçbir kayıt türetmez, çünkü toplama ve kurye akışı `db:refresh`ten sonra bu hâlden denenir.
  Müşterilerin auth hesabı yoktur (girişte `0002` e-postayla eşleştirir), adres koordinatları BAN'dan bir kez çekilip sabitlenmiştir ve
  kalem fiyatı katalogdan okunur.
*/

/**
 * Denemenin müşterileri ve adresleri (BAN, `type: housenumber`). Üç kişinin iki adresi var ve ikisine de sipariş çıkar, ki kurye
 * ekranında "aynı müşteri, başka durak" hâli doğsun.
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
 * Rotanın bugünden itibaren ilk koşu günü (`YYYY-MM-DD`); en fazla bir hafta aranır ve bulunamaması bölgenin gününün olmadığı demektir
 * (veri hatası, sessiz geçilmez).
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

      const vergi = resolveVatTreatment({ channel: 'b2c', originCountry: 'FR', deliveryCountry: 'FR', destinationTaxation: null });
      if (!vergi.ok) throw new Error(`KDV kararı verilemedi: ${vergi.reason}`);
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
          /* Kopya tam olmalı: alıcı adı boş kalırsa sipariş detayı hesap sahibine düşer, koordinat boş kalırsa rota sıralaması posta
             kodu merkezine düşer. */
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
          /* Alan adı `orderedTotalCents`: şema tanımadığı adı sessizce düşürür ve sipariş sıfır tutarla doğardı. */
          orderedTotalCents: toplam,
        },
        kalemler,
      );

      /* Rezervasyon SÜRESİZ: sipariş onaylandı, mal artık müşteriye söz verildi. TTL yalnız ödeme
         bekleyen taslakta olur (`draft`) ve o hâl bu blokta yok. */
      for (const item of items) {
        await reservations.reserve({ orderId: order.id, variantId: item.variantId, warehouseId: depolar.str, qty: item.qty });
      }
      // Geçiş uygulama kapısından: referans ilk kalıcı durumda üretilir ve o kural `transitionOrder`dadır, servis düz yazım yapar.
      const gecis = await transitionOrder(db, {
        orderId: order.id,
        to: 'confirmed',
        expectedFrom: 'draft',
        actorId: profil.id,
        effects: SESSIZ_ETKILER,
      });
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
