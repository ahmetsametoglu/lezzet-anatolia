import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { AuthErrorKey } from '@lezzet/types';

import messages from './error-messages.json';

/*
  AUTH HATA SÖZLÜĞÜ — sözleşmenin hata ANAHTARINI (`AuthErrorKey`) müşteri cümlesine çevirir.

  GİRİŞ EKRANINDAN BURAYA TAŞINDI (10.08): OTP akışının ikinci çağıranı doğdu — bölge talebi
  çekmecesi ("Buraya da gelin") artık e-posta + kod ile doğrulanmış bir hesap açıyor. Aynı on
  cümleyi ikinci bir sözlüğe kopyalamak, iki yüzeyin bir gün farklı şey söylemesi demekti
  (CLAUDE §1). Cümleler auth AİLESİNİN yanında durur; ekranlar yalnız çağırır.

  Eksik anahtar DERLEMEDE yakalanır: `AuthErrorKey` ile indekslenen sözlükte bir anahtar yoksa
  `tsc` kırar — sözleşmeye eklenen yeni hâl sessizce boş metinle çizilmez.
*/

type ErrorCopy = LocalizedCopy<typeof messages>;

export function authErrorText(locale: Locale, key: AuthErrorKey): string {
  const copy: ErrorCopy = messages[locale];
  return copy[key];
}
