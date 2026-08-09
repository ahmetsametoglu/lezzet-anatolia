import { useEffect, useState } from 'react';

import { resolvePostalCode, type PlaceResolution } from '@/lib/api/places';

/*
  YER ÇÖZÜMÜ — posta kodundan "neredesiniz, size nasıl ulaşırız" sorusunun TEK kapısı
  (`GET /api/v1/places/by-postal-code`).

  NEDEN ORTAK HOOK: aynı soru artık İKİ yerde soruluyor — onboarding'in posta kodu adımı ve
  vitrinin teslimat bölgesi çekmecesi. İkisi de "kod beş haneye ulaşınca sor, kod değişince eski
  cevabı ANINDA düşür, yarışta son istek kazanır" davranışını istiyor; bu davranışın iki kopyası
  bir gün ayrışırdı (CLAUDE §1 — hiçbir türde duplication).

  ESKİ CEVAP ANINDA DÜŞER: yarım kodun yanında bir önceki kodun şehri durursa ekran yanlış yeri
  söyler. `null` = "henüz bilinmiyor"; sıfıra ya da boş dizeye düşürülmez.

  HATA SESSİZ DEĞİL, YOK SAYILIYOR: istek düşerse cevap YAZILMAZ ve hâl "bilinmiyor" olarak kalır
  — kullanıcıya söylenecek bir şey yok, çünkü soru zorunlu değil (kod yine kaydedilebilir) ve
  cevabın gelmemesi bir kapı değil. Mobilde log altyapısı yok (01-teknoloji §9); geldiği gün
  bağlanacak yer burası.
*/

/** Yer sorusunun sorulduğu hane sayısı — Fransız/Alman kodları beş hanedir, eksiği sorulmaz. */
export const POSTAL_CODE_LENGTH = 5;

/** Yalnız rakam, en çok beş hane (v3:644 maskesi) — girdi maskesi de tek yerde durur. */
export function maskPostalCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, POSTAL_CODE_LENGTH);
}

/** `null` = kod eksik ya da cevap henüz yok. Dört hâlin anlamı sözleşmede (`place-api.schema.ts`). */
export function usePlaceResolution(code: string): PlaceResolution | null {
  const [place, setPlace] = useState<PlaceResolution | null>(null);

  useEffect(() => {
    setPlace(null);
    if (code.length < POSTAL_CODE_LENGTH) return;
    let current = true;
    void resolvePostalCode(code).then((result) => {
      if (current && result.error === null) setPlace(result.data);
    });
    return () => {
      current = false;
    };
  }, [code]);

  return place;
}
