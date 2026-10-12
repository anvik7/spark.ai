import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Navigation Architecture Verification', async (t) => {
  const appPath = path.join(__dirname, 'src', 'App.jsx');
  const appCode = fs.readFileSync(appPath, 'utf8');

  const cmdMenuPath = path.join(__dirname, 'src', 'components', 'ui', 'CommandMenu.jsx');
  const cmdMenuCode = fs.readFileSync(cmdMenuPath, 'utf8');

  await t.test('1. Tasks is primary workspace after login and initial state', () => {
    // Initial tab state must be "tasks"
    assert.match(appCode, /const\s+\[tab,\s*setTab\]\s*=\s*useState\(["']tasks["']\)/,
      'Initial tab state must be "tasks"');

    // On authentication, redirect target must be "tasks"
    assert.match(appCode, /handleNav\(["']tasks["']\)/,
      'Post-authentication handler must navigate to "tasks"');

    // Brand logo click navigates to "tasks"
    assert.match(appCode, /onClick=\{.*handleNav\(["']tasks["']\).*\}/,
      'Logo lockup click must navigate to "tasks" workspace');
  });

  await t.test('2. Mobile bottom navigation contains Tasks, Capture, Career, More and excludes Study/Home', () => {
    // mobileNavItems array extraction
    const mobileNavMatch = appCode.match(/const\s+mobileNavItems\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(mobileNavMatch, 'mobileNavItems array must be defined in App.jsx');

    const mobileNavBlock = mobileNavMatch[1];

    // Must include tasks, capture, career, more
    assert.match(mobileNavBlock, /id:\s*["']tasks["']/, 'mobileNavItems must include "tasks"');
    assert.match(mobileNavBlock, /id:\s*["']capture["']/, 'mobileNavItems must include "capture"');
    assert.match(mobileNavBlock, /id:\s*["']career["']/, 'mobileNavItems must include "career"');
    assert.match(mobileNavBlock, /id:\s*["']more["']/, 'mobileNavItems must include "more"');

    // Must NOT include study or home
    assert.doesNotMatch(mobileNavBlock, /id:\s*["']study["']/,
      'mobileNavItems must NOT include "study" directly (it must be in More drawer)');
    assert.doesNotMatch(mobileNavBlock, /id:\s*["']home["']/,
      'mobileNavItems must NOT include "home" directly');
  });

  await t.test('3. More drawer contains Study, Home, Circles, Coach, Account, and Plan', () => {
    // Look for more-sheet-grid content
    const moreSheetMatch = appCode.match(/className=["']more-sheet-grid["'][\s\S]*?<\/div>/);
    assert.ok(moreSheetMatch, 'more-sheet-grid must be present in App.jsx');

    const moreGrid = moreSheetMatch[0];

    assert.match(moreGrid, /handleNav\(["']home["']\)/, 'More drawer must allow navigating to "home"');
    assert.match(moreGrid, /handleNav\(["']study["']\)/, 'More drawer must allow navigating to "study"');
    assert.match(moreGrid, /handleNav\(["']circles["']\)/, 'More drawer must allow navigating to "circles"');
    assert.match(moreGrid, /handleNav\(["']coach["']\)/, 'More drawer must allow navigating to "coach"');
    assert.match(moreGrid, /setShowAccount\(true\)/, 'More drawer must allow navigating to Account Profile');
    assert.match(moreGrid, /setShowUpgrade\(true\)/, 'More drawer must allow navigating to Plan & Billing');
  });

  await t.test('4. Home is excluded from desktop sidebar primary navigation and bottom nav', () => {
    const desktopNavMatch = appCode.match(/const\s+desktopNavItems\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(desktopNavMatch, 'desktopNavItems array must be defined in App.jsx');

    const desktopNavBlock = desktopNavMatch[1];

    // Must NOT include home in primary desktop sidebar links
    assert.doesNotMatch(desktopNavBlock, /id:\s*["']home["']/,
      'desktopNavItems must NOT contain "home" in primary navigation');

    // Must contain tasks as primary, along with other core workspaces
    assert.match(desktopNavBlock, /id:\s*["']tasks["']/, 'desktopNavItems must include "tasks"');
    assert.match(desktopNavBlock, /id:\s*["']capture["']/, 'desktopNavItems must include "capture"');
    assert.match(desktopNavBlock, /id:\s*["']career["']/, 'desktopNavItems must include "career"');
    assert.match(desktopNavBlock, /id:\s*["']circles["']/, 'desktopNavItems must include "circles"');
    assert.match(desktopNavBlock, /id:\s*["']coach["']/, 'desktopNavItems must include "coach"');
    assert.match(desktopNavBlock, /id:\s*["']study["']/, 'desktopNavItems must include "study"');
  });

  await t.test('5. CommandMenu provides fast search to all workspaces including Study and Home', () => {
    assert.match(cmdMenuCode, /id:\s*["']tasks["']/, 'CommandMenu must search Tasks');
    assert.match(cmdMenuCode, /id:\s*["']home["']/, 'CommandMenu must search Home');
    assert.match(cmdMenuCode, /id:\s*["']study["']/, 'CommandMenu must search Study Center');
    assert.match(cmdMenuCode, /id:\s*["']capture["']/, 'CommandMenu must search Capture');
    assert.match(cmdMenuCode, /id:\s*["']career["']/, 'CommandMenu must search Career OS');
    assert.match(cmdMenuCode, /id:\s*["']circles["']/, 'CommandMenu must search Chat');
    assert.match(cmdMenuCode, /id:\s*["']coach["']/, 'CommandMenu must search Interview Coach');
  });

  await t.test('6. Public routes and modal views are preserved', () => {
    assert.match(appCode, /\/shared\/capture\//, 'Public shared capture URL route must be preserved');
    assert.match(appCode, /\/reset-password/, 'Password reset URL route must be preserved');
    assert.match(appCode, /<SharedCapture/, 'SharedCapture component must be rendered on share route');
    assert.match(appCode, /<ResetPassword/, 'ResetPassword component must be rendered on reset route');
  });

  await t.test('7. More drawer active indicator lights up when on secondary tabs', () => {
    // When tab is not in ['tasks', 'capture', 'career'], More must show active
    assert.match(appCode, /!\s*\[["']tasks["'],\s*["']capture["'],\s*["']career["']\]\.includes\(tab\)/,
      'More bottom nav button must highlight active when viewing secondary views');
  });
});
