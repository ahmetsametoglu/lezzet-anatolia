'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { iconHitClass } from './button';

/**
 * Açık panellerin yığını. Esc yalnız EN ÜSTTEKİNİ kapatır — iç içe panel doğduğu gün tek tuş iki
 * paneli birden kapatmasın. Gövde kaydırma kilidi de buradan sayılır: kilit yığın 0→1 olunca kurulur,
 * son panel kapanınca kalkar.
 */
const dialogStack: object[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Müşteri paneli (modal) — örtü + ortalanmış kutu + başlık satırı + kapatma (denetim bulgusu K3, 02.08).
 *
 * İki panel bu kabuğu ayrı ayrı kurmuştu (`place-dialog` · `notice-dialog`) ve asıl sorun görsel
 * kopya değildi: **kapanma sözleşmeleri farklıydı.** Biri Escape'i dinliyordu, öteki dinlemiyordu;
 * müşteri hangisinde olduğunu bilemez. Kapanma davranışı bir stil değil, arayüzün verdiği sözdür —
 * tek yerde durur.
 *
 * Odak tuzağı buranın işi: panel açıkken Tab arkadaki sayfaya kaçmaz, açılışta odak panele gelir,
 * kapanışta çağıran öğeye geri döner. Elle kurulmuş iki kabukta bunların hiçbiri yoktu.
 *
 * Operasyon `Dialog`'u kopyalanmadı — token aileleri ayrı (`ops-*` karanlık modda döner). Ortak olan
 * desen, sınıf değil.
 *
 * Panel HER ZAMAN `max-h-[85vh]` + kendi kaydırması: kısa içerikte hiçbir etkisi yok, uzun içerikte
 * (bölge listesi) panelin ekranı taşmasını engelliyor. İki kopyada bu yalnız birinde vardı.
 */
interface DialogProps {
  /** Başlık — `aria-label` olarak da kullanılır. */
  title: string;
  /** Kapatma düğmesinin erişilebilir adı; komponent metin taşımaz, çerçeveden gelir (i18n). */
  closeLabel: string;
  onClose: () => void;
  /** Panel genişliği (px). İçeriğe göre değişir: kısa form 420, listeli panel 460. `sheet`te yok sayılır. */
  maxWidth?: number;
  /**
   * Nerede duracağı — ortalanmış kutu (varsayılan) ya da alttan açılan ÇEKMECE (kullanıcı kararı 21.08).
   *
   * **Ayrı bir çekmece bileşeni YAZILMADI ve bu bilinçli.** Bu kabuğun asıl taşıdığı şey görüntü
   * değil SÖZLEŞME: odak tuzağı, Escape yığını, gövde kaydırma kilidi, kapanışta odağın çağırana
   * dönmesi, `85vh` tavanı. Künyenin kendi dersi bunu söylüyor — iki panel kabuğu ayrı kurulduğunda
   * *"asıl sorun görsel kopya değildi: kapanma sözleşmeleri farklıydı"*. Çekmeceyi ayrı yazmak o
   * hatanın üçüncü sürümü olurdu.
   *
   * **Kararı ÇAĞIRAN verir, kabuk cihazı sormaz** (`CLAUDE §2` cihaz forku): mobil web forku
   * `sheet` geçer, masaüstü hiç geçmez. `md:` ile akışkan bir dönüşüm YOK.
   */
  placement?: 'center' | 'sheet';
  children: ReactNode;
}

export function Dialog({ title, closeLabel, onClose, maxWidth = 420, placement = 'center', children }: DialogProps) {
  const sheet = placement === 'sheet';
  const panelRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<object>({});

  useEffect(() => {
    const token = tokenRef.current;
    const opener = document.activeElement as HTMLElement | null;
    dialogStack.push(token);
    if (dialogStack.length === 1) document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      // Uçtaki öğede Tab çevrilir; ortadakilerde tarayıcının kendi sırası korunur.
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const i = dialogStack.indexOf(token);
      if (i >= 0) dialogStack.splice(i, 1);
      if (dialogStack.length === 0) document.body.style.overflow = '';
      // Odak çağıran öğeye döner: panel kapanınca odak `<body>`de kalırsa klavye kullanıcısı
      // listenin başına fırlar ve nereden geldiğini kaybeder.
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-40 flex bg-ink/40 ${sheet ? 'items-end justify-center' : 'items-center justify-center px-4'}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        /* Çekmecede genişlik ekranın kendisi; `maxWidth` ortalanmış kutunun ölçüsü ve burada
           uygulanırsa çekmece dar kalır — mobilde tam da kaçındığımız sıkışma. */
        style={sheet ? undefined : { maxWidth }}
        className={[
          'flex w-full flex-col bg-card outline-none',
          /* ── İKİ ANATOMİ, TEK SÖZLEŞME ───────────────────────────────────────────────────────
             Ortalanmış kutuda PANELİN KENDİSİ kayar (bugünkü davranış, dokunulmadı).
             Çekmecede başlık SABİT, yalnız gövde kayar — ölçüldü (21.08): tek gövde kaydırmasıyla
             başlık içerikle birlikte yukarı kayıp üstten kırpılıyordu. Çekmecenin başlığı onun
             "neredeyim" işaretidir; kaybolursa müşteri uzun bir formun ortasında bağlamsız kalır. */
          sheet ? 'max-h-[92vh] overflow-hidden rounded-t-card pt-3' : 'max-h-[85vh] gap-3.5 overflow-y-auto rounded-card px-6 py-5.5',
        ].join(' ')}
      >
        {/* Tutamak: çekmecenin "aşağı doğru kapanır" olduğunu söyleyen görsel işaret. Sürükleme
            YOK — vaat edilmeyen bir jest, çalışmadığında kırık hissettirir; kapatma ✕ ile ve
            örtüye dokunarak (kabuğun sözleşmesi). */}
        {sheet && <span aria-hidden className="mx-auto mb-2.5 h-1 w-10 flex-none rounded-full bg-sand-200" />}
        <div className={`flex items-start justify-between gap-3 ${sheet ? 'flex-none px-5 pb-3' : ''}`}>
          <span className="font-serif text-card-title-sm text-ink">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className={`${iconHitClass} -my-2.5 -mr-2.5 font-sans text-note text-muted hover:text-ink`}
          >
            ✕
          </button>
        </div>
        {sheet ? <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-5">{children}</div> : children}
      </div>
    </div>
  );
}
