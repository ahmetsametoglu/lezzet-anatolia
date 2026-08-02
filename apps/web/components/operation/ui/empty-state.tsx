import type { ReactNode } from 'react';

/**
 * Liste/tablo BOŞ HÂLİ — `ErrorState`'in kardeşi (denetim O4).
 *
 * Aynı merkezlenmiş blok altı yerde elle kurulmuştu (fiyat kanalları · stok yaklaşan tarihli ·
 * stok imha · tedarik siparişleri · tedarik tedarikçiler · mobil müşteri listesi). `ErrorState`
 * vardı, boş-hâl karşılığı yoktu; sonuç, aynı iki satırın altı kopyası.
 *
 * **`ErrorState`'ten neden ayrı:** hata bir ARIZADIR (ikon kutusu, tonlu), boş liste çoğu zaman
 * bir arıza değildir — hatta iyi haber olabilir ("eşik altında parti yok"). İkon zorunlu değil ve
 * varsayılan olarak yoktur: boş bir listeye uyarı ikonu koymak, olmayan bir sorunu varmış gibi
 * gösterirdi.
 *
 * **İki hâl ayrı tutulur ve bu ayrım kritik:** "hiç kayıt yok" ile "bu süzgeçte kayıt yok" farklı
 * şeylerdir — ikincisinde operatörün yapacağı iş süzgeci değiştirmektir, birincisinde kayıt
 * oluşturmak. Aynı cümleyi kullanmak operatörü olmayan bir veriyi aramaya gönderir. Ayrımı
 * çağıran yapar (`title`/`description`), bu bileşen yalnız kabuğu sabitler.
 */
interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** İsteğe bağlı ikon — yalnız gerçekten bir şey anlatıyorsa. */
  icon?: ReactNode;
  /** Çağrı düğmesi ("+ İlk tedarikçiyi ekle") ya da ipucu şeridi. */
  children?: ReactNode;
  /**
   * Gövdeyi kaplasın mı (`flex-1`). Tablo içindeki boş hâl kaplar; kart listesinin içine
   * gömülen boş hâl kaplamaz — sarmalayıcısı zaten yüksekliği veriyor.
   */
  fill?: boolean;
}

export function EmptyState({ title, description, icon, children, fill = true }: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-1.5 p-10 text-center',
        fill ? 'flex-1' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ? <span className="mb-1 text-ops-faint">{icon}</span> : null}
      <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{title}</span>
      {description ? (
        <span className="max-w-[420px] text-pretty font-ops-body text-ops-sm leading-relaxed text-ops-muted">
          {description}
        </span>
      ) : null}
      {children ? <span className="mt-1.5">{children}</span> : null}
    </div>
  );
}
