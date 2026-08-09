import messages from './messages.json';

/*
  YÖNETİM BÖLÜMÜNÜN SÖZLÜĞÜ — tek dilli, dil ekseni YOK.

  Zarfın (`{tr, fr, de}`) neden bilerek olmadığı `screens/operations/copy.ts` künyesinde tek yerde
  yazılı; burada tekrar edilmiyor. Bu dosya o kararın yönetim ekranlarındaki uygulamasıdır ve KENDİ
  sözlüğünü taşır (kurye/depo emsali): kabuk sözlüğü yalnız bölüm adlarını tutar.

  YUVA DOLDURMA (`fillCopy`) KABUKTAN GELİR, YENİDEN YAZILMAZ (CLAUDE §1).

  TİP JSON'DAN TÜRER (`typeof messages`), elle interface yazılmaz.
*/

export const managementCopy = messages;
