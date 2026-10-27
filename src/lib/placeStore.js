import { DEFAULT_PLACES } from '../data/defaultPlaces.js';
import { haversineDistance } from './distance.js';

export const STORAGE_KEY = 'busan-map.places.v1';
// 이 거리(미터)보다 가까운 곳은 같은 위치로 봅니다.
export const SAME_SPOT_METERS = 10;

const normalizeName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

// 저장할 장소 모양을 만듭니다. 주소는 있을 때만 넣습니다.
function toPlace(id, input) {
  const place = { id, name: normalizeName(input.name), lat: Number(input.lat), lng: Number(input.lng) };
  const address = normalizeName(input.address);
  if (address) place.address = address;
  return place;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `place-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 입력값을 검사합니다. 문제가 없으면 null, 있으면 한국어 안내 문구를 돌려줍니다.
 * ignoreId: 수정 중인 장소는 중복 검사에서 제외합니다.
 */
export function validatePlace(input, places, ignoreId = null) {
  const name = normalizeName(input?.name);
  if (!name) return '장소 이름을 입력해 주세요.';
  if (name.length > 40) return '장소 이름은 40글자 이하로 입력해 주세요.';

  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  if (input?.lat == null || input?.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '주소를 찾거나 지도를 클릭해서 장소의 위치를 골라 주세요.';
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return '위치 값이 올바르지 않아요. 지도를 다시 클릭해 주세요.';
  }

  const others = places.filter((p) => p.id !== ignoreId);
  const sameName = others.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (sameName) return `'${sameName.name}'은(는) 이미 등록된 이름이에요. 다른 이름을 써 주세요.`;

  const sameSpot = others.find((p) => haversineDistance(p, { lat, lng }) < SAME_SPOT_METERS);
  if (sameSpot) return `'${sameSpot.name}'과(와) 같은 위치예요. 다른 곳을 골라 주세요.`;

  return null;
}

/** localStorage(또는 같은 모양의 저장소)를 이용하는 장소 저장소를 만듭니다. */
export function createPlaceStore(storage = globalThis.localStorage) {
  let places = load();

  function load() {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw == null) return DEFAULT_PLACES.map((p) => ({ ...p }));
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('bad data');
      return parsed.filter(
        (p) => p && typeof p.id === 'string' && typeof p.name === 'string' &&
          Number.isFinite(p.lat) && Number.isFinite(p.lng),
      );
    } catch {
      // 저장된 내용이 망가졌거나 저장소를 쓸 수 없으면 예시 장소로 시작합니다.
      return DEFAULT_PLACES.map((p) => ({ ...p }));
    }
  }

  function save() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(places));
      return true;
    } catch {
      return false;
    }
  }

  const result = (ok, extra) => ({ ok, ...extra });

  return {
    getAll: () => places.map((p) => ({ ...p })),
    getById: (id) => {
      const found = places.find((p) => p.id === id);
      return found ? { ...found } : null;
    },
    add(input) {
      const error = validatePlace(input, places);
      if (error) return result(false, { error });
      const place = toPlace(makeId(), input);
      places.push(place);
      return result(true, { place: { ...place }, saved: save() });
    },
    update(id, input) {
      const index = places.findIndex((p) => p.id === id);
      if (index === -1) return result(false, { error: '수정할 장소를 찾지 못했어요.' });
      const error = validatePlace(input, places, id);
      if (error) return result(false, { error });
      places[index] = toPlace(id, input);
      return result(true, { place: { ...places[index] }, saved: save() });
    },
    remove(id) {
      const before = places.length;
      places = places.filter((p) => p.id !== id);
      if (places.length === before) return result(false, { error: '삭제할 장소를 찾지 못했어요.' });
      return result(true, { saved: save() });
    },
    resetToDefaults() {
      places = DEFAULT_PLACES.map((p) => ({ ...p }));
      return result(true, { saved: save() });
    },
  };
}
