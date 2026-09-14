import { readFileSync } from 'node:fs';
import path from 'node:path';

import { sourceFiles } from './source-files';

/*
  KLAVYE KORUMASININ BEKÇİSİ (21.57'nin ikinci yarısı, 27.08).

  ── KURAL ───────────────────────────────────────────────────────────────────
  **Girdisi olan bir kaydırıcı HAM olamaz.** İçinde metin alanı bulunan `ScrollView`, klavye
  korumasını taşıyan kaba sarılmalıdır (`FormScroll`) — ya da alan bir `BottomSheet` içinde
  yaşamalıdır (çekmece aynı korumayı 08.08'den beri kendisi taşıyor).

  Kural "ham `ScrollView` yasak" DEĞİL ve bu ayrım kabın kendi tasarım kararından geliyor
  (`form-scroll.tsx` künyesi): *"Kaydırıcısı olan ama klavyesi açılmayan ekranlar (vitrin, ürün,
  sipariş detayı…) sarılMAZ: klavye kaçınması olmayan bir yerde bedava değildir."* Depoda otuzdan
  fazla ham kaydırıcı var ve çoğu HAKLI. Ölçüt kaydırıcının varlığı değil, İÇİNDEKİ girdi.

  ── NEDEN MAKİNEYE VERİLDİ ──────────────────────────────────────────────────
  Korumanın iki yarısı var ve ikisi de klavye açıkken doğar: alan klavyenin altında kalmasın
  (`KeyboardAvoidingView` — MB-02) ve klavye açıkken düğmeye ilk dokunuş yutulmasın
  (`keyboardShouldPersistTaps` — MB-01). `(21.33)` ikinci yarıyı on ekrana TEK TEK yazmıştı;
  `(21.57)` yedi ekranı kaba geçirdi. Ama ikisi de o günkü ekran listesine bakan turlardı — kural
  makinede olmadığı için SONRADAN eklenen bir alan sessizce korumasız doğabiliyor. Nitekim doğdu:
  21.57 (11.08) *"müşteri yüzeyinde girdili ham kaydırıcı YOK"* diye ölçmüştü; checkout'un
  iletişim bölümü 15.08'de eklendi ve ekranın ham kaydırıcısının içine düştü. Kimse hata yapmadı —
  ölçüm doğruydu, sadece bir kereye mahsustu.

  ── BEKÇİ NEYİ ÖLÇER, NEYİ ÖLÇMEZ ───────────────────────────────────────────
  Ölçer: JSX ağacında `<ScrollView>` açılışı ile dengeli kapanışı ARASINDA bir girdi bileşeni var
  mı. Ölçmez: çalışma anındaki davranış (klavyenin gerçekten alanı ittiği) — o cihazda ölçülür ve
  `form-scroll.tsx` künyesinde ölçülmüş hâlde duruyor. Bu dosya yalnız KALIBIN korunduğunu söyler.

  Generic tip parametresi açılış etiketi DEĞİLDİR: `useRef<ScrollView>(null)` her sohbet ekranında
  geçiyor ve saf metin taraması onu açılış sanıp dosyanın kalanını "kaydırıcının içi" ilan ediyordu
  (ilk taramada ölçüldü: 3 yanlış aday, ikisi mesaj çubuğu kalıbındaki sohbet ekranlarıydı — orada
  alan kaydırıcının KARDEŞİ, içinde değil).

  Ayraç: **`<` HEMEN, boşluksuz bir tanımlayıcıdan sonra geliyorsa** o bir tip parametresidir
  (`useRef<ScrollView>`); JSX açılışından önce daima bir boşluk ya da ayraç durur
  (`return <ScrollView>`, `<View><ScrollView>`). Ayraç ilk yazılışında boşluğa da izin veriyordu
  (`[A-Za-z0-9_$]\s*$`) ve o hâlde `return <ScrollView>` de tip parametresi sanılıyordu — yani
  bekçi gerçek ihlalleri GÖRMEDEN yeşil kalırdı. Kitin testindeki öz-test tam bunu yakaladı.

  ── MANTIK KİTTE, TARAMA KÖK BAŞINA (21.310) ─────────────────────────────────
  Uygulama ikiye bölününce bekçinin iki uygulamada da koşması gerekti; kopyası iki kuralın zamanla
  ayrışması demekti. Her uygulama kendi kaynağını `describeKeyboardScrollGuard` ile tarar, kit kendi
  kaynağını ve kaplarını kendi testinde. Tek uygulama varken kit ve uygulama tek dosyada taranıyordu;
  bölünmeden sonra operasyon ekranları bir tur bu bekçinin dışında kaldı ve bu dosya o boşluğu kapattı.
*/

/** Metin alanı olan bileşenler — RN'in kendi girdisi + kitin sarmalayıcıları. */
export const INPUT_TAGS = ['TextInput', 'TextField', 'CodeField'];

/**
 * Korumayı KENDİSİ taşıyan kitin kapları — bunları kullanan ekran muaftır.
 *
 * Üçü de aynı iki yarıyı veriyor (kaçınma + `keyboardShouldPersistTaps`), farkları YERLEŞİM:
 * çekmece · tam ekran form · yazışma (liste + yapışkan çubuk). Ekranların bu üçünün dışında bir
 * kalıba ihtiyacı olursa doğru cevap dördüncü bir KAP yazmaktır, korumayı ekrana kopyalamak değil
 * — üçü de zaten bir kopyalamanın toplanmasıyla doğdu (`chat-layout.tsx` künyesi, 27.08).
 */
export const SAFE_CONTAINERS = ['FormScroll', 'BottomSheet', 'ChatLayout'];

/**
 * JSX açılışlarının konumu. Generic tip parametresi (`useRef<ScrollView>`) ELENİR — ondan önce
 * daima bir tanımlayıcı karakteri gelir, JSX açılışından önce ise gelmez (satır başı, `(`, `{`…).
 */
export function openingsOf(source: string, tag: string): number[] {
  const pattern = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
  const hits: number[] = [];
  for (const match of source.matchAll(pattern)) {
    const before = source.slice(Math.max(0, match.index - 24), match.index);
    if (/[A-Za-z0-9_$]$/.test(before)) continue;
    hits.push(match.index);
  }
  return hits;
}

/** Açılıştan dengeli kapanışa kadar olan gövde; kendi kendine kapanan etikette boş. */
export function bodyOf(source: string, tag: string, start: number): string {
  const headEnd = source.indexOf('>', start);
  if (source[headEnd - 1] === '/') return '';
  const scanner = new RegExp(`<${tag}(?=[\\s/>])|</${tag}>`, 'g');
  scanner.lastIndex = headEnd + 1;
  let depth = 1;
  for (const match of source.slice(0).matchAll(scanner)) {
    if (match.index < headEnd) continue;
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return source.slice(headEnd + 1, match.index);
    } else if (!/[A-Za-z0-9_$]$/.test(source.slice(Math.max(0, match.index - 24), match.index))) {
      depth += 1;
    }
  }
  return source.slice(headEnd + 1);
}

/** `dosya:satır` — ihlalin adresi; künye değil ADRES verilir ki okuyan doğrudan gitsin. */
export function scrollInputViolations(root: string): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, 'utf8');
    for (const start of openingsOf(source, 'ScrollView')) {
      const body = bodyOf(source, 'ScrollView', start);
      const inputs = INPUT_TAGS.filter((tag) => openingsOf(body, tag).length > 0);
      if (inputs.length === 0) continue;
      const line = source.slice(0, start).split('\n').length;
      found.push(`${path.relative(root, file)}:${line} → ${inputs.join(', ')}`);
    }
  }
  return found;
}

/**
 * İKİNCİ KALIP: yazışma ekranı — kaydırıcı mesaj listesi, alan onun KARDEŞİ (yapışkan çubuk).
 *
 * Birinci kural burayı görmez ve görmemeli: alan kaydırıcının içinde değil. Ama arıza aynı —
 * çubuk klavyenin altında kalır. Çözüm de aynı korumadır, başka kapta: `KeyboardAvoidingView`
 * kökü sarar (`support/ticket-detail-screen` künyesi, iki cihazda ölçüldü 16.08).
 *
 * Ölçüt: dosyada hem kaydırıcı hem girdi var, girdi kaydırıcının DIŞINDA → kaçınma kabı ya da
 * çekmece bulunmalı. Çekmece muaf çünkü korumayı 08.08'den beri kendisi taşıyor.
 */
export function stickyComposerViolations(root: string): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, 'utf8');
    if (openingsOf(source, 'ScrollView').length === 0) continue;
    const inputs = INPUT_TAGS.filter((tag) => openingsOf(source, tag).length > 0);
    if (inputs.length === 0) continue;
    // İçeride olanlar birinci kuralın işi; burada YALNIZ dışarıda kalan alanlar konuşuyor.
    const insideAny = openingsOf(source, 'ScrollView').some((start) =>
      INPUT_TAGS.some((tag) => openingsOf(bodyOf(source, 'ScrollView', start), tag).length > 0),
    );
    if (insideAny) continue;
    const guarded = ['KeyboardAvoidingView', ...SAFE_CONTAINERS].some((tag) => openingsOf(source, tag).length > 0);
    if (guarded) continue;
    found.push(`${path.relative(root, file)} → ${inputs.join(', ')} (yapışkan çubuk, kaçınma yok)`);
  }
  return found;
}

/**
 * KAÇINMA YALNIZ KAPLARDA: bir ekran elle `KeyboardAvoidingView` yazıyorsa kalıbı yeniden kuruyordur ve
 * bu, üç kapla kapatılan tekrarın geri gelmesi demektir (27.08'de üç ekran birden böyleydi). Kural "yasak"
 * değil "kapta" — dördüncü bir yerleşim gerekiyorsa dördüncü bir KAP yazılır. Muaf yer her kökün
 * `components/ui/` klasörüdür.
 */
export function rogueKeyboardAvoiders(root: string): string[] {
  return sourceFiles(root)
    .map((file) => path.relative(root, file))
    .filter((relative) => !relative.startsWith(`components${path.sep}ui${path.sep}`))
    .filter((relative) => openingsOf(readFileSync(path.join(root, relative), 'utf8'), 'KeyboardAvoidingView').length > 0);
}

/** Bir kökün (uygulamanın ya da kitin kaynağı) üç kuralı; kapların kendisi kitin testinde sınanır. */
export function describeKeyboardScrollGuard(root: string): void {
  describe('klavye koruması — girdisi olan kaydırıcı ham olamaz', () => {
    it('hiçbir ham `ScrollView` metin alanı taşımaz', () => {
      expect(scrollInputViolations(root)).toEqual([]);
    });

    it('yapışkan yazma çubuğu olan her ekranda kaçınma kabı var', () => {
      expect(stickyComposerViolations(root)).toEqual([]);
    });

    it('hiçbir EKRAN kaçınmayı elle kurmaz — kalıp kitin kaplarında', () => {
      expect(rogueKeyboardAvoiders(root)).toEqual([]);
    });
  });
}
