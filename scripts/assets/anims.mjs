// Shared animation file for every Quaternius-based character (same 65-bone skeleton).
import { NodeIO } from '@gltf-transform/core';
import { prune, resample, dedup } from '@gltf-transform/functions';
const KEEP = {
  Idle_Loop:'idle', Walk_Loop:'walk', Jog_Fwd_Loop:'jog', Sprint_Loop:'sprint',
  Driving_Loop:'drive', Idle_Talking_Loop:'talk', Sitting_Idle_Loop:'sit', Sitting_Talking_Loop:'sit_talk',
  Interact:'interact', PickUp_Table:'pickup', Push_Loop:'push',
  Punch_Jab:'punch_jab', Punch_Cross:'punch_cross', Hit_Chest:'hit', Hit_Head:'hit_head', Death01:'death',
  Jump_Start:'jump_start', Jump_Loop:'jump_loop', Jump_Land:'jump_land', Roll:'roll',
  Crouch_Idle_Loop:'crouch_idle', Crouch_Fwd_Loop:'crouch_walk',
  Pistol_Idle_Loop:'pistol_idle', Pistol_Aim_Neutral:'pistol_aim', Pistol_Shoot:'pistol_shoot', Pistol_Reload:'pistol_reload',
};
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
for (const a of root.listAnimations()) {
  const name = KEEP[a.getName()];
  if (!name) { a.dispose(); continue; }
  a.setName(name);
  for (const c of a.listChannels()) {
    const node = c.getTargetNode().getName(), path = c.getTargetPath();
    const keep = path === 'rotation' ? !/_leaf_/.test(node) : path === 'translation' && node === 'pelvis';
    if (!keep) { const s = c.getSampler(); c.dispose(); s.dispose(); }
  }
}
// no mesh: the characters bring their own
for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
for (const m of root.listMeshes()) m.dispose();
for (const s of root.listSkins()) s.dispose();
await doc.transform(resample({ tolerance: 2e-4 }), dedup(), prune({ keepLeaves: true }));
await io.write(process.argv[3], doc);
