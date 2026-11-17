import { PrismaClient } from '@goki/database';
import {
  buildCanonicalVenueKey,
  calculateDistanceMeters,
  findDeduplicatedVenueMatch,
} from '@goki/game-engine';
import { env } from '../config';

export type GymDiscoverySource =
  | 'OSM_OVERPASS'
  | 'USER_SUBMITTED'
  | 'EXTERNAL_PLACES'
  | 'SYSTEM_SEED';

export interface DiscoveredGymVenue {
  venueKey: string;
  name: string;
  source: GymDiscoverySource;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  countryCode: string | null;
  externalPlaceId: string | null;
  osmElementType?: string | null;
  osmElementId?: string | null;
  distanceMeters: number;
  existingClanId: string | null;
  existingClanTag: string | null;
  existingClanLevel: number | null;
  memberCount: number;
}

export interface RawDiscoveredVenue {
  venueKey: string;
  name: string;
  source: GymDiscoverySource;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  countryCode: string | null;
  externalPlaceId: string | null;
  osmElementType?: string | null;
  osmElementId?: string | null;
}

export interface GymDiscoveryProvider {
  discoverNearbyGyms(params: {
    db: PrismaClient;
    latitude: number;
    longitude: number;
    radiusMeters?: number;
    query?: string;
  }): Promise<{
    venues: DiscoveredGymVenue[];
    sourcesUsed: string[];
    overpassFallbackUsed: boolean;
  }>;
}

export interface ExternalPlacesGymAdapter {
  readonly name: string;
  isConfigured(): boolean;
  searchNearby(params: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    query?: string;
  }): Promise<RawDiscoveredVenue[]>;
}

/**
 * Default no-op external places adapter used when no paid Google Places or Mapbox
 * API credentials are configured.
 */
export class NoopExternalPlacesAdapter implements ExternalPlacesGymAdapter {
  readonly name = 'noop_external_places';

  isConfigured(): boolean {
    return false;
  }

  async searchNearby(): Promise<RawDiscoveredVenue[]> {
    return [];
  }
}

class ConfiguredExternalPlacesPlaceholderAdapter implements ExternalPlacesGymAdapter {
  readonly name: string;

  constructor(providerName: string) {
    this.name = providerName;
  }

  isConfigured(): boolean {
    return true;
  }

  async searchNearby(): Promise<RawDiscoveredVenue[]> {
    // Provider slot reserved for optional paid Google Places / Mapbox integrations.
    return [];
  }
}

/**
 * Creates an optional external places adapter from server configuration.
 * Returns `NoopExternalPlacesAdapter` when no paid API keys are set.
 */
export function createOptionalExternalPlacesAdapter(config?: {
  googlePlacesApiKey?: string;
  mapboxAccessToken?: string;
}): ExternalPlacesGymAdapter {
  if (config?.googlePlacesApiKey?.trim()) {
    return new ConfiguredExternalPlacesPlaceholderAdapter('google_places');
  }
  if (config?.mapboxAccessToken?.trim()) {
    return new ConfiguredExternalPlacesPlaceholderAdapter('mapbox_places');
  }
  return new NoopExternalPlacesAdapter();
}

interface OverpassElement {
  type?: string;
  id?: string | number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
}

/**
 * Keyless OpenStreetMap Overpass API adapter for discovering nearby fitness centres and gyms.
 * Gracefully degrades on network errors, aborts, non-200 status codes, or invalid JSON.
 */
export class OpenStreetMapOverpassAdapter {
  private readonly overpassUrl: string;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly timeoutMs: number;

  constructor(options?: {
    overpassUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }) {
    this.overpassUrl = options?.overpassUrl ?? env.OSM_OVERPASS_URL;
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options?.timeoutMs ?? 4500;
  }

  async searchNearby(params: {
    latitude: number;
    longitude: number;
    radiusMeters?: number;
  }): Promise<{ venues: RawDiscoveredVenue[]; failed: boolean }> {
    if (!this.fetchImpl) {
      return { venues: [], failed: true };
    }

    const radius = Math.max(100, Math.min(25_000, Math.round(params.radiusMeters ?? 5000)));
    const lat = params.latitude;
    const lon = params.longitude;
    const overpassQuery = `[out:json][timeout:4];(nwr["leisure"="fitness_centre"](around:${radius},${lat},${lon});nwr["amenity"="gym"](around:${radius},${lat},${lon}););out center 30;`;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.overpassUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: controller.signal,
      });

      if (!response.ok) {
        return { venues: [], failed: true };
      }

      const payload = (await response.json()) as { elements?: unknown } | null;
      if (!payload || !Array.isArray(payload.elements)) {
        return { venues: [], failed: true };
      }

      const venues: RawDiscoveredVenue[] = [];
      for (const rawEl of payload.elements as OverpassElement[]) {
        const elementLat =
          typeof rawEl?.lat === 'number' ? rawEl.lat : rawEl?.center?.lat;
        const elementLon =
          typeof rawEl?.lon === 'number' ? rawEl.lon : rawEl?.center?.lon;

        if (
          typeof elementLat !== 'number' ||
          !Number.isFinite(elementLat) ||
          typeof elementLon !== 'number' ||
          !Number.isFinite(elementLon)
        ) {
          continue;
        }

        const tags = rawEl.tags ?? {};
        const name =
          typeof tags.name === 'string' && tags.name.trim().length > 0
            ? tags.name.trim()
            : 'Unnamed Gym';

        const street =
          typeof tags['addr:street'] === 'string' && tags['addr:street'].trim().length > 0
            ? tags['addr:street'].trim()
            : null;
        const houseNumber =
          typeof tags['addr:housenumber'] === 'string' &&
          tags['addr:housenumber'].trim().length > 0
            ? tags['addr:housenumber'].trim()
            : null;
        const address = street ? (houseNumber ? `${houseNumber} ${street}` : street) : null;
        const city =
          typeof tags['addr:city'] === 'string' && tags['addr:city'].trim().length > 0
            ? tags['addr:city'].trim()
            : null;
        const countryCode =
          typeof tags['addr:country'] === 'string' && tags['addr:country'].trim().length > 0
            ? tags['addr:country'].trim()
            : null;

        const osmElementType =
          typeof rawEl.type === 'string' && rawEl.type.trim().length > 0
            ? rawEl.type.trim()
            : null;
        const osmElementId =
          rawEl.id !== undefined && rawEl.id !== null && String(rawEl.id).trim().length > 0
            ? String(rawEl.id).trim()
            : null;

        const venueKey = buildCanonicalVenueKey({
          osmElementType,
          osmElementId,
          latitude: elementLat,
          longitude: elementLon,
          name,
        });

        venues.push({
          venueKey,
          name,
          source: 'OSM_OVERPASS',
          latitude: elementLat,
          longitude: elementLon,
          address,
          city,
          countryCode,
          externalPlaceId:
            osmElementType && osmElementId ? `${osmElementType}:${osmElementId}` : null,
          osmElementType,
          osmElementId,
        });
      }

      return { venues, failed: false };
    } catch {
      return { venues: [], failed: true };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Combines local `GymClan` database records, keyless OpenStreetMap Overpass results,
 * and optional external places adapters with coordinate/name deduplication.
 */
export class CompositeGymDiscoveryService implements GymDiscoveryProvider {
  private readonly overpassAdapter: OpenStreetMapOverpassAdapter;
  private readonly externalAdapter: ExternalPlacesGymAdapter;

  constructor(options?: {
    overpassAdapter?: OpenStreetMapOverpassAdapter;
    externalAdapter?: ExternalPlacesGymAdapter;
  }) {
    this.overpassAdapter = options?.overpassAdapter ?? new OpenStreetMapOverpassAdapter();
    this.externalAdapter =
      options?.externalAdapter ??
      createOptionalExternalPlacesAdapter({
        googlePlacesApiKey: env.GOOGLE_PLACES_API_KEY,
        mapboxAccessToken: env.MAPBOX_ACCESS_TOKEN,
      });
  }

  async discoverNearbyGyms(params: {
    db: PrismaClient;
    latitude: number;
    longitude: number;
    radiusMeters?: number;
    query?: string;
  }): Promise<{
    venues: DiscoveredGymVenue[];
    sourcesUsed: string[];
    overpassFallbackUsed: boolean;
  }> {
    const radiusMeters = Math.max(100, Math.min(50_000, params.radiusMeters ?? 5000));
    const dbSearchWindow = Math.max(radiusMeters, 25_000);

    const existingClans =
      typeof (params.db as any).gymClan?.findMany === 'function'
        ? ((await params.db.gymClan.findMany({
            where: { kind: 'GYM_VENUE' },
            include: { _count: { select: { members: true } } },
          })) as any[])
        : [];

    const dbVenuesByClanId = new Map<string, DiscoveredGymVenue>();
    const dbMatchCandidates: Array<{
      id: string;
      venueKey: string;
      name: string;
      latitude: number;
      longitude: number;
      kind: string;
      tag: string;
      clanLevel: number;
      memberCount: number;
      venueSource: GymDiscoverySource;
      address: string | null;
      city: string | null;
      countryCode: string | null;
      externalPlaceId: string | null;
      distanceMeters: number;
    }> = [];

    for (const clan of existingClans) {
      if (
        typeof clan.latitude !== 'number' ||
        !Number.isFinite(clan.latitude) ||
        typeof clan.longitude !== 'number' ||
        !Number.isFinite(clan.longitude)
      ) {
        continue;
      }

      const distanceMeters = Math.round(
        calculateDistanceMeters(params.latitude, params.longitude, clan.latitude, clan.longitude)
      );
      const memberCount = clan._count?.members ?? clan.members?.length ?? 0;

      const candidate = {
        id: clan.id,
        venueKey: clan.venueKey,
        name: clan.name,
        latitude: clan.latitude,
        longitude: clan.longitude,
        kind: clan.kind ?? 'GYM_VENUE',
        tag: clan.tag,
        clanLevel: clan.clanLevel ?? 1,
        memberCount,
        venueSource: (clan.venueSource ?? 'USER_SUBMITTED') as GymDiscoverySource,
        address: clan.address ?? null,
        city: clan.city ?? null,
        countryCode: clan.countryCode ?? null,
        externalPlaceId: clan.externalPlaceId ?? null,
        distanceMeters,
      };
      dbMatchCandidates.push(candidate);

      if (distanceMeters <= dbSearchWindow) {
        dbVenuesByClanId.set(clan.id, {
          venueKey: candidate.venueKey,
          name: candidate.name,
          source: candidate.venueSource,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          address: candidate.address,
          city: candidate.city,
          countryCode: candidate.countryCode,
          externalPlaceId: candidate.externalPlaceId,
          distanceMeters: candidate.distanceMeters,
          existingClanId: candidate.id,
          existingClanTag: candidate.tag,
          existingClanLevel: candidate.clanLevel,
          memberCount: candidate.memberCount,
        });
      }
    }

    const sourcesUsed: string[] = ['LOCAL_DB'];
    const overpassResult = await this.overpassAdapter.searchNearby({
      latitude: params.latitude,
      longitude: params.longitude,
      radiusMeters,
    });
    const overpassFallbackUsed = overpassResult.failed;

    if (!overpassResult.failed) {
      sourcesUsed.push('OSM_OVERPASS');
    }

    const rawExternalVenues: RawDiscoveredVenue[] = [...overpassResult.venues];
    if (this.externalAdapter.isConfigured()) {
      try {
        const extra = await this.externalAdapter.searchNearby({
          latitude: params.latitude,
          longitude: params.longitude,
          radiusMeters,
          query: params.query,
        });
        if (extra.length > 0) {
          sourcesUsed.push(this.externalAdapter.name.toUpperCase());
          rawExternalVenues.push(...extra);
        }
      } catch {
        // Never fail venue discovery if an optional external adapter errors.
      }
    }

    const mergedVenues: DiscoveredGymVenue[] = Array.from(dbVenuesByClanId.values());

    for (const raw of rawExternalVenues) {
      const matchedDbClan = findDeduplicatedVenueMatch(
        {
          venueKey: raw.venueKey,
          name: raw.name,
          latitude: raw.latitude,
          longitude: raw.longitude,
        },
        dbMatchCandidates
      );

      if (matchedDbClan) {
        const existingEntry = dbVenuesByClanId.get(matchedDbClan.id);
        if (existingEntry) {
          existingEntry.osmElementType = existingEntry.osmElementType ?? raw.osmElementType ?? null;
          existingEntry.osmElementId = existingEntry.osmElementId ?? raw.osmElementId ?? null;
          if (!existingEntry.address && raw.address) existingEntry.address = raw.address;
          if (!existingEntry.city && raw.city) existingEntry.city = raw.city;
          if (!existingEntry.countryCode && raw.countryCode) {
            existingEntry.countryCode = raw.countryCode;
          }
        }
        continue;
      }

      const duplicateDiscovered = findDeduplicatedVenueMatch(
        {
          venueKey: raw.venueKey,
          name: raw.name,
          latitude: raw.latitude,
          longitude: raw.longitude,
        },
        mergedVenues
      );
      if (duplicateDiscovered) {
        continue;
      }

      mergedVenues.push({
        venueKey: raw.venueKey,
        name: raw.name,
        source: raw.source,
        latitude: raw.latitude,
        longitude: raw.longitude,
        address: raw.address,
        city: raw.city,
        countryCode: raw.countryCode,
        externalPlaceId: raw.externalPlaceId,
        osmElementType: raw.osmElementType ?? null,
        osmElementId: raw.osmElementId ?? null,
        distanceMeters: Math.round(
          calculateDistanceMeters(params.latitude, params.longitude, raw.latitude, raw.longitude)
        ),
        existingClanId: null,
        existingClanTag: null,
        existingClanLevel: null,
        memberCount: 0,
      });
    }

    const normalizedQuery = params.query?.trim().toLowerCase() ?? '';
    const filtered = normalizedQuery
      ? mergedVenues.filter((venue) => {
          return (
            venue.name.toLowerCase().includes(normalizedQuery) ||
            (venue.city?.toLowerCase().includes(normalizedQuery) ?? false) ||
            (venue.address?.toLowerCase().includes(normalizedQuery) ?? false)
          );
        })
      : mergedVenues;

    filtered.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return {
      venues: filtered,
      sourcesUsed,
      overpassFallbackUsed,
    };
  }
}
