import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Mobile-First Collapsible Navigation & Responsive Layout Verification', async (t) => {
  const appPath = path.join(__dirname, 'src', 'App.jsx');
  const appCode = fs.readFileSync(appPath, 'utf8');

  const cssPath = path.join(__dirname, 'src', 'index.css');
  const cssCode = fs.readFileSync(cssPath, 'utf8');

  const cmdMenuPath = path.join(__dirname, 'src', 'components', 'ui', 'CommandMenu.jsx');
  const cmdMenuCode = fs.readFileSync(cmdMenuPath, 'utf8');

  await t.test('1. Tasks is primary workspace after login and initial state', () => {
    assert.match(appCode, /const\s+\[tab,\s*setTab\]\s*=\s*useState\(["']tasks["']\)/,
      'Initial tab state must be "tasks"');
    assert.match(appCode, /handleNav\(["']tasks["']\)/,
      'Post-authentication handler must navigate to "tasks"');
  });

  await t.test('2. Mobile header places a two-line hamburger menu button at the top-left', () => {
    // Two-line hamburger SVG icon definition
    const hamburgerMatch = appCode.match(/hamburger:\s*\([\s\S]*?\),/);
    assert.ok(hamburgerMatch, 'Two-line hamburger icon must be defined in Ico');
    const lineCount = (hamburgerMatch[0].match(/<line\b/g) || []).length;
    assert.equal(lineCount, 2, 'Hamburger icon must be a two-line menu icon');

    // Top-left placement inside topbar-mobile-left
    assert.match(appCode, /<header className="topbar-mobile">[\s\S]*?<div className="topbar-mobile-left">[\s\S]*?className="hamburger-btn"/,
      'Hamburger button must be placed inside topbar-mobile-left at top-left of mobile header');

    // Accessibility attributes on hamburger button
    assert.match(appCode, /aria-label="Open navigation menu"/,
      'Hamburger button must have accessible aria-label');
    assert.match(appCode, /aria-expanded=\{mobileDrawerOpen\}/,
      'Hamburger button must bind aria-expanded to mobileDrawerOpen state');
    assert.match(appCode, /aria-controls="mobile-nav-drawer"/,
      'Hamburger button must reference mobile-nav-drawer via aria-controls');
  });

  await t.test('3. Navigation modules are hidden on mobile when drawer is closed and rendered in drawer when open', () => {
    // No persistent mobile bottom tab bar cluttering the screen
    assert.doesNotMatch(appCode, /<nav className="nav">/,
      'Legacy persistent bottom tab bar must not be rendered');

    // Drawer is conditionally rendered when mobileDrawerOpen is true
    assert.match(appCode, /\{mobileDrawerOpen\s*&&\s*\(/,
      'Mobile navigation drawer must only be visible when mobileDrawerOpen is true');

    // Drawer dialog accessibility
    assert.match(appCode, /id="mobile-nav-drawer"/, 'Drawer must have id="mobile-nav-drawer"');
    assert.match(appCode, /role="dialog"/, 'Drawer must have role="dialog"');
    assert.match(appCode, /aria-modal="true"/, 'Drawer must have aria-modal="true"');
  });

  await t.test('4. Navigation drawer and sidebar include all existing modules and destinations', () => {
    const navItemsMatch = appCode.match(/export\s+const\s+NAVIGATION_ITEMS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(navItemsMatch, 'NAVIGATION_ITEMS must be defined in App.jsx');

    const navBlock = navItemsMatch[1];
    for (const moduleId of ['tasks', 'capture', 'career', 'circles', 'coach', 'study', 'home']) {
      assert.match(navBlock, new RegExp(`id:\\s*["']${moduleId}["']`),
        `NAVIGATION_ITEMS must include "${moduleId}" module`);
    }

    // Secondary destinations inside mobile drawer
    assert.match(appCode, /Plan & Billing/, 'Drawer must include Plan & Billing destination');
    assert.match(appCode, /Account Profile/, 'Drawer must include Account Profile destination');
    assert.match(appCode, /aria-label="Sign out"/, 'Drawer must include Sign out action');
    assert.match(appCode, /aria-label="Search captures and tasks"/, 'Drawer must include Search action');
  });

  await t.test('5. Drawer closes on destination selection, backdrop tap, Escape key, and Back navigation', () => {
    // Destination selection closes drawer
    assert.match(appCode, /const\s+handleNav\s*=\s*\(targetTab\)\s*=>\s*\{[\s\S]*?setMobileDrawerOpen\(false\)/,
      'Selecting a navigation destination must close the mobile drawer');

    // Backdrop tap closes drawer
    assert.match(appCode, /className="nav-drawer-backdrop"[\s\S]*?onClick=\{closeMobileDrawer\}/,
      'Tapping outside on the backdrop must close the mobile drawer');

    // Escape key closes drawer
    assert.match(appCode, /if\s*\(e\.key\s*===\s*["']Escape["']\)\s*\{\s*setMobileDrawerOpen\(false\)/,
      'Pressing Escape must close the mobile drawer');

    // Browser Back navigation (popstate) closes drawer
    assert.match(appCode, /window\.history\.pushState\(\{\s*sparkMobileDrawer:\s*true\s*\}/,
      'Opening drawer must push history state for mobile Back button support');
    assert.match(appCode, /window\.addEventListener\(["']popstate["'],\s*onPopState\)/,
      'App must listen to popstate events to close drawer on Back navigation');
  });

  await t.test('6. Desktop sidebar is collapsible and grants remaining width to active workspace', () => {
    assert.match(appCode, /const\s+\[sidebarCollapsed,\s*setSidebarCollapsed\]\s*=\s*useState/,
      'App must maintain sidebarCollapsed state for desktop');
    assert.match(appCode, /localStorage\.getItem\(["']spark_sidebar_collapsed["']\)/,
      'Desktop sidebar collapse state must persist in localStorage');
    assert.match(appCode, /className=\{`app-layout \$\{sidebarCollapsed \? "sidebar-collapsed" : ""\}`\}/,
      'app-layout must toggle sidebar-collapsed class');
    assert.match(appCode, /aria-label="Collapse sidebar"/,
      'Desktop sidebar must provide a Collapse sidebar button');
    assert.match(appCode, /aria-label="Expand sidebar"/,
      'Desktop header must provide an Expand sidebar button when collapsed');

    // CSS rule gives active workspace full remaining width when collapsed
    assert.match(cssCode, /\.app-layout\.sidebar-collapsed\s+\.app-main\s*\{\s*margin-left:\s*0/,
      'Collapsed sidebar must set .app-main margin-left to 0 so workspace gets full width');
  });

  await t.test('7. Switching or toggling drawer preserves session and mounted workspace state', () => {
    // Toggling drawer only updates mobileDrawerOpen and never clears user or token
    const toggleBlock = appCode.match(/const\s+toggleMobileDrawer\s*=\s*useCallback\([\s\S]*?\},\s*\[\]\);/);
    assert.ok(toggleBlock, 'toggleMobileDrawer must be defined');
    assert.doesNotMatch(toggleBlock[0], /setUser|setToken|setTab/,
      'Toggling mobile drawer must not reset user session, token, or active workspace tab');

    // workspace-container stays mounted in app-main regardless of mobileDrawerOpen
    assert.match(appCode, /<div className="workspace-container">/,
      'workspace-container must remain persistently mounted in main layout');
  });

  await t.test('8. Safe-area insets and horizontal overflow prevention on small screens', () => {
    assert.match(cssCode, /env\(safe-area-inset-top/,
      'CSS must respect safe-area-inset-top for notched mobile screens');
    assert.match(cssCode, /env\(safe-area-inset-bottom/,
      'CSS must respect safe-area-inset-bottom for mobile home indicators');
    assert.match(cssCode, /max-width:\s*100vw/,
      'Mobile layout must constrain max-width to 100vw to prevent horizontal overflow');
    assert.match(cssCode, /overflow-x:\s*clip/,
      'Layout must prevent horizontal scroll bleed');
  });

  await t.test('9. CommandMenu and public routes are preserved', () => {
    for (const id of ['tasks', 'home', 'study', 'capture', 'career', 'circles', 'coach']) {
      assert.match(cmdMenuCode, new RegExp(`id:\\s*["']${id}["']`),
        `CommandMenu must preserve quick jump to ${id}`);
    }
    assert.match(appCode, /\/shared\/capture\//, 'Public shared capture route must be preserved');
    assert.match(appCode, /\/reset-password/, 'Password reset route must be preserved');
  });

  await t.test('10. API client supports VITE_API_URL for Render Static Site deployment', async () => {
    const { API_ORIGIN, resolveApiUrl } = await import('./src/api.js');
    assert.equal(typeof API_ORIGIN, 'string');
    assert.equal(resolveApiUrl('/api/uploads/test.png'), '/api/uploads/test.png');
    assert.equal(resolveApiUrl('/uploads/test.png'), '/api/uploads/test.png');
    assert.equal(resolveApiUrl('https://cdn.example.com/img.png'), 'https://cdn.example.com/img.png');
  });
});
