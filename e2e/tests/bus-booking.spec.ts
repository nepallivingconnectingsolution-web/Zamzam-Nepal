import { test, expect } from '@playwright/test';
import { SEEDED_TRIP } from '../global-setup';

test('a customer can search, select seats, fill passenger details, and book a bus ticket', async ({ page }) => {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = `pw-bus-${stamp}@example.com`;
  const mobile = `96${stamp.replace(/\D/g, '').padEnd(8, '3').slice(0, 8)}`;

  await page.goto('/register');
  await page.getByPlaceholder('Full name').fill('Bus Tester');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('98XXXXXXXX').fill(mobile);
  await page.getByPlaceholder('Password (min 8 characters)').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/profile\/setup/, { timeout: 10_000 });

  await page.goto('/app/buses');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText(`${SEEDED_TRIP.fromCity} → ${SEEDED_TRIP.toCity}`).or(page.getByText(SEEDED_TRIP.fromCity))).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('link', { name: 'Select seats' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/app/buses/${SEEDED_TRIP.scheduleId}`), { timeout: 10_000 });

  // Seats step: pick one seat, then continue.
  await page.getByRole('button', { name: '1A', exact: true }).click();
  await expect(page.getByText('Selected:')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Passengers step: fill the one passenger form.
  await page.getByPlaceholder('First name').fill('Bus');
  await page.getByPlaceholder('Last name').fill('Tester');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Phone').fill(mobile);
  await page.getByPlaceholder('Age').fill('30');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Payment step: default method (eSewa, sandbox — never touches the wallet).
  await page.getByRole('button', { name: /^Pay रू/ }).click();

  await expect(page.getByText('Booking confirmed').or(page.getByText(/reference/i))).toBeVisible({ timeout: 10_000 });

  // The booking shows up in "My tickets".
  await page.goto('/app/buses/tickets');
  await expect(page.getByText(SEEDED_TRIP.fromCity).first()).toBeVisible({ timeout: 10_000 });
});
