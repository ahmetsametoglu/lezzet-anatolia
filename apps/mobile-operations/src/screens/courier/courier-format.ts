import { dateLabelOf, turkishUpper } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from './copy';

/*
  KURYE EKRANLARININ BİÇİMLEME KURALLARI — saf, React'siz, testli.

  Ekranlardan AYRI durur çünkü hiçbiri bir görünüm kararı değil: gün adının Türkçe yazımı, büyük
  harfe çevrim ve kısa ad üç ayrı kuraldır ve üçü de bir bileşen değişse bile aynı kalır.

  İÇERİK ÖZETİNİ AYRIŞTIRAN KURAL (`parseContentSummary`) 21.10e'de SÖKÜLDÜ: durak sözleşmesi artık
  kalem satırlarını kimlikleriyle taşıyor (`CourierStop.items`), yani ekranın listesi bir metinden
  tahmin edilmiyor — kaynağından okunuyor. Ayrıştırma o boşluğun pansumanıydı; boşluk kapandı.

  PARA KURALLARI 21.12'de BU DOSYADAN ÇIKTI (`lib/operations/money.ts`): cent yazımı, girdi çevrimi
  ve işaretli fark kuryeye değil YÜZEYE ait — yönetim ve para ekranları da aynısını soruyor.
  Buradan yeniden ihraç ediliyorlar, yani kurye ekranlarının import satırı hiç değişmedi; tanım ise
  tek yerde durur (CLAUDE §1).
*/

export { centsToAmountText, money, parseAmountToCents, signedMoney } from '@/lib/operations/money';

const t = courierCopy;

/**
 * TÜRKÇE BÜYÜK HARF — kural `lib/operations/stamp.ts`te yaşıyor (05.09'da oraya taşındı: ikinci
 * tüketici bildirim akışının gün ayracı oldu ve bir DİL kuralının evi tek bir bölümün biçimleyicisi
 * olamaz). Buradan yeniden ihraç ediliyor ki kuryenin çağıranları ve testi tek adresten okusun.
 *
 * Üstbaşlık RN tarafında ayrıca `textTransform:'uppercase'` alıyor; buradan zaten büyük çıkan
 * harfler orada değişmez — iki katman çelişmiyor, bu fonksiyon yalnız noktalı/noktasız i ayrımını
 * kurtarıyor.
 */
export { turkishUpper };

/**
 * `"2026-08-08"` → `"8 AĞUSTOS"` (v2:38'in üstbaşlığı).
 *
 * `Intl` KULLANILMADI: Hermes'in ICU kapsamı platforma göre değişiyor ve ay adının Android'de
 * İngilizce dönmesi sessiz bir arıza olurdu. Onikilik sözlük metindir ve **tek yerde durur**
 * (`lib/operations/stamp.ts`) — para ekranı 30.08'de aynı listeyi düz yazımıyla istedi; ikinci bir
 * kopya, bir gün iki ekranın aynı günü iki farklı ay adıyla yazması demekti (CLAUDE §1).
 * Biçim tanınmazsa `null` döner — uydurma bir gün adı yazmaktansa üstbaşlık kuyruksuz kalır.
 */
export function dayLabel(isoDate: string): string | null {
  const label = dateLabelOf(isoDate);
  return label === null ? null : turkishUpper(label);
}

/**
 * SEFERİN KÜNYESİ — `"Kuzey rotası · SF-26-ABC123"` (18.08). Gün ekranının şeridi ve kapanış
 * ekranının başlık altı AYNI cümleyi yazar; kural bu yüzden burada, iki ekranda değil.
 *
 * Rota adı okunamadıysa (bölge kaydı silinmiş ya da isimsiz) yalnız sefer kodu yazılır — uydurma
 * ya da boş bir rota adı, kuryenin hangi rotada olduğunu YANLIŞ söylerdi (CLAUDE §1).
 */
export function runLabel(run: { zoneName: string | null; referenceNo: string }): string {
  return run.zoneName === null || run.zoneName.length === 0
    ? run.referenceNo
    : fillCopy(t.day.runStrip, { route: run.zoneName, ref: run.referenceNo });
}

