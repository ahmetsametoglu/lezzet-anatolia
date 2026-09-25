import { expect, type Page } from '@playwright/test';

/** Sepetin adres penceresine elle yazılan adres; `label` kartın adıdır ve test adresi ekranda onunla bulur. */
interface ManualAddress {
  label: string;
  line1: string;
  postalCode: string;
  city: string;
  phone: string;
}

/**
 * Sepetten yeni adres ekler: pencereyi açar, adresi elle yazar ve "kaydet ve seç"e basar. Arama sahte sokağa gerçek öneri
 * döndürür ve elle giriş yalnız "bulunamadı" kutusundan açılır; bu yüzden önce hiçbir kapıya uymayan damgalı bir sorgu
 * yazılır.
 */
export async function addAddressManually(page: Page, stamp: number, address: ManualAddress): Promise<void> {
  await page
    .getByRole('button', { name: /ajouter une adresse/i })
    .first()
    .click({ timeout: 25_000 });
  const form = page.getByRole('dialog');
  await form.getByLabel(/rue et numéro/i).fill(`1 rue E2E ${stamp}`);
  await form.getByRole('button', { name: /saisir l.adresse manuellement/i }).click({ timeout: 20_000 });
  // Elle giriş kartının sokak alanı arama kutusuyla aynı etiketi taşır; onu ad özniteliği ayırır.
  await form.locator('input[name="address-line1"]').fill(address.line1);
  await form.getByLabel(/code postal/i).fill(address.postalCode);
  await form.getByLabel(/^ville$/i).fill(address.city);
  // Kartın adı serbest alan değil tür çipidir; özel ad yalnız "Autre" seçilince yazılır.
  await form.getByRole('button', { name: /^autre$/i }).click();
  await form.getByLabel(/donnez-lui un nom/i).fill(address.label);
  await form.getByLabel(/nom du destinataire/i).fill('E2E Musteri');
  await form.getByLabel(/téléphone/i).fill(address.phone);
  const save = form.getByRole('button', { name: /enregistrer et choisir/i });
  await expect(save).toBeEnabled();
  await save.click();
}
