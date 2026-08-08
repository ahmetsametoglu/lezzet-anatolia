/*
  D6 · KURYE DÖNÜŞÜ — DÖKÜMÜN FIXTURE'I (v2:483-510 birebir).

  ── YAZMA GERÇEK, OKUMA FIXTURE ─────────────────────────────────────────────
  D6'nın YAZMA kapısı var ve bağlı: `POST /api/v1/warehouse/returns/:orderId` (uç 21.11b). OKUMA
  kapısı YOK — "bugün hangi kurye ne geri getirdi" sorusunu cevaplayan bir uç yazılmadı, çünkü
  karşılığı bir kapıda değil. Kurye tarafındaki gün kapanışı taslağı (`/courier/day-close`) dönen
  durakları taşıyor ama o uç `courier|admin` rolünün arkasında: depocu onu çağıramaz ve çağırması
  da doğru olmazdı (bir kuryenin günü, deponun listesi değildir).

  Bu yüzden dökümün KENDİSİ fixture, akıbet işaretlemesi ve kayıt gerçektir. Fixture'ın `orderId`i
  uydurma olduğu için kapı `not_found` döner ve ekran o reddi AYNEN gösterir — sahte bir "yazıldı"
  ekranı basmak, depocuya yapılmamış bir kaydı yapılmış gibi göstermek olurdu (CLAUDE §1).

  Gerçek okuma kapısı açıldığı gün bu dosya silinir; ekranın düzeni (üç akıbet, zorunlu not,
  ulaşılamayanlar bloğu, hedef-değer kuralı) değişmez.
*/

export interface CourierReturnLine {
  /** Sipariş kaleminin kimliği — kapı `adjustments[].orderItemId` olarak ister. */
  orderItemId: string;
  name: string;
  /** Kuryeye verilmiş adet; **hedef değer** bundan türer (fark sistemde hesaplanır). */
  qty: number;
}

export interface CourierReturnDrop {
  orderId: string;
  referenceNo: string;
  courierName: string;
  /** Kuryenin kapıdaki notu — depocunun akıbet kararının tek bağlamı. */
  note: string | null;
  /** Hasar fotoğrafı VAR MI; görüntüleme bu sürümde yok (kamera/kova hattı 21.13). */
  hasPhoto: boolean;
  lines: CourierReturnLine[];
}

interface CourierReturnUnreached {
  referenceNo: string;
  /** Koli sayısı — araçta kalan, kabul EDİLMEYEN mal. */
  parcels: number;
}

export const COURIER_RETURN_FIXTURE: CourierReturnDrop = {
  orderId: '00000000-0000-4000-8000-000000000401',
  referenceNo: 'LZA-26-9Q2B',
  courierName: 'Musa K.',
  note: 'kapıda reddetti — koku şüphesi',
  hasPhoto: true,
  lines: [{ orderItemId: '00000000-0000-4000-8000-000000000411', name: 'Su Böreği', qty: 2 }],
};

/** Ulaşılamayanlar KABUL EDİLMEZ, yalnız görünür: araçta kalır, yarına devrolur (v2:505). */
export const COURIER_RETURN_UNREACHED: CourierReturnUnreached[] = [{ referenceNo: 'LZA-26-7T4D', parcels: 2 }];
