import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { BUSAN_CENTER, BUSAN_ZOOM } from './data/defaultPlaces.js';
import { createPlaceStore } from './lib/placeStore.js';
import { haversineDistance, formatDistance } from './lib/distance.js';
import { createGeocoder } from './lib/geocoder.js';

const store = createPlaceStore();
const geocoder = createGeocoder(import.meta.env.VITE_KAKAO_JS_KEY);

// 화면 상태: 선택한 두 장소, 수정 중인 장소, 지도에서 고른 위치
const state = {
  selected: { a: null, b: null },
  editingId: null,
  draft: null, // { lat, lng, address? }
};

const $ = (id) => document.getElementById(id);
const els = {
  selectA: $('select-a'),
  selectB: $('select-b'),
  result: $('distance-result'),
  clearSelection: $('clear-selection'),
  form: $('place-form'),
  formTitle: $('form-title'),
  name: $('place-name'),
  address: $('place-address'),
  addressSearchBtn: $('address-search-btn'),
  addressResults: $('address-results'),
  addressHint: $('address-hint'),
  position: $('place-position'),
  message: $('form-message'),
  saveBtn: $('save-btn'),
  cancelBtn: $('cancel-btn'),
  list: $('place-list'),
  count: $('place-count'),
  resetBtn: $('reset-btn'),
};

const fmtCoord = (n) => Number(n).toFixed(5);
const coordText = (p) => `위도 ${fmtCoord(p.lat)}, 경도 ${fmtCoord(p.lng)}`;

// 작은 HTML 요소를 만드는 도우미 (사용자가 입력한 글자는 textContent로 넣어 안전하게 표시)
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

/* ---------- 지도 ---------- */

const map = L.map('map', { zoomControl: true }).setView(BUSAN_CENTER, BUSAN_ZOOM);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
let distanceLine = null;
let draftMarker = null;

function pinIcon(kind, label = '') {
  return L.divIcon({
    className: '',
    html: `<div class="pin ${kind}"><span>${label}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 30],
    popupAnchor: [0, -28],
  });
}

function popupContent(place) {
  const pickA = el('button', { type: 'button', className: 'btn btn-pick-a', textContent: '① 첫 번째로 선택' });
  const pickB = el('button', { type: 'button', className: 'btn btn-pick-b', textContent: '② 두 번째로 선택' });
  pickA.addEventListener('click', () => { selectPlace('a', place.id); map.closePopup(); });
  pickB.addEventListener('click', () => { selectPlace('b', place.id); map.closePopup(); });
  return el('div', {}, [
    el('div', { className: 'popup-name', textContent: place.name }),
    ...(place.address ? [el('div', { className: 'popup-address', textContent: place.address })] : []),
    el('div', { className: 'popup-coords', textContent: `위도: ${fmtCoord(place.lat)}` }),
    el('div', { className: 'popup-coords', textContent: `경도: ${fmtCoord(place.lng)}` }),
    el('div', { className: 'popup-actions' }, [pickA, pickB]),
  ]);
}

function renderMarkers(places) {
  markerLayer.clearLayers();
  for (const place of places) {
    let kind = '';
    let label = '';
    if (place.id === state.selected.a) { kind = 'a'; label = '1'; }
    if (place.id === state.selected.b) { kind = kind ? 'a' : 'b'; label = label ? '1·2' : '2'; }
    L.marker([place.lat, place.lng], {
      icon: pinIcon(kind, label),
      title: place.name,
      placeId: place.id,
      zIndexOffset: kind ? 1000 : 0,
    })
      .bindPopup(() => popupContent(place))
      .addTo(markerLayer);
  }
}

// 지도를 클릭하면 등록할 위치로 사용합니다. (주소로 못 찾을 때 쓰는 보조 방법)
// 클릭한 곳은 주소를 알 수 없으므로 주소 칸을 비웁니다.
map.on('click', (e) => {
  els.address.value = '';
  els.addressResults.replaceChildren();
  setDraft({ lat: e.latlng.lat, lng: e.latlng.lng });
  showMessage('');
  if (!els.name.value.trim()) els.name.focus({ preventScroll: true });
});

function setDraft(pos) {
  state.draft = pos;
  if (draftMarker) { draftMarker.remove(); draftMarker = null; }
  if (pos) {
    draftMarker = L.marker([pos.lat, pos.lng], { icon: pinIcon('draft', '+'), interactive: false, zIndexOffset: 2000 }).addTo(map);
    els.position.textContent = pos.address ? `${pos.address}\n${coordText(pos)}` : `${coordText(pos)} (지도에서 고른 위치)`;
    els.position.classList.remove('empty');
  } else {
    els.position.textContent = '주소를 찾거나 지도를 클릭해 주세요.';
    els.position.classList.add('empty');
  }
}

/* ---------- 도로명 주소 검색 ---------- */

function applyAddressResult(result) {
  els.address.value = result.address;
  els.addressResults.replaceChildren();
  setDraft(result);
  map.setView([result.lat, result.lng], Math.max(map.getZoom(), 16));
  showMessage('찾은 위치를 확인하고 [저장하기]를 눌러 주세요. 조금 다르면 지도를 클릭해 고칠 수 있어요.');
}

async function searchAddress() {
  els.addressResults.replaceChildren();
  els.addressSearchBtn.disabled = true;
  els.addressSearchBtn.textContent = '찾는 중…';
  try {
    const results = await geocoder.search(els.address.value);
    if (results.length === 1) {
      applyAddressResult(results[0]);
    } else {
      showMessage('주소가 여러 개 나왔어요. 맞는 주소를 골라 주세요.');
      els.addressResults.replaceChildren(...results.map((r) => {
        const btn = el('button', { type: 'button', textContent: r.address });
        btn.addEventListener('click', () => applyAddressResult(r));
        return el('li', {}, [btn]);
      }));
    }
  } catch (err) {
    showMessage(err.message, 'error');
  } finally {
    els.addressSearchBtn.disabled = !geocoder.available;
    els.addressSearchBtn.textContent = '주소 찾기';
  }
}

els.addressSearchBtn.addEventListener('click', searchAddress);
// 주소 칸에서 Enter를 누르면 저장 대신 주소를 찾습니다.
els.address.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    if (geocoder.available) searchAddress();
  }
});

if (geocoder.available) {
  els.addressHint.textContent = '주소를 입력하고 [주소 찾기]를 누르면 지도에 표시돼요. 주소로 못 찾는 곳은 지도를 클릭해도 돼요.';
} else {
  els.address.disabled = true;
  els.addressSearchBtn.disabled = true;
  els.addressHint.textContent = '주소 검색 키가 설정되지 않아 지금은 지도를 클릭해서 위치를 골라 주세요. (설정 방법은 README 참고)';
}

/* ---------- 거리 재기 ---------- */

function selectPlace(slot, id) {
  state.selected[slot] = id || null;
  render();
}

function renderSelects(places) {
  for (const [slot, select] of [['a', els.selectA], ['b', els.selectB]]) {
    select.replaceChildren(
      el('option', { value: '', textContent: places.length ? '장소를 골라 주세요' : '등록된 장소가 없어요' }),
      ...places.map((p) => el('option', { value: p.id, textContent: p.name })),
    );
    select.value = state.selected[slot] ?? '';
    select.disabled = places.length === 0;
  }
}

function renderDistance() {
  if (distanceLine) { distanceLine.remove(); distanceLine = null; }
  const a = state.selected.a && store.getById(state.selected.a);
  const b = state.selected.b && store.getById(state.selected.b);
  const box = els.result;
  box.className = 'result';

  if (store.getAll().length === 0) {
    box.textContent = '등록된 장소가 없어요. 아래에서 장소를 먼저 등록해 주세요.';
    return;
  }
  if (!a || !b) {
    const missing = !a && !b ? '두 장소를' : !a ? '첫 번째 장소를' : '두 번째 장소를';
    box.textContent = `${missing} 골라 주세요. 목록이나 지도 위의 핀을 눌러서 고를 수 있어요.`;
    return;
  }
  if (a.id === b.id) {
    box.classList.add('warn');
    box.textContent = '같은 장소를 두 번 골랐어요. 서로 다른 장소를 골라 주세요.';
    return;
  }

  const meters = haversineDistance(a, b);
  const { km, m } = formatDistance(meters);
  distanceLine = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
    color: '#1565c0', weight: 4, dashArray: '8 6',
  }).addTo(map);
  distanceLine.bindTooltip(`${km} (${m})`, { permanent: true, direction: 'center', className: 'line-label' });

  box.classList.add('done');
  box.replaceChildren(
    el('div', { textContent: `${a.name} ↔ ${b.name}` }),
    el('div', { className: 'big', textContent: km }),
    el('div', { textContent: `= ${m}` }),
  );
}

els.selectA.addEventListener('change', () => selectPlace('a', els.selectA.value));
els.selectB.addEventListener('change', () => selectPlace('b', els.selectB.value));
els.clearSelection.addEventListener('click', () => {
  state.selected = { a: null, b: null };
  render();
});

/* ---------- 장소 목록 ---------- */

function renderList(places) {
  els.count.textContent = `(${places.length}곳)`;
  if (places.length === 0) {
    els.list.replaceChildren(el('li', { className: 'empty-list', textContent: '아직 등록된 장소가 없어요. 주소를 찾거나 지도를 클릭해 새 장소를 등록해 보세요.' }));
    return;
  }
  els.list.replaceChildren(...places.map((place) => {
    const nameBtn = el('button', { type: 'button', className: 'name', textContent: place.name, title: '지도에서 보기' });
    nameBtn.addEventListener('click', () => focusPlace(place));

    const pickA = el('button', { type: 'button', className: `btn btn-pick-a${state.selected.a === place.id ? ' on' : ''}`, textContent: '① 선택' });
    const pickB = el('button', { type: 'button', className: `btn btn-pick-b${state.selected.b === place.id ? ' on' : ''}`, textContent: '② 선택' });
    const edit = el('button', { type: 'button', className: 'btn', textContent: '수정' });
    const del = el('button', { type: 'button', className: 'btn btn-danger', textContent: '삭제' });
    pickA.addEventListener('click', () => selectPlace('a', place.id));
    pickB.addEventListener('click', () => selectPlace('b', place.id));
    edit.addEventListener('click', () => startEdit(place.id));
    del.addEventListener('click', () => deletePlace(place.id));

    return el('li', { className: `place-item${state.editingId === place.id ? ' editing' : ''}` }, [
      nameBtn,
      ...(place.address ? [el('div', { className: 'address', textContent: place.address })] : []),
      el('div', { className: 'coords', textContent: coordText(place) }),
      el('div', { className: 'actions' }, [pickA, pickB, edit, del]),
    ]);
  }));
}

function focusPlace(place) {
  map.setView([place.lat, place.lng], Math.max(map.getZoom(), 14));
  markerLayer.eachLayer((m) => {
    if (m.options.placeId === place.id) m.openPopup();
  });
}

/* ---------- 등록 · 수정 · 삭제 ---------- */

function showMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = `message ${type}`;
}

function resetForm() {
  state.editingId = null;
  els.name.value = '';
  els.address.value = '';
  els.addressResults.replaceChildren();
  setDraft(null);
  els.formTitle.textContent = '➕ 나만의 명소 등록';
  els.saveBtn.textContent = '저장하기';
}

function startEdit(id) {
  const place = store.getById(id);
  if (!place) return;
  state.editingId = id;
  els.name.value = place.name;
  els.address.value = place.address ?? '';
  els.addressResults.replaceChildren();
  setDraft({ lat: place.lat, lng: place.lng, address: place.address });
  els.formTitle.textContent = '✏️ 장소 수정';
  els.saveBtn.textContent = '수정 저장';
  showMessage('이름을 고치거나 새 주소를 찾은 뒤 [수정 저장]을 눌러 주세요.');
  map.setView([place.lat, place.lng], Math.max(map.getZoom(), 14));
  render();
  els.form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function deletePlace(id) {
  const place = store.getById(id);
  if (!place) return;
  if (!window.confirm(`'${place.name}'을(를) 삭제할까요?`)) return;
  const res = store.remove(id);
  if (!res.ok) { showMessage(res.error, 'error'); return; }
  if (state.selected.a === id) state.selected.a = null;
  if (state.selected.b === id) state.selected.b = null;
  if (state.editingId === id) resetForm();
  showMessage(savedNotice(res, `'${place.name}'을(를) 삭제했어요.`), res.saved ? 'success' : 'error');
  render();
}

function savedNotice(res, text) {
  return res.saved ? text : `${text} (브라우저 저장 공간을 쓸 수 없어 새로고침하면 사라질 수 있어요.)`;
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = { name: els.name.value, lat: state.draft?.lat, lng: state.draft?.lng, address: state.draft?.address };
  const editing = state.editingId;
  const res = editing ? store.update(editing, input) : store.add(input);
  if (!res.ok) { showMessage(res.error, 'error'); return; }
  resetForm();
  showMessage(savedNotice(res, `'${res.place.name}'을(를) ${editing ? '수정' : '저장'}했어요.`), res.saved ? 'success' : 'error');
  render();
});

els.cancelBtn.addEventListener('click', () => {
  resetForm();
  showMessage('');
  render();
});

els.resetBtn.addEventListener('click', () => {
  if (!window.confirm('직접 등록한 장소가 모두 지워지고 예시 장소 3곳만 남아요. 계속할까요?')) return;
  store.resetToDefaults();
  state.selected = { a: null, b: null };
  resetForm();
  showMessage('예시 장소로 되돌렸어요.', 'success');
  render();
});

/* ---------- 전체 다시 그리기 ---------- */

function render() {
  const places = store.getAll();
  // 지워진 장소를 가리키는 선택은 비웁니다.
  for (const slot of ['a', 'b']) {
    if (state.selected[slot] && !places.some((p) => p.id === state.selected[slot])) state.selected[slot] = null;
  }
  renderSelects(places);
  renderMarkers(places);
  renderList(places);
  renderDistance();
}

render();

// 처음 열 때 모든 장소가 화면에 들어오도록 맞춥니다. (장소가 없으면 부산 중심을 보여 줘요)
const initialPlaces = store.getAll();
if (initialPlaces.length > 1) {
  map.fitBounds(initialPlaces.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: BUSAN_ZOOM + 1 });
}
