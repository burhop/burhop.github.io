// Convert a saved steveCAD render-assets export into the game's GLB.
// Source CAD, manifests and STL files are read-only. No network or CAD mutations.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { BufferAttribute, Box3, Color, Matrix4 } from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import draco3d from 'draco3d';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
  manifest: { type: 'string' }, output: { type: 'string', default: path.join(root, 'assets/roadster.glb') },
  ratio: { type: 'string', default: '0.18' }, error: { type: 'string', default: '0.0005' },
} });
if (!values.manifest) throw new Error('Usage: npm run build:model -- --manifest <export-folder>/render-assets.json');
const ratio = Number(values.ratio), maxError = Number(values.error);
if (!(ratio > 0 && ratio <= 1 && maxError >= 0 && maxError <= .01)) throw new Error('Invalid mesh reduction settings.');
const manifestFile = path.resolve(values.manifest), folder = path.dirname(manifestFile);
const manifestBytes = await fs.readFile(manifestFile), source = JSON.parse(manifestBytes);
if (!source.document_id || !source.revision || !Array.isArray(source.items) || !source.items.length) {
  throw new Error('The manifest must identify its steveCAD document, revision and mesh items.');
}
if (!source.frame?.startsWith('design;')) throw new Error('Expected meshes with assembly placement already applied in design coordinates.');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const output = path.resolve(values.output);
if (output === manifestFile) throw new Error('Output must not overwrite the source manifest.');

const document = new Document();
document.getRoot().getAsset().generator = 'Roadster Lander / steveCAD mesh pipeline 1';
document.getRoot().getAsset().copyright = 'User-authored steveCAD Roadster study; see CREDITS.md';
const scene = document.createScene('Roadster 2026');
const buffer = document.createBuffer();
const clearcoat = document.createExtension(KHRMaterialsClearcoat);
const materials = new Map();
const rgb = hex => new Color(hex).toArray();

function materialFor(owner, chunk) {
  let name = 'cad_silver_paint', color = source.paint_color || '#B8BCC0', metalness = .52, roughness = .25, coat = .7, emissive = null;
  if (chunk.role?.startsWith('roof_panel') || owner.includes('glass') || owner === 'windshield') {
    name = 'cad_bronze_glazing'; color = source.glazing_color || '#2B2119'; metalness = 0; roughness = .24; coat = .9;
  }
  if (chunk.color && !chunk.role?.startsWith('roof_panel')) {
    name = `cad_${chunk.role || owner}`; color = chunk.color;
    metalness = chunk.metalness ?? .1; roughness = chunk.roughness ?? .5; coat = 0;
  } else if (owner.includes('tire')) {
    name = 'cad_tire'; color = '#151719'; metalness = 0; roughness = .9; coat = 0;
  } else if (owner.includes('rim') && !chunk.color) {
    name = 'cad_wheel_alloy'; color = '#ADB5C2'; metalness = .88; roughness = .24; coat = 0;
  } else if (owner === 'rear_plate') {
    name = 'cad_plate'; color = '#E7E7E0'; metalness = .1; roughness = .42; coat = 0;
  } else if (owner === 'front_lamps' || owner === 'front_edge_strip') {
    name = 'cad_headlights'; color = '#EDF2F7'; metalness = .1; roughness = .16; coat = 0; emissive = '#C2C7CD';
  } else if (owner === 'rear_lamp') {
    name = 'cad_taillight'; color = '#EC163E'; metalness = .12; roughness = .2; coat = 0; emissive = '#FF330A';
  } else if (owner.startsWith('side_marker')) {
    name = 'cad_side_marker'; color = '#DD8C30'; metalness = 0; roughness = .25; coat = 0;
  } else if (owner === 'rear_fascia_middle') {
    name = 'cad_rear_fascia'; color = source.rear_bumper_color || '#24272B';
    metalness = source.rear_bumper_metalness ?? .12; roughness = source.rear_bumper_roughness ?? .66; coat = 0;
  } else if (!chunk.color && (owner.startsWith('side_trim') || owner === 'lower_aero' || owner === 'bonnet_vent')) {
    name = 'cad_trim'; color = '#101318'; metalness = .02; roughness = .72; coat = 0;
  }
  if (materials.has(name)) return materials.get(name);
  const material = document.createMaterial(name).setBaseColorFactor([...rgb(color), 1])
    .setMetallicFactor(metalness).setRoughnessFactor(roughness);
  if (coat) material.setExtension('KHR_materials_clearcoat', clearcoat.createClearcoat().setClearcoatFactor(coat).setClearcoatRoughnessFactor(.11));
  if (emissive) material.setEmissiveFactor(rgb(emissive));
  materials.set(name, material);
  return material;
}

await MeshoptSimplifier.ready;
// Source front is -X and up is +Z. Game/glTF front is +Z and up is +Y.
// This is a proper rotation (determinant +1), not a reflection or assembly relocation.
const rotation = new Matrix4().set(0,-1,0,0, 0,0,1,0, -1,0,0,0, 0,0,0,1);
const loader = new STLLoader(), bounds = new Box3(), sourceBounds = new Box3();
const parts = [], names = new Set();
let sourceTriangles = 0, resultTriangles = 0;
for (const item of source.items) {
  // Submesh files replace their aggregate; including both would duplicate geometry.
  for (const chunk of item.submeshes || [item]) {
    const file = path.resolve(folder, chunk.file);
    const relative = path.relative(folder, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Mesh path leaves source folder: ${chunk.file}`);
    if (file === output) throw new Error('Output must not overwrite a source mesh.');
    const bytes = await fs.readFile(file), hash = sha256(bytes);
    if (!chunk.sha256 || hash !== chunk.sha256) throw new Error(`Source checksum mismatch: ${chunk.file}`);
    const name = item.name + (chunk.role ? `__${chunk.role}` : '');
    if (names.has(name)) throw new Error(`Duplicate mesh name: ${name}`);
    names.add(name);
    let geometry = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    geometry.computeBoundingBox(); sourceBounds.union(geometry.boundingBox);
    const before = geometry.getAttribute('position').count / 3;
    sourceTriangles += before;
    geometry.deleteAttribute('normal');
    const unwelded = geometry;
    geometry = mergeVertices(unwelded, .00001);
    unwelded.dispose();
    const indices = Uint32Array.from(geometry.getIndex().array);
    const target = Math.min(before, Math.max(600, Math.round(before * ratio)));
    const [simplified, error] = MeshoptSimplifier.simplify(indices, geometry.getAttribute('position').array, 3, target * 3, maxError, ['LockBorder']);
    geometry.setIndex(new BufferAttribute(simplified, 1));
    geometry.applyMatrix4(rotation);
    const indexed = geometry;
    geometry = toCreasedNormals(indexed, Math.PI / 6);
    indexed.dispose();
    const creased = geometry;
    geometry = mergeVertices(creased, .00001);
    creased.dispose();
    geometry.computeBoundingBox(); bounds.union(geometry.boundingBox);
    const positions = geometry.getAttribute('position').array, normals = geometry.getAttribute('normal').array;
    for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i]) || !Number.isFinite(normals[i])) throw new Error(`Nonfinite geometry: ${name}`);
    const after = geometry.getIndex().count / 3;
    resultTriangles += after;
    const accessor = (suffix, type, data) => document.createAccessor(`${name}_${suffix}`).setBuffer(buffer).setType(type).setArray(data);
    const primitive = document.createPrimitive()
      .setAttribute('POSITION', accessor('position', 'VEC3', positions.slice()))
      .setAttribute('NORMAL', accessor('normal', 'VEC3', normals.slice()))
      .setIndices(accessor('indices', 'SCALAR', geometry.getIndex().array.slice()))
      .setMaterial(materialFor(item.name, chunk));
    const mesh = document.createMesh(name).addPrimitive(primitive);
    scene.addChild(document.createNode(name).setMesh(mesh).setExtras({ cadPart: item.name, role: chunk.role || null }));
    parts.push({ name, owner: item.name, file: chunk.file, source_sha256: hash, source_triangles: before, triangles: after, simplifier_error_relative_to_part: error });
    geometry.dispose();
  }
}

document.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
  method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed: 5, decodeSpeed: 5,
  quantizationBits: { POSITION: 16, NORMAL: 12 },
});
const metadata = {
  schema_version: 1, document_id: source.document_id,
  document_url: `https://stevecad.studio/?document=${encodeURIComponent(source.document_id)}`,
  revision: source.revision, revision_label: source.revision_label || String(source.revision),
  native_build_id: source.native_build_id || null, source_manifest_sha256: sha256(manifestBytes),
  source_step_sha256: source.source_step_sha256 || null,
  source_frame: source.frame, source_bounds: { min: sourceBounds.min.toArray(), max: sourceBounds.max.toArray() },
  axis_transform: 'source (x, y, z) -> glTF (-y, z, -x); front +Z, up +Y',
  bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  materials: [...materials.keys()], source_triangles: sourceTriangles, triangles: resultTriangles,
  settings: { target_ratio: ratio, max_relative_simplifier_error: maxError, normal_crease_degrees: 30, position_quantization_bits: 16, normal_quantization_bits: 12 },
  appearance: source.appearance_label || 'CAD materials',
  qualification: 'Game visualization derived from the saved CAD study. Not a verified production design; no CAD source or live revision was modified.',
  parts,
};
scene.setExtras({ sourceDocument: source.document_id, sourceRevision: source.revision, nativeBuild: source.native_build_id });
const io = new NodeIO().registerExtensions([KHRDracoMeshCompression, KHRMaterialsClearcoat])
  .registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule() });
const glb = await io.writeBinary(document);
metadata.output_sha256 = sha256(glb);
metadata.output_bytes = glb.byteLength;
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, glb);
await fs.writeFile(output.replace(/\.glb$/i, '') + '.source.json', JSON.stringify(metadata, null, 2) + '\n');
console.log(`${source.revision_label}: ${parts.length} named meshes, ${sourceTriangles.toLocaleString()} -> ${resultTriangles.toLocaleString()} triangles.`);
console.log(`GLB: ${(glb.byteLength / 1024 / 1024).toFixed(2)} MiB; ${output}`);
console.log(`Canonical bounds: ${JSON.stringify(metadata.bounds)}`);
