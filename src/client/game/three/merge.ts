import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Durağan bir grubun içindeki mesh ve çizgileri malzemeye göre birleştirir.
 * Her plaka, boru, kelepçe ayrı bir çizim çağrısıydı; telefonda kare başına yüzlerce çağrı
 * (ana geçiş + gölge + AO derinliği) kasmanın ana nedeniydi. Görünüm aynı kalır.
 * Işıklar ve birleştirilemeyenler (çoklu malzeme, ters ölçek) yerinde bırakılır.
 */
export function mergeStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  type Item = { obj: THREE.Mesh | THREE.LineSegments; geo: THREE.BufferGeometry };
  const buckets = new Map<string, { kind: "mesh" | "line"; mat: THREE.Material; cast: boolean; recv: boolean; items: Item[] }>();
  const rel = new THREE.Matrix4();
  const split = new Set<THREE.Mesh>();

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const line = o as THREE.LineSegments;
    const isMesh = mesh.isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && !(o as THREE.InstancedMesh).isInstancedMesh;
    const isLine = !!line.isLineSegments;
    if (!isMesh && !isLine) return;
    if (!o.visible) return;
    rel.multiplyMatrices(inv, o.matrixWorld);
    if (rel.determinant() < 0) return;
    const geo = mesh.geometry;
    if (geo.morphAttributes && Object.keys(geo.morphAttributes).length) return;
    if (Array.isArray(mesh.material)) {
      // Yüz başına malzeme (ör. üstü kontrplak kutu): her grup ayrı çizim çağrısıydı; gruplara böl
      if (!isMesh || !geo.groups.length) return;
      const flat = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(rel);
      const attrsM = Object.keys(flat.attributes).sort().join(",");
      for (const gr of geo.groups) {
        const mat = mesh.material[gr.materialIndex ?? 0];
        if (!mat) continue;
        const sub = new THREE.BufferGeometry();
        for (const [name, a] of Object.entries(flat.attributes)) {
          const at = a as THREE.BufferAttribute;
          const n = at.itemSize;
          const end = Math.min(gr.start + gr.count, at.count);
          sub.setAttribute(name, new THREE.BufferAttribute(at.array.slice(gr.start * n, end * n), n, at.normalized));
        }
        const key = `mesh|${mat.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${attrsM}|n`;
        let b = buckets.get(key);
        if (!b) {
          b = { kind: "mesh", mat, cast: o.castShadow, recv: o.receiveShadow, items: [] };
          buckets.set(key, b);
        }
        b.items.push({ obj: mesh, geo: sub });
      }
      flat.dispose();
      split.add(mesh);
      return;
    }
    const attrs = Object.keys(geo.attributes).sort().join(",");
    const kind = isMesh ? "mesh" : "line";
    const key = `${kind}|${(mesh.material as THREE.Material).uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${attrs}|${geo.index ? "i" : "n"}`;
    let b = buckets.get(key);
    if (!b) {
      b = { kind, mat: mesh.material as THREE.Material, cast: o.castShadow, recv: o.receiveShadow, items: [] };
      buckets.set(key, b);
    }
    b.items.push({ obj: o as THREE.Mesh, geo: geo.clone().applyMatrix4(rel) });
  });

  const dropped = new Set<THREE.BufferGeometry>();
  for (const b of buckets.values()) {
    if (b.items.length < 2 && !split.has(b.items[0].obj as THREE.Mesh)) {
      for (const it of b.items) it.geo.dispose();
      continue;
    }
    for (const it of b.items) for (const name of Object.keys(it.geo.attributes)) if (name !== "position" && name !== "normal" && name !== "uv" && name !== "color") it.geo.deleteAttribute(name);
    const merged = mergeGeometries(
      b.items.map((it) => it.geo),
      false,
    );
    for (const it of b.items) it.geo.dispose();
    if (!merged) {
      // Birleşmediyse bölünen mesh yerinde kalsın
      for (const it of b.items) split.delete(it.obj as THREE.Mesh);
      continue;
    }
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const out = b.kind === "mesh" ? new THREE.Mesh(merged, b.mat) : new THREE.LineSegments(merged, b.mat);
    out.castShadow = b.cast;
    out.receiveShadow = b.recv;
    out.matrixAutoUpdate = false;
    root.add(out);
    for (const it of b.items) {
      dropped.add(it.obj.geometry);
      it.obj.removeFromParent();
    }
  }
  // Artık kimsenin kullanmadığı özgün geometrileri bırak
  const inUse = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (g) inUse.add(g);
  });
  for (const g of dropped) if (!inUse.has(g)) g.dispose();
  // Boş kalan ara grupları temizle
  const empty: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && o.type === "Group" && o.children.length === 0) empty.push(o);
  });
  for (const o of empty) o.removeFromParent();
  root.updateMatrixWorld(true);
}

/** Bir nesnedeki farklı malzemelerin kopyası: aynı malzemeyi paylaşan parçalar aynı kopyayı alır. */
export function cloneMaterialsOnce(root: THREE.Object3D): void {
  const map = new Map<string, THREE.Material>();
  const cl = (m: THREE.Material) => {
    let c = map.get(m.uuid);
    if (!c) {
      c = m.clone();
      map.set(m.uuid, c);
    }
    return c;
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.LineSegments).isLineSegments) return;
    m.material = Array.isArray(m.material) ? m.material.map(cl) : cl(m.material as THREE.Material);
  });
}
