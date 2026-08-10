import Link from 'next/link';
import { CROP_CENTER, RATIO_SQUARE, type ImageCrop } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { ImageIcon } from './icons';
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
 */
export interface SubjectImage {
  url: string;
  crop: ImageCrop;
}

interface SubjectCardProps {
  name: string;
  detail: string | null;
  imageUrl: string | null;
  href: string | null;
  /** `imageUrl`in odak + zoom künyesi; verilmezse merkez. Yalnız `fluid` bandında uygulanır. */
  crop?: ImageCrop;
  /**
   * **Görselin kenarı (px).** 44 = satır içi künye · 96 = öneri panelinin başı.
   *
   * Görsel KUTUYU DOLDURMAZ, sabit kalır. Bir tur panel genişliğini izliyordu (`fluid`) ve geniş
   * ekranda 550 piksellik sütunda 4:3 fotoğraf 410 piksel boy tutuyordu: panel tek başına ötekilerin
   * iki katına çıkıyor, yanındaki iki sütunun altında 450 piksellik ölü alan kalıyordu (kullanıcı,
   * 10.08: *"ekranın canına okuyor"*). Sabit boy hem kırpmayı öngörülebilir tutar hem panelin
   * yüksekliğini formunkine yaklaştırır — akışkan görsel, sütunlu bir dizilimde daima en uzun
   * sütunu üretir.
   *
   * Bu modda kutu KARE ve kaynak da kare — kırpma sapması yok, `Thumbnail` yetiyor. Odak/zoom
   * yalnız bandın işi (aşağıda).
   */
  size?: number;
  /**
   * **Dikey biçim** (öneri kartı) — görsel bandı üstte, ad altında. `size` yok sayılır.
   *
   * Akışkan görsel bir tur kaldırılmıştı ve gerekçesi doğruydu: DİYALOĞUN geniş sütununda 4:3 bir
   * fotoğraf 400 pikseli aşıyordu. Kartta durum tersine dönüyor — sütun dar ve SABİT, üstelik bandın
   * boyu artık orandan değil `MEDIA_H`den geliyor. Aynı bileşenin iki yerleşimi var çünkü iki kabın
   * ölçüsü farklı; ikinci bir kart bileşeni yazmak aynı veriyi iki dilde çizmek olurdu.
   */
  fluid?: boolean;
  /**
   * **Konunun ÇOĞUL görselleri** — paket gibi birden çok kalemden oluşan konularda. Doluysa bant tek
   * fotoğraf yerine kalem destesini çizer (`fluid` şart; künye boyunda yeri yok).
   */
  images?: SubjectImage[];
}

/**
 * GÖRSEL BANDININ STANDART YÜKSEKLİĞİ — her kartta aynı (kullanıcı kararı 10.08).
 *
 * *"Resim bölümüne bir yükseklik standardımız olsun; fırsat için de geçerli, paket için de. Onun
 * hemen altında fiyatla alakalı kısım olsun."*
 *
 * Önce oran vardı (16:9) ve oran KARTIN GENİŞLİĞİNE bağlıdır: aynı ızgarada 288 piksellik bir kartın
 * bandı 137, 320 piksellik bir kartınki 152 piksel oluyordu — üstelik tek fotoğraflı fırsat ile
 * kareli paket birbirini hiç tutmuyordu. Sabit yükseklik ikisini de tek hizaya getiriyor: fiyat
 * satırı bütün kartlarda aynı yükseklikte başlıyor ve göz ızgarayı satır satır değil sütun sütun
 * tarayabiliyor — ızgaranın tek gerekçesi zaten o.
 *
 * 7 → 8rem: bant bir tur 112 pikseldi ve kullanıcı ölçtü — *"yüksekliği biraz artıralım"*. Fotoğrafın
 * ürünü tanıtabilmesi için gereken asgari boy bu; 112'de kek ile turta ayırt edilemiyordu.
 */
export const MEDIA_H = 'h-32';

/**
 * Destede gösterilen kalem sayısı — üç.
 *
 * Sınır matematikten geliyor, tercihten değil: kart iç genişliği 1280 piksellik ekranda 244 piksel
 * ve kareler bandın yüksekliğinde (128). Üç kare ancak 72 piksellik binmeyle sığıyor (128+56+56=240);
 * dördüncüsü taşardı. Kırpılan kalem sayısı KAYBOLMUYOR — künyedeki "İçerik 4 kalem · 4 ad." satırı
 * gerçek sayıyı söylüyor, o yüzden ayrıca bir "+N" rozeti çizilmiyor: aynı bilgiyi iki kez göstermek
 * desteden bir fotoğraf çalardı.
 */
const STACK_TILES = 3;

/** Destede sonraki karenin öncekinin üstüne binme payı. `128 − 72 = 56` piksel görünür kalır. */
const STACK_OVERLAP = '-ml-[4.5rem]';

/**
 * DESTE KARESİNİN ÇERÇEVESİ — çizgi + gölge, yani bir KART (kullanıcı kararı 10.08).
 *
 * ── ÇERÇEVE YALNIZ DESTEDE ──────────────────────────────────────────────────
 * *"Tek resim varsa çerçeve olmasın; birden fazla resim varsa çerçeve koyalım ve bu çerçevede stilli
 * bir şey olsun, bir kart efekti."* Ayrım doğru: tek fotoğrafın çerçeveye ihtiyacı yok, zaten kendisi
 * bandın tamamı — çevresine çizgi çekmek onu bir kutuya hapsetmek olurdu. Destede ise çerçevenin işi
 * süs değil AYIRMAK: kareler üst üste biniyor ve sınır yoksa nerede bitip nerede başladıkları
 * okunmuyor.
 *
 * ── BEYAZ HALKA DEĞİL, GRİ ÇİZGİ ────────────────────────────────────────────
 * Deste ilk turda avatar yığınının klasik çözümünü kullanıyordu: beyaz kenarlık. O desen renkli
 * avatarlarda çalışır; burada çalışmadı ve sebebi ürün fotoğraflarının kendisi — hepsi BEYAZ ZEMİNLİ
 * stüdyo çekimi. Beyaz kenarlık beyaz zemine karışınca üç ayrı börek tek bir fotoğraf gibi göründü
 * (*"bu resimlerin sınırları belli değil, o yüzden kötü görünüyorlar"*).
 *
 * ── GÖLGE: DESTE OLDUĞUNU GÖLGE SÖYLER ──────────────────────────────────────
 * Üstteki kare alttakine gölge düşürüyor; üst üste binmenin yönü ("sağdaki soldakinin üstünde")
 * ancak böyle görünür hâle geliyor — çizgi tek başına iki komşu kareyi de aynı düzlemde gösterirdi.
 * Eğim (dönmüş kartlar) denenmedi ve bilinçli: bant yüksekliği tüm kartlarda standart, dönen bir
 * kare o standardı taşırır.
 */
const TILE_EDGE = 'border border-ops-line-strong bg-ops-white shadow-sm';

export function SubjectCard({
  name,
  detail,
  imageUrl,
  href,
  crop = CROP_CENTER,
  size = 44,
  fluid = false,
  images,
}: SubjectCardProps) {
  // Büyük görselde ad SARILIR ve büyür; küçükte kırpılır. Eşik boyun kendisinden çıkıyor, ayrı bir
  // bayrak taşınmıyor — iki ayar aynı şeyin iki yüzü ve ayrı verilirse bir gün ayrışırlar.
  const wide = size >= 96;
  const body = (
    <>
      {/* ── BANT: KARE ÇERÇEVE, KIRPMA YOK (kullanıcı kararı 10.08) ────────────
          Bir tur bant tam genişlikti (1,9:1) ve fotoğraf `cover` ile oturuyordu; ölçüm neden
          çalışmadığını söyledi: **117 görselli ürünün SIFIRININ odağı ayarlanmış** — hepsi
          `x50 y50 zoom100`. Kart odağı doğru okuyor ama künye "merkez" diyor, yani kare bir fotoğraf
          basık banda merkezden oturuyor ve dikeyde %48'i kırpılıyor. Ürünün kendisi kesiliyordu.
          Kare çerçevede kırpma SIFIR: kaynak zaten kare. Paket destesinin kareleriyle de birebir
          aynı ölçü — iki tip tek görsel dili konuşuyor. Odaklar ileride ayarlanırsa kayıp olmaz;
          `crop` yine uygulanıyor, kare içinde odak/zoom aynen çalışır.
          Yükseklik `MEDIA_H`den, genişlik orandan: bant tek yerde tanımlı, iki dal onu paylaşıyor. */}
      {fluid ? (
        <span className={`flex ${MEDIA_H} items-stretch justify-center`}>
          {images && images.length > 0 ? (
            <SubjectStack images={images} name={name} />
          ) : (
            <FramedImage
              src={imageUrl}
              alt={name}
              ratio={RATIO_SQUARE}
              crop={crop}
              // Tek fotoğrafta çerçeve YOK: bandın tamamı zaten o, çevresine çizgi çekmek onu
              // gereksiz bir kutuya hapsederdi (kullanıcı kararı 10.08).
              placeholder={<ImageIcon size={28} />}
              className="h-full flex-none"
            />
          )}
        </span>
      ) : (
        <Thumbnail src={imageUrl} alt={name} size={size} />
      )}
      {/* ── AD SOLDA, AYIRT EDİCİ EK SAĞDA (kullanıcı kararı 10.08) ─────────────
          *"Bu gramaj mevzusu silik olabilir… veya başlık sol tarafa, gramaj gibi alt bilgiler sağ
          tarafa yaslanabilir."* İkincisi seçildi çünkü bir satır kazandırıyor: alt satırdaki `90g`
          kartta tam bir satır yer tutuyor ve taşıdığı bilgi tek kelime. Bir tur ada parantezle
          eklenmişti (`Artisan Mango Cake (90g)`) — o da adın kendisini uzatıp iki satıra düşürüyordu.
          Sağa yaslı ve sönük: okunur ama adın önüne geçmez.
          Sarma serbest (`flex-wrap`) — uzun ad + uzun ek dar kartta alt satıra iner, kırpılmaz. */}
      <span
        className={
          fluid
            ? 'flex min-w-0 flex-wrap items-baseline justify-between gap-x-2.5 gap-y-0.5'
            : 'flex min-w-0 flex-col gap-0.5'
        }
      >
        <span
          className={`font-ops-display font-semibold text-ops-ink ${wide ? 'text-ops-lead leading-snug' : fluid ? 'min-w-0 text-ops-base leading-snug' : 'truncate text-ops-base'}`}
        >
          {name}
        </span>
        {detail ? (
          <span
            className={`font-ops-body text-ops-muted ${fluid ? 'flex-none text-ops-xs' : 'truncate text-ops-sm'}`}
          >
            {detail}
          </span>
        ) : null}
      </span>
    </>
  );

  const shell = fluid ? 'flex flex-col gap-1.5' : wide ? 'flex items-start gap-3.5' : 'flex items-center gap-3';

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

/**
 * KALEM DESTESİ — paketin taslak evresindeki tek görsel yüzü.
 *
 * ── ÜST ÜSTE BİNEN DESTE (kullanıcı kararı 10.08) ───────────────────────────
 * *"Paket kartlarında resimler hafiften üst üste binsin; yan yana olması şart değil, sağdaki
 * soldakinin biraz üstüne. Bu klasik bir tasarım zaten."* Doğru okuma: dar bir kartta yan yana
 * dizilen kareler ya küçülür ya taşar — deste ikisini de çözer, çünkü örtüşen kısım yer tutmaz.
 * Kazanılan yerle kareler bandın TAMAMINI dolduruyor (128 px), yani fotoğraf gerçekten tanıtıyor.
 *
 * Sağdaki üstte: DOM sırası yeterli, `z-index` gerekmez — aynı yığın bağlamında sonraki eleman
 * üste boyanır. Kareleri birbirinden `TILE_EDGE` ayırıyor; onsuz beyaz zeminli fotoğraflar tek bir
 * lekeye dönüşüyor.
 *
 * ── HER KALEM KENDİ ODAĞIYLA ────────────────────────────────────────────────
 * Kırpma karenin kendi künyesinden (`crop`), ortak bir merkez değil: paket kalemleri farklı
 * fotoğraflardır ve merkezden kesmek dikey çekilmiş olanın ürününü bandın dışında bırakırdı.
 * Oran `RATIO_SQUARE` — "paket içeriği" için proje zaten kareyi tanımlamış (`image.schema`).
 */
function SubjectStack({ images, name }: { images: SubjectImage[]; name: string }) {
  return (
    <>
      {images.slice(0, STACK_TILES).map((image, i) => (
        <FramedImage
          key={image.url}
          src={image.url}
          alt={`${name} · ${i + 1}. kalem`}
          ratio={RATIO_SQUARE}
          crop={image.crop}
          placeholder={<ImageIcon size={20} />}
          className={`h-full flex-none ${TILE_EDGE} ${i > 0 ? STACK_OVERLAP : ''}`}
        />
      ))}
    </>
  );
}
