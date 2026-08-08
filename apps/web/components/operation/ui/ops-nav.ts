import type { UserRole } from '@lezzet/types';
import type { NavIconName } from './icons';

/**
 * Operasyon gezinmesinin TEK modeli — ray da (`AdminSidebar`) hızlı geçiş paleti de (⌘K) buradan
 * okur.
 *
 * Ayrı bir dosyada durmasının sebebi somut: palet eklendiğinde model rayın içindeydi ve iki seçenek
 * vardı — ya paleti raya bağımlı kılmak (bir sunum komponentinden veri çekmek) ya da listeyi ikinci
 * kez yazmak. İkincisi bir gün "yeni ekran palette çıkmıyor" olarak yaşanırdı. Model artık veri,
 * ikisi de onu çiziyor.
 */
export interface NavItem {
  key: NavIconName;
  label: string;
  href: string;
  /**
   * Bu girişi GÖREN roller (`UserRole`). Boş bırakılmaz: her ekranın bir sahibi vardır.
   *
   * **Nav bir yetki kapısı DEĞİL, bir görgü kuralıdır** — asıl kapı sayfanın kendi guard'ı
   * (`requireAdmin` vb.) ve o kalkmıyor (`09.1` çift kat). Buradaki süzgecin işi başka: depocuya
   * Fiyatlar/Para/Tedarik bağlantısı göstermek, tıklayınca "bu ekran size kapalı" demekten ibaret
   * bir gezinme kurar — sistem her tıklamada kullanıcıya yetkisiz olduğunu hatırlatır. Görmediği
   * kapıyı çalmaz.
   */
  roles: readonly UserRole[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Rol kümeleri — aynı küme birden çok girişte tekrarlanmasın (biri değişince öteki eskirdi).
const ADMIN_ONLY = ['admin'] as const;
/** Para gözü: yönetici + muhasebe. Muhasebeci rolü henüz kimseye atanmıyor ama ekranın sahibi belli. */
const FINANCE = ['admin', 'accounting'] as const;
/** Malın kendisiyle çalışanlar — fiyat/kâr görmezler ama stok gerçeğini görürler. */
const STOCK_FLOOR = ['admin', 'warehouse'] as const;
/** Günün işi: kim ne götürüyor. */
const DAILY = ['admin', 'warehouse', 'courier'] as const;

// URL segmentleri İngilizce (web-conventions kuralı operasyon yüzeyinde de geçerli); etiketler Türkçe.
//
// Gruplama 02.08'de yeniden kuruldu (kullanıcı kararı): "Katalog" iki doğayı karıştırıyordu —
// Ürünler/Fiyatlar depo-üstü TANIM işleridir, Stok/Tedarik depo GERÇEĞİ (depo ekseni sözleşmesi §5).
// Yeni "Depo" grubu o gerçeği topluyor ve Depolar sayfasına ev veriyor. Adlar da düzeldi:
// "Rotalar" → "Teslimat & Rota" (sayfa günün çıkışlarıdır — rota + kargo; `admin-teslimat.md`),
// "Satın Alma" → "Tedarik" (sayfa dokümanının kendi adı; tedarikçi/kod eşlemesi de kapsamda).
// Sidebar .dc henüz eski kurguda — sapma bilinçli, tasarım tarafına bildirildi (09.2 Durum notu).
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Günlük',
    items: [
      // Panel HERKESE açık ve tek adres: rolüne göre farklı kuyruk gösterecek (09.3). Ayrı rota
      // açmak aynı soruyu ("bugün ne var") üç ekrana bölerdi.
      { key: 'panel', label: 'Panel', href: '/operations', roles: DAILY },
      { key: 'siparisler', label: 'Siparişler', href: '/operations/orders', roles: FINANCE },
      { key: 'rotalar', label: 'Teslimat & Rota', href: '/operations/deliveries', roles: DAILY },
    ],
  },
  {
    label: 'Katalog',
    items: [
      { key: 'urunler', label: 'Ürünler', href: '/operations/products', roles: ADMIN_ONLY },
      { key: 'fiyatlar', label: 'Fiyatlar', href: '/operations/prices', roles: ADMIN_ONLY },
      // Tarifler KATALOĞUN altında, kendi başlığında değil (tasarım `AdminSidebar active="tarifler"`):
      // tarif satılan bir şey değil, satılanı ANLATAN bir şey — ürünlerin komşusu olması bunu söylüyor.
      { key: 'tarifler', label: 'Tarifler', href: '/operations/recipes', roles: ADMIN_ONLY },
    ],
  },
  {
    label: 'Depo',
    items: [
      // Hazırlık grubun BAŞINDA: depocunun günü bu ekranda başlıyor (`design/pages/depo-hazirlik.md §5`),
      // stok sayfası ise günün içinde bakılan bir defter. Sıra kullanım sıklığını izliyor.
      { key: 'hazirlik', label: 'Hazırlık', href: '/operations/preparation', roles: STOCK_FLOOR },
      { key: 'stock', label: 'Stok', href: '/operations/stock', roles: STOCK_FLOOR },
      // Tedarik muhasebeye de açık: tedarikçi borcu ve vadesi onun da sorusu.
      { key: 'satinalma', label: 'Tedarik', href: '/operations/procurement', roles: FINANCE },
      { key: 'depolar', label: 'Depolar', href: '/operations/warehouses', roles: ADMIN_ONLY },
    ],
  },
  {
    label: 'Para & analiz',
    items: [
      { key: 'para', label: 'Para', href: '/operations/finance', roles: FINANCE },
      { key: 'raporlar', label: 'Raporlar', href: '/operations/reports', roles: FINANCE },
      { key: 'analitik', label: 'Analitik', href: '/operations/analytics', roles: ADMIN_ONLY },
    ],
  },
  {
    label: 'İlişki',
    items: [
      // `B2B Onay` BURADA DEĞİL (kullanıcı kararı 30.07): onay, profesyonel müşterinin bir hâlidir,
      // ayrı bir varlık değil. Ayrı satır aynı müşteriyi iki yerde yaşatıyordu ve onaydan sonra gelen
      // iş (vade/limit) zaten müşteri panelindeydi. Kontrol kartı o panelden açılan diyalog.
      { key: 'musteriler', label: 'Müşteriler', href: '/operations/customers', roles: FINANCE },
      { key: 'talepler', label: 'Talepler', href: '/operations/tickets', roles: ADMIN_ONLY },
      { key: 'geribildirim', label: 'Geri Bildirim', href: '/operations/feedback', roles: ADMIN_ONLY },
      // WhatsApp girişi KALDIRILDI (denetim O-Y3, 03.08): `/operations/whatsapp` rotası yok ve
      // modül 15'in tamamı henüz `[ ]` — yani giriş ekranından önce inmiş, tıklayan admin
      // not-found'a düşüyordu. Bu, yüzeyin kendi yazdığı ilkenin ihlaliydi: **var olmayan bir yere
      // giden düğme, olmayan bir yetenek vaat eder.** Girişi 15.5 (admin konuşma izleme) ekranıyla
      // BİRLİKTE geri koyun — ray, modülün ne zaman biteceğinin ilanı değil, bugün gidilebilecek
      // yerlerin listesidir.
    ],
  },
  {
    label: 'Sistem',
    items: [
      { key: 'ayarlar', label: 'Ayarlar', href: '/operations/settings', roles: ADMIN_ONLY },
      // Sistem sağlığı (18.5) — YALNIZ admin. Rayda durması zorunlu: kritik hatada e-posta/itme
      // bildirimi gönderilmiyor (`OBSERVABILITY §4.1`), yani bu ekran alarmın kendisi. Menüde
      // görünmeyen bir alarm, olmayan bir alarmdır.
      { key: 'sistem', label: 'Sistem', href: '/operations/system', roles: ADMIN_ONLY },
    ],
  },
];

/** Rolüne göre görünen bölümler — girişi kalmayan bölüm başlığıyla birlikte düşer. */
export function sectionsFor(roles: readonly UserRole[]): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.some((r) => roles.includes(r))),
  })).filter((section) => section.items.length > 0);
}

/** Panel kökü TAM eşleşir (aksi hâlde her yolu yakalar); diğerleri önek eşleşir. */
export function isActive(pathname: string, href: string): boolean {
  return href === '/operations' ? pathname === '/operations' : pathname.startsWith(href);
}

// Rol → Türkçe etiket (customer bu yüzeye giremez).
const ROLE_LABEL: Record<string, string> = {
  admin: 'Yönetici',
  warehouse: 'Depo',
  courier: 'Kurye',
  accounting: 'Muhasebe',
};

/**
 * Kullanıcı künyesinin rol satırı. Bir kişi birden çok rol taşıyabilir (depo + muhasebe) ve
 * **hepsi yazılır**: tek etiket göstermek, gezinmesinin neden o kadar geniş olduğunu gizlerdi.
 */
export function roleText(roles: readonly UserRole[]): string {
  const labels = roles.flatMap((r) => (ROLE_LABEL[r] ? [ROLE_LABEL[r]] : []));
  return labels.length > 0 ? labels.join(' · ') : 'Personel';
}
