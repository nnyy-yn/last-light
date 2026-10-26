// Metres, +Z vehicle forward. Distances are shared by the whole column; a
// follower never receives a delayed keyframe at the lead vehicle's position.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const p3 = p => p.length === 2 ? [p[0], 0, p[1]] : [...p];
const delta = (a, b) => b.map((v, i) => v - a[i]);
const length = v => Math.hypot(...v);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b, scale = 1) => a.map((v, i) => v + b[i] * scale);
const unit = v => v.map(n => n / (length(v) || 1));
const angle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export const CONVOY_LENGTHS = Object.freeze({ humvee: 4.9, 'cargo-truck': 7.8 });

export function createConvoyFormation(types, { gap = 3.6 } = {}) {
  if (!Array.isArray(types) || !types.length || gap < 1) throw new RangeError('A convoy needs vehicles and a safe bumper gap.');
  let offset = 0;
  return types.map((type, index) => {
    if (!CONVOY_LENGTHS[type]) throw new RangeError('Unknown convoy vehicle: ' + type);
    const size = CONVOY_LENGTHS[type];
    if (index) offset += (CONVOY_LENGTHS[types[index - 1]] + size) / 2 + gap;
    return { index, type, length: size, offset, gap };
  });
}

export function createConvoyPath(points, { cornerRadius = 4.2, step = .35 } = {}) {
  const input = points.map(p3).filter((p, i, all) => !i || length(delta(all[i - 1], p)) > .01);
  if (input.length < 2 || !input.every(p => p.length === 3 && p.every(Number.isFinite))) throw new RangeError('A convoy path needs two finite positions.');
  const samples = [input[0]], append = p => { if (length(delta(samples.at(-1), p)) > .00001) samples.push(p); };
  for (let i = 1; i < input.length - 1; i++) {
    const a = input[i - 1], b = input[i], c = input[i + 1], incoming = unit(delta(a, b)), outgoing = unit(delta(b, c));
    const cosine = incoming.reduce((sum, n, k) => sum + n * outgoing[k], 0);
    if (cosine > .999) { append(b); continue; }
    if (cosine < -.92) throw new RangeError('A convoy cannot make an in-place U-turn. Supply a real turning route.');
    const cut = Math.min(cornerRadius, length(delta(a, b)) * .32, length(delta(b, c)) * .32);
    const enter = add(b, incoming, -cut), exit = add(b, outgoing, cut); append(enter);
    const divisions = Math.max(8, Math.ceil(cut * 2 / step));
    for (let j = 1; j <= divisions; j++) { const t = j / divisions; append(lerp(lerp(enter, b, t), lerp(b, exit, t), t)); }
  }
  append(input.at(-1));
  let total = 0;
  const entries = samples.map((position, i) => { if (i) total += length(delta(samples[i - 1], position)); return { distance: total, position }; });
  function sample(distance) {
    let index = 0;
    if (distance >= total) index = entries.length - 2;
    else if (distance > 0) { let lo = 0, hi = entries.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (entries[mid].distance <= distance) lo = mid; else hi = mid; } index = lo; }
    const a = entries[index], b = entries[index + 1], span = b.distance - a.distance;
    const direction = unit(delta(a.position, b.position));
    return { position: lerp(a.position, b.position, (distance - a.distance) / span), direction, yaw: Math.atan2(direction[0], direction[2]), distance };
  }
  return { length: total, entries, sample };
}

export function createConvoyMotion({ points, vehicles, duration = 18, startDistance = 30, stopDistance, speed = 5.2, waitAt = null, waitSeconds = 2.4, startDelay = .6 } = {}) {
  const path = createConvoyPath(points), formation = createConvoyFormation(vehicles), end = stopDistance ?? path.length - 3;
  const dt = .025, frames = [{ time: 0, distance: startDistance, speed: 0 }];
  let distance = startDistance, velocity = 0, waited = 0, waitDone = !Number.isFinite(waitAt);
  for (let time = dt; time <= duration + dt; time += dt) {
    let limit = speed;
    for (const vehicle of formation) {
      const here = distance - vehicle.offset, a = path.sample(here - 2), b = path.sample(here + 2);
      const bend = Math.abs(angle(a.yaw, b.yaw)) / 4;
      if (bend > .015) limit = Math.min(limit, Math.sqrt(1.3 / bend));
    }
    const stop = !waitDone ? Math.min(end, waitAt) : end;
    const remaining = Math.max(0, stop - distance);
    limit = Math.min(limit, Math.sqrt(2 * 1.5 * remaining), remaining * 2.5);
    if (time <= startDelay) limit = 0;
    if (!waitDone && distance >= stop - .035) { limit = 0; waited += dt; if (waited >= waitSeconds) waitDone = true; }
    velocity += clamp(limit - velocity, -2.1 * dt, 1.25 * dt);
    distance = Math.min(stop, distance + velocity * dt);
    if (distance >= stop - .001) { distance = stop; velocity = 0; }
    frames.push({ time, distance, speed: velocity });
  }
  function at(time, index = 0) {
    const vehicle = formation[index]; if (!vehicle) throw new RangeError('Unknown convoy slot.');
    const scaled = clamp(time / dt, 0, frames.length - 1), lo = Math.floor(scaled), hi = Math.min(frames.length - 1, lo + 1), t = scaled - lo;
    const a = frames[lo], b = frames[hi], distance = a.distance + (b.distance - a.distance) * t - vehicle.offset;
    const rear = path.sample(distance - vehicle.length * .30), front = path.sample(distance + vehicle.length * .30), center = path.sample(distance);
    const yaw = Math.atan2(front.position[0] - rear.position[0], front.position[2] - rear.position[2]);
    const turn = angle(path.sample(distance - 1.7).yaw, path.sample(distance + 1.7).yaw) / 3.4;
    return { position: center.position, yaw, speed: a.speed + (b.speed - a.speed) * t, steer: clamp(Math.atan(3.2 * turn), -.55, .55), distance, offset: vehicle.offset, length: vehicle.length, type: vehicle.type };
  }
  return { path, formation, frames, at, stopDistance: end, duration };
}
