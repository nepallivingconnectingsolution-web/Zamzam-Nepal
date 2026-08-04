import { test, expect } from '@playwright/test';

/**
 * End-to-end regression test for the Critical exploit fixed this session
 * (see server/PHASE1_AUDIT.md and commit "fix(wallet): stop crediting
 * balance on unverified top-ups"): a wallet top-up must NOT credit the
 * balance until a super-admin confirms it. Drives both the customer and
 * super-admin UIs in one browser context — the two auth stores use
 * independent sessionStorage keys (zz_auth vs zz_sa) by design, so both
 * sessions coexist in the same tab without interfering with each other.
 */
test('a wallet top-up stays pending until a super-admin confirms it, then credits the balance', async ({ page }) => {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = `pw-wallet-${stamp}@example.com`;
  const mobile = `97${stamp.replace(/\D/g, '').padEnd(8, '2').slice(0, 8)}`;

  // Register a fresh customer (auto-signs-in, kyc APPROVED for role=customer).
  await page.goto('/register');
  await page.getByPlaceholder('Full name').fill('Wallet Tester');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('98XXXXXXXX').fill(mobile);
  await page.getByPlaceholder('Password (min 8 characters)').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/profile\/setup/, { timeout: 10_000 });

  await page.goto('/app/wallet');
  await expect(page.getByText(/रू\s?0\.00/)).toBeVisible();

  // Request a top-up.
  await page.getByRole('button', { name: 'Add money' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add money to wallet' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Add /, exact: false }).click();

  // Must NOT be credited instantly — balance stays at 0, and the ledger
  // shows the top-up as pending, not success.
  await expect(page.getByText(/pending confirmation|being verified/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/रू\s?0\.00/)).toBeVisible();
  await expect(page.getByText('pending')).toBeVisible();

  // Switch to the super-admin console (independent session, same tab) and
  // resolve the top-up.
  await page.goto('/x-admin/login');
  await page.getByLabel('Admin email').fill('superadmin@e2e.local');
  await page.getByLabel('Password').fill('e2e-only-password-123');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page).toHaveURL(/\/x-admin(?!\/login)/, { timeout: 10_000 });

  await page.goto('/x-admin/transactions');
  await page.getByRole('button', { name: 'topup', exact: true }).click();
  const pendingRow = page.locator('tr', { hasText: 'eSewa' }).filter({ hasText: 'pending' }).first();
  await expect(pendingRow).toBeVisible({ timeout: 10_000 });
  await pendingRow.getByRole('button', { name: 'Confirm top-up' }).click();
  await expect(pendingRow.getByText('success')).toBeVisible({ timeout: 10_000 });

  // Back on the customer side, the balance is now credited.
  await page.goto('/app/wallet');
  await expect(page.getByText(/रू\s?1,000\.00/)).toBeVisible({ timeout: 10_000 });
});
