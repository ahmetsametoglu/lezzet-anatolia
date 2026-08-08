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
