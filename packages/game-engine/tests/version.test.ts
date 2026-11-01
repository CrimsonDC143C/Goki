import { describe, it, expect } from 'vitest';
import {
  parseSemver,
  compareSemver,
  isUpdateAvailable,
  isForceUpdateRequired,
} from '../src/version';

describe('Version & SemVer Utilities', () => {
  describe('parseSemver', () => {
    it('correctly parses standard semver strings', () => {
      expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined });
      expect(parseSemver('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0, prerelease: undefined });
      expect(parseSemver('2.10.15')).toEqual({ major: 2, minor: 10, patch: 15, prerelease: undefined });
    });

    it('strips leading "v" or "V"', () => {
      expect(parseSemver('v1.0.0')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: undefined });
      expect(parseSemver('V2.4.1')).toEqual({ major: 2, minor: 4, patch: 1, prerelease: undefined });
    });

    it('handles prerelease suffixes', () => {
      expect(parseSemver('1.0.0-beta.1')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: 'beta.1' });
      expect(parseSemver('v2.0.0-rc.3')).toEqual({ major: 2, minor: 0, patch: 0, prerelease: 'rc.3' });
    });

    it('gracefully handles missing parts or malformed strings', () => {
      expect(parseSemver('1')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: undefined });
      expect(parseSemver('1.2')).toEqual({ major: 1, minor: 2, patch: 0, prerelease: undefined });
      expect(parseSemver('')).toEqual({ major: 0, minor: 0, patch: 0, prerelease: undefined });
      expect(parseSemver(null as any)).toEqual({ major: 0, minor: 0, patch: 0, prerelease: undefined });
      expect(parseSemver(undefined as any)).toEqual({ major: 0, minor: 0, patch: 0, prerelease: undefined });
    });
  });

  describe('compareSemver', () => {
    it('returns 0 for identical versions', () => {
      expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
      expect(compareSemver('v1.0.0', '1.0.0')).toBe(0);
      expect(compareSemver('0.1.0', '0.1.0')).toBe(0);
    });

    it('compares major versions correctly', () => {
      expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
      expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
    });

    it('compares minor versions correctly', () => {
      expect(compareSemver('1.1.0', '1.2.0')).toBe(-1);
      expect(compareSemver('1.5.0', '1.2.0')).toBe(1);
    });

    it('compares patch versions correctly', () => {
      expect(compareSemver('1.0.1', '1.0.2')).toBe(-1);
      expect(compareSemver('1.0.10', '1.0.2')).toBe(1);
    });

    it('handles prerelease comparison: stable is newer than prerelease', () => {
      expect(compareSemver('1.0.0-beta', '1.0.0')).toBe(-1);
      expect(compareSemver('1.0.0', '1.0.0-beta')).toBe(1);
      expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
    });
  });

  describe('isUpdateAvailable', () => {
    it('returns true when target is newer than current', () => {
      expect(isUpdateAvailable('0.1.0', '0.2.0')).toBe(true);
      expect(isUpdateAvailable('1.0.0', '1.0.1')).toBe(true);
      expect(isUpdateAvailable('1.0.0', '2.0.0')).toBe(true);
    });

    it('returns false when current is equal to or newer than target', () => {
      expect(isUpdateAvailable('1.0.0', '1.0.0')).toBe(false);
      expect(isUpdateAvailable('1.1.0', '1.0.0')).toBe(false);
      expect(isUpdateAvailable('2.0.0', '1.9.9')).toBe(false);
    });
  });

  describe('isForceUpdateRequired', () => {
    it('returns true when current is strictly below minimum required version', () => {
      expect(isForceUpdateRequired('0.1.0', '0.2.0')).toBe(true);
      expect(isForceUpdateRequired('1.0.0', '2.0.0')).toBe(true);
    });

    it('returns false when current meets or exceeds minimum required version', () => {
      expect(isForceUpdateRequired('1.0.0', '1.0.0')).toBe(false);
      expect(isForceUpdateRequired('1.5.0', '1.0.0')).toBe(false);
      expect(isForceUpdateRequired('2.0.0', '1.0.0')).toBe(false);
    });
  });
});
