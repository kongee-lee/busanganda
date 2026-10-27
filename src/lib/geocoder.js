// 카카오 지도 JavaScript SDK로 도로명(지번) 주소를 위도·경도로 바꿉니다.
// 키는 코드에 넣지 않고 환경 변수 VITE_KAKAO_JS_KEY에서 읽습니다.

const SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js';

let sdkPromise = null;

/** 카카오 SDK를 한 번만 불러옵니다. */
export function loadKakaoSdk(appKey, doc = globalThis.document) {
  if (globalThis.kakao?.maps?.services) return Promise.resolve(globalThis.kakao);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = `${SDK_URL}?appkey=${encodeURIComponent(appKey)}&libraries=services&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!globalThis.kakao?.maps?.load) {
        reject(new Error('sdk'));
        return;
      }
      globalThis.kakao.maps.load(() => resolve(globalThis.kakao));
    };
    script.onerror = () => reject(new Error('sdk'));
    doc.head.append(script);
  }).catch((err) => {
    sdkPromise = null; // 다음에 다시 시도할 수 있게 합니다.
    throw err;
  });
  return sdkPromise;
}

/** 카카오 주소 검색 결과 한 건을 앱에서 쓰는 모양으로 바꿉니다. */
export function toResult(doc) {
  const lat = Number(doc.y);
  const lng = Number(doc.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const road = doc.road_address?.address_name;
  const jibun = doc.address?.address_name;
  return { address: road || jibun || doc.address_name, lat, lng };
}

/**
 * 주소 검색기를 만듭니다.
 * search(주소)는 [{ address, lat, lng }] 목록을 돌려주고,
 * 실패하면 한국어 안내 문구가 담긴 Error를 던집니다.
 */
export function createGeocoder(appKey, loadSdk = loadKakaoSdk) {
  const available = Boolean(appKey);

  async function search(query) {
    const text = String(query ?? '').trim();
    if (!text) throw new Error('찾을 주소를 입력해 주세요.');
    if (!available) throw new Error('주소 검색 키가 설정되지 않았어요. 지도를 클릭해서 위치를 골라 주세요.');

    let kakao;
    try {
      kakao = await loadSdk(appKey);
    } catch {
      throw new Error('주소 검색 서비스에 연결하지 못했어요. 인터넷 연결이나 키 설정을 확인해 주세요.');
    }

    const geocoder = new kakao.maps.services.Geocoder();
    const { Status } = kakao.maps.services;
    return new Promise((resolve, reject) => {
      geocoder.addressSearch(text, (data, status) => {
        if (status === Status.OK) {
          resolve(data.map(toResult).filter(Boolean).slice(0, 5));
        } else if (status === Status.ZERO_RESULT) {
          reject(new Error('주소를 찾지 못했어요. 도로명과 건물 번호를 확인해 주세요. (예: 부산 해운대구 해운대해변로 264)'));
        } else {
          reject(new Error('주소 검색 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.'));
        }
      });
    });
  }

  return { available, search };
}
