import type { BoxPrinterContract } from '@lezzet/types';

import { findNetworkPrinters, type PrinterChannel } from './brother';

/*
  YAZICI NEREDE — KİMLİKTEN, ADRESTEN DEĞİL (kullanıcı sorusu 05.09).

  ── ARIZA ÖLÇÜLDÜ, VARSAYILMADI ─────────────────────────────────────────────
  Envanter yazıcıyı IP ile tutuyordu ve ekran ağda bulunanı ADRESTEN eşleştiriyordu. 05.09'da
  cihazda görüldü: envanterde `192.168.1.91` yazılıydı, gerçek QL-820NWB `192.168.1.169`daydı ve
  ekran "ağda görünmüyor" diyordu. Kimse yalan söylemiyordu — envanterin adresi eskimişti.

  O gün adresi seed uydurmuştu; ama DHCP kirası yenilendiğinde doğan tablo BİREBİR AYNI, ve daha
  sinsi: basım eski adrese gider, o adres artık başka bir cihazın olabilir.

  ── ÇARE SDK'DA ZATEN VARDI ─────────────────────────────────────────────────
  `BPChannel` WiFi yazıcılar için `serialNumber` taşıyor ve bizim sarmalayıcımız onu atıyordu.
  Seri numarası ağdan bağımsız, cihazın etiketinde basılı ve hiç değişmiyor. Eşleşme oraya taşındı;
  adres artık bir ÖNBELLEK — "en son burada görüldü".

  ── ADRESE DÜŞMEK BİR YEDEK DEĞİL, AYNI KURALIN İKİNCİ DALI ─────────────────
  Serisi olmayan satırlar var ve olmaya devam edecek: Depolar ekranının formu adres yazdırıyor,
  cihaz taramıyor. O satırlar eski davranışta kalıyor — adresten eşleşiyor ve IP değişirse
  kayboluyor. Bunu gizlemiyoruz; kimliği olmayan bir şeyi kimlikten bulmanın yolu yok.
*/

/**
 * **Envanter satırının ağdaki karşılığı** — yoksa `null`.
 *
 * Seri numarası varsa YALNIZ ondan eşleşir: seri bilinen bir satırı adresten eşleştirmek, tam da
 * güvenilmez olan alana geri dönmek olurdu — ve daha kötüsü, o adreste artık başka bir yazıcı
 * duruyorsa onu bu satırın kendisi sanardı.
 */
export function locatePrinter(
  printer: Pick<BoxPrinterContract, 'address' | 'serialNumber'>,
  found: readonly PrinterChannel[],
): PrinterChannel | null {
  if (printer.serialNumber !== null) {
    return found.find((channel) => channel.serialNumber === printer.serialNumber) ?? null;
  }
  return found.find((channel) => channel.address === printer.address) ?? null;
}

/** Basımın gideceği hedef — ağda bulunduysa GÜNCEL adres, bulunamadıysa son bilinen. */
export function printTargetOf(
  printer: Pick<BoxPrinterContract, 'address' | 'model' | 'labelSize' | 'serialNumber'>,
  found: readonly PrinterChannel[],
): { address: string; model: string; labelSize: string } {
  return {
    address: locatePrinter(printer, found)?.address ?? printer.address,
    model: printer.model,
    labelSize: printer.labelSize,
  };
}

/**
 * **Basar; adres eskimişse kendini onarır** — SDK'ya açılan kapıların ÜSTÜNDEKİ tek disiplin.
 *
 * ── NEDEN ÖNCE TARAMIYOR ────────────────────────────────────────────────────
 * Her basımdan önce ağ taramak 4 saniye eder ve kutu kapanışı o gecikmeyi kaldırmaz — üstelik
 * adres günlerce doğru kalıyor, tarama bedeli her seferinde ödenip neredeyse hiç işe yaramazdı.
 * Onarım ARIZA ANINA bağlı: eski adres tutmadıysa, tam olarak o an tarama anlamlı hâle geliyor.
 *
 * ── BİR KEZ ─────────────────────────────────────────────────────────────────
 * İkinci deneme başarısızsa hata İLK hatanın kendisi olarak fırlıyor: depocuya "yeni adreste de
 * olmadı" demek, aradığı cevabı ("neden basılmadı") ikinci bir katmanın arkasına saklardı.
 *
 * ── ONARILAN ADRES ÇAĞIRANA SÖYLENİYOR ──────────────────────────────────────
 * Dönüşteki `healedAddress` envantere yazılsın diye var. Yazmak bu kapının işi değil — burası
 * basım hattı, sunucuya yazan taraf ekran (`registerPrinter` seriden tazeliyor). Kapı yalnız
 * ölçtüğünü söylüyor.
 */
export async function printHealing(
  printer: Pick<BoxPrinterContract, 'address' | 'model' | 'labelSize' | 'serialNumber'>,
  send: (target: { address: string; model: string; labelSize: string }) => Promise<void>,
): Promise<{ healedAddress: string | null }> {
  try {
    await send({ address: printer.address, model: printer.model, labelSize: printer.labelSize });
    return { healedAddress: null };
  } catch (ilkHata) {
    // Kimliği olmayan satır onarılamaz — neyi arayacağımızı bilmiyoruz.
    if (printer.serialNumber === null) throw ilkHata;

    let taze: PrinterChannel | null = null;
    try {
      taze = locatePrinter(printer, await findNetworkPrinters());
    } catch {
      // Tarama da düştü: onarım denenemedi, arıza İLK hatadır. Sessiz değil — o hata fırlıyor.
      throw ilkHata;
    }
    if (taze === null || taze.address === printer.address) throw ilkHata;

    await send({ address: taze.address, model: printer.model, labelSize: printer.labelSize });
    return { healedAddress: taze.address };
  }
}
