/**
 * Personel kaydın e-postasını değiştirebilir mi. Girişe bağlı kayıtta e-posta giriş anahtarının kopyasıdır: değişirse profil girişten
 * ayrışır ve yeni adresle açılan giriş kayda bağlanamaz, çünkü e-posta tekildir; girişsiz kayıtta ise değişiklik mirası kurar.
 */
export function staffCanEditEmail(profile: { authUserId: string | null }): boolean {
  return profile.authUserId === null;
}
