/*
  EXPO_PUBLIC_* değişkenleri Metro tarafından DERLEME anında gömülür — bu yüzden okuma
  `process.env.EXPO_PUBLIC_X` biçiminde STATİK olmak zorunda (dinamik `process.env[name]`
  gömülmez, üretimde sessizce undefined olur). Getter'lar çağrı anında değerlendirilir:
  test ortamı değişkeni koşudan önce atayabilir, üretimde ise Metro değeri satır içine yazar.

  Eksik değişken SESSİZ undefined dönerdi — tek kapı + gürültülü hata bunun panzehiri
  (CLAUDE §1 "ölçülemeyen değer sıfır değildir" ile aynı sınıf kural: yokluk, boş değer değildir).
*/

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} tanımsız — apps/mobile/.env dosyasını .env.example'dan oluşturun`);
  }
  return value;
}

export const env = {
  /** `/api/v1` taban adresi (apps/mobile-api — yerelde http://localhost:3002). */
  get apiUrl(): string {
    return required(process.env.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL');
  },
  get supabaseUrl(): string {
    return required(process.env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL');
  },
  /** Anon (publishable) anahtar — SECRET anahtar HİÇBİR koşulda mobil bundle'a giremez (02-mimari §4). */
  get supabaseKey(): string {
    return required(process.env.EXPO_PUBLIC_SUPABASE_KEY, 'EXPO_PUBLIC_SUPABASE_KEY');
  },
};
