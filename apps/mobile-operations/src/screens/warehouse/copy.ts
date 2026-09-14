import messages from './messages.json';

/*
  DEPO BÖLÜMÜNÜN SÖZLÜĞÜ — tek dilli, dil ekseni YOK.

  Zarfın (`{tr, fr, de}`) neden bilerek olmadığı `screens/operations/copy.ts` künyesinde tek yerde
  yazılı; burada tekrar edilmiyor. Bu dosya o kararın depo ekranlarındaki uygulamasıdır ve KENDİ
  sözlüğünü taşır (kurye emsali): kabuk sözlüğü bölüm adlarını tutar, altı depo ekranının yüzlerce
  dizesini oraya yığmak kabuğu açan herkese onları da yükletirdi.

  YUVA DOLDURMA (`fillCopy`) KABUKTAN GELİR, YENİDEN YAZILMAZ (CLAUDE §1).

  TİP JSON'DAN TÜRER (`typeof messages`), elle interface yazılmaz.
*/

export const warehouseCopy = messages;

type QtySheetBase = typeof messages.qtySheet;

/**
 * ADET ÇEKMECESİNİN SÖZLERİ — bir taban, ekran başına birkaç cümle.
 *
 * Çekmece uygulamanın tek adet deseninin (kullanıcı kararı 02.09) hızlı ayarı ve artık altı
 * ekrandan açılıyor. Yirmi cümlelik bloğu altı kez yazmak, "sıfırla"yı bir gün beş yerde
 * değiştirmek demekti (CLAUDE §1). Ekran yalnız KENDİ sorusunu söyler: başlık, künye satırı,
 * koli bölümünün adı ve tuş takımının başlığı. Mal kabul kendi tabanını verir (`t.intake.qtySheet`
 * — orada birim "paket"tir ve soru "kaç geldi"dir).
 */
export function qtySheetCopy(
  override: Partial<Omit<QtySheetBase, 'keypad' | 'extra'>> & { keypadTitle?: string },
  base: QtySheetBase = messages.qtySheet,
): QtySheetBase {
  const { keypadTitle, ...flat } = override;
  return { ...base, ...flat, keypad: { ...base.keypad, title: keypadTitle ?? base.keypad.title } };
}
