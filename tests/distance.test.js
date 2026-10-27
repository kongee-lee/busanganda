import { describe, it, expect } from 'vitest';
import { haversineDistance, formatDistance } from '../src/lib/distance.js';
import { DEFAULT_PLACES } from '../src/data/defaultPlaces.js';

const [haeundae, gwangalli, gamcheon] = DEFAULT_PLACES;

describe('직선거리 계산', () => {
  it('같은 지점은 0 m', () => {
    expect(haversineDistance(haeundae, haeundae)).toBe(0);
  });

  it('해운대 ↔ 광안리는 약 3.8 km', () => {
    const d = haversineDistance(haeundae, gwangalli);
    expect(d).toBeGreaterThan(3700);
    expect(d).toBeLessThan(3900);
  });

  it('방향을 바꿔도 거리가 같음', () => {
    expect(haversineDistance(haeundae, gamcheon)).toBeCloseTo(haversineDistance(gamcheon, haeundae), 6);
  });

  it('위도 1도는 약 111 km', () => {
    expect(haversineDistance({ lat: 35, lng: 129 }, { lat: 36, lng: 129 }) / 1000).toBeCloseTo(111.2, 0);
  });

  it('km와 m 글자로 바꿈', () => {
    expect(formatDistance(12345.6)).toEqual({ km: '12.35 km', m: '12,346 m' });
    expect(formatDistance(0)).toEqual({ km: '0.00 km', m: '0 m' });
  });
});
