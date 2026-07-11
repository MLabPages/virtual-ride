import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const scenesSource = read("./scenes.js");
const appSource = read("./app.js");
const displaySource = read("./display.js");
const indexHtml = read("./index.html");
const displayHtml = read("./display.html");

const context = { window: {} };
vm.runInNewContext(scenesSource, context, { filename: "scenes.js" });
const vr = context.window;

assert.ok(Array.isArray(vr.VR_SCENES), "VR_SCENES must be an array");
assert.ok(vr.VR_SCENES.length >= 10, "route should contain at least 10 scenes");
assert.equal(new Set(vr.VR_SCENES.map((scene) => scene.id)).size, vr.VR_SCENES.length, "scene ids must be unique");

for (const scene of vr.VR_SCENES) {
  assert.match(scene.id, /^[a-z0-9-]+$/, `invalid scene id: ${scene.id}`);
  assert.ok(scene.title && typeof scene.title === "string", `missing title: ${scene.id}`);
  assert.ok(Number.isFinite(scene.durationSec) && scene.durationSec > 0, `invalid duration: ${scene.id}`);
  assert.ok(Number.isFinite(scene.baseSpeed) && scene.baseSpeed > 0, `invalid base speed: ${scene.id}`);
  assert.match(scene.credit, /^https:\/\/mixkit\.co\/free-stock-video\//, `invalid credit: ${scene.id}`);
  if (!/^https:\/\//.test(scene.file)) {
    assert.ok(existsSync(new URL(`./${scene.file}`, import.meta.url)), `missing local video: ${scene.file}`);
  }
}

const routeMinutes = vr.vrRouteEstimateSec() / 60;
assert.ok(routeMinutes >= 8 && routeMinutes <= 15, `unexpected route length: ${routeMinutes.toFixed(1)} min`);
assert.equal(vr.vrNextSceneId(vr.VR_SCENES.at(-1).id), vr.VR_SCENES[0].id, "route must loop to the first scene");
assert.equal(vr.vrRouteProgress(vr.VR_SCENES[0].id, 0), 0, "route should start at 0%");
assert.ok(vr.vrRouteProgress(vr.VR_SCENES.at(-1).id, vr.VR_SCENES.at(-1).durationSec) > 0.99, "route should finish near 100%");

function assertReferencedIdsExist(source, html, label) {
  const ids = [...source.matchAll(/\$\("([A-Za-z][A-Za-z0-9_-]*)"\)/g)].map((match) => match[1]);
  for (const id of new Set(ids)) {
    assert.ok(html.includes(`id="${id}"`), `${label} references missing #${id}`);
  }
}

function assertUniqueIds(html, label) {
  const ids = [...html.matchAll(/\sid="([A-Za-z][A-Za-z0-9_-]*)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${label} contains duplicate ids`);
}

assertReferencedIdsExist(appSource, indexHtml, "app.js");
assertReferencedIdsExist(displaySource, displayHtml, "display.js");
assertUniqueIds(indexHtml, "index.html");
assertUniqueIds(displayHtml, "display.html");
assert.ok(!indexHtml.includes("通信は一切行いません"), "privacy copy must not deny required network access");
assert.ok(displaySource.includes("await import(\"https://unpkg.com/three@0.160.0/"), "Three.js must remain lazy-loaded for optional VR");
assert.ok(appSource.includes("cameraRequestId"), "camera permission race guard is required");
assert.ok(displaySource.includes("pendingSceneId"), "display scene transition de-duplication is required");
assert.ok(appSource.includes("sceneTime:"), "sender must include the current scene time");
assert.ok(displaySource.includes("syncRemotePlayback"), "display must correct remote playback drift");

console.log(`Verified ${vr.VR_SCENES.length} scenes / ${routeMinutes.toFixed(1)} min / ${vr.vrRouteDistanceKm().toFixed(2)} km`);
