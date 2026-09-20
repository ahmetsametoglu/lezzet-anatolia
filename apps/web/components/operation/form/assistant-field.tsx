import type { ReactNode } from 'react';

/**
 * ASİSTANIN DOLDURDUĞU ALAN — kutunun kendisi mor zemine oturur.
 *
 * ── NEDEN ROZET DEĞİL ZEMİN (kullanıcı ölçümü) ──────────────────────────────
 * İşaret bir tur etiketin sağ ucunda küçük bir rozetti ve görülmüyordu: *"bu asistan rozeti çok
 * dikkat çekici olmuyor."* Etiket satırı zaten dolu (alan adı, zorunluluk yıldızı, kutunun kendi
 * açıklaması) ve oraya sıkışan bir kelime taranırken atlanıyor. Zemin ise alanın kendi alanını
 * kullanıyor: operatör forma bakar bakmaz hangi kutuların önerildiğini görüyor.
 *
 * **Kutunun kendi açıklaması da geri geliyor:** rozet `labelAside`i işgal ettiği için alerjen ve
 * çapraz bulaşma kutularının açıklaması ("ürünün İÇERDİKLERİ") asistan yazdığında kayboluyordu.
 *
 * ── İŞARETSİZ HÂLDE SARMALAMAZ ──────────────────────────────────────────────
 * `on` yanlışken çocuk olduğu gibi döner: ürün ekranında (asistansız yol) form bugünkü hizasını
 * birebir korur, ızgaralara fazladan bir kutu girmez.
 */
export function AssistantField({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    // İpucu tek bilgi kaynağı DEĞİL, zeminin kendisi konuşuyor; fare bekleyene adını söylüyor.
    <div title="Bu kutuyu asistan doldurdu" className="rounded-ops-card border border-ops-violet-line bg-ops-violet-bg px-2.5 py-2">
      {children}
    </div>
  );
}
