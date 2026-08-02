/**
 * Operasyon etkileşim öğelerinin **ORTAK YÜKSEKLİĞİ** — tek kaynak.
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────────
 * Yükseklik beş komponentte ayrı ayrı, dikey DOLGUDAN doğuyordu: buton `py-2.5`, arama kutusu
 * `py-2`, seçici tetikleyicisi `py-[7px]`, depo çipi iki satırlık bir yığın, kullanıcı künyesi 30px
 * bir kare. Hiçbiri yanlış değildi ama hiçbiri ötekini bilmiyordu — ve yan yana geldiklerinde
 * (başlık barı) beş farklı yükseklik çıkıyordu: **46 · 40 · 36 · 33 · 30 px** (kullanıcı bildirimi,
 * 02.08). Bir barın içinde beş farklı yükseklik, hizalanmamış bir satır demektir.
 *
 * ── NEDEN DOLGU DEĞİL YÜKSEKLİK ─────────────────────────────────────────────
 * Dolgu, yüksekliği İÇERİĞE bağlar: aynı `py` değeri tek satırlık bir düğmede 36px, iki satırlık bir
 * çipte 46px verir. İçerik değişince ölçü sessizce kayar. Açık yükseklik bu bağı keser — içerik ne
 * olursa olsun öğe aynı yeri kaplar, ve sığmıyorsa bu görünür bir sorun olur (sessiz bir kayma değil).
 * Yatay dolgu her komponentin kendi kararı olarak kalır: genişlik hizalanmak zorunda değil.
 *
 * ── İKİ KADEME, ÜÇÜNCÜSÜ YOK ────────────────────────────────────────────────
 * `md` masaüstü barın ve form alanlarının ölçüsü; `sm` dar ekranın ve süzgeç şeridinin. Üçüncü bir
 * kademe eklemek, "hangisini kullanacağım" sorusunu her seferinde yeniden sordurur.
 *
 * `StepButton` (26px) bu ailede DEĞİL ve olmamalı: o bir sayaç oku, tablo hücresinin içinde yaşıyor
 * ve satır yüksekliğine uyuyor — bar öğeleriyle aynı ölçüye çıkarmak tabloyu şişirirdi.
 */
export const CONTROL_H = {
  /** 36px — başlık barı, form alanı, birincil düğme. */
  md: 'h-9',
  /** 32px — dar ekran (compact bar), süzgeç çipi, satır içi ikincil düğme. */
  sm: 'h-8',
} as const;

export type ControlSize = keyof typeof CONTROL_H;
