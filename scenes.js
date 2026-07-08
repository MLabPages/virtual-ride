"use strict";

// スマホ側(app.js)と Quest 表示側(display.js)で共有する定義。
// 前に進む感覚が出る走行・移動映像。baseSpeed は
// その映像が「等速(×1.0)」に見える想定の走行速度 km/h。
// この並び順が、そのまま連続再生される「旅」のルートになる。
window.VR_SCENES = [
  { id: "coast", file: "videos/coast.mp4", title: "🌊 海沿いの町を走る",
    baseSpeed: 18, viewY: "48%", credit: "https://mixkit.co/free-stock-video/roading-through-a-small-coastal-town-4165/" },
  { id: "europe", file: "videos/europe.mp4", title: "🏛 欧州の路地を進む",
    baseSpeed: 8, viewY: "50%", credit: "https://mixkit.co/free-stock-video/narrow-and-old-alley-in-venice-4600/" },
  { id: "autumn", file: "videos/autumn.mp4", title: "🍁 紅葉の森のカーブ道",
    baseSpeed: 20, viewY: "50%", credit: "https://mixkit.co/free-stock-video/driving-through-a-forest-on-a-bendy-road-45312/" },
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
