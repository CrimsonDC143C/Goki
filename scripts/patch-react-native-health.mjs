#!/usr/bin/env node

/**
 * scripts/patch-react-native-health.mjs
 *
 * Patches react-native-health@1.19.0 for React Native 0.76+ / 0.88+ (New Architecture / Bridgeless).
 * Removes obsolete `[RCTCallableJSModules setBridge:]` and `+sharedJsModule` calls from
 * `RCTAppleHealthKit.m` since `RCTCallableJSModules` no longer declares `setBridge:` in RN 0.76+
 * and `RCTEventEmitter` already manages `callableJSModules` natively.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const candidatePaths = [
  path.join(
    ROOT_DIR,
    'node_modules',
    'react-native-health',
    'RCTAppleHealthKit',
    'RCTAppleHealthKit.m'
  ),
  path.join(
    ROOT_DIR,
    'apps',
    'mobile',
    'node_modules',
    'react-native-health',
    'RCTAppleHealthKit',
    'RCTAppleHealthKit.m'
  ),
];

for (const targetPath of candidatePaths) {
  if (!fs.existsSync(targetPath)) continue;

  const original = fs.readFileSync(targetPath, 'utf8');
  let patched = original;

  // 1. Remove obsolete +sharedJsModule singleton factory
  patched = patched.replace(
    /\+\s*\(RCTCallableJSModules\s*\*\)sharedJsModule\s*\{[\s\S]*?return sharedJsModule;\s*\}\r?\n*/g,
    ''
  );

  // 2. Remove obsolete callableJSModules override & removed setBridge: selector call
  patched = patched.replace(
    /\s*self\.callableJSModules\s*=\s*\[RCTAppleHealthKit\s+sharedJsModule\];\r?\n\s*\[self\.callableJSModules\s+setBridge:self\.bridge\];/g,
    ''
  );

  if (patched !== original) {
    fs.writeFileSync(targetPath, patched, 'utf8');
    console.log(`[patch-react-native-health] Patched ${path.relative(ROOT_DIR, targetPath)} for RN 0.88+ compatibility.`);
  } else {
    console.log(`[patch-react-native-health] ${path.relative(ROOT_DIR, targetPath)} already patched.`);
  }
}
