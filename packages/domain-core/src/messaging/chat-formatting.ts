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

// ─────────────────────────────────────────────────────────────────────────────
// AYRIŞTIRICI — çizen yüzeyler için (06.09)
//
// Sökücü "çizemeyen yüzey" içindi; bu, ÇİZEBİLEN yüzey için. İkisi aynı dosyada
// duruyor ve bu bilinçli: aynı söz diziminin iki okuması bir gün ayrışırsa, sökülen
// metinle çizilen metin farklı çıkar ve arıza yalnız bir kanalda görünür. Yan yana
// durdukları için testleri de birlikte, EŞDEĞERLİK olarak yazılabiliyor.
//
// Çıktı JSX DEĞİL veri: aynı ağacı React (web), React Native (mobil) ve e-posta
// şablonu ayrı ayrı çiziyor. Ayrıştırıcı hiçbirini bilmiyor.
// ─────────────────────────────────────────────────────────────────────────────

/** Tek parça metin — işaretler BİRLEŞEBİLİR (`*_kalın italik_*`). */
export interface ChatSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
}

/**
 * Blok — paragraf ya da madde listesi.
 *
 * Başlık, tablo, numaralı liste, kod bloğu YOK ve olmayacak: bu bir sohbet mesajıdır,
 * doküman değil. Ajanın prompt'u da aynı üçlüyle sınırlı — ayrıştırıcı modelin
 * yazabileceğinden fazlasını tanısaydı, hiç gelmeyecek bir hâli çizmeye çalışırdı.
 */
export type ChatBlock = { kind: 'paragraph'; spans: ChatSpan[] } | { kind: 'list'; items: ChatSpan[][] };

/** Ajanın kullandığı madde işareti. Satır başında ve ardından boşlukla aranır. */
const BULLET = /^[•·]\s+/;

type Mark = 'bold' | 'italic' | 'strike';

/** Sarmalayıcılar — sökücüyle AYNI sınır kuralları; iki okuma tek yerden beslenmeli. */
const WRAPPERS: readonly { mark: Mark; re: RegExp }[] = [
  { mark: 'bold', re: BOLD },
  { mark: 'italic', re: ITALIC },
  { mark: 'strike', re: STRIKE },
];

/** İşaret kümesini span'a çevirir — `false` alan YAZILMAZ, çizici `undefined` görsün. */
function spanOf(text: string, marks: ReadonlySet<Mark>): ChatSpan {
  return {
    text,
    ...(marks.has('bold') ? { bold: true } : {}),
    ...(marks.has('italic') ? { italic: true } : {}),
    ...(marks.has('strike') ? { strike: true } : {}),
  };
}

/**
 * Satır içi ayrıştırma — İÇ İÇE işaretleri de çözer.
 *
 * En ERKEN başlayan sarmalayıcı seçiliyor; eşitlikte sıra `WRAPPERS`ınki. Seçilen
 * sarmalayıcının içi kendi işaretiyle birlikte YENİDEN ayrıştırılıyor, yani
 * `*_kalın italik_*` tek span'da iki işaret taşıyor. Özyineleme her adımda metni
 * kısalttığı için sonlu.
 */
function parseSpans(text: string, marks: ReadonlySet<Mark> = new Set()): ChatSpan[] {
  let enErken: { mark: Mark; index: number; length: number; inner: string } | null = null;

  for (const { mark, re } of WRAPPERS) {
    if (marks.has(mark)) continue; // Aynı işaret iç içe aranmaz — `**a**` bir kez kalınlaşır.
    const arayici = new RegExp(re.source, re.flags);
    const eslesme = arayici.exec(text);
    if (eslesme && (enErken === null || eslesme.index < enErken.index)) {
      enErken = { mark, index: eslesme.index, length: eslesme[0].length, inner: eslesme[1] ?? '' };
    }
  }

  if (enErken === null) return text ? [spanOf(text, marks)] : [];

  const once = text.slice(0, enErken.index);
  const sonra = text.slice(enErken.index + enErken.length);
  const icMarks = new Set(marks).add(enErken.mark);

  return [
    ...(once ? [spanOf(once, marks)] : []),
    ...parseSpans(enErken.inner, icMarks),
    ...parseSpans(sonra, marks),
  ];
}

/**
 * Metni çizilebilir bloklara ayırır.
 *
 * ── SATIR YAPISI KORUNUYOR ──────────────────────────────────────────────────
 * Ardışık madde satırları TEK `list` bloğuna toplanıyor; aradaki düz satırlar kendi
 * `paragraph`ına düşüyor ve içindeki satır sonları KORUNUYOR (`\n` span metninde
 * kalır). Sohbette satır sonu bir yazım kararıdır — "üç boy var:" ile listesini
 * ayıran şey odur; yutulsaydı metin tek bloğa yapışırdı.
 *
 * Çizici tarafında karşılığı: web'de `white-space: pre-wrap`, React Native'de
 * varsayılan davranış.
 *
 * ── SÖKÜCÜYLE EŞDEĞER ───────────────────────────────────────────────────────
 * Blokların metinleri geri birleştirildiğinde `stripChatFormatting` çıktısı elde
 * edilir (`chatBlocksToText`). Bu eşdeğerlik testle çivili: iki okuma ayrışırsa
 * sökülen metinle çizilen metin farklı olur ve arıza yalnız tek kanalda görünür —
 * bulunması en zor tür.
 */
export function parseChatFormatting(text: string): ChatBlock[] {
  if (!text) return [];

  const bloklar: ChatBlock[] = [];
  let paragraf: string[] = [];
  let liste: string[] = [];

  const paragrafiKapat = (): void => {
    if (paragraf.length === 0) return;
    bloklar.push({ kind: 'paragraph', spans: parseSpans(paragraf.join('\n')) });
    paragraf = [];
  };
  const listeyiKapat = (): void => {
    if (liste.length === 0) return;
    bloklar.push({ kind: 'list', items: liste.map((madde) => parseSpans(madde)) });
    liste = [];
  };

  for (const satir of text.split('\n')) {
    const madde = BULLET.exec(satir);
    if (madde) {
      paragrafiKapat();
      liste.push(satir.slice(madde[0].length));
    } else {
      listeyiKapat();
      paragraf.push(satir);
    }
  }
  paragrafiKapat();
  listeyiKapat();

  return bloklar;
}

/**
 * Blokları düz metne geri çevirir — ayrıştırıcının sökücüyle EŞDEĞERLİĞİNİ ölçen kapı.
 *
 * Üretim yolunda çizici kullanır (metin kopyalama, arama, e-posta düz metin yedeği);
 * asıl işi testte: `chatBlocksToText(parseChatFormatting(t)) === stripChatFormatting(t)`.
 */
export function chatBlocksToText(blocks: readonly ChatBlock[]): string {
  return blocks
    .map((blok) =>
      blok.kind === 'paragraph'
        ? blok.spans.map((s) => s.text).join('')
        : blok.items.map((madde) => `• ${madde.map((s) => s.text).join('')}`).join('\n'),
    )
    .join('\n');
}
