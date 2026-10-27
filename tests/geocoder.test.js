import { describe, it, expect } from 'vitest';
import { createGeocoder, toResult } from '../src/lib/geocoder.js';

const Status = { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' };

// 카카오 SDK를 흉내 낸 가짜: 주소 → [결과, 상태]
function fakeSdk(answer) {
  return async () => ({
    maps: {
      services: {
        Status,
        Geocoder: class {
          addressSearch(query, cb) { cb(...answer(query)); }
        },
      },
    },
  });
}

const TAEJONGDAE_DOC = {
  address_name: '부산 영도구 동삼동 1-1',
  x: '129.0874', y: '35.0532',
  road_address: { address_name: '부산 영도구 전망로 24' },
  address: { address_name: '부산 영도구 동삼동 1-1' },
};

describe('주소 검색', () => {
  it('도로명 주소를 위도·경도로 바꿈', async () => {
    const geocoder = createGeocoder('test-key', fakeSdk(() => [[TAEJONGDAE_DOC], Status.OK]));
    expect(await geocoder.search('부산 영도구 전망로 24')).toEqual([
      { address: '부산 영도구 전망로 24', lat: 35.0532, lng: 129.0874 },
    ]);
  });

  it('도로명이 없으면 지번 주소를 씀', () => {
    expect(toResult({ ...TAEJONGDAE_DOC, road_address: null }).address).toBe('부산 영도구 동삼동 1-1');
  });

  it('결과가 없으면 안내 문구', async () => {
    const geocoder = createGeocoder('test-key', fakeSdk(() => [[], Status.ZERO_RESULT]));
    await expect(geocoder.search('없는 주소 999')).rejects.toThrow('주소를 찾지 못했어요');
  });

  it('빈 주소는 검색하지 않음', async () => {
    const geocoder = createGeocoder('test-key', fakeSdk(() => { throw new Error('호출되면 안 됨'); }));
    await expect(geocoder.search('   ')).rejects.toThrow('주소를 입력');
  });

  it('키가 없으면 사용할 수 없다고 안내', async () => {
    const geocoder = createGeocoder('');
    expect(geocoder.available).toBe(false);
    await expect(geocoder.search('부산')).rejects.toThrow('키가 설정되지 않았어요');
  });

  it('SDK를 못 불러오면 연결 오류 안내', async () => {
    const geocoder = createGeocoder('test-key', async () => { throw new Error('network'); });
    await expect(geocoder.search('부산')).rejects.toThrow('연결하지 못했어요');
  });
});
