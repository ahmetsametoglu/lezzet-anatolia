import type { ReactNode } from 'react';
import type { OpsTone } from './tone';

/**
 * Operasyon hata gövdesi — pane ortasında merkezlenmiş durum bloğu: ikon kutusu + başlık +
 * açıklama + aksiyon/ek slot. 404 ve 500 ekranları bu TEK bloğu paylaşır (yeni komponent icat
 * edilmez). Çerçeve (AdminSidebar + üst bar) layout/sayfada korunur; burası yalnız gövdedir.
 *
 * `tone` ikon kutusunun rengini belirler — anlam taşır: `neutral` (bulunamadı), `red` (hata),
 * `amber` (yetki/uyarı). Emoji yok; ikon çizgi SVG olarak `icon` slot'undan gelir.
 *
 * Sözlük ORTAK (`OpsTone`) ve buradaki küme onun ALT KÜMESİ olarak türetiliyor. Bir tur kendi
 * kelimelerini kullanıyordu (`danger` / `warn`) ve bu ikinci bir sözlüktü: aynı kırmızıyı rozette
 * `red`, hata gövdesinde `danger` diye çağırmak, iki ekranı karşılaştıran gözü yoruyor ve palete
 * bir renk eklendiğinde hangi listelerin güncelleneceğini belirsiz bırakıyordu. `Extract` sayesinde
 * `OpsTone`'dan bir değer kalkarsa burası DERLENMEZ.
 */
type ErrorTone = Extract<OpsTone, 'neutral' | 'red' | 'amber'>;

const TONE: Record<ErrorTone, string> = {
  neutral: 'bg-ops-gray-100 text-ops-body',
  red: 'bg-ops-red-bg text-ops-red',
  amber: 'bg-ops-amber-bg text-ops-amber',
};

interface ErrorStateProps {
  tone?: ErrorTone;
  icon: ReactNode;
  title: string;
  description: string;
  /** Referans kartı, güvence kutusu, butonlar, çipler — ekrana özgü ek içerik. */
  children?: ReactNode;
}

export function ErrorState({ tone = 'neutral', icon, title, description, children }: ErrorStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-auto p-8 text-center">
      <span className={['grid h-11 w-11 place-items-center rounded-ops-card', TONE[tone]].join(' ')}>{icon}</span>
      <div className="flex flex-col items-center gap-[7px]">
        <h1 className="font-ops-display text-ops-title font-semibold text-ops-ink">{title}</h1>
        <p className="max-w-[440px] text-pretty font-ops-body text-ops-base leading-relaxed text-ops-body">{description}</p>
      </div>
      {children}
    </div>
  );
}
