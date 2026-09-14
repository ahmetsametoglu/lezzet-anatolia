import messages from './messages.json';

/*
  PARA BÖLÜMÜNÜN SÖZLÜĞÜ — tek dilli, dil ekseni YOK.

  Zarfın (`{tr, fr, de}`) neden bilerek olmadığı `screens/operations/copy.ts` künyesinde tek yerde
  yazılı. Bölüm iki ekrandan ibaret ama sözlüğü yine KENDİ klasöründe: kabuk sözlüğü bölüm adlarını
  tutar, ekranların dizelerini değil (kurye/depo/yönetim emsali).

  YUVA DOLDURMA (`fillCopy`) KABUKTAN GELİR, YENİDEN YAZILMAZ (CLAUDE §1).
*/

export const moneyCopy = messages;
