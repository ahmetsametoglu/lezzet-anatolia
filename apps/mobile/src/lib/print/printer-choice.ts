import { z } from 'zod';

import type { BoxPrinterContract, PrinterPurpose } from '@lezzet/types';

import { DEVICE_STORE_KEYS, deviceStore } from '../storage/device-store';

/*
  YAZICI SEÇİMİ — CİHAZIN BİLGİSİ (kullanıcı kararı 29.08).

  *"Sunucu: bu depoda hangi yazıcılar var. Cihaz: hangisini kullanıyor — listeden seçer, elle IP
  yazmaz."* Envanter sunucuda (`warehouse_printer`, 0054); seçim burada ve sunucuya HİÇ gitmiyor.

  ── NEDEN CİHAZDA ───────────────────────────────────────────────────────────
  Aynı depodaki iki telefon iki ayrı yazıcıya basabilir ve bu bir çelişki değil kurulumun kendisi:
  biri rampada (kargo etiketi), biri masada (kutu etiketi). Sunucuda tutulan tek bir "varsayılan
  yazıcı", ikinci telefonun kâğıdını yanlış odaya yollardı.

  ── TEK YAZICIYA DÜŞME BİR VARSAYIM DEĞİL, BİR ÇIKARIMDIR ───────────────────
  O amaç için depoda TEK yazıcı varsa seçim sorulmuyor: seçenek yoksa seçim de yoktur. İki ve
  üzeri varsa cihaz seçene kadar `null` dönüyor ve ekran soruyor — birini kendiliğinden seçmek,
  kâğıdın hangi odadan çıkacağına yazılımın karar vermesi olurdu.

  ── SEÇİM KİMLİĞE BAĞLI, ADRESE DEĞİL ───────────────────────────────────────
  Yazıcının IP'si değişebilir (DHCP); kimliği değişmez. Adres saklansaydı ilk kira yenilemesinde
  cihaz sessizce yanlış makineye ya da hiçbir yere basardı.
*/

/*
  Şema DAR TUTULMADI (`uuid()` değil `min(1)`) ve bu bilinçli: değeri bizim kodumuz, sunucudan
  gelen bir kimlikle yazıyor — biçim denetimi gerçek bir şeye karşı korumuyor. Buna karşılık
  başarısızlığı SESSİZ: bir biçim uyuşmazlığı TÜM seçimi silerdi ve depocu ertesi gün "ben bunu
  seçmiştim" derdi. Denetim yalnız "bu bir metin sözlüğü mü" sorusunu soruyor.
*/
const ChoiceSchema = z.record(z.string(), z.string().min(1));

/** Cihazın seçimi: `{ box: <id>, shipping: <id> }` — eksik anahtar "henüz seçilmedi". */
export type PrinterChoice = Record<string, string>;

export async function readPrinterChoice(): Promise<PrinterChoice> {
  try {
    const raw = await deviceStore.getItem(DEVICE_STORE_KEYS.printerChoice);
    if (!raw) return {};
    const parsed = ChoiceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    /*
      Okunamayan depo ya da bozuk JSON = SEÇİM YOK.

      `try` deponun kendisini de kapsıyor ve bu bilinçli: cihaz deposu düşebilir (izin, bozuk
      kayıt, taze kurulum) ve o düşüş BASIM ZİNCİRİNİ kırmamalı — kutu kapandı, etiketin çıkması
      bir tercih kaydına bağlı olmamalı. Sonuç sessiz değil: seçim yoksa tek-yazıcı kuralı işler,
      o da yoksa ekran sorar.
    */
    return {};
  }
}

export async function choosePrinter(purpose: PrinterPurpose, printerId: string): Promise<void> {
  const current = await readPrinterChoice();
  await deviceStore.setItem(DEVICE_STORE_KEYS.printerChoice, JSON.stringify({ ...current, [purpose]: printerId }));
}

/**
 * **Basımın hedefi** — envanter + cihazın seçimi → tek yazıcı (ya da `null`).
 *
 * Üç hâl ve üçü de ayrı: seçim varsa ve hâlâ listedeyse o · o amaç için TEK yazıcı varsa o
 * (seçenek yoksa seçim de yok) · başka her hâlde `null` ve ekran sorar. Seçim listede yoksa
 * (yazıcı kapatıldı) tek-yazıcı dalına düşer — bu bir sessiz yedek değil, aynı kuralın kendisi.
 */
export function resolvePrinter(
  printers: readonly BoxPrinterContract[],
  purpose: PrinterPurpose,
  choice: PrinterChoice,
): BoxPrinterContract | null {
  const uygun = printers.filter((p) => p.purpose === purpose);
  return uygun.find((p) => p.id === choice[purpose]) ?? (uygun.length === 1 ? uygun[0]! : null);
}
