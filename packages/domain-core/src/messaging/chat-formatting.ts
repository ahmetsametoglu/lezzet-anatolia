/**
 * **SOHBET BİÇİMLENDİRMESİ — KANAL KARARI BURADA, PROMPT'TA DEĞİL** (06.09).
 *
 * Ajan cevaplarını HER ZAMAN biçimlendirilmiş yazıyor (mesajlaşma söz dizimi: `*kalın*`,
 * `_italik_`, `~üstü çizili~`, `•` maddeleri). Hangi yüzeyin bunu çizebildiği ayrı bir sorudur ve
 * cevabı burada veriliyor.
 *
 * ── NEDEN PROMPT'TA DEĞİL ───────────────────────────────────────────────────
 * İlk tasarım üslubu kanala göre dallandırmaktı: "WhatsApp'ta yıldız kullan, talepte kullanma."
 * Bu, modelin unutabileceği ya da yanlış uygulayabileceği bir TALİMAT olurdu ve arızası sessiz
 * olurdu — müşteri düz metnin içinde çıplak yıldız görür, kimse fark etmez. Kural yüzeye taşınınca
 * model onu çiğneyemez hâle geliyor.
 *
 * ── HANGİ YÜZEY NE YAPIYOR ──────────────────────────────────────────────────
 *  · **WhatsApp** — söz dizimini kendi çizer; metin OLDUĞU GİBİ gider.
 *  · **Messenger / Instagram** — çizmez; işaretler sökülür, yoksa müşteri `*Fıstıklı Baklava*`
 *    diye okur. (Meta'nın bu iki kanalda WhatsApp'ın işaretlerini render etmediği belgelidir.)
 *  · **Talep ekranı** — bugün çizmiyor, sökülür. Çizmeyi öğrendiği gün çağıran taraf bu
 *    fonksiyonu çağırmayı bırakır; **ajanın prompt'una dokunulmaz.** Yeteneğin kenarda büyümesi
 *    bu ayrımın asıl kazancı.
 *
 * ── SÖKMEK ≠ SİLMEK ─────────────────────────────────────────────────────────
 * İşaret kalkarken **içerik kalır**: `*Fıstıklı Baklava*` → `Fıstıklı Baklava`. Madde işareti
 * `•` KORUNUR — o bir biçimlendirme işareti değil, düz metinde de okunabilen bir karakterdir ve
 * listenin satır yapısını taşıyan tek şeydir; sökülseydi dört boy tek paragrafa yapışırdı.
 */

/** Kaçırılmaması gereken hâl: `*` bir çarpma işareti ya da ölçü olabilir (`2*3`, `5 * 100 g`). */
const BOLD = /(?<![\p{L}\p{N}])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}])/gu;
const ITALIC = /(?<![\p{L}\p{N}])_(?!\s)([^_\n]+?)(?<!\s)_(?![\p{L}\p{N}])/gu;
const STRIKE = /(?<![\p{L}\p{N}])~(?!\s)([^~\n]+?)(?<!\s)~(?![\p{L}\p{N}])/gu;

/**
 * Mesajlaşma biçim işaretlerini söker; içeriği ve satır yapısını korur.
 *
 * Sarmalayıcı işaretler **kelime sınırında** aranıyor: `2*3` ya da `100 g * 4` gibi çarpma
 * ifadeleri biçimlendirme sanılıp yenmesin. Aynı sebeple açılış işaretinden sonra ve kapanış
 * işaretinden önce boşluk kabul edilmiyor — `* madde` bir yıldız listesidir, kalın metin değil.
 */
export function stripChatFormatting(text: string): string {
  return text.replace(BOLD, '$1').replace(ITALIC, '$1').replace(STRIKE, '$1');
}

/**
 * Kanal bu söz dizimini kendi çiziyor mu?
 *
 * Bugün yalnız WhatsApp. Liste `ConversationSource`tan TÜRETİLMİYOR ve bu bilinçli: yeni bir kanal
 * eklendiğinde varsayılan **çizmiyor** olmalı — yanlış yönde hata yapmak (gereksiz sökmek) çıplak
 * yıldız göstermekten ucuzdur.
 */
export function rendersChatFormatting(channel: string): boolean {
  return channel === 'whatsapp';
}

/** Kanala göre karar: çizen yüzeye olduğu gibi, çizmeyene sökülmüş. */
export function formatForChannel(text: string, channel: string): string {
  return rendersChatFormatting(channel) ? text : stripChatFormatting(text);
}
