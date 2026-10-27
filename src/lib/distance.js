// 지구 평균 반지름 (미터)
const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * 두 지점 사이의 지구 표면 직선거리(대원 거리)를 미터로 계산합니다.
 * 하버사인(Haversine) 공식을 사용하며, 도로를 따라가는 거리가 아닙니다.
 */
export function haversineDistance(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 미터 값을 { km: '1.23 km', m: '1,234 m' } 형태의 글자로 바꿉니다. */
export function formatDistance(meters) {
  return {
    km: `${(meters / 1000).toFixed(2)} km`,
    m: `${Math.round(meters).toLocaleString('ko-KR')} m`,
  };
}
