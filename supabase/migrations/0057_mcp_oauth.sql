-- MCP OAuth — Claude'un connector ekranından bağlanabilmesi için yetkilendirme sunucusu tarafı.
-- Kapı değişmiyor: akışın sonunda üretilen erişim jetonu yine bir `mcp_connection_key` satırıdır.
-- Burada yalnız akışın iki kısa ömürlü kaydı durur: istemci künyesi ve tek kullanımlık kod.

-- İstemci KENDİNİ kaydeder (dinamik kayıt): connector ekranında kullanıcı hiçbir alan doldurmaz.
-- Gizli anahtar YOK — istemci tarayıcıda çalışır ve sırrı saklayamaz; korumayı PKCE veriyor.
create table public.oauth_client (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_name text,
  -- Dönüş adresleri kayıt anında beyaz listeye sınanır; burada beyan olarak durur ki `/authorize`
  -- gelen adresi satırla karşılaştırabilsin (açık yönlendirmeye karşı ikinci süzgeç).
  redirect_uris text[] not null check (array_length(redirect_uris, 1) >= 1),
  created_at timestamptz not null default now()
);

-- Yetkilendirme kodu — TEK KULLANIMLIK ve kısa ömürlü. Kodun kendisi saklanmaz: satır sızarsa
-- kimse onunla jeton alamasın diye yalnız özeti (SHA-256) tutulur, `mcp_connection_key` deseni.
create table public.oauth_code (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  client_id text not null references public.oauth_client (client_id) on delete cascade,
  -- Jeton isteğinde aynı adres yeniden gönderilir ve eşleşmezse kod yanar: kodu başka bir dönüş
  -- adresine taşımak, çalınmış kodu kendi sunucusunda kullanmanın en kolay yoludur.
  redirect_uri text not null,
  -- PKCE sorusu. Yöntem saklanmıyor çünkü tek yöntem kabul ediliyor (S256); `plain` reddedilir ve
  -- reddin yeri kapıdır — kolonda tutmak, bir gün "hangi yöntemle doğrulayayım" sorusunu doğururdu.
  code_challenge text not null,
  -- Kodu ÜRETEN admin. Jeton onun adına açılır; kim izin verdi sorusu jetonun satırında da durur.
  admin_profile_id uuid not null references public.user_profiles (id) on delete cascade,
  expires_at timestamptz not null,
  -- Dolu = kullanılmış. Satır silinmiyor: aynı kodun ikinci kez denendiği görülebilsin.
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Süpürme ve "süresi geçti mi" sorusu aynı kolondan okunur.
create index oauth_code_expires_idx on public.oauth_code (expires_at);

-- Erişim SUNUCUDAN, service_role ile (RLS deny-by-default — `0051` ile aynı desen ve gerekçe).
alter table public.oauth_client enable row level security;
alter table public.oauth_code enable row level security;
