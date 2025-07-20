import { test, expect } from '@playwright/test';

/**
 * End-to-end tests for critical user flows in the URL shortener platform
 */

test.describe('Critical User Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Go to the homepage
    await page.goto('/');
  });

  test('User registration and login flow', async ({ page }) => {
    // Navigate to register page
    await page.click('text=Register');
    
    // Fill registration form
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="confirmPassword"]', 'Password123!');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Verify successful registration
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Log out
    await page.click('[data-testid="user-menu"]');
    await page.click('text=Logout');
    
    // Verify logged out state
    await expect(page).toHaveURL(/\/login/);
    
    // Log back in
    await page.fill('input[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    
    // Verify successful login
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('URL shortening and management flow', async ({ page }) => {
    // Login first
    await page.click('text=Login');
    await page.fill('input[name="email"]', 'user@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Navigate to URL creation page
    await page.click('text=Create URL');
    
    // Fill URL form
    await page.fill('input[name="originalUrl"]', 'https://example.com/very/long/url/that/needs/shortening');
    await page.fill('input[name="title"]', 'Test URL');
    
    // Add tags
    await page.fill('input[name="tags"]', 'test');
    await page.press('input[name="tags"]', 'Enter');
    await page.fill('input[name="tags"]', 'e2e');
    await page.press('input[name="tags"]', 'Enter');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Verify URL was created
    await expect(page.locator('text=URL created successfully')).toBeVisible();
    
    // Go to URL list
    await page.click('text=My URLs');
    
    // Verify the URL appears in the list
    await expect(page.locator('text=Test URL')).toBeVisible();
    
    // Edit the URL
    await page.click('[data-testid="edit-url-button"]');
    await page.fill('input[name="title"]', 'Updated Test URL');
    await page.click('button[type="submit"]');
    
    // Verify URL was updated
    await expect(page.locator('text=URL updated successfully')).toBeVisible();
    await expect(page.locator('text=Updated Test URL')).toBeVisible();
    
    // Delete the URL
    await page.click('[data-testid="delete-url-button"]');
    await page.click('text=Confirm');
    
    // Verify URL was deleted
    await expect(page.locator('text=URL deleted successfully')).toBeVisible();
    await expect(page.locator('text=Updated Test URL')).not.toBeVisible();
  });

  test('Analytics dashboard flow', async ({ page }) => {
    // Login first
    await page.click('text=Login');
    await page.fill('input[name="email"]', 'user@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Create a URL first
    await page.click('text=Create URL');
    await page.fill('input[name="originalUrl"]', 'https://example.com/analytics/test');
    await page.fill('input[name="title"]', 'Analytics Test URL');
    await page.click('button[type="submit"]');
    
    // Navigate to analytics dashboard
    await page.click('text=Analytics');
    
    // Select the URL from dropdown
    await page.selectOption('select[name="urlId"]', { label: 'Analytics Test URL' });
    
    // Verify analytics components are visible
    await expect(page.locator('[data-testid="analytics-summary"]')).toBeVisible();
    await expect(page.locator('[data-testid="time-series-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="geo-map"]')).toBeVisible();
    await expect(page.locator('[data-testid="device-breakdown"]')).toBeVisible();
    
    // Change time range
    await page.click('text=Last 7 days');
    await page.click('text=Last 30 days');
    
    // Verify time range change updates the charts
    await expect(page.locator('[data-testid="time-series-chart"]')).toBeVisible();
  });
});