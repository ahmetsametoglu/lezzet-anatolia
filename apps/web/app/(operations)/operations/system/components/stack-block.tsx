/**
 * O24 · Stack / bağlam bloğu — uzun teknik metnin tek okuma kabı (18.5).
 *
 * **Satır KIRILMAZ, iki eksende kaydırılır.** Sarmalanan bir stack okunmuyor: `at foo (/a/b/c.ts:44)`
 * ikiye bölününce göz her satırın nerede bittiğini aramak zorunda kalıyor ve kareler birbirine
 * karışıyor. Genişlik `min-w-max` ile içeriğe açılır, kap kaydırır.
 *
 * **Kopyalanabilir olması işlevin parçası:** bu metnin gideceği yer çoğu zaman başka bir pencere.
 * Kopyalandı geri bildirimi 1,6 sn görünür — sessiz bir kopyalama, kopyalanıp kopyalanmadığını
 * bilmemek demek.
 *
 * Üç ölçüde aynı bileşen (`size`): geniş inceleme sütunu · dialog · telefon kartı. Ölçü değişir,
 * davranış değişmez — üç yerde ayrı yazılsalardı biri bir gün sarmalamaya başlardı.
 */
type StackSize = 'wide' | 'dialog' | 'mobile';

const SIZE: Record<StackSize, { box: string; text: string }> = {
  wide: { box: 'min-h-[300px] max-h-[420px] px-4 py-3.5', text: 'text-ops-sm leading-[1.75]' },
  dialog: { box: 'max-h-[220px] px-3.5 py-3', text: 'text-ops-xs leading-[1.7]' },
  mobile: { box: 'max-h-[150px] p-2.5', text: 'text-ops-micro leading-[1.65]' },
};

interface StackBlockProps {
  stack: string | null;
  size?: StackSize;
}

export function StackBlock({ stack, size = 'dialog' }: StackBlockProps) {
  const s = SIZE[size];
  return (
    <div className={`overflow-auto rounded-[9px] border border-ops-gray-300 bg-ops-subtle ${s.box}`}>
      <pre className={`m-0 min-w-max whitespace-pre font-ops-mono text-ops-strong ${s.text}`}>
        {/* Stack YOKSA bunu SÖYLER. Boş bir kutu "yüklenmedi" diye okunur; yokluk da bir bilgidir —
            bazı hatalar (doğrulama, uyarı) gerçekten stack taşımaz. */}
        {stack ?? '— stack kaydı yok —'}
      </pre>
    </div>
  );
}

// `CopyButton` BURADAN GİTTİ (17.08) → `components/operation/ui/copy-text.tsx`. Burada doğmuştu ama
// bu dosyanın konusu yığın izidir, panoya yazmak değil; üç ekran aynı düğmeyi ayrı ayrı yazdığı ve
// üçü de farklı davrandığı ölçülünce ortak kapıya taşındı. Tüketicileri oradan import eder.
