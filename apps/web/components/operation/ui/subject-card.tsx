import Link from 'next/link';
import { Thumbnail } from './thumbnail';

/**
 * ÖNERİNİN KONU KARTI (22.9) — görsel + ad + ilgili ekrana bağlantı.
 *
 * **Ortak, çünkü 11 öneri tipinin 9'unda bir konu var** (ürün · paket · kategori · koleksiyon ·
 * tarif). Tip başına ayrı bir başlık kartı yazılsaydı dokuz kopya doğardı; burada tek yer.
 *
 * **Bağlantı YENİ SEKMEDE** ve bu kararın gerekçesi kurgunun kendisi: bu ekranın bütün amacı
 * operatörü asistan sayfasından çıkarmamak (22.8). Aynı sekmede gitmek, az önce çözülen "ortamdan
 * kopma" sorununu geri getirirdi — bağlantı bir kaçış değil, bir yan pencere.
 *
 * Görsel yoksa `Thumbnail` kendi yer tutucusunu çiziyor: kutu boyu sabit kalır, kart zıplamaz.
 */
interface SubjectCardProps {
  name: string;
  detail: string | null;
  imageUrl: string | null;
  href: string | null;
  /**
   * **Görselin kenarı (px).** 44 = satır içi künye · 132 = öneri panelinin başı.
   *
   * Görsel KUTUYU DOLDURMAZ, sabit kalır. Bir tur panel genişliğini izliyordu (`fluid`) ve geniş
   * ekranda 550 piksellik sütunda 4:3 fotoğraf 410 piksel boy tutuyordu: panel tek başına ötekilerin
   * iki katına çıkıyor, yanındaki iki sütunun altında 450 piksellik ölü alan kalıyordu (kullanıcı,
   * 10.08: *"ekranın canına okuyor"*). Sabit boy hem kırpmayı öngörülebilir tutar hem panelin
   * yüksekliğini formunkine yaklaştırır — akışkan görsel, sütunlu bir dizilimde daima en uzun
   * sütunu üretir.
   */
  size?: number;
}

export function SubjectCard({ name, detail, imageUrl, href, size = 44 }: SubjectCardProps) {
  // Büyük görselde ad SARILIR ve büyür; küçükte kırpılır. Eşik boyun kendisinden çıkıyor, ayrı bir
  // bayrak taşınmıyor — iki ayar aynı şeyin iki yüzü ve ayrı verilirse bir gün ayrışırlar.
  const wide = size >= 96;
  const body = (
    <>
      <Thumbnail src={imageUrl} alt={name} size={size} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={`font-ops-display font-semibold text-ops-ink ${wide ? 'text-ops-lead leading-snug' : 'truncate text-ops-base'}`}
        >
          {name}
        </span>
        {detail ? <span className="truncate font-ops-body text-ops-sm text-ops-muted">{detail}</span> : null}
      </span>
    </>
  );

  const shell = wide ? 'flex items-start gap-3.5' : 'flex items-center gap-3';

  if (!href) {
    return <span className={shell}>{body}</span>;
  }

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      title={`${name} — ürün ekranında aç (yeni sekme)`}
      className={`${shell} cursor-pointer rounded-ops-card transition-colors hover:opacity-90`}
    >
      {body}
    </Link>
  );
}
