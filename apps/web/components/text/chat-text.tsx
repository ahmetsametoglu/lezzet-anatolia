import type { ReactNode } from 'react';
import { parseChatFormatting, type ChatSpan } from '@lezzet/domain-core';

/**
 * **Sohbet metnini ÇİZER** (06.09) — web'in üç yazışma yüzeyi buradan geçer: operasyon talep
 * panosu, sosyal sohbet ve müşterinin talep detayı. Dördüncü yüzey e-postadır ve o kendi HTML'ini
 * üretmek zorunda; ayrıştırıcı ortak, çizici mecraya göre ayrı.
 *
 * Ajan müşteriye artık biçimli yazıyor (`*kalın*`, `_italik_`, `~üstü çizili~`, `•` madde). WhatsApp
 * bunu kendi çiziyordu; çizemeyen yüzeylerde işaretler SÖKÜLÜYORDU, yani vurgu ekrandan siliniyordu
 * — "üç kavanoz **eksik**" ile "üç kavanoz eksik" aynı cümle değildir. Çizen yüzey sökmez.
 *
 * ── TEK ÇİZİCİ, ÇOK YÜZEY ───────────────────────────────────────────────────
 * `RichText`in kardeşi ve aynı sebeple onun yanında duruyor: hem müşteri hem operasyon kullanıyor,
 * tipografi ve kutu ÇAĞIRANDAN geliyor (`className`), komponent yalnız YAPIYI çiziyor. İkinci bir
 * kopya bir gün ayrışır — ve ayrıştığı gün bir yüzey kalını çizmeyi unutur, üstelik sessizce.
 *
 * ── HTML ÜRETİLMEZ ──────────────────────────────────────────────────────────
 * Ayrıştırıcı dize değil VERİ döndürüyor (`ChatBlock[]`); parçalar `<strong>`/`<em>`/`<s>` olarak
 * çiziliyor. `dangerouslySetInnerHTML` yok, dolayısıyla temizleme (sanitize) adımı ve XSS yüzeyi de
 * yok: müşteri mesajına `<script>` yazsa React onu metin olarak basar.
 *
 * ── SATIR SONU ÇAĞIRANA BIRAKILMAZ ──────────────────────────────────────────
 * Ayrıştırıcı paragraf içindeki `\n`i span metninde BIRAKIYOR; karşılığı `whitespace-pre-wrap` ve
 * onu burada veriyoruz. Çağıranın hatırlaması gereken bir kural olsaydı, unutulduğu gün metni tek
 * satıra çöktürürdü — hem de yalnız o yüzeyde, yani fark edilmeden.
 */
interface ChatTextProps {
  /** Ham mesaj metni — biçim işaretleri İÇİNDE, sökülmemiş hâlde. */
  text: string | null | undefined;
  /** Kutu + tipografi çağırandan: müşteri balonu ile operasyon balonu aynı ölçekte değil. */
  className?: string;
  /**
   * Gösterilen metnin GERÇEK dili. Çeviri anahtarı olan yüzeyler orijinale dönerken bunu
   * değiştirir; ekran okuyucusu ve tarayıcı çevirisi buna bakar.
   */
  lang?: string;
}

export function ChatText({ text, className, lang }: ChatTextProps) {
  const blocks = parseChatFormatting(text ?? '');
  if (blocks.length === 0) return null;

  return (
    <div className={className} lang={lang}>
      {blocks.map((block, index) =>
        block.kind === 'paragraph' ? (
          <p key={index} className={blockClass(index, 'whitespace-pre-wrap')}>
            {renderSpans(block.spans)}
          </p>
        ) : (
          <ul key={index} className={blockClass(index, 'flex list-disc flex-col gap-1 pl-4')}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="whitespace-pre-wrap">
                {renderSpans(item)}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/**
 * Bloklar arası boşluk **bloğun kendisinde**, sarmalayıcıda değil.
 *
 * Sarmalayıcıya `flex flex-col gap-*` vermek çağıranın kutu sınıfını (balon, kart) ezerdi: kimi
 * çağıran zaten kendi yerleşimini kuruyor ve iki yerleşim üst üste binerdi.
 */
function blockClass(index: number, extra: string): string {
  return index === 0 ? extra : `mt-2 ${extra}`;
}

function renderSpans(spans: readonly ChatSpan[]): ReactNode {
  return spans.map((span, index) => <Span key={index} span={span} />);
}

/**
 * Tek parçanın çizimi. İşaretler BİRLEŞEBİLİR (`*_böyle_*` tek span'da hem kalın hem italik gelir),
 * o yüzden eleman iç içe sarılıyor.
 *
 * Sınıflar AÇIKÇA yazılı, etiketin varsayılan görünümüne güvenilmiyor: Tailwind'in preflight'ı
 * `strong`un ağırlığını zaten eziyor, öteki ikisini bir gün ezerse vurgu sessizce kaybolurdu.
 */
function Span({ span }: { span: ChatSpan }) {
  let node: ReactNode = span.text;
  if (span.strike) node = <s className="line-through">{node}</s>;
  if (span.italic) node = <em className="italic">{node}</em>;
  if (span.bold) node = <strong className="font-semibold">{node}</strong>;
  return <>{node}</>;
}
