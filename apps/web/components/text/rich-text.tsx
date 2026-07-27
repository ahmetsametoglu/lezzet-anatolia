import { parseEmphasis } from '@lezzet/helper';

/**
 * Vurgulu metin çizici — TEK KAYNAK: müşteri ürün sayfası da operasyon önizlemesi de bunu kullanır.
 *
 * Metin veritabanında DÜZ tutulur, içinde yalnız `**vurgu**` işareti taşır; burada HTML üretilmez,
 * parçalar `<span>`/`<strong>` olarak çizilir. Bu yüzden temizleme (sanitize) adımı ve XSS yüzeyi yok:
 * kullanıcı metnine `<script>` yazsa bile React onu metin olarak basar.
 *
 * Yasal arka plan: INCO içindekiler listesinde alerjenin YAZILDIĞI hâlinin vurgulanmasını ister
 * ("buğday unu"), kategori adının değil — bu yüzden vurgu operatörün işaretidir, otomatik türetilmez.
 */
interface RichTextProps {
  text: string | null | undefined;
  /** Sarmalayıcı sınıfı — tipografi çağırandan gelir (müşteri ve operasyon farklı ölçekte). */
  className?: string;
}

export function RichText({ text, className }: RichTextProps) {
  if (!text) return null;
  return (
    <p className={className}>
      {parseEmphasis(text).map((seg, i) =>
        seg.strong ? (
          <strong key={i} className="font-semibold">
            {seg.text}
          </strong>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}
