// Authored firearm assets, normalized to metres. Muzzle is -Z; +Y is up.
// These landmarks fit the source meshes, not an interchangeable M4 silhouette.
// Every derivative and its author/license are recorded in ASSET-SOURCES.md.
export const STATIC_WEAPON_ASSETS = Object.freeze({
  m16a2: Object.freeze({
    file: 'm16a2-real.glb', credit: 'M16A2 · Luchador · CC BY 4.0',
    offset: [.002611, -.024, -.1963],
    left: [0, .011, -.3263],
    muzzle: [.00001048, .03582639, -.6963],
    rear: [0, .10305, -.0091], front: [0, .103394, -.52],
  }),
  m249: Object.freeze({
    file: 'm249-real.glb', credit: 'M249 · AK / skaf13 · CC BY 4.0',
    left: [0, -.010, -.330],
    muzzle: [0, .09037610, -.72836463],
    rear: [0, .1683, .0700], front: [0, .15540980, -.59815058],
  }),
  ak: Object.freeze({
    file: 'akm-real.glb', credit: 'AKM · LonesomeDucky · CC0 1.0',
    offset: [0, .01872, -.166731],
    left: [0, -.008003, -.316602],
    muzzle: [0, .01872, -.614002],
    rear: [0, .064097, -.188876], front: [0, .064068, -.566968],
  }),
});
