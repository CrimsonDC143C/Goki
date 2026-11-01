/**
 * Pure deterministic Semantic Versioning comparison utilities.
 * Used for workout-safe client updates, force binary upgrades, and version gating.
 */

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/**
 * Cleans and parses a semver string (e.g. "v1.2.3", "1.0.0-beta.1") into numeric components.
 */
export function parseSemver(version: string | undefined | null): ParsedSemver {
  if (!version || typeof version !== 'string') {
    return { major: 0, minor: 0, patch: 0 };
  }

  // Strip leading 'v' or 'V' and trim whitespace
  const clean = version.trim().replace(/^[vV]/, '');
  
  // Split optional pre-release / build suffix (e.g. 1.0.0-beta.1 -> [1.0.0, beta.1])
  const [core, ...preParts] = clean.split('-');
  const prerelease = preParts.length > 0 ? preParts.join('-') : undefined;

  const parts = (core || '').split('.').map(p => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });

  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
    prerelease,
  };
}

/**
 * Compares two semantic version strings.
 * 
 * @returns -1 if a < b (a is older than b)
 *           0 if a === b
 *           1 if a > b (a is newer than b)
 */
export function compareSemver(a: string, b: string): number {
  const vA = parseSemver(a);
  const vB = parseSemver(b);

  if (vA.major !== vB.major) {
    return vA.major > vB.major ? 1 : -1;
  }
  if (vA.minor !== vB.minor) {
    return vA.minor > vB.minor ? 1 : -1;
  }
  if (vA.patch !== vB.patch) {
    return vA.patch > vB.patch ? 1 : -1;
  }

  // SemVer spec: a normal version with no prerelease tag has higher precedence than one with a prerelease tag
  // e.g., 1.0.0 is newer than 1.0.0-beta
  if (vA.prerelease && !vB.prerelease) {
    return -1;
  }
  if (!vA.prerelease && vB.prerelease) {
    return 1;
  }
  if (vA.prerelease && vB.prerelease) {
    return vA.prerelease.localeCompare(vB.prerelease);
  }

  return 0;
}

/**
 * Returns true if the client's current version is older than the target latest version.
 */
export function isUpdateAvailable(currentVersion: string, latestVersion: string): boolean {
  return compareSemver(currentVersion, latestVersion) < 0;
}

/**
 * Returns true if the client's current version is older than the minimum required version.
 * When true, client should block operations until upgraded.
 */
export function isForceUpdateRequired(currentVersion: string, minRequiredVersion: string): boolean {
  return compareSemver(currentVersion, minRequiredVersion) < 0;
}
