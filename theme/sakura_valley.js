import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const themeMeta = {
  id: 'sakura_valley',
  name: 'Sakura Valley',
  backgroundColor: '#fdf0f3',
  accentColor: '#e63946',
};

const NAMES = [
  'Zen Stones & Bamboo', 'Tea Shelter', 'Sakura Cottage', 'Bamboo Garden Home',
  'Two-Story Tea House', 'Lantern Market', 'Torii Courtyard Shrine', 'Koi Pond Manor',
  'Three-Tier Pagoda', 'Samurai Stone Keep', 'Water-Moat Fortress',
  'Golden Pavilion Palace', 'Grand Imperial Citadel',
];

const COLORS = {
  moss: '#84a96c', mossDark: '#628454', sand: '#eae4d7', ivory: '#fff7e8',
  slate: '#2b2d42', cedar: '#6f4518', timber: '#594033', wood: '#aa7954',
  woodLight: '#c99b70', cedarRoof: '#9c6644', plaster: '#fff6ed',
  charcoal: '#3d405b', indigo: '#274c77', roofEdge: '#20364f',
  stone: '#a3aaa5', stoneDark: '#757f7d', stoneLight: '#cbd0c6',
  bamboo: '#639c49', bambooJoint: '#a2c777', bambooCut: '#d7d9a1',
  pink: '#ff8fa3', pinkLight: '#ffb3c6', pinkShade: '#ed7997',
  red: '#e63946', crimson: '#d90429', redDark: '#9f2438',
  paper: '#ffe699', water: '#48cae4', deepWater: '#259eb8',
  gold: '#ffb703', goldLight: '#ffda75', koi: '#f68b45', selection: '#ff758f',
  cloth: '#ffffff',
};

const FINISHES = {
  paper: { emissive: '#ffd574', emissiveIntensity: 0.23, roughness: 0.7 },
  water: { roughness: 0.25, metalness: 0.08 },
  gold: { roughness: 0.46, metalness: 0.28 },
  goldLight: { roughness: 0.5, metalness: 0.2 },
  selection: { emissive: '#ff758f', emissiveIntensity: 0.48, roughness: 0.5 },
  cloth: { vertexColors: true, side: THREE.DoubleSide, roughness: 1 },
};

// Each factory gets its own lazy material cache; no disposable resource escapes it.
function palette() {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) {
      const material = new THREE.MeshStandardMaterial({
        color: COLORS[key], flatShading: true, roughness: 0.87, ...FINISHES[key],
      });
      material.name = `Sakura Valley · ${key}`;
      cache.set(key, material);
    }
    return cache.get(key);
  };
}

function mesh(parent, geometry, material, x = 0, y = 0, z = 0, name = '') {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(parent, material, w, h, d, x, y, z) {
  return mesh(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
}

function cylinder(parent, material, r, h, x, y, z, top = r, sides = 8) {
  return mesh(parent, new THREE.CylinderGeometry(top, r, h, sides), material, x, y, z);
}

function place(parent, x, y, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  parent.add(group);
  return group;
}

function beam(parent, material, a, b, width, depth = width) {
  const direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const object = box(parent, material, width, direction.length(), depth,
    (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return object;
}

function geometryFromRings(rings) {
  const positions = rings.flat(2);
  const indices = [];
  const count = rings[0].length;
  for (let layer = 0; layer < rings.length - 1; layer++) {
    for (let i = 0; i < count; i++) {
      const a = layer * count + i;
      const b = layer * count + (i + 1) % count;
      indices.push(a, b, b + count, a, b + count, a + count);
    }
  }
  const top = (rings.length - 1) * count;
  for (let i = 1; i < count - 1; i++) indices.push(0, i + 1, i, top, top + i, top + i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function slabGeometry(w, d, bottom, top, bevel = 0.008, cut = 0.03) {
  const rings = [];
  for (const [y, inset] of [[bottom, bevel], [bottom + bevel, 0], [top - bevel, 0], [top, bevel]]) {
    const a = w / 2 - inset;
    const b = d / 2 - inset;
    const c = Math.max(0.001, cut - inset * 0.4);
    rings.push([[-a + c, y, -b], [-a, y, -b + c], [-a, y, b - c], [-a + c, y, b],
      [a - c, y, b], [a, y, b - c], [a, y, -b + c], [a - c, y, -b]]);
  }
  return geometryFromRings(rings);
}

function slab(parent, material, w, d, bottom, top, x = 0, z = 0, bevel = 0.008, cut = 0.03) {
  return mesh(parent, slabGeometry(w, d, bottom, top, bevel, cut), material, x, 0, z);
}

function prism(points, depth) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false, curveSegments: 1, steps: 1,
  }).translate(0, 0, -depth / 2);
}

// Broad hips, a short ridge, and a dipped outer slope give each roof upturned eaves.
function roof(parent, m, w, d, h, x, y, z, color = 'charcoal', edge = 'roofEdge') {
  const outline = (a, b, height, rise = 0) => [
    [-a, height + rise, -b], [-a, height, 0], [-a, height + rise, b], [0, height, b],
    [a, height + rise, b], [a, height, 0], [a, height + rise, -b], [0, height, -b],
  ];
  const eave = Math.min(0.025, h * 0.22);
  const lip = outline(w / 2, d / 2, 0.002, eave);
  const underside = lip.map(([a, b, c]) => [a, b - 0.016, c]);
  const rings = [underside, lip, outline(w * 0.37, d * 0.34, h * 0.2),
    outline(w * 0.22, 0.007, h)];
  mesh(parent, geometryFromRings(rings), m(color), x, y, z);
  for (let i = 0; i < lip.length; i++) {
    const a = lip[i];
    const b = lip[(i + 1) % lip.length];
    beam(parent, m(edge), [x + a[0], y + a[1] - 0.008, z + a[2]],
      [x + b[0], y + b[1] - 0.008, z + b[2]], 0.012);
  }
  box(parent, m(edge), w * 0.48, 0.018, 0.027, x, y + h + 0.004, z);
  return y + h + 0.013;
}

function shoji(parent, m, x, y, z, w, h, side = false, trim = 'timber') {
  const frame = place(parent, x, y, z);
  if (side) frame.rotation.y = Math.PI / 2;
  box(frame, m(trim), w + 0.017, h + 0.017, 0.013, 0, 0, 0);
  box(frame, m('paper'), w, h, 0.007, 0, 0, 0.008);
  box(frame, m(trim), 0.006, h, 0.006, 0, 0, 0.015);
  box(frame, m(trim), w, 0.006, 0.006, 0, 0, 0.015);
}

function hall(parent, m, {
  w, d, h, base, x = 0, z = 0, roofH = 0.13, wall = 'plaster',
  roofColor = 'charcoal', posts = 'timber', gilded = false, door = true,
}) {
  box(parent, m(wall), w, h, d, x, base + h / 2, z);
  box(parent, m(posts), w + 0.012, 0.025, d + 0.012, x, base + 0.0125, z);
  box(parent, m(gilded ? 'gold' : posts), w + 0.016, 0.022, d + 0.016, x, base + h - 0.018, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(parent, m(posts), 0.023, h, 0.023,
      x + sx * (w / 2 - 0.006), base + h / 2, z + sz * (d / 2 - 0.006));
  }
  const paneH = Math.min(0.12, h * 0.36);
  const paneW = Math.min(0.081, w * 0.23);
  const trim = gilded ? 'gold' : posts;
  if (w > 0.34) {
    for (const offset of [-0.28, 0.28]) {
      shoji(parent, m, x + w * offset, base + h * 0.57, z + d / 2 + 0.005, paneW, paneH, false, trim);
    }
  } else if (!door) {
    shoji(parent, m, x, base + h * 0.56, z + d / 2 + 0.005, paneW, paneH, false, trim);
  }
  shoji(parent, m, x + w / 2 + 0.005, base + h * 0.57, z, Math.min(0.078, d * 0.26), paneH, true, trim);
  if (door) {
    const doorH = Math.min(0.19, h * 0.7);
    shoji(parent, m, x, base + doorH / 2 + 0.014, z + d / 2 + 0.008,
      Math.min(0.105, w * 0.3), doorH, false, posts);
  }
  return roof(parent, m, w + 0.09, d + 0.09, roofH, x, base + h, z,
    roofColor, gilded ? 'goldLight' : 'roofEdge');
}

function gardenBase(parent, m, w = 0.78, d = 0.76, top = 0.05) {
  slab(parent, m('stoneDark'), w, d, 0, top - 0.012, 0, 0, 0.007, 0.055);
  slab(parent, m('sand'), w - 0.012, d - 0.012, top - 0.019, top, 0, 0, 0.004, 0.05);
}

function steps(parent, m, x, z, top = 0.1, w = 0.17) {
  box(parent, m('stoneLight'), w, top * 0.45, 0.07, x, top * 0.225 + 0.045, z + 0.035);
  box(parent, m('stoneLight'), w * 0.87, top * 0.75, 0.06, x, top * 0.375 + 0.045, z - 0.01);
}

function stoneLantern(parent, m, x, base, z, scale = 1) {
  const lantern = place(parent, x, base, z, scale);
  slab(lantern, m('stoneDark'), 0.105, 0.105, 0, 0.022, 0, 0, 0.004, 0.02);
  cylinder(lantern, m('stone'), 0.021, 0.084, 0, 0.064, 0, 0.027, 6);
  box(lantern, m('stoneLight'), 0.082, 0.018, 0.082, 0, 0.111, 0);
  box(lantern, m('paper'), 0.049, 0.045, 0.049, 0, 0.142, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(lantern, m('stoneDark'), 0.009, 0.052, 0.009, sx * 0.03, 0.142, sz * 0.03);
  }
  roof(lantern, m, 0.12, 0.12, 0.036, 0, 0.177, 0, 'stone', 'stoneDark');
  mesh(lantern, new THREE.OctahedronGeometry(0.012), m('stoneLight'), 0, 0.229, 0);
}

function sakura(parent, m, x, z, scale = 1, base = 0.05) {
  const tree = place(parent, x, base, z, scale);
  cylinder(tree, m('timber'), 0.016, 0.22, 0, 0.11, 0, 0.009, 6);
  beam(tree, m('timber'), [0, 0.115, 0], [-0.048, 0.225, 0.012], 0.014);
  beam(tree, m('timber'), [0, 0.14, 0], [0.05, 0.243, -0.012], 0.012);
  mesh(tree, new THREE.IcosahedronGeometry(0.101, 1), m('pink'), 0, 0.275, 0);
  mesh(tree, new THREE.IcosahedronGeometry(0.072, 1), m('pinkShade'), -0.053, 0.247, 0.018);
  mesh(tree, new THREE.IcosahedronGeometry(0.073, 1), m('pinkLight'), 0.049, 0.284, 0.012);
}

function bamboo(parent, m, x, base, z, scale = 1) {
  const patch = place(parent, x, base, z, scale);
  for (let i = 0; i < 3; i++) {
    const px = (i - 1) * 0.044;
    const pz = i === 1 ? -0.025 : 0.018;
    const h = [0.23, 0.31, 0.265][i];
    cylinder(patch, m('bamboo'), 0.014, h, px, h / 2, pz, 0.012, 6);
    cylinder(patch, m('bambooCut'), 0.011, 0.004, px, h + 0.001, pz, 0.011, 6);
    for (const fraction of [0.32, 0.67]) {
      cylinder(patch, m('bambooJoint'), 0.016, 0.009, px, h * fraction, pz, 0.016, 6);
    }
    const direction = i % 2 ? -1 : 1;
    mesh(patch, prism([[0, 0], [direction * 0.063, 0.035], [direction * 0.039, 0.002]], 0.005),
      m('mossDark'), px, h * 0.73, pz);
  }
}

function bambooGarden(parent, m, x, z) {
  slab(parent, m('moss'), 0.23, 0.27, 0.048, 0.066, x, z, 0.004, 0.022);
  bamboo(parent, m, x, 0.065, z - 0.018, 0.76);
  for (const dx of [-0.116, 0.116]) {
    for (const dz of [-0.13, 0, 0.13]) {
      box(parent, m('woodLight'), 0.011, 0.096, 0.011, x + dx, 0.096, z + dz);
    }
    for (const y of [0.085, 0.12]) box(parent, m('wood'), 0.009, 0.009, 0.27, x + dx, y, z);
  }
  for (const y of [0.085, 0.12]) box(parent, m('wood'), 0.24, 0.009, 0.009, x, y, z + 0.13);
}

function torii(parent, m, x, base, z) {
  const gate = place(parent, x, base, z);
  for (const sx of [-1, 1]) {
    cylinder(gate, m('stoneDark'), 0.028, 0.025, sx * 0.12, 0.0125, 0, 0.028, 6);
    cylinder(gate, m('red'), 0.019, 0.295, sx * 0.12, 0.1675, 0, 0.016, 8);
    box(gate, m('slate'), 0.042, 0.023, 0.043, sx * 0.12, 0.038, 0);
  }
  box(gate, m('red'), 0.315, 0.025, 0.036, 0, 0.25, 0);
  box(gate, m('red'), 0.021, 0.064, 0.024, 0, 0.297, 0);
  const crown = [[-0.198, 0.347], [-0.13, 0.326], [0.13, 0.326], [0.198, 0.347],
    [0.184, 0.367], [0.123, 0.348], [-0.123, 0.348], [-0.184, 0.367]];
  mesh(gate, prism(crown, 0.055), m('slate'));
  box(gate, m('red'), 0.34, 0.021, 0.044, 0, 0.321, 0);
  box(gate, m('gold'), 0.032, 0.041, 0.009, 0, 0.291, 0.024);
}

function pond(parent, m, x, z, w, d, base = 0.05, fish = false) {
  slab(parent, m('stoneLight'), w, d, base, base + 0.019, x, z, 0.004, 0.045);
  slab(parent, m('deepWater'), w - 0.023, d - 0.023, base + 0.012, base + 0.021, x, z, 0.002, 0.039);
  slab(parent, m('water'), w - 0.038, d - 0.038, base + 0.019, base + 0.024, x, z, 0.001, 0.036);
  for (let i = 0; i < 2; i++) {
    box(parent, m('ivory'), w * 0.16, 0.0015, 0.005, x - w * 0.23 + i * w * 0.38,
      base + 0.025, z - d * 0.22 + i * d * 0.42);
  }
  if (fish) {
    for (let i = 0; i < 2; i++) {
      const koi = mesh(parent, new THREE.SphereGeometry(1, 7, 4), m(i ? 'ivory' : 'koi'),
        x + (i ? -0.065 : 0.065), base + 0.025, z + (i ? -0.045 : 0.045));
      koi.scale.set(0.031, 0.004, 0.012);
      koi.rotation.y = i ? -0.4 : 0.55;
      mesh(parent, prism([[0, 0], [-0.013, 0.009], [-0.013, -0.009]], 0.003), m('red'),
        x + (i ? -0.093 : 0.037), base + 0.025, z + (i ? -0.045 : 0.045)).rotation.x = -Math.PI / 2;
    }
  }
}

function bridge(parent, m, x, base, z) {
  const span = 0.245;
  const nodes = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 3 - 1;
    const y = base + 0.012 + (1 - u * u) * 0.037;
    const px = x + u * span / 2;
    nodes.push([px, y, z]);
    box(parent, m('red'), span / 6 + 0.002, 0.013, 0.095, px, y, z);
  }
  for (const side of [-1, 1]) {
    for (const i of [0, 3, 6]) {
      box(parent, m('redDark'), 0.009, 0.057, 0.009, nodes[i][0], nodes[i][1] + 0.03, z + side * 0.054);
    }
    for (let i = 0; i < 6; i++) {
      beam(parent, m('red'), [nodes[i][0], nodes[i][1] + 0.058, z + side * 0.054],
        [nodes[i + 1][0], nodes[i + 1][1] + 0.058, z + side * 0.054], 0.009);
    }
  }
}

function hangingLantern(parent, m, x, top, z) {
  cylinder(parent, m('timber'), 0.003, 0.039, x, top - 0.0195, z, 0.003, 5);
  const lantern = mesh(parent, new THREE.SphereGeometry(0.031, 8, 6), m('paper'), x, top - 0.068, z);
  lantern.scale.y = 1.14;
  for (const y of [top - 0.038, top - 0.099]) {
    cylinder(parent, m('redDark'), 0.014, 0.008, x, y, z, 0.014, 8);
  }
}

function finial(parent, m, x, base, z, height = 0.13) {
  cylinder(parent, m('gold'), 0.007, height, x, base + height / 2, z, 0.004, 6);
  for (let i = 0; i < 3; i++) {
    cylinder(parent, m('goldLight'), 0.022 - i * 0.004, 0.01,
      x, base + height * (0.23 + i * 0.22), z, 0.022 - i * 0.004, 8);
  }
  mesh(parent, new THREE.OctahedronGeometry(0.014), m('gold'), x, base + height + 0.007, z);
}

function stoneFoundation(parent, m, w, d, base, h, x = 0, z = 0) {
  // A wider foot and narrower summit make a battered Japanese castle plinth.
  const outline = (a, b, y) => [[-a, y, -b], [-a, y, b], [a, y, b], [a, y, -b]];
  mesh(parent, geometryFromRings([outline(w / 2, d / 2, base),
    outline(w * 0.43, d * 0.43, base + h)]), m('stoneDark'), x, 0, z);
  for (let row = 0; row < 3; row++) {
    const t = (row + 0.5) / 3;
    const ww = w * (1 - 0.14 * t);
    const dd = d * (1 - 0.14 * t);
    const y = base + h * t;
    for (let i = 0; i < 5; i++) {
      const px = -ww * 0.4 + i * ww * 0.2 + (row % 2 ? 0.012 : 0);
      box(parent, m((i + row) % 3 ? 'stone' : 'stoneLight'), ww * 0.178, h / 3 - 0.008,
        0.01, x + px, y, z + dd / 2 + 0.002);
    }
    for (let i = 0; i < 4; i++) {
      box(parent, m((i + row) % 3 ? 'stone' : 'stoneLight'), 0.01, h / 3 - 0.008, dd * 0.21,
        x + ww / 2 + 0.002, y, z - dd * 0.36 + i * dd * 0.24);
    }
  }
  box(parent, m('stoneLight'), w * 0.89, 0.025, d * 0.89, x, base + h - 0.006, z);
}

function ramparts(parent, m, w, d, base, h, cap = 'indigo') {
  for (const sx of [-1, 1]) {
    box(parent, m('stone'), 0.035, h, d, sx * w / 2, base + h / 2, 0);
    box(parent, m(cap), 0.048, 0.024, d + 0.012, sx * w / 2, base + h, 0);
  }
  box(parent, m('stone'), w, h, 0.035, 0, base + h / 2, -d / 2);
  box(parent, m(cap), w + 0.02, 0.024, 0.048, 0, base + h, -d / 2);
  for (const sx of [-1, 1]) {
    const span = w / 2 - 0.085;
    const x = sx * (0.085 + span / 2);
    box(parent, m('stone'), span, h, 0.035, x, base + h / 2, d / 2);
    box(parent, m(cap), span + 0.008, 0.024, 0.048, x, base + h, d / 2);
  }
}

function banner(root, m, x, base, z, height = 0.34, width = 0.083, inward = 1, royal = false) {
  cylinder(root, m('gold'), 0.0045, height, x, base + height / 2, z, 0.0045, 6);
  mesh(root, new THREE.OctahedronGeometry(0.012), m('goldLight'), x, base + height + 0.006, z);
  const clothHeight = height * 0.56;
  const geometry = new THREE.PlaneGeometry(width, clothHeight, 8, 5);
  geometry.translate(width / 2, -clothHeight / 2, 0);
  const positions = geometry.attributes.position;
  const colors = [];
  const ground = new THREE.Color(royal ? COLORS.crimson : COLORS.red);
  const crest = new THREE.Color(royal ? COLORS.goldLight : COLORS.ivory);
  for (let i = 0; i < positions.count; i++) {
    const u = positions.getX(i) / width;
    const v = -positions.getY(i) / clothHeight;
    positions.setX(i, positions.getX(i) * inward);
    if (v > 0.99) positions.setY(i, positions.getY(i) + Math.max(0, 1 - Math.abs(u - 0.5) * 2) * 0.016);
    const color = Math.abs(u - 0.52) + Math.abs(v - 0.43) < 0.24 ? crest : ground;
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const flag = mesh(root, geometry, m('cloth'), x, base + height - 0.021, z, 'Waving royal banner');
  flag.userData.cloth = true;
  flag.userData.restPositions = positions.array.slice();
  flag.userData.width = width;
  flag.userData.phase = x * 8 + z * 5;
  root.userData.banners ??= [];
  root.userData.banners.push(flag);
}

// Keep cloth editable, but collapse static architecture to one draw call per finish.
function batchArchitecture(root) {
  root.updateMatrixWorld(true);
  const batches = new Map();
  const sources = [];
  const groups = [];
  root.traverse((object) => {
    if (object.isGroup && object !== root) groups.push(object);
    if (!object.isMesh || object.userData.cloth) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    for (const key of Object.keys(geometry.attributes)) {
      if (key !== 'position' && key !== 'normal') geometry.deleteAttribute(key);
    }
    if (!batches.has(object.material)) batches.set(object.material, []);
    batches.get(object.material).push(geometry);
    sources.push(object);
  });
  for (const object of sources) {
    object.removeFromParent();
    object.geometry.dispose();
  }
  for (const group of groups.reverse()) if (!group.children.length) group.removeFromParent();
  for (const [material, pieces] of batches) {
    const geometry = mergeGeometries(pieces, false);
    for (const piece of pieces) piece.dispose();
    mesh(root, geometry, material, 0, 0, 0, material.name);
  }
}

export function createBoard() {
  const board = new THREE.Group();
  board.name = 'Sakura Valley · Zen garden board';
  board.userData.kind = 'board';
  const m = palette();
  slab(board, m('cedar'), 3.9, 3.9, -0.74, -0.285, 0, 0, 0.035, 0.09);
  slab(board, m('wood'), 3.96, 3.96, -0.325, -0.26, 0, 0, 0.012, 0.075);
  slab(board, m('slate'), 4, 4, -0.27, -0.068, 0, 0, 0.024, 0.06);
  // Quiet cedar grain stays entirely within the side faces and below the slate.
  for (const y of [-0.59, -0.45]) {
    for (const side of [-1, 1]) {
      box(board, m('timber'), 3.66, 0.008, 0.003, 0, y, side * 1.951);
      box(board, m('timber'), 0.003, 0.008, 3.66, side * 1.951, y, 0);
    }
  }
  const tileGeometry = slabGeometry(0.988, 0.988, -0.087, 0, 0.017, 0.033);
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    const tile = mesh(board, tileGeometry, m((row + column) % 2 ? 'sand' : 'moss'),
      column - 1.5, 0, row - 1.5, `tile-${row}-${column}`);
    tile.userData.gridCell = { row, column };
  }
  return board;
}

export function createSelectionIndicator() {
  const indicator = new THREE.Group();
  indicator.name = 'Sakura-pink corner brackets';
  const m = palette();
  // The solid frame spans .01–.03: contract center .02, luminous top at .03.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    slab(indicator, m('selection'), 0.18, 0.025, 0.01, 0.03, sx * 0.389, sz * 0.466, 0.003, 0.005);
    slab(indicator, m('selection'), 0.025, 0.18, 0.01, 0.03, sx * 0.466, sz * 0.389, 0.003, 0.005);
  }
  indicator.userData.sakuraAnimation = { time: 0, selection: m('selection') };
  return indicator;
}

export function createBuilding(level) {
  if (!Number.isInteger(level) || level < 1 || level > 13) {
    throw new RangeError('Sakura Valley building level must be an integer from 1 to 13.');
  }
  const model = new THREE.Group();
  const m = palette();
  model.name = NAMES[level - 1];
  model.userData = {
    level, assetName: model.name,
    tier: level <= 3 ? 'Quiet beginnings' : level <= 6 ? 'Village gardens' : level <= 9 ? 'Sacred estates' : 'Imperial wonders',
  };

  if (level === 1) {
    gardenBase(model, m, 0.59, 0.56, 0.04);
    slab(model, m('moss'), 0.23, 0.16, 0.037, 0.046, -0.1, -0.1, 0.002, 0.035);
    for (const [x, z, rx, ry, rz] of [
      [-0.11, 0.045, 0.112, 0.069, 0.087], [0.017, 0.086, 0.086, 0.049, 0.066],
      [-0.08, 0.176, 0.069, 0.035, 0.053],
    ]) {
      const stone = mesh(model, new THREE.SphereGeometry(1, 9, 6), m('stone'), x, 0.04 + ry, z);
      stone.scale.set(rx, ry, rz);
      stone.rotation.y = x * 3;
    }
    bamboo(model, m, -0.065, 0.045, -0.16);
    stoneLantern(model, m, 0.175, 0.04, 0.025, 0.72);
  }

  if (level === 2) {
    gardenBase(model, m, 0.67, 0.63, 0.045);
    slab(model, m('wood'), 0.51, 0.44, 0.047, 0.105, 0, -0.025, 0.006, 0.022);
    for (let i = 0; i < 6; i++) box(model, m('woodLight'), 0.004, 0.003, 0.409, -0.2 + i * 0.08, 0.106, -0.025);
    for (const x of [-0.207, 0.207]) for (const z of [-0.19, 0.14]) {
      box(model, m('timber'), 0.033, 0.286, 0.033, x, 0.248, z);
    }
    box(model, m('woodLight'), 0.45, 0.032, 0.035, 0, 0.375, 0.14);
    roof(model, m, 0.6, 0.53, 0.127, 0, 0.392, -0.025, 'cedarRoof', 'timber');
    box(model, m('timber'), 0.17, 0.06, 0.11, 0.02, 0.137, -0.06);
    box(model, m('woodLight'), 0.2, 0.018, 0.14, 0.02, 0.176, -0.06);
    cylinder(model, m('mossDark'), 0.023, 0.025, 0.02, 0.1975, -0.06, 0.017, 6);
    steps(model, m, 0, 0.232, 0.065);
  }

  if (level === 3) {
    gardenBase(model, m, 0.75, 0.72, 0.045);
    hall(model, m, { w: 0.45, d: 0.4, h: 0.39, base: 0.085, x: -0.065, z: -0.07, roofH: 0.145 });
    slab(model, m('wood'), 0.49, 0.12, 0.045, 0.086, -0.065, 0.159, 0.005, 0.014);
    steps(model, m, -0.065, 0.25, 0.045);
    sakura(model, m, 0.255, 0.23, 0.84, 0.045);
    slab(model, m('moss'), 0.17, 0.15, 0.044, 0.052, 0.255, 0.23, 0.002, 0.045);
  }

  if (level === 4) {
    gardenBase(model, m, 0.78, 0.76);
    hall(model, m, { w: 0.49, d: 0.43, h: 0.49, base: 0.095, x: -0.09, z: -0.085,
      roofH: 0.14, wall: 'woodLight', roofColor: 'cedarRoof' });
    for (let i = 0; i < 3; i++) box(model, m('wood'), 0.48, 0.007, 0.005, -0.09, 0.18 + i * 0.115, 0.133);
    bambooGarden(model, m, 0.255, 0.195);
    stoneLantern(model, m, -0.28, 0.05, 0.265, 0.7);
    steps(model, m, -0.075, 0.225, 0.06);
  }

  if (level === 5) {
    gardenBase(model, m, 0.79, 0.77);
    slab(model, m('wood'), 0.59, 0.53, 0.05, 0.1, 0, -0.05, 0.006, 0.025);
    hall(model, m, { w: 0.5, d: 0.44, h: 0.34, base: 0.1, z: -0.065, roofH: 0.13 });
    hall(model, m, { w: 0.42, d: 0.36, h: 0.28, base: 0.51, z: -0.065, roofH: 0.145, door: false });
    box(model, m('woodLight'), 0.47, 0.02, 0.075, 0, 0.53, 0.143);
    for (const x of [-0.21, 0, 0.21]) box(model, m('timber'), 0.012, 0.068, 0.012, x, 0.565, 0.176);
    box(model, m('timber'), 0.45, 0.011, 0.011, 0, 0.6, 0.176);
    sakura(model, m, -0.295, 0.265, 0.69);
    sakura(model, m, 0.295, 0.265, 0.69);
    steps(model, m, 0, 0.26, 0.06);
  }

  if (level === 6) {
    gardenBase(model, m, 0.81, 0.79);
    slab(model, m('deepWater'), 0.76, 0.081, 0.046, 0.055, 0, 0.345, 0.002, 0.015);
    slab(model, m('water'), 0.73, 0.06, 0.054, 0.058, 0, 0.345, 0.001, 0.012);
    slab(model, m('wood'), 0.69, 0.63, 0.05, 0.09, 0, -0.035, 0.005, 0.023);
    hall(model, m, { w: 0.64, d: 0.47, h: 0.43, base: 0.09, z: -0.085,
      roofH: 0.13, wall: 'woodLight', posts: 'red', roofColor: 'charcoal' });
    hall(model, m, { w: 0.46, d: 0.37, h: 0.24, base: 0.6, z: -0.085, roofH: 0.15, posts: 'red', door: false });
    for (const x of [-0.293, 0.293]) box(model, m('red'), 0.022, 0.346, 0.022, x, 0.263, 0.299);
    for (let i = 0; i < 7; i++) {
      box(model, m(i % 2 ? 'sand' : 'red'), 0.653 / 7, 0.014, 0.211,
        -0.3265 + (i + 0.5) * 0.653 / 7, 0.452, 0.233).rotation.x = 0.31;
      box(model, m(i % 2 ? 'sand' : 'red'), 0.653 / 7, 0.033, 0.012,
        -0.3265 + (i + 0.5) * 0.653 / 7, 0.405, 0.335);
    }
    box(model, m('wood'), 0.52, 0.11, 0.082, 0, 0.145, 0.222);
    box(model, m('woodLight'), 0.55, 0.017, 0.104, 0, 0.2085, 0.222);
    for (const x of [-0.195, 0, 0.195]) hangingLantern(model, m, x, 0.411, 0.303);
  }

  if (level === 7) {
    gardenBase(model, m, 0.82, 0.79);
    slab(model, m('stoneLight'), 0.68, 0.56, 0.05, 0.105, 0, -0.1, 0.008, 0.032);
    hall(model, m, { w: 0.6, d: 0.46, h: 0.62, base: 0.105, z: -0.105,
      roofH: 0.135, posts: 'red', gilded: true });
    hall(model, m, { w: 0.44, d: 0.35, h: 0.225, base: 0.795, z: -0.105,
      roofH: 0.135, posts: 'red', gilded: true, door: false });
    torii(model, m, -0.07, 0.05, 0.295);
    sakura(model, m, 0.29, 0.255, 0.7);
    box(model, m('stoneLight'), 0.12, 0.007, 0.12, -0.07, 0.054, 0.185);
  }

  if (level === 8) {
    gardenBase(model, m, 0.83, 0.81);
    hall(model, m, { w: 0.64, d: 0.3, h: 0.94, base: 0.11, z: -0.2, roofH: 0.15 });
    hall(model, m, { w: 0.26, d: 0.46, h: 0.63, base: 0.11, x: -0.205, z: 0.035,
      roofH: 0.135, door: false });
    for (const y of [0.43, 0.75]) {
      box(model, m('wood'), 0.65, 0.018, 0.31, 0, y, -0.2);
      for (const x of [-0.18, 0.18]) shoji(model, m, x, y + 0.105, -0.044, 0.075, 0.11);
    }
    pond(model, m, 0.145, 0.225, 0.39, 0.305, 0.05, true);
    bridge(model, m, 0.145, 0.076, 0.222);
    stoneLantern(model, m, -0.305, 0.05, 0.31, 0.57);
  }

  if (level === 9) {
    gardenBase(model, m, 0.84, 0.82);
    slab(model, m('stoneLight'), 0.73, 0.66, 0.05, 0.11, 0, 0, 0.008, 0.03);
    const tiers = [
      { w: 0.66, d: 0.59, h: 0.4, base: 0.11, roofH: 0.14 },
      { w: 0.55, d: 0.49, h: 0.34, base: 0.6, roofH: 0.13 },
      { w: 0.44, d: 0.39, h: 0.28, base: 1.02, roofH: 0.12 },
    ];
    for (const tier of tiers) {
      hall(model, m, { ...tier, wall: 'woodLight', roofColor: 'indigo', posts: 'timber', door: tier.base < 0.2 });
      box(model, m('wood'), tier.w + 0.03, 0.021, tier.d + 0.03, 0, tier.base + 0.015, 0);
    }
    finial(model, m, 0, 1.438, 0, 0.14);
    steps(model, m, 0, 0.345, 0.065);
  }

  if (level === 10) {
    gardenBase(model, m, 0.84, 0.82);
    stoneFoundation(model, m, 0.76, 0.7, 0.05, 0.27);
    for (const tier of [
      { w: 0.66, d: 0.6, h: 0.43, base: 0.32, roofH: 0.15 },
      { w: 0.54, d: 0.49, h: 0.36, base: 0.84, roofH: 0.14 },
      { w: 0.42, d: 0.38, h: 0.3, base: 1.28, roofH: 0.13 },
    ]) hall(model, m, { ...tier, z: -0.015, roofColor: 'indigo', door: tier.base < 0.4 });
    for (const x of [-0.085, 0.085]) {
      beam(model, m('gold'), [x, 1.721, -0.015], [x * 1.15, 1.76, -0.015], 0.014);
    }
    steps(model, m, 0, 0.355, 0.14, 0.19);
  }

  if (level === 11) {
    gardenBase(model, m, 0.85, 0.84);
    pond(model, m, 0, 0, 0.824, 0.814, 0.05);
    slab(model, m('stoneDark'), 0.69, 0.65, 0.072, 0.18, 0, -0.025, 0.009, 0.035);
    stoneFoundation(model, m, 0.64, 0.59, 0.18, 0.12, 0, -0.045);
    for (const tier of [
      { w: 0.54, d: 0.48, h: 0.52, base: 0.3, roofH: 0.15 },
      { w: 0.42, d: 0.37, h: 0.43, base: 0.91, roofH: 0.14 },
      { w: 0.3, d: 0.27, h: 0.26, base: 1.43, roofH: 0.13 },
    ]) hall(model, m, { ...tier, z: -0.065, roofColor: 'indigo', door: tier.base < 0.4 });
    for (const x of [-0.275, 0.275]) {
      hall(model, m, { w: 0.19, d: 0.48, h: 0.66, base: 0.18, x, z: -0.035,
        roofH: 0.12, roofColor: 'indigo', door: false });
      banner(model, m, x, 0.97, -0.115, 0.34, 0.08, x < 0 ? 1 : -1);
    }
    ramparts(model, m, 0.66, 0.6, 0.18, 0.18);
    box(model, m('woodLight'), 0.15, 0.026, 0.16, 0, 0.165, 0.32);
    finial(model, m, 0, 1.833, -0.065, 0.055);
  }

  if (level === 12) {
    gardenBase(model, m, 0.85, 0.84);
    slab(model, m('stoneLight'), 0.79, 0.69, 0.05, 0.14, 0, -0.055, 0.011, 0.045);
    for (const tier of [
      { w: 0.6, d: 0.46, h: 0.64, base: 0.18, roofH: 0.16 },
      { w: 0.44, d: 0.36, h: 0.45, base: 0.88, roofH: 0.14 },
      { w: 0.31, d: 0.29, h: 0.27, base: 1.42, roofH: 0.14 },
    ]) hall(model, m, { ...tier, z: -0.11, wall: 'goldLight', roofColor: 'gold',
      posts: 'crimson', gilded: true, door: tier.base < 0.3 });
    for (const x of [-0.267, 0.267]) {
      hall(model, m, { w: 0.21, d: 0.49, h: 0.8, base: 0.14, x, z: -0.035,
        roofH: 0.135, wall: 'goldLight', roofColor: 'gold', posts: 'crimson', gilded: true, door: false });
      box(model, m('crimson'), 0.22, 0.022, 0.5, x, 0.56, -0.035);
      shoji(model, m, x, 0.75, 0.216, 0.068, 0.115, false, 'crimson');
      banner(model, m, x, 1.09, -0.14, 0.32, 0.085, x < 0 ? 1 : -1, true);
    }
    pond(model, m, 0, 0.293, 0.36, 0.19, 0.05);
    box(model, m('crimson'), 0.55, 0.022, 0.075, 0, 0.185, 0.158);
    for (const x of [-0.25, -0.125, 0.125, 0.25]) {
      box(model, m('crimson'), 0.012, 0.064, 0.012, x, 0.214, 0.19);
    }
    box(model, m('gold'), 0.54, 0.012, 0.012, 0, 0.247, 0.19);
    finial(model, m, 0, 1.844, -0.11, 0.13);
  }

  if (level === 13) {
    gardenBase(model, m, 0.85, 0.84);
    stoneFoundation(model, m, 0.79, 0.72, 0.05, 0.29, 0, -0.035);
    const tiers = [
      { w: 0.62, d: 0.48, h: 0.39, base: 0.34, roofH: 0.12 },
      { w: 0.54, d: 0.43, h: 0.34, base: 0.81, roofH: 0.12 },
      { w: 0.46, d: 0.37, h: 0.29, base: 1.23, roofH: 0.11 },
      { w: 0.37, d: 0.31, h: 0.24, base: 1.6, roofH: 0.105 },
      { w: 0.28, d: 0.24, h: 0.21, base: 1.91, roofH: 0.1 },
    ];
    for (const tier of tiers) {
      hall(model, m, { ...tier, z: -0.105, roofColor: 'indigo', posts: 'redDark', gilded: true, door: tier.base < 0.4 });
    }
    for (const x of [-0.267, 0.267]) {
      hall(model, m, { w: 0.21, d: 0.25, h: 0.67, base: 0.25, x, z: 0.155,
        roofH: 0.12, roofColor: 'indigo', posts: 'redDark', gilded: true, door: false });
      hall(model, m, { w: 0.155, d: 0.195, h: 0.25, base: 1, x, z: 0.155,
        roofH: 0.095, roofColor: 'indigo', posts: 'redDark', gilded: true, door: false });
      banner(model, m, x, 1.355, 0.14, 0.33, 0.088, x < 0 ? 1 : -1, true);
      const treeX = x < 0 ? -0.315 : 0.315;
      cylinder(model, m('stoneLight'), 0.069, 0.115, treeX, 0.1075, 0.335, 0.069, 8);
      cylinder(model, m('moss'), 0.057, 0.009, treeX, 0.1695, 0.335, 0.057, 8);
      sakura(model, m, treeX, 0.335, 0.6, 0.174);
    }
    ramparts(model, m, 0.745, 0.71, 0.05, 0.19);
    box(model, m('redDark'), 0.14, 0.19, 0.045, 0, 0.145, 0.355);
    roof(model, m, 0.23, 0.12, 0.067, 0, 0.255, 0.34, 'indigo', 'gold');
    finial(model, m, 0, 2.233, -0.105, 0.085);
  }

  if (model.userData.banners) model.userData.sakuraAnimation = { time: 0 };
  batchArchitecture(model);
  return model;
}

export function updateAnimations(models, deltaTime) {
  if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;
  for (const model of models) {
    const animation = model?.userData?.sakuraAnimation;
    if (!animation) continue;
    animation.time = (animation.time + deltaTime) % (Math.PI * 20);
    const time = animation.time;
    if (animation.selection) animation.selection.emissiveIntensity = 0.48 + Math.sin(time * 2) * 0.065;
    for (const flag of model.userData.banners || []) {
      const positions = flag.geometry.attributes.position;
      const rest = flag.userData.restPositions;
      for (let i = 0; i < positions.count; i++) {
        const offset = i * 3;
        const u = Math.abs(rest[offset]) / flag.userData.width;
        const phase = time * 2.1 - u * 4 + flag.userData.phase;
        positions.setY(i, rest[offset + 1] + Math.sin(phase) * 0.002 * u);
        positions.setZ(i, rest[offset + 2] + Math.sin(phase) * 0.009 * u
          + Math.sin(time * 3.4 + u * 7) * 0.002 * u);
      }
      positions.needsUpdate = true;
      flag.geometry.computeVertexNormals();
      flag.geometry.computeBoundingBox();
      flag.geometry.computeBoundingSphere();
    }
  }
}
