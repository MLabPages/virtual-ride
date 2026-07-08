"use strict";

// スマホ側(app.js)と Quest 表示側(display.js)で共有する定義。
// baseSpeed は、その映像が「等速(×1.0)」に見える想定の走行速度 km/h。
// 車載・空撮素材は自転車の速度感に合わせるためやや高めにして、
// 18km/h前後で走ると約20分のルートになるよう調整している。
const MIXKIT = "https://assets.mixkit.co";

window.VR_REFERENCE_SPEED = 18;
window.VR_SCENES = [
  { id: "coast", file: "videos/coast.mp4", title: "🌊 海沿いの町",
    durationSec: 27, baseSpeed: 28, viewY: "48%", credit: "https://mixkit.co/free-stock-video/roading-through-a-small-coastal-town-4165/" },
  { id: "coast-tour", file: `${MIXKIT}/videos/4062/4062-720.mp4`, title: "🌊 海岸線ツアー",
    durationSec: 16, baseSpeed: 28, viewY: "50%", credit: "https://mixkit.co/free-stock-video/tour-along-the-coast-4062/", chip: false },
  { id: "beach-town-streets", file: `${MIXKIT}/videos/2592/2592-720.mp4`, title: "🌴 ビーチタウンの道",
    durationSec: 11, baseSpeed: 18, viewY: "50%", credit: "https://mixkit.co/free-stock-video/streets-of-a-beach-town-2592/", chip: false },
  { id: "seashore-hotel-zone", file: `${MIXKIT}/videos/4077/4077-720.mp4`, title: "🌴 海辺のホテルゾーン",
    durationSec: 29, baseSpeed: 30, viewY: "50%", credit: "https://mixkit.co/free-stock-video/hotel-zone-near-the-seashore-4077/", chip: false },
  { id: "europe", file: "videos/europe.mp4", title: "🏛 欧州の路地",
    durationSec: 11, baseSpeed: 12, viewY: "50%", credit: "https://mixkit.co/free-stock-video/narrow-and-old-alley-in-venice-4600/" },
  { id: "amsterdam-canal", file: `${MIXKIT}/videos/4015/4015-720.mp4`, title: "🚲 アムステルダムの水辺",
    durationSec: 9, baseSpeed: 12, viewY: "48%", credit: "https://mixkit.co/free-stock-video/canal-and-street-scene-in-amsterdam-4015/", chip: false },
  { id: "paris-arc", file: `${MIXKIT}/videos/4024/4024-720.mp4`, title: "🏛 パリのロータリー",
    durationSec: 17, baseSpeed: 12, viewY: "48%", credit: "https://mixkit.co/free-stock-video/arc-de-triomphe-roundabout-by-day-4024/", chip: false },
  { id: "paris-calm-street", file: `${MIXKIT}/videos/4348/4348-720.mp4`, title: "🏛 パリの静かな通り",
    durationSec: 22, baseSpeed: 12, viewY: "50%", credit: "https://mixkit.co/free-stock-video/a-calm-street-in-paris-4348/", chip: false },
  { id: "cobbled-restaurant", file: `${MIXKIT}/videos/2597/2597-720.mp4`, title: "🏛 石畳のカフェ通り",
    durationSec: 12, baseSpeed: 12, viewY: "50%", credit: "https://mixkit.co/free-stock-video/outdoor-restaurant-seating-on-cobbled-street-2597/", chip: false },
  { id: "autumn", file: `${MIXKIT}/videos/41576/41576-720.mp4`, title: "🍁 山あいのカーブ道",
    durationSec: 50, baseSpeed: 46, viewY: "50%", credit: "https://mixkit.co/free-stock-video/going-down-a-curved-highway-through-a-mountain-range-41576/" },
  { id: "green-hill-road", file: `${MIXKIT}/videos/41537/41537-720.mp4`, title: "🌲 木々に覆われた丘道",
    durationSec: 29, baseSpeed: 42, viewY: "50%", credit: "https://mixkit.co/free-stock-video/curvy-road-on-a-tree-covered-hill-41537/", chip: false },
  { id: "mountain-highway", file: `${MIXKIT}/videos/4633/4633-720.mp4`, title: "⛰ 山脈のハイウェイ",
    durationSec: 22, baseSpeed: 46, viewY: "50%", credit: "https://mixkit.co/free-stock-video/highway-in-the-middle-of-a-mountain-range-4633/", chip: false },
  { id: "scenic-mountain-sky", file: `${MIXKIT}/active_storage/video_items/100341/1723061354/100341-video-720.mp4`, title: "⛰ 空の広い山道",
    durationSec: 21, baseSpeed: 42, viewY: "48%", credit: "https://mixkit.co/free-stock-video/scenic-highway-with-mountains-and-open-sky-100341/", chip: false },
  { id: "nature-road-sunset", file: `${MIXKIT}/videos/50267/50267-720.mp4`, title: "🌄 夕暮れの自然道",
    durationSec: 19, baseSpeed: 34, viewY: "48%", credit: "https://mixkit.co/free-stock-video/natural-landscape-with-a-road-at-sunset-50267/", chip: false },
  { id: "dawn-road", file: `${MIXKIT}/videos/52452/52452-720.mp4`, title: "🌅 夜明けの一本道",
    durationSec: 24, baseSpeed: 28, viewY: "50%", credit: "https://mixkit.co/free-stock-video/gliding-along-a-quiet-asphalt-road-at-dawn-the-soft-52452/" },
  { id: "black-road-sun", file: `${MIXKIT}/videos/52454/52454-720.mp4`, title: "🌅 陽の差すアスファルト",
    durationSec: 31, baseSpeed: 34, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-along-from-the-driver-point-of-view-over-an-52454/", chip: false },
  { id: "road-at-dusk", file: `${MIXKIT}/videos/41575/41575-720.mp4`, title: "🌄 夕方の自然道",
    durationSec: 20, baseSpeed: 30, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-on-a-nature-road-at-dusk-41575/", chip: false },
  { id: "sunny-highway", file: `${MIXKIT}/videos/42368/42368-720.mp4`, title: "☀ 晴れた日のハイウェイ",
    durationSec: 12, baseSpeed: 42, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-on-the-highway-on-a-sunny-day-42368/", chip: false },
  { id: "speedy-highway", file: `${MIXKIT}/videos/44655/44655-720.mp4`, title: "☀ まっすぐ伸びる高速道",
    durationSec: 20, baseSpeed: 42, viewY: "50%", credit: "https://mixkit.co/free-stock-video/speedy-point-of-view-tour-of-a-highway-44655/", chip: false },
  { id: "fast-road-point", file: `${MIXKIT}/videos/44651/44651-720.mp4`, title: "☀ ひらけた直線路",
    durationSec: 13, baseSpeed: 42, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-fast-by-car-on-a-road-in-point-of-44651/", chip: false },
  { id: "forest-lane", file: `${MIXKIT}/videos/506/506-720.mp4`, title: "🌲 木立の間を進む",
    durationSec: 39, baseSpeed: 38, viewY: "50%", credit: "https://mixkit.co/free-stock-video/highway-between-trees-506/" },
  { id: "empty-tree-road", file: `${MIXKIT}/videos/4852/4852-720.mp4`, title: "🌲 木々に包まれた道",
    durationSec: 7, baseSpeed: 28, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-on-an-empty-road-covered-in-trees-4852/", chip: false },
  { id: "forest-path", file: `${MIXKIT}/videos/41573/41573-720.mp4`, title: "🌲 森の小径",
    durationSec: 33, baseSpeed: 14, viewY: "50%", credit: "https://mixkit.co/free-stock-video/path-in-the-middle-of-a-forest-surrounded-by-many-41573/", chip: false },
  { id: "dense-forest-crossing", file: `${MIXKIT}/videos/41574/41574-720.mp4`, title: "🌲 深い森を抜ける",
    durationSec: 15, baseSpeed: 14, viewY: "50%", credit: "https://mixkit.co/free-stock-video/walking-a-path-that-crosses-a-dense-forest-41574/", chip: false },
  { id: "forest-slide", file: `${MIXKIT}/videos/50847/50847-720.mp4`, title: "🌲 光の入る森",
    durationSec: 24, baseSpeed: 10, viewY: "50%", credit: "https://mixkit.co/free-stock-video/the-camera-slowly-slides-into-the-tranquil-forest-on-a-50847/", chip: false },
  { id: "jungle-green", file: `${MIXKIT}/videos/5039/5039-720.mp4`, title: "🌿 緑の濃いジャングル",
    durationSec: 31, baseSpeed: 14, viewY: "48%", credit: "https://mixkit.co/free-stock-video/abundant-trees-in-a-jungle-5039/", chip: false },
  { id: "snowy-forest-road", file: `${MIXKIT}/videos/3317/3317-720.mp4`, title: "❄ 雪の森のカーブ",
    durationSec: 14, baseSpeed: 28, viewY: "50%", credit: "https://mixkit.co/free-stock-video/curve-on-a-snowy-forest-road-3317/", chip: false },
  { id: "tokyo-walk", file: `${MIXKIT}/videos/4231/4231-720.mp4`, title: "🏙 東京の街歩き",
    durationSec: 19, baseSpeed: 12, viewY: "50%", credit: "https://mixkit.co/free-stock-video/pedestrian-walk-in-tokyo-4231/" },
  { id: "busy-avenue", file: `${MIXKIT}/videos/2034/2034-720.mp4`, title: "🏙 都市の大通り",
    durationSec: 44, baseSpeed: 18, viewY: "48%", credit: "https://mixkit.co/free-stock-video/aerial-shot-of-a-busy-avenue-in-the-city-2034/", chip: false },
  { id: "europe-from-air", file: `${MIXKIT}/videos/5015/5015-720.mp4`, title: "🏙 欧州の街を空から",
    durationSec: 15, baseSpeed: 16, viewY: "48%", credit: "https://mixkit.co/free-stock-video/european-city-from-the-air-with-buildings-to-the-horizon-5015/", chip: false },
  { id: "medieval-castle", file: `${MIXKIT}/videos/4013/4013-720.mp4`, title: "🏰 山の城を望む",
    durationSec: 11, baseSpeed: 14, viewY: "48%", credit: "https://mixkit.co/free-stock-video/medieval-castle-in-the-mountains-4013/", chip: false },
  { id: "bus-window", file: `${MIXKIT}/videos/4394/4394-720.mp4`, title: "🚌 旅の車窓",
    durationSec: 23, baseSpeed: 26, viewY: "50%", credit: "https://mixkit.co/free-stock-video/point-of-view-from-a-bus-passenger-seat-roading-in-4394/", chip: false },
  { id: "motorcycle-empty-road", file: `${MIXKIT}/videos/39912/39912-720.mp4`, title: "🛣 静かな一本道",
    durationSec: 12, baseSpeed: 30, viewY: "50%", credit: "https://mixkit.co/free-stock-video/man-traveling-by-motorcycle-on-an-empty-road-39912/", chip: false },
  { id: "sports-car-sunset", file: `${MIXKIT}/videos/50134/50134-720.mp4`, title: "🌇 夕焼けの道",
    durationSec: 16, baseSpeed: 38, viewY: "50%", credit: "https://mixkit.co/free-stock-video/two-cars-followed-each-other-on-the-road-at-sunset-50134/" },
  { id: "curvy-red-car", file: `${MIXKIT}/videos/52427/52427-720.mp4`, title: "🌇 カーブを進む赤い車",
    durationSec: 7, baseSpeed: 36, viewY: "50%", credit: "https://mixkit.co/free-stock-video/a-red-sports-car-traveling-along-a-curvy-asphalt-road-52427/", chip: false },
  { id: "driver-asphalt", file: `${MIXKIT}/videos/52453/52453-720.mp4`, title: "🌇 夕方のアスファルト道",
    durationSec: 18, baseSpeed: 38, viewY: "50%", credit: "https://mixkit.co/free-stock-video/traveling-along-from-the-driver-point-of-view-on-an-52453/", chip: false },
  { id: "dashboard-road", file: `${MIXKIT}/videos/72/72-720.mp4`, title: "🌇 旅のダッシュボード",
    durationSec: 18, baseSpeed: 28, viewY: "50%", credit: "https://mixkit.co/free-stock-video/dashboard-of-a-car-72/", chip: false },
  { id: "nature-road-aerial", file: `${MIXKIT}/videos/41389/41389-720.mp4`, title: "🌿 自然を貫く道",
    durationSec: 10, baseSpeed: 32, viewY: "48%", credit: "https://mixkit.co/free-stock-video/aerial-view-of-a-road-that-crosses-through-nature-41389/", chip: false },
  { id: "canyon-flyover", file: `${MIXKIT}/videos/41401/41401-720.mp4`, title: "⛰ 渓谷の上を進む",
    durationSec: 28, baseSpeed: 20, viewY: "48%", credit: "https://mixkit.co/free-stock-video/fly-over-a-huge-canyon-covered-in-vegetation-41401/", chip: false },
  { id: "mangrove-mountain", file: `${MIXKIT}/videos/51501/51501-720.mp4`, title: "🌿 マングローブと山",
    durationSec: 12, baseSpeed: 20, viewY: "48%", credit: "https://mixkit.co/free-stock-video/flying-over-a-green-mangrove-swamp-with-mountain-in-the-51501/", chip: false },
  { id: "river-raft", file: `${MIXKIT}/videos/1218/1218-720.mp4`, title: "🏞 ゆっくり流れる川",
    durationSec: 20, baseSpeed: 10, viewY: "48%", credit: "https://mixkit.co/free-stock-video/raft-going-slowly-down-a-river-1218/" },
  { id: "waterfall-forest", file: `${MIXKIT}/videos/2213/2213-720.mp4`, title: "🏞 森の滝",
    durationSec: 15, baseSpeed: 8, viewY: "48%", credit: "https://mixkit.co/free-stock-video/waterfall-in-forest-2213/", chip: false },
  { id: "sea-horizon", file: `${MIXKIT}/videos/4477/4477-720.mp4`, title: "⛵ 海と帆船の水平線",
    durationSec: 18, baseSpeed: 10, viewY: "48%", credit: "https://mixkit.co/free-stock-video/view-of-the-horizon-in-the-sea-while-a-sailboat-4477/", chip: false },
  { id: "rocky-coast", file: `${MIXKIT}/videos/51502/51502-720.mp4`, title: "🌊 岩場の海岸",
    durationSec: 16, baseSpeed: 16, viewY: "48%", credit: "https://mixkit.co/free-stock-video/overhead-view-of-a-rocky-coast-and-waves-crashing-51502/", chip: false },
  { id: "coast-pier", file: `${MIXKIT}/videos/5363/5363-720.mp4`, title: "🌊 桟橋のある海岸",
    durationSec: 10, baseSpeed: 18, viewY: "48%", credit: "https://mixkit.co/free-stock-video/beautiful-coast-with-motorboats-and-a-pier-seen-from-the-5363/", chip: false },
  { id: "sunset-beach", file: `${MIXKIT}/videos/2168/2168-720.mp4`, title: "🌅 夕焼けの浜辺",
    durationSec: 14, baseSpeed: 8, viewY: "48%", credit: "https://mixkit.co/free-stock-video/bright-orange-sunset-on-beach-2168/", chip: false },
  { id: "beach-waves", file: `${MIXKIT}/videos/5016/5016-720.mp4`, title: "🌊 波打ち際",
    durationSec: 9, baseSpeed: 8, viewY: "48%", credit: "https://mixkit.co/free-stock-video/waves-coming-to-the-beach-5016/", chip: false },
];

window.VR_TUNING = {
  RATE_MIN: 0.25,   // ブラウザが安定して再生できる下限あたり
  RATE_MAX: 1.7,    // 誤検出時に映像が極端な早送りにならないよう抑える
  STOP_SPEED: 0.8,  // これ未満は「停止」とみなす km/h
};

// 速度(km/h)→ 再生速度(playbackRate)
window.vrRateFor = function (speed, baseSpeed) {
  const t = window.VR_TUNING;
  return Math.min(t.RATE_MAX, Math.max(t.RATE_MIN, speed / baseSpeed));
};

window.vrSceneById = function (id) {
  return window.VR_SCENES.find((s) => s.id === id) || window.VR_SCENES[0];
};

window.vrChapterSceneId = function (id) {
  const list = window.VR_SCENES;
  const index = list.findIndex((s) => s.id === id);
  for (let i = Math.max(0, index); i >= 0; i--) {
    if (list[i].chip !== false) return list[i].id;
  }
  return list[0].id;
};

window.vrRouteEstimateSec = function (referenceSpeed = window.VR_REFERENCE_SPEED) {
  return window.VR_SCENES.reduce((sum, scene) => {
    return sum + (scene.durationSec || 0) * (scene.baseSpeed / referenceSpeed);
  }, 0);
};

window.vrRouteMinutesText = function () {
  return `18km/h想定で約${Math.round(window.vrRouteEstimateSec() / 60)}分`;
};

window.vrApplySceneFraming = function (video, scene) {
  video.style.objectPosition = `center ${scene.viewY || "38%"}`;
};

// 「旅」モード: 今の映像が終わったら次の映像へ。最後まで行ったら先頭へ戻る。
// 1本をループさせず、景色が移り変わっていくので飽きにくい。
window.vrNextSceneId = function (id) {
  const list = window.VR_SCENES;
  const i = list.findIndex((s) => s.id === id);
  return list[(i + 1) % list.length].id;
};
