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

export interface PlaceLookup {
  /** `null` = kod eksik, cevap henüz yok ya da istek düştü. Dört hâlin anlamı sözleşmede. */
  place: PlaceResolution | null;
  /**
   * **İstek UÇUŞTA mı** — ekranın iskelet göstereceği tek hâl (kullanıcı isteği 13.08).
   *
   * `place === null` üç ayrı şey demek olabiliyordu: *"kod daha tamamlanmadı"*, *"soruldu, cevap
   * bekleniyor"* ve *"soruldu, istek düştü"*. Ekran ikincisinde iskelet göstermeli, ötekilerde
   * göstermemeli — üçüncüsünde gösterirse **iskelet sonsuza kadar döner** ve müşteri hiç gelmeyecek
   * bir cevabı bekler (ölçüldü 13.08: ilk kurgu `code.length` + `place === null` ile türetiliyordu
   * ve tam olarak bu tuzağa düşüyordu; ağ kesintisinde ekran ebediyen "yükleniyor" derdi).
   *
   * Bu yüzden bayrak TÜRETİLMİYOR, efektin kendisi tarafından yazılıyor: istek biterken `false`a
   * döner — cevap geldi ya da GELMEDİ, ikisi de "artık beklemiyoruz" demek.
   */
  pending: boolean;
}

/**
 * Yer çözümünün TAM hâli — cevap + bekleyiş.
 *
 * `usePlaceResolution` bunun üstünde duran ince bir sarmalayıcıdır: çağıranların çoğu yalnız cevabı
 * istiyor ve sekiz çağrı yerini `{ place }` yazmaya zorlamak, hiçbir şey kazandırmadan hepsini
 * değiştirmek olurdu. Efekt ve kural TEK yerde — burada.
 */
export function usePlaceLookup(code: string): PlaceLookup {
  const [place, setPlace] = useState<PlaceResolution | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPlace(null);
    if (code.length < POSTAL_CODE_LENGTH) {
      setPending(false);
      return;
    }
    setPending(true);
    let current = true;
    void resolvePostalCode(code)
      .then((result) => {
        if (current && result.error === null) setPlace(result.data);
      })
      // `finally` ÇÜNKÜ ret de bir bitiştir: düşen istekte bekleyiş sürseydi iskelet hiç sönmezdi.
      .finally(() => {
        if (current) setPending(false);
      });
    return () => {
      current = false;
    };
  }, [code]);

  return { place, pending };
}

/** `null` = kod eksik ya da cevap henüz yok. Dört hâlin anlamı sözleşmede (`place-api.schema.ts`). */
export function usePlaceResolution(code: string): PlaceResolution | null {
  const { place } = usePlaceLookup(code);

  return place;
}
