import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

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
  bekçi gerçek ihlalleri GÖRMEDEN yeşil kalırdı. Aşağıdaki öz-test tam bunu yakaladı.
*/

const screensRoot = path.resolve(__dirname, '..');

/** Metin alanı olan bileşenler — RN'in kendi girdisi + kitin sarmalayıcıları. */
const INPUT_TAGS = ['TextInput', 'TextField', 'CodeField'];

/**
 * Korumayı KENDİSİ taşıyan kitin kapları — bunları kullanan ekran muaftır.
 *
 * Üçü de aynı iki yarıyı veriyor (kaçınma + `keyboardShouldPersistTaps`), farkları YERLEŞİM:
 * çekmece · tam ekran form · yazışma (liste + yapışkan çubuk). Ekranların bu üçünün dışında bir
 * kalıba ihtiyacı olursa doğru cevap dördüncü bir KAP yazmaktır, korumayı ekrana kopyalamak değil
 * — üçü de zaten bir kopyalamanın toplanmasıyla doğdu (`chat-layout.tsx` künyesi, 27.08).
 */
const SAFE_CONTAINERS = ['FormScroll', 'BottomSheet', 'ChatLayout'];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') out.push(...sourceFiles(full));
    } else if (full.endsWith('.tsx') && !full.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * JSX açılışlarının konumu. Generic tip parametresi (`useRef<ScrollView>`) ELENİR — ondan önce
 * daima bir tanımlayıcı karakteri gelir, JSX açılışından önce ise gelmez (satır başı, `(`, `{`…).
 */
function openingsOf(source: string, tag: string): number[] {
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
function bodyOf(source: string, tag: string, start: number): string {
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
function violations(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(screensRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const start of openingsOf(source, 'ScrollView')) {
      const body = bodyOf(source, 'ScrollView', start);
      const inputs = INPUT_TAGS.filter((tag) => openingsOf(body, tag).length > 0);
      if (inputs.length === 0) continue;
      const line = source.slice(0, start).split('\n').length;
      found.push(`${path.relative(screensRoot, file)}:${line} → ${inputs.join(', ')}`);
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
function stickyComposerViolations(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(screensRoot)) {
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
    found.push(`${path.relative(screensRoot, file)} → ${inputs.join(', ')} (yapışkan çubuk, kaçınma yok)`);
  }
  return found;
}

describe('klavye koruması — girdisi olan kaydırıcı ham olamaz', () => {
  it('hiçbir ham `ScrollView` metin alanı taşımaz', () => {
    expect(violations()).toEqual([]);
  });

  it('yapışkan yazma çubuğu olan her ekranda kaçınma kabı var', () => {
    expect(stickyComposerViolations()).toEqual([]);
  });

  /* BEKÇİNİN KENDİSİ DE ÖLÇÜLÜR: ilk yazılışında generic tip parametresini açılış sanıyordu ve
     iki sohbet ekranını yanlışlıkla suçluyordu. Ayraç bozulursa bekçi ya yalancı kırmızı üretir
     ya da (ters yönde bozulursa) gerçek ihlali görmez — ikisi de sessiz olurdu. */
  it('generic tip parametresini AÇILIŞ sanmaz', () => {
    const source = 'const ref = useRef<ScrollView>(null);\nreturn <ScrollView><TextField /></ScrollView>;';
    expect(openingsOf(source, 'ScrollView')).toHaveLength(1);
    expect(bodyOf(source, 'ScrollView', openingsOf(source, 'ScrollView')[0]!)).toContain('<TextField');
  });

  it('korumalı kapların ÜÇÜ de klavye açıkken ilk dokunuşu korur', () => {
    // Kap adları kuralın kendisinin parçası; biri yeniden adlandırılırsa burası hatırlatır.
    expect(SAFE_CONTAINERS).toEqual(['FormScroll', 'BottomSheet', 'ChatLayout']);
    /* Korumanın İKİNCİ yarısı (MB-01) üçünde de yazılı olmalı: kaçınma alanı klavyenin üstüne
       taşır ama düğmeye ilk dokunuş yine yutulabilir — biri olmadan öteki yarım kalır. */
    for (const file of ['form-scroll.tsx', 'chat-layout.tsx']) {
      expect(readFileSync(path.join(screensRoot, 'components/ui', file), 'utf8')).toContain(
        'keyboardShouldPersistTaps="handled"',
      );
    }
    /* ÇEKMECEDE KAÇINMA ARTIK KÜTÜPHANENİN (01.09): gövde `@gorhom/bottom-sheet`e geçti ve
       `KeyboardAvoidingView` yerine `keyboardBehavior` + `android_keyboardInputMode` kullanıyor —
       kaçınmayı panelin kendi konumundan yürütüyor. Ölçülen şey değişmedi, ADI değişti: kapta
       klavye koruması YAZILI olmalı. */
    expect(readFileSync(path.join(screensRoot, 'components/ui/bottom-sheet.tsx'), 'utf8')).toContain(
      'keyboardBehavior',
    );
  });

  /* KAÇINMA ARTIK YALNIZ KİTTE: bir ekran elle `KeyboardAvoidingView` yazıyorsa kalıbı yeniden
     kuruyordur ve bu, üç kapla kapatılan tekrarın geri gelmesi demektir (27.08'de üç ekran birden
     böyleydi). Kural "yasak" değil "kitte" — dördüncü bir yerleşim gerekiyorsa dördüncü bir KAP
     yazılır, koruma ekrana kopyalanmaz. */
  it('hiçbir EKRAN kaçınmayı elle kurmaz — kalıp kitin kaplarında', () => {
    const rogue = sourceFiles(screensRoot)
      .filter((file) => !path.relative(screensRoot, file).startsWith('components/ui/'))
      .filter((file) => openingsOf(readFileSync(file, 'utf8'), 'KeyboardAvoidingView').length > 0)
      .map((file) => path.relative(screensRoot, file));
    expect(rogue).toEqual([]);
  });
});
