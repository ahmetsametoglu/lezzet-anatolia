import { ErrorState } from './error-state';
import { AlertIcon } from './icons';

/**
 * "Bu ekran size kapalı" panesi — personel ama o ekranın rolü değil (denetim O2).
 *
 * Altı sayfada elle kurulmuştu (siparişler · sipariş detayı · müşteriler · fiyatlar · tedarik ·
 * sistem); beşi birebir aynı, altıncısı ayrışmaya başlamıştı — kopyanın çürüme kanıtı.
 *
 * **Kabuk KORUNUR, yalnız pane kapanır:** sidebar operasyon gezinmesidir ve yetkisi olan kişiye
 * açıktır; kullanıcı yanlış ekrana geldiğini görüp başka bir yere gidebilmeli. Sessiz yönlendirme
 * "tıkladım, bir şey oldu" hâlidir ve teşhis edilemez.
 *
 * **Sebep YAZILIR, gizlenmez.** Başlık ekranın adını, `reason` neyin kapalı olduğunu ve nerede
 * karşılığının bulunduğunu söyler — operatör aradığı işi başka ekranda bulabilsin diye. Yalnız
 * "yetkiniz yok" demek, kişiyi ne yapacağını bilmeden bırakır.
 *
 * Rol adı GEÇMEZ ("yalnız yöneticiye açık" başlığı sabit): kimin yetkili olduğu bir yetki
 * kararıdır ve rol kümesi değiştiğinde altı ekranın metni birden eskirdi.
 */
interface NoAccessPaneProps {
  /** Ekranın adı — başlık barında, açık hâliyle aynı yerde durur. */
  title: string;
  /** Neyin kapalı olduğu ve varsa karşılığının nerede bulunduğu. */
  reason: string;
}

export function NoAccessPane({ title, reason }: NoAccessPaneProps) {
  return (
    <>
      <div className="flex items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="font-ops-display text-ops-section font-semibold text-ops-ink">{title}</span>
        <span className="rounded-md border border-ops-line bg-ops-gray-25 px-2 py-[3px] font-ops-mono text-ops-xs font-medium text-ops-muted">
          kapalı
        </span>
      </div>
      <ErrorState tone="amber" icon={<AlertIcon />} title="Bu ekran yalnız yöneticiye açık" description={reason} />
    </>
  );
}
