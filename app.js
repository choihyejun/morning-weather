// 아침 날씨 웹앱 — Open-Meteo (API 키 불필요)

const DEFAULT_PLACE = { name: "서울", lat: 37.5665, lon: 126.978 };

const WMO = {
  0: ["맑음", "☀️"], 1: ["대체로 맑음", "🌤️"], 2: ["구름 조금", "⛅"], 3: ["흐림", "☁️"],
  45: ["안개", "🌫️"], 48: ["짙은 안개", "🌫️"],
  51: ["약한 이슬비", "🌦️"], 53: ["이슬비", "🌦️"], 55: ["강한 이슬비", "🌧️"],
  56: ["어는 이슬비", "🌧️"], 57: ["어는 이슬비", "🌧️"],
  61: ["약한 비", "🌦️"], 63: ["비", "🌧️"], 65: ["강한 비", "🌧️"],
  66: ["어는 비", "🌧️"], 67: ["어는 비", "🌧️"],
  71: ["약한 눈", "🌨️"], 73: ["눈", "🌨️"], 75: ["많은 눈", "❄️"], 77: ["싸락눈", "🌨️"],
  80: ["소나기", "🌦️"], 81: ["소나기", "🌧️"], 82: ["강한 소나기", "⛈️"],
  85: ["눈보라", "🌨️"], 86: ["강한 눈보라", "❄️"],
  95: ["뇌우", "⛈️"], 96: ["우박 동반 뇌우", "⛈️"], 99: ["강한 우박 뇌우", "⛈️"],
};
const wmo = (c) => WMO[c] || ["알 수 없음", "❔"];

const $ = (id) => document.getElementById(id);

// ---------- 저장소 ----------
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

let place = load("place", DEFAULT_PLACE);
let alarm = load("alarm", { time: "07:00", on: false, lastDate: null });
let lastData = null;

// ---------- 데이터 ----------
async function fetchWeather({ lat, lon }) {
  const w = new URL("https://api.open-meteo.com/v1/forecast");
  w.search = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: "auto", forecast_days: 2,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset",
    wind_speed_unit: "ms",
  });
  const a = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  a.search = new URLSearchParams({ latitude: lat, longitude: lon, timezone: "auto", current: "pm10,pm2_5" });

  const [wr, ar] = await Promise.all([fetch(w), fetch(a).catch(() => null)]);
  if (!wr.ok) throw new Error("날씨 정보를 가져오지 못했어요");
  const weather = await wr.json();
  const air = ar && ar.ok ? await ar.json() : null;
  return { weather, air };
}

async function searchCity(q) {
  const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
  u.search = new URLSearchParams({ name: q, count: 6, language: "ko", format: "json" });
  const r = await fetch(u);
  const j = await r.json();
  return j.results || [];
}

// ---------- 해석 ----------
function pmGrade(v, type) {
  if (v == null) return null;
  const cut = type === "pm25" ? [15, 35, 75] : [30, 80, 150];
  if (v <= cut[0]) return "좋음";
  if (v <= cut[1]) return "보통";
  if (v <= cut[2]) return "나쁨";
  return "매우나쁨";
}

function outfit(t) {
  if (t >= 28) return "민소매·반팔·반바지";
  if (t >= 23) return "반팔·얇은 셔츠";
  if (t >= 20) return "얇은 가디건·긴팔";
  if (t >= 17) return "맨투맨·얇은 니트";
  if (t >= 12) return "자켓·가디건";
  if (t >= 9) return "트렌치코트·야상";
  if (t >= 5) return "코트·히트텍";
  return "패딩·목도리 필수";
}

function buildBriefing(weather, air) {
  const d = weather.daily, h = weather.hourly;
  const max = Math.round(d.temperature_2m_max[0]);
  const min = Math.round(d.temperature_2m_min[0]);
  const rain = d.precipitation_probability_max[0] ?? 0;
  const uv = d.uv_index_max[0] ?? 0;
  const avg = (max + min) / 2;
  const items = [];

  items.push(`🌡️ 최저 ${min}° / 최고 ${max}° — 일교차 ${max - min}°${max - min >= 10 ? ", 겉옷 챙기세요" : ""}`);
  items.push(`👕 추천 옷차림: ${outfit(avg)}`);

  if (rain >= 60) items.push(`☂️ 강수확률 ${rain}% — 우산 꼭 챙기세요`);
  else if (rain >= 30) items.push(`🌂 강수확률 ${rain}% — 작은 우산이 있으면 좋아요`);
  else items.push(`☀️ 강수확률 ${rain}% — 우산은 필요 없어요`);

  // 오늘 비가 오는 시간대
  const today = weather.daily.time[0];
  const rainyHours = h.time
    .map((t, i) => ({ t, p: h.precipitation_probability[i] }))
    .filter((x) => x.t.startsWith(today) && x.p >= 50)
    .map((x) => Number(x.t.slice(11, 13)));
  if (rainyHours.length) {
    items.push(`🕒 비 예상 시간: ${rainyHours[0]}시 ~ ${rainyHours[rainyHours.length - 1] + 1}시`);
  }

  if (uv >= 8) items.push(`🧴 자외선 ${uv.toFixed(0)} (매우 높음) — 선크림 필수`);
  else if (uv >= 6) items.push(`🧴 자외선 ${uv.toFixed(0)} (높음) — 선크림 권장`);

  if (air?.current) {
    const g10 = pmGrade(air.current.pm10, "pm10");
    const g25 = pmGrade(air.current.pm2_5, "pm25");
    const bad = [g10, g25].some((g) => g === "나쁨" || g === "매우나쁨");
    items.push(`😷 미세먼지 ${g10} · 초미세먼지 ${g25}${bad ? " — 마스크 챙기세요" : ""}`);
  }
  return items;
}

// ---------- 렌더 ----------
function render({ weather, air }) {
  const c = weather.current, d = weather.daily, h = weather.hourly;
  const [desc, icon] = wmo(c.weather_code);

  $("place").textContent = place.name;
  $("nowIcon").textContent = icon;
  $("nowTemp").textContent = `${Math.round(c.temperature_2m)}°`;
  $("nowDesc").textContent = desc;
  $("nowSub").textContent = `체감 ${Math.round(c.apparent_temperature)}° · 최고 ${Math.round(d.temperature_2m_max[0])}° / 최저 ${Math.round(d.temperature_2m_min[0])}°`;

  $("briefing").innerHTML = buildBriefing(weather, air).map((s) => `<li>${s}</li>`).join("");

  const stats = [
    ["습도", `${c.relative_humidity_2m}%`],
    ["바람", `${c.wind_speed_10m.toFixed(1)}m/s`],
    ["자외선", `${(d.uv_index_max[0] ?? 0).toFixed(0)}`],
    ["일출", d.sunrise[0].slice(11)],
    ["일몰", d.sunset[0].slice(11)],
    ["강수확률", `${d.precipitation_probability_max[0] ?? 0}%`],
  ];
  $("stats").innerHTML = stats
    .map(([l, v]) => `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div></div>`)
    .join("");

  // 현재 시각부터 24시간
  const nowKey = c.time.slice(0, 13);
  let start = h.time.findIndex((t) => t.slice(0, 13) === nowKey);
  if (start < 0) start = 0;
  $("hourly").innerHTML = h.time.slice(start, start + 24).map((t, k) => {
    const i = start + k;
    const hr = Number(t.slice(11, 13));
    return `<div class="hour">
      <div class="t">${k === 0 ? "지금" : hr + "시"}</div>
      <div class="i">${wmo(h.weather_code[i])[1]}</div>
      <div class="v">${Math.round(h.temperature_2m[i])}°</div>
      <div class="p">${h.precipitation_probability[i] ?? 0}%</div>
    </div>`;
  }).join("");

  const [tDesc, tIcon] = wmo(d.weather_code[1]);
  $("tomorrow").innerHTML = `<div class="i">${tIcon}</div>
    <div><strong>${tDesc}</strong><br/>
    <span style="color:var(--muted)">최고 ${Math.round(d.temperature_2m_max[1])}° / 최저 ${Math.round(d.temperature_2m_min[1])}° · 강수 ${d.precipitation_probability_max[1] ?? 0}%</span></div>`;

  $("updated").textContent = `업데이트 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

function renderHeader() {
  const now = new Date();
  const hr = now.getHours();
  $("greeting").textContent =
    hr < 5 ? "늦은 밤이에요" : hr < 11 ? "좋은 아침이에요 ☕" : hr < 17 ? "좋은 오후예요" : "좋은 저녁이에요";
  $("date").textContent = now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
}

async function refresh() {
  renderHeader();
  try {
    lastData = await fetchWeather(place);
    render(lastData);
  } catch (e) {
    $("nowDesc").textContent = e.message;
    $("nowIcon").textContent = "⚠️";
  }
  return lastData;
}

// ---------- 알림 ----------
const todayStr = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

async function notifyMorning() {
  const data = await refresh();
  if (!data || Notification.permission !== "granted") return;
  const c = data.weather.current, d = data.weather.daily;
  const [desc, icon] = wmo(c.weather_code);
  const body = [
    `${icon} ${desc}, 지금 ${Math.round(c.temperature_2m)}°`,
    `최고 ${Math.round(d.temperature_2m_max[0])}° / 최저 ${Math.round(d.temperature_2m_min[0])}°`,
    ...buildBriefing(data.weather, data.air).slice(1, 3),
  ].join("\n");
  new Notification(`${place.name} 아침 날씨`, { body });
}

function checkAlarm() {
  if (!alarm.on) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (hhmm >= alarm.time && alarm.lastDate !== todayStr()) {
    // 알림 시간을 지난 뒤 처음 확인될 때 한 번만 (정오 이후에는 생략)
    if (now.getHours() < 12 || hhmm.slice(0, 2) === alarm.time.slice(0, 2)) notifyMorning();
    alarm.lastDate = todayStr();
    save("alarm", alarm);
  }
}

async function ensurePermission() {
  if (!("Notification" in window)) { alert("이 브라우저는 알림을 지원하지 않아요."); return false; }
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}

// ---------- 설정 UI ----------
function setPlace(p) {
  place = p;
  save("place", place);
  $("settings").close();
  refresh();
}

$("settingsBtn").onclick = () => {
  $("alarmTime").value = alarm.time;
  $("alarmOn").checked = alarm.on;
  $("settings").showModal();
};

async function doSearch() {
  const q = $("cityInput").value.trim();
  if (!q) return;
  const list = $("cityResults");
  list.innerHTML = "<li>검색 중…</li>";
  const results = await searchCity(q).catch(() => []);
  if (!results.length) { list.innerHTML = "<li>결과가 없어요</li>"; return; }
  list.innerHTML = "";
  results.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
    li.onclick = () => setPlace({ name: r.name, lat: r.latitude, lon: r.longitude });
    list.appendChild(li);
  });
}
$("searchBtn").onclick = doSearch;
$("cityInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });

$("geoBtn").onclick = () => {
  if (!navigator.geolocation) return alert("위치 기능을 사용할 수 없어요.");
  navigator.geolocation.getCurrentPosition(
    (pos) => setPlace({ name: "현재 위치", lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => alert("위치 권한이 거부되었어요.")
  );
};

$("alarmTime").onchange = (e) => { alarm.time = e.target.value; alarm.lastDate = null; save("alarm", alarm); };
$("alarmOn").onchange = async (e) => {
  if (e.target.checked && !(await ensurePermission())) { e.target.checked = false; return; }
  alarm.on = e.target.checked;
  // 이미 오늘 알림 시간이 지났으면 오늘은 건너뜀
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  alarm.lastDate = hhmm >= alarm.time ? todayStr() : null;
  save("alarm", alarm);
};
$("testNotify").onclick = async () => { if (await ensurePermission()) notifyMorning(); };

// ---------- 시작 ----------
refresh();
setInterval(checkAlarm, 30 * 1000);
setInterval(refresh, 30 * 60 * 1000); // 30분마다 갱신
