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
}

export function SubjectCard({ name, detail, imageUrl, href }: SubjectCardProps) {
  const body = (
    <>
      <Thumbnail src={imageUrl} alt={name} size={44} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-ops-display text-ops-base font-semibold text-ops-ink">{name}</span>
        {detail ? <span className="truncate font-ops-body text-ops-sm text-ops-muted">{detail}</span> : null}
      </span>
    </>
  );

  if (!href) {
    return <span className="flex items-center gap-3">{body}</span>;
  }

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      title={`${name} — ürün ekranında aç (yeni sekme)`}
      className="flex cursor-pointer items-center gap-3 rounded-ops-card transition-colors hover:bg-ops-gray-100"
    >
      {body}
    </Link>
  );
}
