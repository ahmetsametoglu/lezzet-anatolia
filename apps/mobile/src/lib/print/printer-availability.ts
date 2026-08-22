import { requireOptionalNativeModule } from 'expo-modules-core';

/*
  YAZICININ NATIVE TARAFI BU DERLEMEDE VAR MI — tek soru, tek dosya (`camera-availability` emsali;
  gerekçesi orada ölçülü: çıplak `require` native modül yokken Metro guarded-require'da bile tam
  ekran hataya dönüyor, `requireOptionalNativeModule` fırlatmaz — yoksa `null`).

  Jest'te ayrıca sahtelenmez (kameradan farkı): testlerde yazıcı akışı KAPALI kalmalı — iğne
  deneyi fiziksel bir ölçümdür, sahte yazıcıyla "geçti" demek deneyin kendisini boşa çıkarır.
*/
export function hasPrinterNativeModule(): boolean {
  return requireOptionalNativeModule('ExpoBrotherPrinterSdk') !== null;
}
