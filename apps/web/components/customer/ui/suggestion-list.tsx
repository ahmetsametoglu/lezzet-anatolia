'use client';

/**
 * ÖNERİ LİSTESİ — bir alanın ALTINDA duran, seçilebilir aday satırları.
 *
 * **Açılır kutu (dropdown) DEĞİL ve bu bilinçli.** Liste alanın akışında, blok olarak durur;
 * üstüne binmez. Gerekçesi `place-dialog`da zaten yazılıydı ve buraya taşındı: `combobox` rolü
 * bir KLAVYE SÖZLEŞMESİ vaat eder (ok tuşları, `aria-activedescendant`, kapanma kuralları) ve o
 * sözleşme burada yok. Rolü yazıp gereğini yapmamak, hiç yazmamaktan kötüdür — ekran okuyucu
 * kullanıcısına var olmayan bir gezinme sözü verir. Satırlar sıradan düğme; sekme ile gezilir.
 *
 * **Görsel dil yeniden uydurulmadı:** satır biçimi `place-dialog`ın aday satırından birebir
 * alındı (kum kenarlıklı kart, üstüne gelince zeytin kenar). Aynı işi yapan iki liste iki farklı
 * görünse, müşteri ikisini iki ayrı şey sanardı.
 *
 * **Boş listede HİÇBİR ŞEY çizilmez** — "sonuç yok" satırı bile. Öneri bir kolaylıktır; yokluğu
 * bir hata değildir ve müşteriye bir şey olmuş gibi göstermek, çalışan bir formu arızalı okutur.
 */

interface SuggestionItem {
  /** Liste anahtarı ve seçim kimliği — çağıran neyle bulacaksa onu verir. */
  id: string;
  title: string;
  /** İkincil satır; yoksa hiç çizilmez (uydurulacak alt metin yok). */
  subtitle?: string;
  /** Sağa yaslanan kısa işaret (örn. "Teslimat bölgesi"). */
  tag?: string;
}

interface SuggestionListProps {
  items: SuggestionItem[];
  onSelect: (id: string) => void;
  /** Listenin ne olduğunu söyleyen erişilebilirlik adı — görsel başlık DEĞİL. */
  label: string;
  /**
   * Kaynak künyesi. BAN verisi Etalab 2.0 altında ve kaynak gösterimi ZORUNLU (STACK "Adres arama
   * (FR)"); künyeyi ÇİZEN yüzeydir. Kendi referansımızdan gelen listelerde geçilmez.
   */
  footnote?: string;
}

export function SuggestionList({ items, onSelect, label, footnote }: SuggestionListProps) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className="flex cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-soft border border-sand-200 bg-card px-3.5 py-2 text-left transition-colors hover:border-olive"
        >
          <span className="font-sans text-body-sm font-bold text-ink">{item.title}</span>
          {item.subtitle && <span className="font-sans text-note text-body">{item.subtitle}</span>}
          {item.tag && <span className="ml-auto font-sans text-micro font-semibold text-olive-dark">{item.tag}</span>}
        </button>
      ))}
      {footnote && <span className="font-sans text-micro text-muted">{footnote}</span>}
    </div>
  );
}
