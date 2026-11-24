// Character = base body + hairstyle, both skinned to the same Quaternius skeleton. The hair arrives with
// its own copy of the skeleton; we point its skin at the body's bones (matched by name) and drop the copy.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup } from '@gltf-transform/functions';
const [,, bodyPath, outPath, ...extras] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(bodyPath);
const root = doc.getRoot();
const bodySkin = root.listSkins()[0];
const bones = new Map(bodySkin.listJoints().map((j) => [j.getName(), j]));
const armature = root.listScenes()[0].listChildren().find((n) => n.getName() === 'Armature');
const keepNodes = new Set(root.listNodes());
const keepMaterials = new Map(root.listMaterials().map((m) => [m.getName(), m]));
for (const p of extras) {
  const src = await io.read(p);
  const map = mergeDocuments(doc, src);
  for (const n of root.listNodes()) {
    if (keepNodes.has(n) || !n.getMesh() || !n.getSkin()) continue;
    const skin = n.getSkin();
    const joints = skin.listJoints();
    for (const j of joints) { const b = bones.get(j.getName()); if (!b) throw new Error('no bone ' + j.getName()); skin.removeJoint(j); }
    for (const j of joints) skin.addJoint(bones.get(j.getName()));
    skin.setSkeleton(bones.get('root'));
    // reuse the body's copy of a material with the same name (hair/eyebrows share MI_Hair_1)
    for (const prim of n.getMesh().listPrimitives()) {
      const same = keepMaterials.get(prim.getMaterial()?.getName());
      if (same) prim.setMaterial(same);
    }
    armature.addChild(n);
    keepNodes.add(n);
  }
  // throw away the merged-in scene and its duplicate skeleton
  for (const s of root.listScenes().slice(1)) s.dispose();
  for (const n of root.listNodes()) if (!keepNodes.has(n)) n.dispose();
}
for (const s of root.listScenes().slice(1)) s.dispose();
root.setDefaultScene(root.listScenes()[0]);
const buf = root.listBuffers()[0];
for (const a of root.listAccessors()) a.setBuffer(buf);
for (const b of root.listBuffers().slice(1)) b.dispose();
await doc.transform(dedup(), prune());
await io.write(outPath, doc);
console.log('skins', root.listSkins().length, 'nodes', root.listNodes().length, 'meshes', root.listMeshes().map(m=>m.getName()));
