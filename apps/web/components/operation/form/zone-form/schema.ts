import type { Country } from '@lezzet/types';

/**
 * **BÖLGE GENİŞLETME FORMU — saf şekil ve saf hesap** (22.36).
 *
 * `intake-form` · `purchase-order-form` · `featured-form` kardeşlerinin aynı deseni: RHF YOK,
 * kontrollü değer + saf yardımcılar. Sebebi kuyruğun kendi mimarisi — `defineBody` taslağı kendi
 * tutuyor (`draft`/`onDraft`) ve form kütüphanesi ikinci bir durum sahibi olurdu; iki sahip, bir
 * gün ayrışan iki gerçek demektir.
 */

/** Bölgeye eklenmesi düşünülen tek kod — dilekçenin taşıdığı kanıtlarla birlikte. */
export interface ZoneCandidateCode {
  country: Country;
  postalCode: string;
  /** Kodun yerleşim adları — HAM (`OB-04`); kırpma çizim anında. */
  places: readonly string[];
  /** Anonim "buraya geliyor musunuz" sorusu (`postal_code_demand`). */
  requestCount: number;
  /** Kimlikli ve izinli bekleyen kişi (`zone_notice`) — **bildirim bunlara gider.** */
  waitingCount: number;
  /** Kodu bugün BAŞKA bir bölge tutuyorsa onun adı; `null` ise boşta. */
  heldBy: string | null;
}

/** Formun iki kararı: kodlar HANGİ rotaya, ve hangileri. */
export interface ZoneFormValues {
  /**
   * **HEDEF ROTA — dilekçeninki değil, operatörünki** (kullanıcı tespiti 15.08).
   *
   * Asistan `delivery_map` ile en yakın güzergâhı buluyor ve onu öneriyor; ama hangi aracın o kodu
   * taşıyacağı operatörün bilgisidir (kapasite, sürücü, gün). Rota kendi deposunu belirlediği için
   * "farklı depoya ver" kararı da buradan veriliyor — ayrı bir depo seçicisi rotasız bir atama
   * doğururdu ve öyle bir kayıt yok.
   */
  zoneId: string;
  /** Seçili kodlar — `postalCode` değil TAM anahtar, çünkü `67000` iki ülkede geçerli. */
  selectedKeys: string[];
}

/** `(ülke, kod)` ikilisinin dize anahtarı — harita ve liste aynı anahtarı kullanır. */
export function zoneCodeKey(code: { country: Country; postalCode: string }): string {
  return `${code.country}:${code.postalCode}`;
}

/**
 * Kararın canlı özeti.
 *
 * **`waiting` SEÇİMDEN hesaplanıyor, dilekçeden değil** — ve bu, kullanıcının 09.08'de kuyruğun tek
 * kapılı hâline itiraz ettiği noktanın ta kendisi: *"hepsine birden gidiyor, ben belki bir bölgeyi
 * istiyorum."* Operatör bir kodu listeden çıkarınca o koddaki bekleyenler de sayıdan düşmeli, yani
 * kaç kişiye mesaj gideceği ONAYLAMADAN ÖNCE görünmeli.
 *
 * **`blocked` başka bölgenin tuttuğu kodları sayar.** Bunlar seçilebilir DEĞİL (aşağıdaki gövde
 * tıklatmıyor) ama sayısı yazılıyor: asistan böyle bir kod önerdiyse operatörün bunu bilmesi
 * gerekir — sessizce yok saymak, önerinin bir parçasının nereye gittiğini gizlerdi.
 */
export function zoneSummary(
  values: ZoneFormValues,
  candidates: readonly ZoneCandidateCode[],
): { selected: number; waiting: number; requests: number; blocked: number } {
  const chosen = new Set(values.selectedKeys);
  const picked = candidates.filter((c) => chosen.has(zoneCodeKey(c)));
  return {
    selected: picked.length,
    waiting: picked.reduce((sum, c) => sum + c.waitingCount, 0),
    requests: picked.reduce((sum, c) => sum + c.requestCount, 0),
    blocked: candidates.filter((c) => c.heldBy !== null).length,
  };
}

/**
 * Kaydetmeyi engelleyen sebep — yoksa `undefined`.
 *
 * Tek engel BOŞ seçim: hiçbir kod seçilmemişse uygulanacak bir şey yok ve "onayla" düğmesi
 * hiçbir şey yapmayan bir söz verirdi. **Az kod seçmek engel DEĞİL:** dilekçenin üç kodundan
 * yalnız birini almak meşru bir karardır ve zaten bu formun varlık sebebi.
 */
export function zoneBlock(values: ZoneFormValues): string | null {
  if (!values.zoneId) return 'Kodların gireceği rotayı seçin.';
  return values.selectedKeys.length === 0 ? 'En az bir posta kodu seçin — seçimsiz onay bölgeye hiçbir şey eklemez.' : null;
}
