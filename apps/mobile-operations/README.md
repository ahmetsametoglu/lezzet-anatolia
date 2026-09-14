# Lezzet Operasyonu — operasyon native uygulaması

Personelin telefon yüzeyi: kurye · depo · yönetim · para. Müşteri uygulamasıyla (`apps/mobile`) aynı ortak
çekirdeği okur — `@lezzet/mobile-kit` (tema, kit bileşenleri, oturum, push, giriş ekranı). Ayrım kararı ve
dilimleri `docs/build/21-mobil-uygulama.md` (21.310).

## Çalıştırma

```
pnpm dev:mobile-operations                # Metro
pnpm mobile-operations:rebuild:android    # dev-client derle ve kur (native bağımlılık değişince)
pnpm mobile:device                        # cihaz tünelleri (8081 · 3002 · 54321) + ölçüm
pnpm mobile-operations:e2e                # Maestro akışları (maestro/README.md)
```

## Kimlikler

- Ad "Lezzet Operasyonu" · slug `lezzet-operasyonu` · paket `com.lezzetanatolie.operasyon` · şema `lezzetoperasyonu`.
- Kullanıcının kaydedeceği dış değerler — kayıttan SONRA koda yazılır: Expo proje kimliği, Firebase
  `google-services.json`, Apple uygulama kimliği, operasyon ikonu, Supabase dönüş listesinde `lezzetoperasyonu://**`.

## Müşteri uygulamasından farklar

- Açılış giriş kapısıyla: oturum yoksa `/login`, personel bölümü yoksa "yetki yok" ekranı; kök `/` ilk bölüme gider.
- Tema kökte operasyon teması; operasyon metinleri tek dilli (Türkçe).
- Derin bağlantı, ödeme ve görsel seçici yok; kamera (kod okutma) ve Brother etiket yazıcısı var.
