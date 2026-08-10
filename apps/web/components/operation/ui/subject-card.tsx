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
   * **Yön.** `row` (varsayılan) satır içi künye içindir — küçük görsel, yanında ad.
   * `column` KENDİ SÜTUNUNU kaplar: görsel büyür ve üste geçer, ad altına iner. Öneri kartında
   * konu artık bir satır değil bir sütun (kullanıcı kararı 10.08: *"en solda kart olsun, ürün
   * resmi adı sanı bilgisi"*) — görsel tanımanın en hızlı yolu ve o boyda gerçekten işe yarıyor.
   */
  layout?: 'row' | 'column';
}

export function SubjectCard({ name, detail, imageUrl, href, layout = 'row' }: SubjectCardProps) {
  const column = layout === 'column';
  const body = (
    <>
      <Thumbnail src={imageUrl} alt={name} size={column ? undefined : 44} fluid={column} />
      <span className="flex min-w-0 flex-col">
        <span className={`font-ops-display font-semibold text-ops-ink ${column ? 'text-ops-lead' : 'truncate text-ops-base'}`}>
          {name}
        </span>
        {detail ? <span className="truncate font-ops-body text-ops-sm text-ops-muted">{detail}</span> : null}
      </span>
    </>
  );

  const shell = column ? 'flex flex-col gap-2' : 'flex items-center gap-3';

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
