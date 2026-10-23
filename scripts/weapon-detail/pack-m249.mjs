import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(import.meta.dirname, '../..');
const input = fs.readFileSync(path.join(root, 'weapon-sources/v0.5/m249-detail-export.glb'));
const jsonLength = input.readUInt32LE(12);
const gltf = JSON.parse(input.subarray(20, 20 + jsonLength));
const bin = input.subarray(28 + jsonLength);
const imageViews = new Map(gltf.images.map((image, index) => [image.bufferView, index]));
const imageFor = texture => texture.source ?? texture.extensions?.EXT_texture_webp?.source;
const normalSources = new Set(gltf.materials.flatMap(material => material.normalTexture ? [imageFor(gltf.textures[material.normalTexture.index])] : []));
const dataSources = new Set(gltf.materials.flatMap(material => material.pbrMetallicRoughness?.metallicRoughnessTexture ? [imageFor(gltf.textures[material.pbrMetallicRoughness.metallicRoughnessTexture.index])] : []));
const chunks = []; let length = 0;
for (let index = 0; index < gltf.bufferViews.length; index++) {
  const view = gltf.bufferViews[index];
  let bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  if (imageViews.has(index)) {
    const image = imageViews.get(index);
    bytes = await sharp(bytes).webp({ lossless: normalSources.has(image) || dataSources.has(image), quality: 94, effort: 6 }).toBuffer();
    gltf.images[image].mimeType = 'image/webp';
  }
  view.byteOffset = length; view.byteLength = bytes.length;
  chunks.push(bytes); length += bytes.length;
  const padding = (4 - length % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); length += padding; }
}
for (const texture of gltf.textures) {
  texture.extensions = { ...texture.extensions, EXT_texture_webp: { source: imageFor(texture) } };
  delete texture.source;
}
gltf.extensionsUsed = [...new Set([...(gltf.extensionsUsed || []), 'EXT_texture_webp'])];
gltf.extensionsRequired = [...new Set([...(gltf.extensionsRequired || []), 'EXT_texture_webp'])];
gltf.asset.extras = {
  sourceAuthor: 'AK / skaf13',
  sourceLicense: 'CC BY 4.0',
  sourceUrl: 'https://sketchfab.com/3d-models/m249-light-machine-gun-75cacc16a52640c7adb100d7294da244',
  sourceLicenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  modification: 'v0.5: original project-authored canvas pouch, seams, decorative short belt, bevelled muzzle interior; original gun UVs retained. Polymer/steel materials separated. Non-functional game artwork.',
};
gltf.buffers = [{ byteLength: length }];
const rawJson = Buffer.from(JSON.stringify(gltf));
const json = Buffer.concat([rawJson, Buffer.alloc((4 - rawJson.length % 4) % 4, 32)]);
const body = Buffer.concat(chunks);
const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + body.length, 8);
jsonHeader.writeUInt32LE(json.length); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
binHeader.writeUInt32LE(body.length); binHeader.writeUInt32LE(0x004e4942, 4);
const result = Buffer.concat([header, jsonHeader, json, binHeader, body]);
fs.writeFileSync(path.join(root, 'public/assets/m249-real.glb'), result);
fs.writeFileSync(path.join(root, 'weapon-sources/v0.5/m249-detail-packed.glb'), result);
const report = {
  bytes: result.length, sha256: crypto.createHash('sha256').update(result).digest('hex'),
  triangles: gltf.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n, primitive) => n + gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3, 0), 0),
  draws: gltf.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0),
  materials: gltf.materials.map(material => material.name),
  embeddedImages: gltf.images.length, externalImages: gltf.images.filter(image => image.uri).length,
};
fs.writeFileSync(path.join(root, 'weapon-sources/v0.5/runtime-statistics.json'), JSON.stringify(report, null, 2));
console.log(report);
