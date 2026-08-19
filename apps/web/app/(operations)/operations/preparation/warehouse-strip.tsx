'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setWarehouseContextAction } from '@/app/(operations)/operations/actions';
import { stripNote } from './preparation-labels';
import type { WarehouseWorkView } from './preparation-types';

/**
 * **Kalıcı tesis şeridi** (10.8, kullanıcı kararı 19.08) — kuyruk açıkken başlığın altında durur.
 *
 * ── NEDEN KUYRUK EKRANINDA DA VAR ───────────────────────────────────────────
 * Karşılama ekranı seçimi çözüyordu ama seçimden SONRA kayboluyordu: ikinci depoya bakmak için üst
 * bardaki bağlam seçicisine gitmek gerekiyordu — yani ekranın kendi işi, ekranın dışına çıkılarak
 * yapılıyordu. Depolar sayfası tam bu yüzden iki görünümden vazgeçti (kullanıcı kararı 16.08:
 * *"başlığın hemen altına depo isimlerini koyalım"*); burada da aynı desen geçerli.
 *
 * ── ŞERİT SIRALANMAZ, DEPOLAR'DAKİ SIRAYA UYAR ──────────────────────────────
 * Sürükleme YOK ve bu bilinçli: sıra operatörün Depolar ekranında dizdiği sıradır ve sistemdeki
 * **bütün** depo seçicilerinde aynıdır. İkinci bir yerden sıralanabilmesi, iki yerin bir gün
 * ayrışması demekti — okuma sırayı olduğu gibi taşıyor.
 *
 * ── NOT İŞİ ANLATIR, KURULUMU DEĞİL ─────────────────────────────────────────
 * Depolar şeridinin notu kurulumu söylüyor ("kurulumu eksik", "kapalı"); buradaki işi söylüyor
 * ("2 geciken · 7 bekleyen"). Aynı şerit biçimi, farklı soru — çünkü burada depo zaten seçilmiş,
 * sorulan şey "hangisine geçeyim".
 *
 * **Tek depo varsa hiç çizilmez** (sayfanın kararı): tek seçenekli bir seçici, seçim değil süstür.
 */
export function WarehouseStrip({ rows, activeId }: { rows: readonly WarehouseWorkView[]; activeId: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);

  const pick = (id: string) => {
    if (id === activeId) return;
    setPending(id);
    startTransition(async () => {
      const { error } = await setWarehouseContextAction(id);
      // Hata hâlinde şerit sunucunun bildiğine döner: `router.refresh()` etkin bağlamı yeniden
      // okuyor, yani başarısız bir geçiş ekranda "olmuş" gibi kalmıyor.
      if (error) setPending(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-none flex-col gap-2 border-b border-ops-line bg-ops-subtle px-6 py-3">
      <div className="flex items-baseline gap-2">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">Tesisler</span>
        <span className="font-ops-body text-ops-micro text-ops-faint">kuyruk seçili deponun işidir — sıra Depolar'da dizilir</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <FacilityChip
            key={row.id}
            row={row}
            active={row.id === activeId}
            busy={busy}
            pending={pending === row.id}
            onSelect={() => pick(row.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Şeritteki tek tesis — Depolar şeridindeki `FacilityChip` ile aynı biçim: seçili olan sol
 * kenarından işaretlenir (rozet değil, kenar: sessiz ama net).
 *
 * Geciken iş olan tesis amber notla ayrılıyor. Bu bir uyarı: operatör başka depoda çalışırken de
 * bir yerde işin sarktığını görmeli — şeridin bu ekranda durmasının asıl kazancı bu.
 */
function FacilityChip({
  row,
  active,
  busy,
  pending,
  onSelect,
}: {
  row: WarehouseWorkView;
  active: boolean;
  busy: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={busy || active}
      aria-current={active ? 'true' : undefined}
      className={[
        'flex min-w-[168px] flex-col gap-0.5 rounded-ops-btn border px-2.5 py-2 text-left transition-colors',
        // Seçili olan tıklanmaz ama SOLGUN da değil: o an bakılan yer, engellenmiş bir seçenek
        // değil. Solgunlaştırmak "burası kapalı" derdi.
        active
          ? 'cursor-default border-l-[3px] border-ops-olive bg-ops-card shadow-sm'
          : 'cursor-pointer border-ops-line bg-ops-card hover:border-ops-olive-line disabled:cursor-not-allowed disabled:opacity-60',
      ].join(' ')}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="font-ops-mono text-ops-sm font-semibold text-ops-ink">{row.code}</span>
        <span className="min-w-0 flex-1 truncate font-ops-display text-ops-sm font-semibold text-ops-ink">{row.name}</span>
      </span>
      {/* "açılıyor…" YALNIZ henüz açılmamışken. Geçiş bitince `activeId` bu çipe döner ama
          `pending` durumu istemcide asılı kalır (sunucu render'ı istemci state'ini sıfırlamaz) —
          koşulsuz yazıldığında seçili tesis sonsuza kadar "açılıyor…" görünüyordu (ölçüldü). */}
      <span className={['font-ops-body text-ops-xs', row.overdue > 0 ? 'text-ops-amber' : 'text-ops-muted'].join(' ')}>
        {pending && !active ? 'açılıyor…' : stripNote(row)}
      </span>
    </button>
  );
}
