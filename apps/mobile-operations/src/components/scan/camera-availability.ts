import { requireOptionalNativeModule } from 'expo-modules-core';

/*
  KAMERANIN NATIVE TARAFI BU DERLEMEDE VAR MI — tek soru, tek dosya.

  Ayrı dosya olmasının sebebi JEST DİKİŞİDİR (ölçüldü 22.08): yoklama `scan-sheet` içindeyken
  jest'te `expo-modules-core`u mock'lamak gerekiyordu ve o mock, jest-expo preset'inin öteki expo
  paketleri için kurduğu native sahtelerini deliyordu — 7 suite "Cannot find native module
  'ExpoLocalization/ExpoLinking'" ile düştü. Preset'in modülüne dokunmadan yalnız BU dosya
  sahtelenir (`jest.setup.ts`), gerisi olduğu gibi kalır.

  `requireOptionalNativeModule` fırlatmaz: native yoksa `null` döner. Çıplak `require('expo-camera')`
  bunun yerini TUTAMAZ — modül fabrikası fırlatır ve Metro guarded-require onu yakalansa da
  redbox'a çevirir (scan-sheet künyesi).
*/
export function hasCameraNativeModule(): boolean {
  return requireOptionalNativeModule('ExpoCamera') !== null;
}
