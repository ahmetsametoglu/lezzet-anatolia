/**
 * **Hap girdi** görünümü — etiket kabuğu olmayan, satır içinde duran kısa girdi (denetim bulgusu
 * K2, 02.08). Bugünkü tüketicileri: posta kodu şeridi, posta kodu paneli, "haber ver" e-postası.
 *
 * **`controlClass`ın küçük hâli DEĞİL, kardeşidir.** K34 form alanı etiket + hata satırı taşıyan,
 * `48px` sabit yükseklikli, `rounded-soft` bir kutudur; hap girdi ne etiket kabuğu ne sabit
 * yükseklik ister, köşesi `pill`dir ve yanındaki `sm` düğmeyle aynı satırda durur. Kitin bekleyen
 * `size` ekseni (design/BACKLOG §2) geldiğinde bu dosya onunla birleşmez — iki ayrı çizimdir.
 *
 * **Yalnız DEĞİŞMEZ burada.** Punto, ağırlık, dikey ped ve genişlik çağrı yerinde kalır, çünkü üç
 * çağrı yerinde üç ayrı bileşim var ve hiçbiri tekrarlamıyor: şerit dar ve sıkışık, panel geniş ve
 * iri puntolu, e-posta alanı panel pedinde ama küçük puntolu (uzun metin kalın yazılmaz). Bunlara
 * `sm`/`md` gibi bir kademe adı vermek, olmayan bir örüntüyü varmış gibi göstermek olurdu.
 * Dördüncü tüketici gelip bir bileşim tekrarlarsa o zaman adlandırılır.
 *
 * Varsayılan ped/punto da KOYULMAZ: Tailwind çakışan sınıfları kaynak sırasına göre çözer, sınıf
 * dizgisindeki sıraya göre değil — `py-2.5` varsayılanının üstüne `py-2` yazmak öngörülemez sonuç
 * verir (birleştirme yardımcısı yok).
 *
 * Kenar tonu `sand-300`: yüzeydeki hap KONTROLLER (`Button.secondary`, `load-more`, `sort-select`,
 * dil hapı) `sand-400` kullanıyor. Ayrım bilinçli mi sapma mı belli değil; tasarım söylemeden
 * birine çekmek improvise olurdu — üç girdinin bugünkü tonu korundu (`design/BACKLOG §2`).
 */
export function pillInputClass(extra?: string): string {
  return [
    'rounded-pill border-[1.5px] border-sand-300 bg-card px-4 font-sans text-ink outline-none transition-colors placeholder:text-sand-600 focus:border-olive',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}
