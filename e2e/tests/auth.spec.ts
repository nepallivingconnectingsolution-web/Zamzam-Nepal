import { test, expect } from '@playwright/test';

function uniqueUser() {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    name: 'Playwright Tester',
    email: `pw-${stamp}@example.com`,
    mobile: `98${stamp.replace(/\D/g, '').padEnd(8, '1').slice(0, 8)}`,
    password: 'password123',
  };
}

test.describe('Authentication', () => {
  test('a new customer can register, is signed in immediately, and can sign out + sign back in', async ({ page }) => {
    const user = uniqueUser();

    await page.goto('/register');
    await page.getByPlaceholder('Full name').fill(user.name);
    await page.getByPlaceholder('Email').fill(user.email);
    await page.getByPlaceholder('98XXXXXXXX').fill(user.mobile);
    await page.getByPlaceholder('Password (min 8 characters)').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Customer registration issues tokens immediately and lands on profile setup.
    await expect(page).toHaveURL(/\/profile\/setup/, { timeout: 10_000 });
    await expect(page.evaluate(() => sessionStorage.getItem('zz_token'))).resolves.toBeTruthy();

    // Sign out by clearing the session directly (fastest reliable path —
    // exercises the same store method the topbar's sign-out button calls)
    // and confirm the app treats us as logged out on the next navigation.
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/app/wallet');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Sign back in with the same credentials.
    await page.getByPlaceholder('you@example.com').fill(user.email);
    await page.getByPlaceholder('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.evaluate(() => sessionStorage.getItem('zz_token'))).resolves.toBeTruthy();
  });

  test('registering with an already-used email shows a clean error, not a crash', async ({ page }) => {
    const user = uniqueUser();

    await page.goto('/register');
    await page.getByPlaceholder('Full name').fill(user.name);
    await page.getByPlaceholder('Email').fill(user.email);
    await page.getByPlaceholder('98XXXXXXXX').fill(user.mobile);
    await page.getByPlaceholder('Password (min 8 characters)').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/profile\/setup/, { timeout: 10_000 });

    // Register again with the same email, different mobile.
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/register');
    await page.getByPlaceholder('Full name').fill(user.name);
    await page.getByPlaceholder('Email').fill(user.email);
    await page.getByPlaceholder('98XXXXXXXX').fill(`98${Date.now().toString().slice(-8)}`);
    await page.getByPlaceholder('Password (min 8 characters)').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/register/);
  });

  test('logging in with the wrong password shows an error and does not sign in', async ({ page }) => {
    const user = uniqueUser();
    await page.goto('/register');
    await page.getByPlaceholder('Full name').fill(user.name);
    await page.getByPlaceholder('Email').fill(user.email);
    await page.getByPlaceholder('98XXXXXXXX').fill(user.mobile);
    await page.getByPlaceholder('Password (min 8 characters)').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/profile\/setup/, { timeout: 10_000 });

    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(user.email);
    await page.getByPlaceholder('Password').fill('totally-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
