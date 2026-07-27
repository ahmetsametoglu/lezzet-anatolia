-- Modül 06 — Sıcaklık kaydı (06.7). DOMAIN §4 / hijyen denetimi.
--
-- Hijyen denetiminin İLK istediği veri budur: dolabın/aracın sıcaklığı düzenli ölçülmüş mü.
-- Sensör entegrasyonu YOK — günde bir-iki elle giriş yeter. Basit tutulur ki gerçekten girilsin.

create table public.temperature_log (
  id uuid primary key default gen_random_uuid(),
  location text not null,                            -- dolap adı / araç plakası
  temperature_c numeric(4, 1) not null,              -- −18.5 gibi; donukta negatif normaldir
  recorded_by uuid,                                  -- FK yok: personel kimliği auth şemasında
  recorded_at timestamptz not null default now()
);

-- Denetim sorgusu: konum + tarih aralığı ("şu dolabın geçen ayki kayıtları").
create index temperature_log_location_date_idx on public.temperature_log (location, recorded_at desc);

alter table public.temperature_log enable row level security;
