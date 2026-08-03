import { fromCents } from '@lezzet/helper';

/**
 * Operasyon yüzeyinin sayı/tarih biçimleri — TEK kaynak.
 *
 * Beş ayrı dosyada `toFixed(2).replace('.', ',')` yazılıydı: aynı karar beş yerde tutulunca biri
 * "12,60 €" derken öbürü "12,60" diyordu ve fark ancak ekranda görülüyordu. Para tamsayı CENT'te
 * taşınır (STACK §8); biçimlendirme yalnız sunum anında yapılır.
 */

/**
 * "12,60" — sabit basamaklı ondalık, virgüllü, **binlik ayracısız**.
 *
 * Para yazımının çekirdeği: `money`, `amount` ve para GİRDİ kutusu (`money-input`) üçü de bunu
 * kullanır. Kutu ayrı yazıyordu ve fark görünmezdi — bir gün biri üç haneye geçse öteki ikide
 * kalırdı; aynı sayı kutuda başka, sütunda başka okunurdu.
 *
 * Ayracın olmaması bilinçli: kutuya yazılan metin geri okunabilir olmalı ("1.234,50" yazımını
 * ayrıştırmak, noktayı ondalık sanan bir hataya davettir). Sayaç ve ölçüler ayraç ister → `num`.
 */
export function decimal(value: number, digits = 2): string {
  return value.toFixed(digits).replace('.', ',');
}

/** "12,60 €" — cent girer, okunur tutar çıkar. `null` bilinmiyor demektir, sıfır değil. */
export function money(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `${decimal(fromCents(cents))} €`;
}

/** "12,60" — para birimi SİMGESİZ (sütun başlığı zaten "€" diyorsa simge iki kez yazılmasın). */
export function amount(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return decimal(fromCents(cents));
}

/**
 * "1.234" · `digits=1` ile "1.234,5" — düz sayının Türkçe yazımı (binlik nokta, ondalık virgül).
 *
 * Basamak SABİTLENİR (`minimum` = `maximum`): "%92" ile "%92,0" aynı sütunda alt alta gelirse
 * virgüller kayar ve göz sayıları karşılaştıramaz. Bu yüzden çağıran kaç hane istediğini söyler ve
 * o kadarı yazılır.
 *
 * Sayaçlar da buradan geçer: `count.toLocaleString('tr-TR')` altı ayrı dosyada yazılıydı ve o
 * çağrıların hiçbiri basamak vermiyordu — biri gün gelip verse ötekilerden ayrışırdı.
 */
export function num(value: number | null | undefined, digits = 0): string {
  if (value == null) return '—';
  return value.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * "%18" · `digits=1` ile "%15,3". Basamak PARAMETRİK, çünkü iki farklı iş var: raf ömrü yüzdesi bir
 * karar eşiğidir (tam sayı yeter), marj ise ölçüdür ve ondalığı bilgi taşır.
 */
export function percent(value: number | null | undefined, digits = 0): string {
  if (value == null) return '—';
  return `%${num(value, digits)}`;
}

/**
 * "512 MB" · "1,5 GB" — veri büyüklüğü. İkisi de **MB girer**: ölçüm kaynağı (`SystemHealthMetrics`)
 * her şeyi MB'de taşıyor, dönüşümü sunum anında yapmak ölçüyü tek birimde tutuyor.
 *
 * Birimi ÇAĞIRAN seçer, fonksiyon otomatik geçmez: "512 MB / 2,0 GB kullanımda" gibi cümlelerde iki
 * birim bilerek yan yana duruyor — küçük olanı MB'de bırakmak farkı görünür kılıyor.
 */
export function megabytes(mb: number | null | undefined): string {
  if (mb == null) return '—';
  return `${num(Math.round(mb))} MB`;
}

export function gigabytes(mb: number | null | undefined): string {
  if (mb == null) return '—';
  return `${num(mb / 1024, 1)} GB`;
}

/**
 * "22 Tem 2026" — kısa ve okunur. Tarih **UTC** okunur: parti son tarihi bir gündür, yerel saat
 * dilimine çevrilirse akşam saatlerinde bir gün geriye kayar ve "bugün son gün" yazan satır
 * "dün bitti"ye dönüşürdü.
 */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * "22 Tem" — YIL YOK. Yakın gelecek/geçmiş kontrollerinin biçimi (teslim günü çipi, gün seçici):
 * orada yıl gürültüdür, çünkü liste zaten birkaç günlük bir pencereyi gösteriyor.
 *
 * `shortDate` ile aynı UTC kuralı — gün bir tarihtir, yerel saate çevrilirse akşam bir gün kayar.
 */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "22 Tem 14:30" — hareket kayıtlarında saat de gerekir (aynı gün iki kayıt ayırt edilsin). */
export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * "2 dk önce" · "3 sa önce" · "2 gün önce" — bir damganın YAŞI.
 *
 * Sistem ekranında mutlak saat yetmiyor: "09:42" okunup geçilir, "23 dk önce" bir arıza işaretidir
 * (`OBSERVABILITY §2`, ölçüm iki dakikada bir gelmeli). Ölçünün kendisi `dakika` alır çünkü çağıran
 * onu sunucuda hesaplayıp istemcide ilerletiyor — iki tarafta ayrı `Date.now()` okunsaydı ilk boyama
 * sunucununkinden farklı çıkar ve hidrasyon uyuşmazlığı doğardı.
 */
export function agoLabel(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${Math.floor(minutes)} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

/**
 * Aynı yaş, DAR sütun için: "12 dk" · "2 saat" · "dün" · "3 gün".
 *
 * "Önce" eki bir liste sütununda bilgi taşımıyor — o sütundaki her değer zaten geçmiş. Buna karşılık
 * genişlik yiyor: talep kuyruğunda rozetlerin yanına sığmayıp satırı ikiye bölüyordu ve satır
 * yüksekliği çizimin iki katına çıkıyordu. Tarama yüzeyinde satır sayısı bilginin kendisidir.
 *
 * "Dün" ÖZEL: 24–48 saat arası "1 gün" demek teknik olarak doğru ama insan öyle konuşmuyor, ve
 * çizim de "dün" yazıyor.
 */
export function agoShort(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  if (minutes < 1) return 'şimdi';
  if (minutes < 60) return `${Math.floor(minutes)} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'dün' : `${days} gün`;
}

/**
 * Son tarihe kalan süreyi operatörün diliyle söyler. Mutlak tarih tek başına yetmiyor: "3 gün kaldı"
 * ile "12 Ağustos" arasındaki fark, aciliyetin okunup okunmamasıdır.
 */
export function daysLabel(days: number): string {
  if (days === 0) return 'bugün son gün';
  if (days === 1) return 'yarın son gün';
  if (days > 0) return `${days} gün kaldı`;
  if (days === -1) return 'dün geçti';
  return `${Math.abs(days)} gün geçti`;
}
