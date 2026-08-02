import { cartKey, type CartLine, type CartView } from './cart-types';

/**
 * Yer değişince sepette NE DEĞİŞTİ (19.7 · tasarım `musteri-yer-ekseni §5`).
 *
 * **Sessiz daralma yok.** Yer değiştiğinde her kalem hâline yeniden oturuyor: kapıya gidenler
 * kargo grubuna düşebiliyor, düşenler geri çıkabiliyor, teklif fiyatı bir partiye bağlı olduğu
 * için geçersiz kalabiliyor. Hiçbiri silinmiyor ama hiçbiri de sabit kalmıyor — ve müşteri bunu
 * fark etmezse sepetini son gördüğü hâliyle hatırlar. "Sepette gördüm, ödemede kayboldu"
 * şikâyeti tam olarak buradan doğar.
 *
 * Karşılaştırma **iki okuma arasında** yapılır: eski yer bağlamıyla çözülmüş görünüm ile yeni
 * yer bağlamıyla çözülmüş görünüm. Saf fonksiyon — kararı okumalar veriyor, bu yalnız farkı
 * okuyor; ekran da farkı hesaplamıyor.
 */
export type CartLineChange =
  /** Kapıdan kargoya düştü — artık ayrı bir siparişle gidecek. */
  | { kind: 'to_shipping'; name: string }
  /** Kargodan kapıya çıktı — yeni yerin deposunda var, araçla ve ücretsiz gelecek. */
  | { kind: 'to_route'; name: string }
  /**
   * Yeni yerde karşılanamıyor: soğuk zincir olduğu için kargoya da verilemiyor ya da hiçbir
   * depoda kalmadı. Kalem SİLİNMEZ; çıkışını kısıt bloğu sunar (sonraya kaydet / haber ver).
   */
  | { kind: 'unavailable'; name: string }
  /** Fiyat değişti — teklif partisi yere bağlıdır ve yeni yerde geçerli olmayabilir (DOMAIN §5). */
  | { kind: 'price'; name: string; fromCents: number; toCents: number };

/** Kalem artık bu yerde alınamıyor mu — motorun iki olumsuz yolu. */
function unreachable(line: CartLine): boolean {
  return line.route === 'not_shippable_here' || line.route === 'unavailable';
}

export function diffCartByPlace(before: CartView, after: CartView): CartLineChange[] {
  const previous = new Map(before.lines.map((line) => [cartKey(line), line]));
  const changes: CartLineChange[] = [];

  for (const line of after.lines) {
    const was = previous.get(cartKey(line));
    // Yeni eklenmiş satırın "değişimi" yok: kıyaslanacak bir önceki hâli yok.
    if (!was) continue;

    // ÖNCE yol, sonra fiyat. Bir kalem ikisini birden yaşayabilir (kargoya düşen teklif kalemi
    // fiyatını da kaybeder) ve o zaman önemli olan yolun kendisidir: fiyat farkı, yol değişiminin
    // sonucudur. İki satır yazmak aynı olayı iki kez anlatırdı.
    if (unreachable(line) && !unreachable(was)) {
      changes.push({ kind: 'unavailable', name: line.name });
      continue;
    }
    if (line.route === 'shipping' && was.route !== 'shipping') {
      changes.push({ kind: 'to_shipping', name: line.name });
      continue;
    }
    if (line.route === 'local' && was.route === 'shipping') {
      changes.push({ kind: 'to_route', name: line.name });
      continue;
    }
    // Fiyat karşılaştırması yalnız İKİ TARAF DA BİLİNİYORKEN yapılır: satışa kapanmış kalemin
    // fiyatı `null` ve onu "0 €'ya düştü" diye okumak, olmayan bir indirim uydurmak olurdu.
    if (line.unitPriceCents !== null && was.unitPriceCents !== null && line.unitPriceCents !== was.unitPriceCents) {
      changes.push({ kind: 'price', name: line.name, fromCents: was.unitPriceCents, toCents: line.unitPriceCents });
    }
  }

  return changes;
}
