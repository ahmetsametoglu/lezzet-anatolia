/*
  TAKILI KÂĞIT — MODELİN RULO SINIFINDAN (kullanıcı kararı 05.09).

  ── SORU NEDEN VAR ──────────────────────────────────────────────────────────
  Yazıcıya hangi kâğıdın takılı olduğu SDK'dan OKUNAMIYOR (23.5 ölçümü) ve yanlış boy basım anında
  `SetLabelSizeError` ile reddediliyor. Envanter bu yüzden `label_size` taşıyor: doğruyu söylemek o
  satırın işi. Telefondan tanıtmada ise soracak kimse yok — depocu ağda gördüğü yazıcıya dokunuyor,
  elinde bir kâğıt listesi yok.

  ── ÜÇ SEÇENEKTEN BİRİ SEÇİLDİ ──────────────────────────────────────────────
  Kullanıcıya üç yol sunuldu (05.09): tanıtırken iğne deneyiyle ÖLÇMEK (bir etiket harcar, üç şeyi
  birden kanıtlar), MODELDEN VARSAYMAK, ya da tanıtırken SORMAK. Seçilen ikincisi: kâğıt harcamayan,
  anlık tanıtma. Bedeli açık ve kabul edildi — varsayım yanlışsa arıza kurulumda değil ilk gerçek
  basımda görünür; ekranın "test bas" düğmesi bunu erken yakalamak için orada duruyor.

  ── KURAL MODELE BAKAR, İŞE DEĞİL ───────────────────────────────────────────
  Bir yazıcıda bir rulo vardır; hangi işe baktığı takılı kâğıdı değiştirmez. Bu yüzden eşleme
  `purpose` almıyor — kutu etiketi için tanıtılan QL-820 de 62 mm taşır, kargo için tanıtılan da.
  Modelin sabitlediği şey RULO GENİŞLİĞİ; hangi kâğıdın o genişlikte takılı olduğu bir varsayımdır
  ve varsayılan olarak kullanıcının 06.09'da doğruladığı kurulum seçiliyor: iki yazıcıda da SÜREKLİ
  RULO (103 mm ve 62 mm). Kalıp kesim hiç varsayılmıyor — boyu sabit bir kâğıda, boyu bize ait
  olmayan bir etiket basılamaz.

  ── TANINMAYAN MODEL REDDEDİLİR ─────────────────────────────────────────────
  Listede olmayan bir modele "herhalde şudur" demek, basımı sessizce hataya göndermektir. `null`
  dönüyor ve çağıran uç `unsupported_model` diyor — Depolar ekranından elle, boyu seçilerek
  tanıtılabilir. Ölçemediğimizi söylemek, yanlış ölçmekten iyidir (CLAUDE §1).
*/

/**
 * Modelin rulo sınıfı → o sınıfta bizim kullandığımız kâğıt.
 *
 * Anahtar bir ÖNEK, çünkü Brother'ın model adları sınıfı öneklerinde taşıyor (QL-1110NWB /
 * QL-1115NWB aynı 102 mm sınıfı; QL-820NWB / QL-810W / QL-800 aynı 62 mm sınıfı). Tam ad listesi
 * her yeni modelde bakım isterdi ve sınıf zaten önekte duruyor.
 */
const ROLL_CLASS: ReadonlyArray<{ prefix: string; labelSize: string }> = [
  /*
    102/103 mm sınıfı — SÜREKLİ RULO (kullanıcı kararı 06.09).

    Bu satır önce `DieCutW103H164` (4×6 kalıp kesim) diyordu ve o, geniş yazıcının BİZİM kutu
    etiketimizi bastığı varsayımından geliyordu. Kullanıcı iş bölüşümünü düzeltti: taşıyıcının
    etiketi A6 YATAY (148×105 mm) ve 105 mm'lik kenar ancak 102/103 mm ruloya sığar — yani kargo
    etiketi GENİŞ yazıcıdan çıkar. Kalıp kesim ise boyu SABİT bir kâğıttır (103×164); dışarıdan
    gelen, boyu bize ait olmayan bir etiketi ona basmak, kesimi etiketin ortasından geçirir.
    Sürekli ruloda her etiket kendi boyunda kesiliyor.
  */
  { prefix: 'QL-11', labelSize: 'RollW103' },
  /*
    62 mm sınıfı — sürekli rulo (DK-2205). QL-8xx · QL-7xx · QL-6xx aynı genişlik.

    Bizim kutu etiketimizin yeri burası: şablon 103×164 çiziliyor ama 62 mm'ye SDK ölçeklemesiyle
    (~%60) okunur biçimde iniyor (`label-svg.ts` künyesi, 23.5'te ölçüldü). Tersi geçerli değil —
    A6 kargo etiketi 62 mm'ye indiğinde taşıyıcının barkodu okunmayabilir.
  */
  { prefix: 'QL-8', labelSize: 'RollW62' },
  { prefix: 'QL-7', labelSize: 'RollW62' },
  { prefix: 'QL-6', labelSize: 'RollW62' },
];

/**
 * **Bu modelde hangi kâğıt varsayılıyor** — bilinmiyorsa `null`.
 *
 * Model adı SDK'nın keşfinden geliyor (`BPChannel.modelName`, örn. `QL-820NWB`) ve orada büyük
 * harfli geliyor; yine de karşılaştırma büyük/küçük harf duyarsız — bir gün başka bir kaynaktan
 * gelirse kural sessizce düşmesin.
 */
export function defaultLabelSizeFor(model: string): string | null {
  const ad = model.trim().toUpperCase();
  return ROLL_CLASS.find((sinif) => ad.startsWith(sinif.prefix))?.labelSize ?? null;
}

/*
  KÂĞIDIN FİZİKSEL ÖLÇÜSÜ — ADINDAN OKUNUYOR (06.09).

  ── NEDEN GEREKTİ ───────────────────────────────────────────────────────────
  Kutu etiketinin şablonu 103 mm genişlikte sabit çiziliyordu ve 62 mm ruloya basılınca SDK onu
  %60'a indiriyordu. Ölçüldü: ürün satırları 4,7 mm tasarlanıp **2,9 mm** çıkıyordu — kullanıcının
  cümlesi *"ürünler okunmayacak kadar küçük çıktı"*. Çare şablonu hedef rulonun GENİŞLİĞİNDE
  çizmek; o da kâğıdın kaç milimetre olduğunu bilmeyi gerektiriyor.

  ── AD ZATEN ÖLÇÜYÜ TAŞIYOR ────────────────────────────────────────────────
  Brother'ın boy adları ölçülerini içinde yazıyor: `RollW62` = 62 mm sürekli, `DieCutW103H164` =
  103×164 mm kalıp kesim. İkinci bir sözlük tutmak (ad → ölçü tablosu) aynı bilgiyi iki yerde
  saklamak olurdu ve biri bir gün ötekinden ayrılırdı (CLAUDE §1).

  ── SÜREKLİ RULONUN YÜKSEKLİĞİ YOKTUR ──────────────────────────────────────
  `heightMm: null` "bilmiyorum" değil, **"boy serbest"** demektir: rulo istenen yerde kesiliyor,
  yani etiketin boyu İÇERİĞİN sorusu. Kalıp kesimde ise boy kâğıdın kendisinde sabit ve içerik
  ona sığmak zorunda.
*/

/** Kâğıdın milimetresi — sürekli ruloda `heightMm` `null`, yani boyu içerik belirler. */
export interface LabelSizeMm {
  widthMm: number;
  heightMm: number | null;
}

/** Bilinmeyen ad için `null` — uydurulmuş bir ölçü, yanlış boyda etiket demektir. */
export function labelSizeMm(name: string): LabelSizeMm | null {
  const dieCut = /^DieCutW(\d+)H(\d+)$/.exec(name.trim());
  if (dieCut) return { widthMm: Number(dieCut[1]), heightMm: Number(dieCut[2]) };

  const roll = /^RollW(\d+)$/.exec(name.trim());
  if (roll) return { widthMm: Number(roll[1]), heightMm: null };

  return null;
}
