import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import draco3d from 'draco3d';

const file = new URL('../assets/roadster.glb', import.meta.url);
const bytes = await fs.readFile(file);
const source = JSON.parse(await fs.readFile(new URL('../assets/roadster.source.json', import.meta.url)));
const io = new NodeIO().registerExtensions([KHRDracoMeshCompression, KHRMaterialsClearcoat])
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const document = await io.readBinary(bytes);

test('the shipped mesh is the identified steveCAD document snapshot', () => {
  assert.equal(source.document_id, 'cb784919-1fe5-4a3a-a39d-a91fe59d781c');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.output_sha256);
  assert.equal(document.getRoot().listScenes()[0].getExtras().sourceRevision, source.revision);
  assert.equal(document.getRoot().listMeshes().length, source.parts.length);
  assert.ok(bytes.length < 4 * 1024 * 1024, 'game asset stays below 4 MiB');
});

test('all CAD owners survive optimization and split parts are not duplicated', () => {
  const nodes = document.getRoot().listNodes();
  const names = new Set(nodes.map(node => node.getName()));
  for (const part of source.parts) assert.ok(names.has(part.name), `${part.name} missing`);
  for (const part of source.parts.filter(p => p.name !== p.owner)) assert.ok(!names.has(part.owner), `aggregate duplicated: ${part.owner}`);
  for (const name of ['body','windshield','door_left','door_right','front_tire_left','rear_tire_right','front_lamps','rear_lamp']) assert.ok(names.has(name));
});

test('decoded mesh has finite positions, unit normals and valid triangle indices', () => {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const p = primitive.getAttribute('POSITION'), n = primitive.getAttribute('NORMAL'), indices = primitive.getIndices();
    assert.equal(p.getCount(), n.getCount());
    assert.equal(indices.getCount() % 3, 0);
    for (const v of p.getArray()) assert.ok(Number.isFinite(v));
    for (const index of indices.getArray()) assert.ok(index >= 0 && index < p.getCount());
    const normals = n.getArray();
    for (let i = 0; i < normals.length; i += 3) assert.ok(Math.abs(Math.hypot(normals[i],normals[i+1],normals[i+2]) - 1) < .01, `${mesh.getName()} has invalid normals`);
    triangles += indices.getCount() / 3;
  }
  assert.equal(triangles, source.triangles);
  assert.ok(triangles < source.source_triangles * .4);
});

test('front and rear face the expected game directions and materials remain separate', () => {
  const meshes = document.getRoot().listMeshes();
  const zCenter = name => {
    const position = meshes.find(m => m.getName() === name).listPrimitives()[0].getAttribute('POSITION').getArray();
    let min = Infinity, max = -Infinity;
    for (let i = 2; i < position.length; i += 3) { min = Math.min(min,position[i]); max = Math.max(max,position[i]); }
    return (min + max) / 2;
  };
  assert.ok(zCenter('front_lamps') > zCenter('rear_lamp'));
  const materials = document.getRoot().listMaterials().map(m => m.getName());
  for (const name of ['cad_silver_paint','cad_bronze_glazing','cad_tire','cad_headlights','cad_taillight']) assert.ok(materials.includes(name));
});

test('social previews are declared in static HTML and reference a real 1200 × 630 image', async () => {
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  const social = await fs.readFile(new URL('../assets/social-preview.png', import.meta.url));
  assert.equal(social.subarray(1,4).toString(), 'PNG');
  assert.equal(social.readUInt32BE(16), 1200); assert.equal(social.readUInt32BE(20), 630);
  assert.match(html, /property="og:url" content="https:\/\/burhop\.github\.io\/games\/roadster-lander\/"/);
  assert.match(html, /property="og:image" content="https:\/\/burhop\.github\.io\/games\/roadster-lander\/assets\/social-preview\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
});
