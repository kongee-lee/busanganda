import { describe, it, expect, beforeEach } from 'vitest';
import { createPlaceStore, STORAGE_KEY } from '../src/lib/placeStore.js';

// 브라우저 localStorage를 흉내 낸 가짜 저장소
function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const TAEJONGDAE = { name: '태종대', lat: 35.0532, lng: 129.0874 };

describe('장소 저장소', () => {
  let storage;
  beforeEach(() => { storage = fakeStorage(); });

  it('처음에는 예시 장소 3곳이 있음', () => {
    const names = createPlaceStore(storage).getAll().map((p) => p.name);
    expect(names).toEqual(['해운대해수욕장', '광안리해수욕장', '감천문화마을']);
  });

  it('저장: 새 장소를 추가하고 다시 열어도 남아 있음', () => {
    const res = createPlaceStore(storage).add({ ...TAEJONGDAE, name: '  태종대  ' });
    expect(res.ok).toBe(true);
    expect(res.saved).toBe(true);
    expect(res.place.name).toBe('태종대');

    const reopened = createPlaceStore(storage); // 브라우저를 다시 연 상황
    expect(reopened.getAll()).toHaveLength(4);
    expect(reopened.getById(res.place.id)).toMatchObject(TAEJONGDAE);
  });

  it('수정: 이름과 위치를 바꾸고 다시 열어도 바뀐 값이 남아 있음', () => {
    const store = createPlaceStore(storage);
    const { place } = store.add(TAEJONGDAE);
    const res = store.update(place.id, { name: '태종대 전망대', lat: 35.0510, lng: 129.0860 });
    expect(res.ok).toBe(true);

    const saved = createPlaceStore(storage).getById(place.id);
    expect(saved).toEqual({ id: place.id, name: '태종대 전망대', lat: 35.0510, lng: 129.0860 });
  });

  it('수정: 자기 자신과는 중복으로 보지 않음', () => {
    const store = createPlaceStore(storage);
    const { place } = store.add(TAEJONGDAE);
    expect(store.update(place.id, TAEJONGDAE).ok).toBe(true);
  });

  it('삭제: 지운 장소는 다시 열어도 없음', () => {
    const store = createPlaceStore(storage);
    const { place } = store.add(TAEJONGDAE);
    expect(store.remove(place.id).ok).toBe(true);
    expect(createPlaceStore(storage).getById(place.id)).toBeNull();
  });

  it('모두 삭제하면 빈 목록이 유지됨 (예시가 다시 생기지 않음)', () => {
    const store = createPlaceStore(storage);
    for (const p of store.getAll()) store.remove(p.id);
    expect(createPlaceStore(storage).getAll()).toEqual([]);
  });

  it('없는 장소 수정·삭제는 오류 메시지', () => {
    const store = createPlaceStore(storage);
    expect(store.update('nope', TAEJONGDAE).ok).toBe(false);
    expect(store.remove('nope').ok).toBe(false);
  });

  it('필수 입력 누락을 막음', () => {
    const store = createPlaceStore(storage);
    expect(store.add({ name: '   ', lat: 35, lng: 129 }).error).toMatch('이름');
    expect(store.add({ name: '어딘가' }).error).toMatch('지도를 클릭');
    expect(store.add({ name: '어딘가', lat: 'abc', lng: 129 }).error).toMatch('지도를 클릭');
    expect(store.add({ name: '어딘가', lat: 95, lng: 129 }).ok).toBe(false);
    expect(store.getAll()).toHaveLength(3);
  });

  it('같은 이름 중복 등록을 막음 (띄어쓰기·대소문자 무시)', () => {
    const store = createPlaceStore(storage);
    const res = store.add({ name: ' 해운대해수욕장 ', lat: 35.2, lng: 129.2 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch('이미 등록된 이름');
    store.add({ name: 'Busan Tower', lat: 35.1, lng: 129.03 });
    expect(store.add({ name: 'busan  tower', lat: 35.2, lng: 129.2 }).ok).toBe(false);
  });

  it('같은 위치 중복 등록을 막음', () => {
    const store = createPlaceStore(storage);
    const res = store.add({ name: '해운대 바로 옆', lat: 35.15871, lng: 129.16041 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch('같은 위치');
  });

  it('저장 데이터가 망가져 있어도 오류 없이 예시 장소로 시작', () => {
    storage.setItem(STORAGE_KEY, '{망가진 데이터');
    expect(createPlaceStore(storage).getAll()).toHaveLength(3);
  });

  it('저장소를 쓸 수 없어도 앱은 동작함', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    const store = createPlaceStore(broken);
    const res = store.add(TAEJONGDAE);
    expect(res.ok).toBe(true);
    expect(res.saved).toBe(false);
    expect(store.getAll()).toHaveLength(4);
  });
});
