-- Bölge haberi — "buraya gelince haber verin" kaydı (K34'ün üçüncü çıkışı).
--
-- **Bu bir SÖZ DEĞİL, bir KAYITTIR.** Ekran "haber göndeririz" demez, "not aldık" der: bölge
-- genişletme kararı verilmemiş, tetikleyici de yazılmamıştır. Sözü tutamayacakken vermek, müşteriyi
-- bekletip sonra hiç aramamak olurdu. Tetikleyici geldiğinde (bölge kaydedilince kontrol) elimizde
-- gerçek bir liste bulunur — kaydı bugünden almanın tek sebebi bu.
--
-- İşletme tarafındaki değeri `postal_code_demand`'den FARKLI: orada anonim bir sayaç var ("bu koddan
-- N kişi sordu"), burada iletişime izin vermiş somut kişiler. İkisi ayrı sorulara cevap verir ve
-- birleştirilemez — sayacın kimliği yoktur, olması da istenmez (0029).

create table public.zone_notice (
  id uuid primary key default gen_random_uuid(),
  -- Normalize edilmiş posta kodu; hangi bölgenin açılması bekleniyor.
  postal_code text not null,
  -- İletişim adresi. Ziyaretçi de kayıt bırakabilir — hesap ZORUNLU DEĞİL: "haber ver"in önüne
  -- giriş duvarı koymak, tam da vazgeçmeye en yakın anda ikinci bir engel çıkarmaktır.
  email text not null,
  -- Girişli müşteride kim olduğu; ziyaretçide null. Hesap sayfası kendi kayıtlarını bununla bulur.
  customer_id uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Haber gönderildiğinde damgalanır. **Tek hatırlatma** sözü (tasarım) bu alanla tutulur: dolu
  -- olan satıra ikinci kez yazılmaz.
  notified_at timestamptz
);

alter table public.zone_notice enable row level security;

-- Aynı kişi aynı kod için iki kez kayıt bırakmasın — düğmeye ikinci kez basmak yeni bir bekleyiş
-- değil, aynı bekleyişin tekrarıdır.
create unique index zone_notice_unique_idx on public.zone_notice (postal_code, lower(email));

-- Bölge açıldığında "bu koda bekleyen var mı" sorgusu: henüz haber verilmemişler.
create index zone_notice_pending_idx on public.zone_notice (postal_code) where notified_at is null;
