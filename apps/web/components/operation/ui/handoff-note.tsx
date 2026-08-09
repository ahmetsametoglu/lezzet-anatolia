import type { ReactNode } from 'react';

/**
 * **Asistan önerisinden gelindi** künyesi — devredilen önerinin hedef ekrandaki izi (22.5).
 *
 * ── NEDEN ORTAK ─────────────────────────────────────────────────────────────
 * Dört hedef ekranın (rota · mal kabul · para · fırsat) dördü de aynı şeyi söylüyor: "bu form
 * kendiliğinden dolmadı, asistan doldurdu — ve şu gerekçeyle". Dört kopya yazılsaydı biri bir gün
 * gerekçeyi düşürür, biri rengi değiştirir ve operatör aynı olguyu dört ekranda dört ayrı
 * biçimde okurdu. Değişen tek şey ALT NOTTUR ve o da zaten ekrana özgü — `children` ile geliyor.
 *
 * ── RENK BİR CÜMLEDİR ───────────────────────────────────────────────────────
 * Mor bu yüzeyde "makine konuştu" demek (`OpsTone.violet`; asistan ikonu ve kuyruk rozeti de mor).
 * Amber ise tek bir hâlin rengi: **form doldurulamadı.** Öneri geçerli ama bu ekranın kapısı onu
 * alamıyor (para ekranında stok alımı gibi) — o zaman künye ön dolgu vaat etmez, hangi yoldan
 * gidileceğini söyler. İki hâli aynı renkte göstermek "hazır, kaydete bas" demek olurdu.
 */
interface HandoffNoteProps {
  /** Öneri özeti — asistanın kendi cümlesi (kuyrukta okunanla aynı). */
  summary: string;
  /** Gerekçe; yoksa satır hiç çizilmez — cümle uydurulmaz. */
  reason: string | null;
  /**
   * Başlığın ekine yazılan künye ("· irsaliye 12345"). Ekranın kimliğe dair elindeki tek ipucu
   * buysa burada durur; yoksa başlık kısa kalır.
   */
  labelSuffix?: string;
  /**
   * Alt not — ekranın kendi cümlesi: neyin dolu geldiği, neyin bilerek boş bırakıldığı, neyin
   * geri alınamayacağı. Ortak bir metin YAZILMAZ: dört ekranın uyarısı dört ayrı şey.
   */
  children?: ReactNode;
  /** Form doldurulamadı — künye amber olur ve `children` "hangi yoldan gidilir"i anlatır. */
  blocked?: boolean;
  /** Yerleşim (kenar boşluğu, dar rayda daha sıkı iç boşluk). Ekranın düzeni ortak bileşene girmez. */
  className?: string;
  /** Dar rayda (rota kurulumu) iç boşluk küçülür — kutu kolonun yarısını yemesin. */
  dense?: boolean;
}

export function HandoffNote({ summary, reason, labelSuffix, children, blocked, className, dense }: HandoffNoteProps) {
  const tone = blocked
    ? { box: 'border-ops-amber-line bg-ops-amber-bg', label: 'text-ops-amber' }
    : { box: 'border-ops-violet-line bg-ops-violet-bg', label: 'text-ops-violet' };

  return (
    <div
      className={`flex flex-col gap-1 rounded-ops-card border ${tone.box} ${
        dense ? 'px-3 py-2.5' : 'px-4 py-3'
      } ${className ?? ''}`}
    >
      <span
        className={`font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] ${tone.label}`}
      >
        Asistan önerisinden{labelSuffix ? ` · ${labelSuffix}` : ''}
      </span>
      <span className="font-ops-body text-ops-sm leading-relaxed text-ops-strong">{summary}</span>
      {reason ? <span className="font-ops-body text-ops-xs leading-relaxed text-ops-body">{reason}</span> : null}
      {children ? (
        <span className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">{children}</span>
      ) : null}
    </div>
  );
}
