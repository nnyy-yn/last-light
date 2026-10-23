// Keep authored skin and fabric response distinct under both city and gallery
// lighting. All maps are embedded in the GLBs and shared between actor clones.
export function tuneCharacterMaterial(material, kind) {
  const name = material.name || '';
  if (/MakeHuman_.*\.body/i.test(name)) {
    material.color.set(kind === 'soldier' || kind === 'wounded' ? '#c9b8a9' : '#e0d4c7');
    material.roughness = 1;
    material.metalness = 0;
  }
  if (/eyebrow001/i.test(name)) {
    material.transparent = true;
    material.alphaTest = .02;
    material.alphaToCoverage = false;
    material.depthWrite = false;
    material.color.set('#a39788');
  } else if (/short01/i.test(name)) {
    material.transparent = false;
    material.alphaTest = .3;
    material.alphaToCoverage = false;
    material.depthWrite = true;
    material.color.set('#665c51');
  }
  if (/low-poly/i.test(name)) {
    material.color.set('#ffffff');
    material.roughness = .26;
    material.envMapIntensity = .8;
  }
  if (kind === 'enemy' && /male_casualsuit05/i.test(name)) material.color.set('#aaa49a');
  if (/^Mil_Suit_R5(?:__Plate)?$/.test(name)) {
    // Retopologised cloth keeps the source weave; reduce its strong baked
    // tangent-space folds so they do not read as hard metal dents at the neck.
    material.normalScale.multiplyScalar(.45);
    material.aoMapIntensity = .65;
  }
  return material;
}
