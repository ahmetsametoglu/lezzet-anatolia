/**
 * **Üstbaşlığın künye satırı** — "Deniz Arslan · Strasbourg Merkez", "28 Ağustos · Kehl".
 *
 * v3 dört bölümün de başlığının altına bir künye koyuyor ve satır hep aynı biçimde kuruluyor:
 * elde olan parçalar ` · ` ile birleşir. Asıl kural birleştirme değil, **NE YAZILMAYACAĞI**:
 * ölçülemeyen parça (uç `null` döndü, gün ayrıştırılamadı, kapsam tek tesis değil) satırdan
 * DÜŞER — yerine boşluk, tire ya da uydurma bir değer konmaz (CLAUDE §1). Hiç parça kalmazsa
 * satır hiç doğmaz: `undefined` döner ve başlık komponentleri (`context` / `subtitle`) o hâlde
 * satırı çizmez.
 *
 * Tek yerde, çünkü kural beş ekranda birden geçerli ve tek satırlık olması onu güvenli yapmıyor:
 * her ekran kendi `filter`ını yazsaydı biri gün gelip `null`u atlar, boş dizeyi atlamazdı — ve
 * ekranda ortada duran bir " · " ile karşılaşılırdı. Boş dize de düşer: bir çevirinin ya da
 * biçimlendiricinin boş dönmesi, "değer yok" demenin öteki yoludur.
 */
/*
  İKİ İMZA, TEK GÖVDE — çağıranın elindeki gerçeğe göre.

  Üstbaşlık (`eyebrow`) ZORUNLU bir dize ister ve ilk parçası her zaman sabit bir metindir
  ("DEPO"); künye satırı (`context`/`subtitle`) ise hiç doğmayabilir. İki imza olmasaydı
  üstbaşlığı kuran her ekran, asla koşmayacak bir yedek dal yazmak zorunda kalırdı
  (`captionOf(...) ?? t.eyebrow`) — okuyan kişiye "demek ki boş dönebiliyor" diyen ölü bir kod.
*/
export function captionOf(head: string, ...rest: readonly (string | null | undefined)[]): string;
export function captionOf(...parts: readonly (string | null | undefined)[]): string | undefined;
export function captionOf(...parts: readonly (string | null | undefined)[]): string | undefined {
  const written = parts.filter((part): part is string => typeof part === 'string' && part.length > 0);
  return written.length === 0 ? undefined : written.join(' · ');
}
