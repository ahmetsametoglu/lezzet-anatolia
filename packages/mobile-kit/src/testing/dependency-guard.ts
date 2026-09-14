import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

/*
  KİT BAĞIMLILIKLARI UYGULAMANIN KOPYASINA MI BAĞLI (21.310) — her native uygulama bu bekçiyi
  kendi testinden çağırır; mantık burada TEK yerde.

  `@lezzet/mobile-kit` kendi `node_modules`unu taşır (pnpm çalışma alanı paketi). Bir kit dosyası
  `react-native-unistyles`i önce KENDİ klasöründen çözer; o bağ uygulamanınkinden başka bir depo
  klasörünü gösterirse Metro İKİ kopya paketler: tema kaydı birinde durur, kit bileşeninin stili
  ötekinden okunur. Jest'te de aynısı olur (iki `react-native` kopyası). Hiçbiri derlemede hata
  vermez.

  ── NİÇİN BİR TEST (ölçüldü 14.09) ─────────────────────────────────────────
  Kit ilk kurulduğunda `expo-constants` uygulamada `~57.0.9` aralığıyla 57.0.9'a kilitliydi. Kitin
  AYNI aralığı yeni bir içe aktarıcı olarak en yükseğe (57.0.14) çözüldü ve pnpm uygulamanın Expo
  CLI kopyasını da o bağlama taşıdı. Belirti yalnız kilit dosyasının farkındaydı. Yazılı aralık aynı
  olsa bile sürüm ayrışabiliyor; bu yüzden karşılaştırılan şey aralık değil, BAĞIN GİTTİĞİ YER.
*/

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const KIT_ROOT = join(__dirname, '..', '..');

function manifestOf(root: string): Manifest {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Manifest;
}

/** `appRoot`: uygulamanın `package.json`ının klasörü. Kit uygulamayı import etmez, yolunu alır. */
export function describeKitDependencyGuard(appRoot: string): void {
  const app = manifestOf(appRoot);
  const kit = manifestOf(KIT_ROOT);
  const appDeps = new Set(Object.keys({ ...app.dependencies, ...app.devDependencies }));
  const shared = Object.keys({ ...kit.dependencies, ...kit.devDependencies }).filter((dep) => appDeps.has(dep));

  describe('kit bağımlılıkları uygulamanın kopyasına bağlı', () => {
    it('karşılaştırılacak ortak bağımlılık var (boş liste bekçiyi susturmasın)', () => {
      expect(shared.length).toBeGreaterThan(0);
    });

    it.each(shared)('%s', (dep) => {
      const fromApp = realpathSync(join(appRoot, 'node_modules', dep));
      const fromKit = realpathSync(join(KIT_ROOT, 'node_modules', dep));
      expect(fromKit).toBe(fromApp);
    });
  });
}
