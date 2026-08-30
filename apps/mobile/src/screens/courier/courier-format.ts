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
 * TÜRKÇE BÜYÜK HARF — `toUpperCase` tek başına YANLIŞTIR: JS'in dil-bağımsız dönüşümü `i` → `I`
 * verir, Türkçede ise `İ` olmalı ("Nisan" → "NISAN" değil "NİSAN"). Üstbaşlık CSS/RN tarafında
 * ayrıca `textTransform:'uppercase'` alıyor; buradan zaten büyük çıkan harfler orada değişmez,
 * yani iki katman çelişmiyor — bu fonksiyon yalnız noktalı/noktasız i ayrımını KURTARIYOR.
 */
export function turkishUpper(value: string): string {
  return value.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

/**
 * `"2026-08-08"` → `"8 AĞUSTOS"` (v2:38'in üstbaşlığı).
 *
 * `Intl` KULLANILMADI: Hermes'in ICU kapsamı platforma göre değişiyor ve ay adının Android'de
 * İngilizce dönmesi sessiz bir arıza olurdu. Onikilik sözlük metindir, sözlükte durur.
 * Biçim tanınmazsa `null` döner — uydurma bir gün adı yazmaktansa üstbaşlık kuyruksuz kalır
 * (CLAUDE §1: ölçülemeyen değer sıfır/varsayılan değildir).
 */
export function dayLabel(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const month = t.months[Number(match[2]) - 1];
  if (month === undefined) return null;
  return `${Number(match[3])} ${month}`;
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

