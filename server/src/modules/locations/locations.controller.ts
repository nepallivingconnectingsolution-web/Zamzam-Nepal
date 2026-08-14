import { Controller, Get, Injectable, Logger, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SearchLocationsDto } from './dto/locations.dto';

export interface LocationResult {
  id: string;
  label: string;
  secondary: string | null;
  lat: number;
  lng: number;
}

interface CacheEntry {
  expiresAt: number;
  results: LocationResult[];
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
}

const USER_AGENT = 'ZamzamSuperApp/1.0 (+https://zamzam-super-app.vercel.app)';
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;
const NOMINATIM_MIN_GAP_MS = 1100;

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastCallAt = 0;

  async search(rawQuery: string): Promise<LocationResult[]> {
    const query = rawQuery.trim();
    const cacheKey = query.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.results;
    }

    let results: LocationResult[];
    try {
      results = await this.queryNominatim(query);
    } catch (err) {
      this.logger.warn(`Nominatim search failed for "${query}": ${err instanceof Error ? err.message : err}`);
      return [];
    }

    this.setCache(cacheKey, results);
    return results;
  }

  private async queryNominatim(query: string): Promise<LocationResult[]> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '0');
    url.searchParams.set('limit', '8');
    url.searchParams.set('countrycodes', 'np');
    url.searchParams.set('accept-language', 'en');

    const res = await this.throttledFetch(url.toString());
    if (!res.ok) {
      throw new Error(`Nominatim responded ${res.status}`);
    }
    const rows = (await res.json()) as NominatimResult[];
    return rows.map((r) => this.toResult(r));
  }

  private toResult(r: NominatimResult): LocationResult {
    const parts = r.display_name.split(',').map((p) => p.trim());
    const label = r.name?.trim() || parts[0] || r.display_name;
    const rest = parts[0] === label ? parts.slice(1) : parts;
    const secondary = rest.length > 0 ? rest.join(', ') : null;
    return {
      id: String(r.place_id),
      label,
      secondary,
      lat: Number(r.lat),
      lng: Number(r.lon),
    };
  }

  private throttledFetch(url: string): Promise<Response> {
    const run = this.queue.then(async () => {
      const wait = Math.max(0, this.lastCallAt + NOMINATIM_MIN_GAP_MS - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastCallAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        return await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private setCache(key: string, results: LocationResult[]) {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}

@Controller('locations')
@UseGuards(JwtAuthGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('search')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  search(@Query() dto: SearchLocationsDto) {
    return this.locations.search(dto.q);
  }
}