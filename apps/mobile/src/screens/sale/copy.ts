import messages from './messages.json';

/*
  YERİNDE SATIŞ SÖZLÜĞÜ — tek dilli, dil ekseni YOK (operasyon yüzeyi Türkçedir; kararın gerekçesi
  `screens/operations/copy.ts` künyesinde tek yerde durur, burada tekrar edilmez).

  TİP JSON'DAN TÜRER (`typeof messages`), elle interface yazılmaz. Depo/kurye emsalleriyle aynı
  düzen: bölüm kendi sözlüğünü taşır, kabuğa yığılmaz.
*/

export const saleCopy = messages;
