import type { ShortfallSuggestion } from '@lezzet/domain-core';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { ScoreTone } from '@/components/operation/ui/score-tile';
import { num } from '@/components/operation/ui/format';
import type { PreparationLane, PreparationOrderView, WarehouseWorkView } from './preparation-types';

/**
 * Hazırlık masasının sözlüğü (10.1–10.3).
 *
 * **İÇ TERİM YASAĞI burada uygulanıyor** (`design/pages/depo-hazirlik.md §6`): "FEFO",
 * "rezervasyon", "batch-pinned", "fulfilled_qty" arayüz dilinde geçmez. Karşılıkları sade:
 * *"önce şu tarihli partiden"*, *"ayrılmış"*, *"karşılanan adet"*. Depocu kuralı değil, işi okur.
 */

/**
 * Kulvar adları (10.9) — hem kuyruk başlıklarında hem seçim kartlarında. **Tek yerde**, çünkü
 * ikisi aynı üç kulvarı sayıyor: ayrı yazılsalardı biri bir gün "kargo", öteki "günsüz" derdi ve
 * operatör iki ekranda iki farklı küme sanırdı.
 *
 * "Geciken" bir SUÇLAMA değil bir hâl: sipariş dün hazırlanmadı ve bugün hâlâ duruyor. Sebebi
 * ekranın işi değil — görünür olması işi.
 */
export const LANE_LABELS: Record<PreparationLane, string> = {
  overdue: 'geciken',
  today: 'bugün',
  shipping: 'kargo',
};

/** Kulvar başlığının altındaki tek cümle — o kulvarın NE olduğunu söyler. */
export const LANE_HINTS: Record<PreparationLane, string> = {
  overdue: 'Günü geçti, hâlâ hazırlanmadı — bugünün işinin önüne geçer.',
  today: 'Bugün teslim edilecek.',
  shipping: 'Kargo — teslim günü yok, sıraya göre hazırlanır.',
};

/**
 * **Deponun künye cümlesi** — seçim satırında ve şeritte, nokta ayraçlı gerçekler (Sevkiyat'ın
 * `DaySummary` deseni).
 *
 * Kutular kulvarları sayıyor; bu cümle TOPLAMI ve **ağırlığı** söylüyor. Sipariş sayısı tek başına
 * günü tarif etmiyor: 12 sipariş 60 adet de olabilir 400 adet de, ve ikisi bambaşka iki gün
 * (tasarım §2 — B2B 10-50 koli olabilir). B2B sayısı aynı beklentiyi kuruyor.
 *
 * **Sıfır olan parça yazılmaz.** "0 B2B" bir bilgi değil gürültüdür ve gerçek sayıları içinde
 * kaybederdi — bölge kartındaki "bekleyen" rozetiyle aynı kural.
 */
export function workSummary(w: WarehouseWorkView): string {
  const orders = w.overdue + w.today + w.shipping;
  if (orders === 0) return PREP_NOTES.choiceEmpty;
  return [
    `${num(orders)} sipariş`,
    `${num(w.unitCount)} adet`,
    w.b2bCount > 0 ? `${num(w.b2bCount)} B2B` : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

/**
 * **Karne kutusunun tonu — İŞİN NE OLDUĞUNA göre** (kullanıcı isteği 19.08: *"kartlar renklense…
 * işine göre, görevine göre, vazifesine göre"*).
 *
 * Renkler uydurulmuyor, `components/operation/ui/tone.ts` sözlüğünden okunuyor — o sözlük kapalı
 * bir listedir ve her tonun anlamı orada yazılı:
 *
 * | kutu | ton | sözlükteki anlamı | neden bu iş için doğru |
 * |---|---|---|---|
 * | geciken | `red` | *hata/**gecikme*** | sözlük gecikmeyi zaten kırmızıya bağlamış; dünün yapılmamış işi bugünün önüne geçer |
 * | bugün | `olive` | *yolunda* | planlandığı gibi akan iş — günün asıl vazifesi |
 * | kargo | `blue` | *bilgi/aday* | bir gün'e ait değil; kuyrukta bekleyen, sırası gelince yapılacak iş |
 * | yarım kalan | `amber` | *dikkat/**karar*** | biri başlamış bırakmış; sürecek birini bekliyor — bir karar gerekiyor |
 *
 * ── SIFIRIN TONU OLMAZ ──────────────────────────────────────────────────────
 * Sayı sıfırsa ton VERİLMEZ ve kutu nötr kalır. Sabit renkli bir "0 geciken", gerçek gecikmeyi
 * kendi gürültüsünde kaybederdi; renk ancak söyleyecek bir şeyi varken anlam taşır (`CLAUDE §3`).
 * Bu yüzden ton bir sözlük değil FONKSİYON: değere bakmadan verilemez.
 */
export function laneTone(kind: 'overdue' | 'today' | 'shipping' | 'inProgress', value: number): ScoreTone | undefined {
  if (value === 0) return undefined;
  const TONE: Record<typeof kind, ScoreTone> = {
    overdue: 'red',
    today: 'olive',
    shipping: 'blue',
    inProgress: 'amber',
  };
  return TONE[kind];
}

/**
 * **Şeritteki tek satırlık not** — hangi depoda ne var, en sert hâl kazanır.
 *
 * Şerit dar: dört sayıya yeri yok ve olsaydı da okunmazdı. Sıra karar ağırlığına göre — geciken iş
 * bugünün işinin önüne geçer, o yüzden varsa tek başına yazılıyor. Depolar şeridindeki `railNote`
 * ile aynı mantık, farklı soru: orası kurulumu, burası işi anlatıyor.
 */
export function stripNote(w: WarehouseWorkView): string {
  if (w.overdue > 0) return `${num(w.overdue)} geciken · ${num(w.today + w.shipping)} bekleyen`;
  const orders = w.today + w.shipping;
  return orders === 0 ? 'bekleyen yok' : `${num(orders)} bekleyen · ${num(w.unitCount)} adet`;
}

/** Sipariş kuyruğundaki durum rozeti — üç hâl, üç renk. */
export function queueStatus(order: PreparationOrderView): { label: string; tone: OpsTone } {
  if (order.isComplete) return { label: 'Hazır ✓', tone: 'olive' };
  // "hazırlanıyor 1/3": yarım kalan iş kaybolmamalı — depocu döndüğünde nerede kaldığını
  // listeden okumalı, siparişi açmak zorunda kalmadan (tasarım §4 "yarım kalan hazırlık").
  if (order.pickedLineCount > 0) return { label: `hazırlanıyor ${order.pickedLineCount}/${order.lineCount}`, tone: 'amber' };
  return { label: 'bekliyor', tone: 'slate' };
}

/** Kanal rozeti — B2B'de hacim beklentisi kurar (10–50 koli olabilir). */
export function channelLabel(order: PreparationOrderView): string {
  // "hacimli" eşiği ADET üzerinden ve parametrik: 40 paketin üstü bir arabayı doldurur, depocu
  // kolileri ona göre hazırlar. Eşik burada duruyor çünkü bir görünüm kararı — iş kuralı değil.
  const HACIM_ESIGI = 40;
  if (order.channel !== 'b2b') return 'B2C';
  return order.totalQty >= HACIM_ESIGI ? 'B2B · hacimli' : 'B2B';
}

/**
 * **Koliye yazılacak ad** — adresin alıcısı hesap sahibinden BAŞKAYSA (kullanıcı kararı 21.08).
 *
 * `null` iki hâlde: adreste alıcı yazılı değil (etiket zaten hesap adıyla gider) ya da ikisi aynı
 * kişi. İkisi aynıyken satır çizmek, her siparişe hiçbir şey söylemeyen bir tekrar eklerdi —
 * gösterilmeye değer olan şey FARKIN kendisi: paketi alacak kişi sipariş verenden başkası.
 *
 * Karşılaştırma boşluk ve büyük/küçük harf duyarsız: "ayşe yılmaz " ile "Ayşe Yılmaz" aynı kişidir
 * ve aradaki farkı depocuya bir uyarı gibi göstermek yanlış olurdu.
 */
export function parcelName(order: PreparationOrderView): string | null {
  const alici = order.recipientName?.trim();
  if (!alici) return null;
  return alici.toLocaleLowerCase('tr') === order.customerName.trim().toLocaleLowerCase('tr') ? null : alici;
}

/**
 * **Kutu özeti** (23.6) — "2 kutu · 1 kapalı · 1 açık". `null` = kutusuz akış (eski yol) ve o
 * hâlde satır hiç çizilmez: kutu istisnadır, yokluğunu her siparişe yazmak gürültü olurdu.
 *
 * Web'de kutu AÇILMAZ/KAPANMAZ (karar §1.1: tarama telefonda) — masa yalnız okur; bu yüzden
 * dönen şey bir cümledir, bir etkileşim modeli değil.
 */
export function boxSummary(order: PreparationOrderView): string | null {
  if (order.boxes.length === 0) return null;
  const sealed = order.boxes.filter((box) => box.sealedAt !== null).length;
  const open = order.boxes.length - sealed;
  const parts = [`${num(order.boxes.length)} kutu`];
  if (sealed > 0) parts.push(`${num(sealed)} kapalı`);
  if (open > 0) parts.push(`${num(open)} açık`);
  return parts.join(' · ');
}

export const PREP_NOTES = {
  empty: 'Bekleyen hazırlık yok. Onaylanan siparişler bu listeye kendiliğinden düşer.',
  /**
   * Seçim satırının boş hâli. `empty`den AYRI çünkü farklı bir soruya cevap veriyor: orada operatör
   * çalıştığı deponun kuyruğuna bakıyor ("işim bitti"), burada henüz seçmedi ("burada iş yok, ötekine
   * bak"). Aynı cümle iki yerde iki farklı şey söylerdi.
   */
  choiceEmpty: 'Bekleyen hazırlık yok',
  pick: 'Soldaki kuyruktan bir sipariş seçin; kalemleri ve hangi partiden alınacağı burada görünür.',
  /**
   * **Cümle 19.08'de değişti (10.9).** Eskiden *"liste yalnız bugünün işi"* diyordu ve o cümle
   * kuyruğun süzgecini birebir anlatıyordu — ama süzgeç yanlıştı: teslim günü olmayan kargo
   * siparişi ile dünden kalan hazırlanmamış sipariş de düşüyordu. Bugün liste **yapılması gereken
   * işi** gösteriyor; dışarıda kalan tek şey İLERİ tarihli sipariş.
   */
  queueHint: 'Liste bekleyen işin tamamı — geciken, bugün ve kargo. İleri tarihli sipariş girmez; yarım kalan iş saklanır.',
  /** Onayın ne yaptığını söyler: depocu ayrıca kayıt girmez, günlük ek yük sıfırdır. */
  confirmHint:
    'Onayla birlikte çıkan partiler otomatik kaydedilir — ayrıca kayıt girmezsiniz. "Sorun" ile başka partiden aldığınızı, partide eksik olduğunu ya da kalemin eksik kalacağını söyleyebilirsiniz.',
  /** Kilitli kalem: öneri değil zorunluluk. */
  pinned: 'partiye kilitli, başka partiden verilemez',
  /** Öneri satırının ilk partisi — "önce bu" işareti. Kuralın ADI geçmez, sonucu yazılır. */
  firstBatch: 'önce bu',
  /** Sipariş tamamlanınca ne olacağını önceden söyler. */
  completeHint: 'Tüm kalemler toplanınca sipariş "hazır" olur ve rota/kargoya düşer.',
  /** Sahadaki toplama akışı bu ekranın işi DEĞİL (yüzey formülü). */
  fieldHint: 'Raf karşısındaki toplama akışı cihaz uygulamasında; bu ekran masadan yönetim içindir.',
  /** Eksik kararı diyaloğunun altbilgisi — para depocuya görünmez. */
  moneyHidden: 'Para tarafı otomatik çözülür (iade / düşük tahsilat) — tutar bu yüzeyde görünmez.',
  /**
   * Cevap bekleyen kalem (10.3). Cümle **kilit vaat etmiyor**: kalem yine toplanabilir, "kalanı
   * gönder" hâlâ mümkün. "Bekliyor" desek depocu dokunulmaz sanır ve cevap gecikirse sipariş
   * kimsenin beklemediği bir yerde takılırdı.
   */
  awaitingAnswer: 'müşteriye soruldu — operasyon takip ediyor',
} as const;

/**
 * Motorun eksik tavsiyesini operatörün cümlesine çevirir.
 *
 * **Tavsiye TUTAR TAŞIMAZ** (`domain-core/stock/shortfall`): parasal ölçüt motora girdi olarak
 * verilir, dönen değerde yer almaz. Buradaki cümleler de tutar yazmaz — yazsalardı rol duvarını
 * sözlük katmanından delerlerdi. `high_value` bu yüzden "değerli kalem" diyor, rakam vermiyor.
 *
 * **Cümle SEBEPTEN türüyor, eylemden değil:** aynı tavsiye ("müşteriye sor") üç ayrı sebepten
 * gelebiliyor ve operatörün kararı sebebi bilerek değişir — kalemin tamamı yoksa müşteri sipariş
 * ettiği şeyi hiç almayacaktır, oysa yarısı eksikse konuşulacak bir şey vardır.
 */
export function shortfallAdvice(suggestion: ShortfallSuggestion): string {
  const REASON: Record<ShortfallSuggestion['reason'], string> = {
    complete: 'Bu kalemde eksik yok.',
    line_fully_missing: 'Bu kalemden hiç çıkmadı — müşteri sipariş ettiği ürünü hiç almayacak. Sormak gerekiyor.',
    large_share: 'Eksik, istenen adedin büyük bölümü — müşteriye sormak uygun görünüyor.',
    high_value: 'Eksik kalan değerli bir kalem — müşteriye sormak uygun görünüyor.',
    minor: 'Eksik küçük — "kalanı gönder" uygun görünüyor.',
  };
  return `Sistem önerisi: ${REASON[suggestion.reason]} Karar sizin.`;
}
