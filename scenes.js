"use strict";

// スマホ側(app.js)と Quest 表示側(display.js)で共有する定義。
// baseSpeed: その映像が「等速(×1.0)」に見える想定速度 km/h
window.VR_SCENES = [
  { id: "ride-street", file: "videos/ride-street.mp4", title: "🚴 街なかライド",
    baseSpeed: 15, credit: "https://www.pexels.com/video/5479440/" },
  { id: "ride-sunset", file: "videos/ride-sunset.mp4", title: "🌇 夕暮れの旧市街",
    baseSpeed: 15, credit: "https://www.pexels.com/video/14610894/" },
  { id: "forest-road", file: "videos/forest-road.mp4", title: "🌲 森の道",
    baseSpeed: 40, credit: "https://www.pexels.com/video/4254119/" },
  { id: "drive-road", file: "videos/drive-road.mp4", title: "🛣 郊外ドライブ",
    baseSpeed: 50, credit: "https://www.pexels.com/video/5921059/" },
  { id: "drive-city", file: "videos/drive-city.mp4", title: "🚗 街をドライブ",
    baseSpeed: 35, credit: "https://www.pexels.com/video/13646170/" },
  { id: "walk-city", file: "videos/walk-city.mp4", title: "🚶 街を散歩",
    baseSpeed: 5, credit: "https://www.pexels.com/video/5129237/" },
];

window.VR_TUNING = {
  RATE_MIN: 0.25,   // ブラウザが安定して再生できる下限あたり
  RATE_MAX: 3.0,
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
