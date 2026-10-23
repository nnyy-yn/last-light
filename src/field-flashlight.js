import * as THREE from 'three';

const RANGE = 24, INTENSITY = 360;

function beamTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d'); if (!context) return null;
  const image = context.createImageData(256, 256);
  // Original soft reflector pattern. It modulates the actual light, not the screen.
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const dx = (x - 127.5) / 128, dy = (y - 127.5) / 128, radius = Math.hypot(dx, dy);
    const core = Math.exp(-radius * radius * 6.5), ring = Math.sin(radius * 34) * .016 * Math.exp(-radius * 2.4);
    const value = THREE.MathUtils.clamp(.57 + core * .43 + ring, 0, 1), index = (y * 256 + x) * 4;
    image.data[index] = image.data[index + 1] = image.data[index + 2] = Math.round(value * 255); image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.name = 'original flashlight reflector'; texture.colorSpace = THREE.NoColorSpace; texture.needsUpdate = true; return texture;
}

/** Camera-mounted physical light. The owner handles input and defaults it off. */
export function createFieldFlashlight(camera) {
  const mount = new THREE.Group(); mount.name = 'field flashlight mount'; camera.add(mount);
  const light = new THREE.SpotLight('#fff0d8', 0, RANGE, .38, .72, 2);
  // Keep the emitter outside the first-person arms/rifle silhouette. Placing it
  // behind the right-hand receiver creates extreme inverse-square highlights.
  light.name = 'local warm field flashlight'; light.position.set(-.32, .24, -.10);
  // Aim the bright center toward the next few metres of road. A horizontal
  // beam leaves nearby asphalt only in the dim penumbra at standing height.
  const target = new THREE.Object3D(); target.name = 'field flashlight aim'; target.position.set(0, -1.15, -10);
  light.target = target; mount.add(light, target);
  const pattern = beamTexture(); light.map = pattern;
  light.shadow.camera.near = .12; light.shadow.camera.far = RANGE;
  light.shadow.bias = -.00015; light.shadow.normalBias = .012; light.shadow.radius = 2;
  let enabled = false, quality = 'high', disposed = false, blockedDistance = null;
  light.visible = false;

  function setEnabled(value) {
    if (disposed) return;
    enabled = Boolean(value); light.visible = enabled; light.intensity = enabled ? INTENSITY : 0;
    light.shadow.autoUpdate = enabled; light.shadow.needsUpdate = enabled;
  }
  function setQuality(value) {
    if (disposed) return;
    quality = ['low', 'medium', 'high'].includes(value) ? value : 'medium';
    const size = quality === 'high' ? 1024 : quality === 'medium' ? 512 : 256;
    if (light.shadow.mapSize.x !== size) {
      light.shadow.map?.dispose(); light.shadow.map = null;
      light.shadow.mapPass?.dispose(); light.shadow.mapPass = null;
      light.shadow.mapSize.set(size, size);
    }
    light.castShadow = true; light.map = pattern; light.shadow.radius = quality === 'low' ? 0 : 2;
    light.shadow.needsUpdate = true;
    light.distance = RANGE;
  }
  function update(dt, options = {}) {
    if (disposed) return;
    // No wall-clock animation: pause keeps the beam completely stable.
    // Retain the caller's obstruction distance for diagnostics. Shadows now
    // handle low quality too, so the wall is no longer at the range fade-out.
    blockedDistance = Number.isFinite(options.blockedDistance) ? Math.max(0, options.blockedDistance) : null;
    light.distance = RANGE;
    mount.updateWorldMatrix(true, true);
  }
  function inspect() {
    return { enabled, quality, visible: light.visible, intensity: light.intensity, range: RANGE, distance: light.distance, castShadow: light.castShadow,
      shadowMapSize: light.castShadow ? light.shadow.mapSize.x : 0, shadowNear: light.shadow.camera.near, localPosition: light.position.toArray(), localTarget: target.position.toArray(), blockedDistance, disposed };
  }
  function dispose() {
    if (disposed) return; setEnabled(false); mount.removeFromParent(); light.dispose(); pattern?.dispose(); mount.clear(); disposed = true;
  }
  setQuality('high'); setEnabled(false);
  return { setEnabled, setQuality, update, inspect, dispose };
}
