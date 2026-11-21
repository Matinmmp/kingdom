import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const themeMeta = {
  id: 'sunstone_dynasty',
  name: 'Sunstone Dynasty',
  backgroundColor: '#f6ebd9',
  accentColor: '#e07a5f',
};

const NAMES = [
  'Raw Materials', 'Nomad Hut', 'Artisan Dwelling', 'Oasis Farmstead',
  'Stepped Terrace House', 'Silk Bazaar', 'Oasis Courtyard Villa', 'Astral Hall',
  'Twin-Pylon Gatehouse', 'Sun Temple', 'Royal Pool Sanctuary',
  'Golden Spire Citadel', 'Grand Sun Monument',
];
const TIERS = ['Desert beginnings', 'Oasis livelihoods', 'Civic landmarks', 'Royal wonders'];
const COLORS = {
  sand: '#f2cc8f', grass: '#9ab868', earth: '#7f4f24', base: '#d48c46',
  paleStone: '#eddbc1', clay: '#e6ccb2', adobe: '#eab676', cream: '#f5dfb4',
  ochre: '#f4a261', sandstone: '#e5bd80', terracotta: '#cd8665',
  ivory: '#fff0d3', limestone: '#eae0c6', marble: '#f8f0dc',
  goldenStone: '#e7b85b', gold: '#ffb703', paleGold: '#efcc79',
  jar: '#bc7050', wood: '#956345', dark: '#584336', soil: '#aa784d',
  leaf: '#79a757', leafLight: '#a5c86c', water: '#48cae4',
  teal: '#00afb9', coral: '#e76f51', dome: '#0096c7', banner: '#5e60ce',
  selection: '#00bbf9', apex: '#ffcd58',
};
const FINISHES = {
  water: { roughness: 0.3, metalness: 0.08 },
  gold: { roughness: 0.4, metalness: 0.38 },
  paleGold: { roughness: 0.5, metalness: 0.22 },
  dome: { roughness: 0.48, metalness: 0.12 },
  banner: { side: THREE.DoubleSide, roughness: 0.95 },
  selection: { emissive: '#00bbf9', emissiveIntensity: 0.6, roughness: 0.4 },
  apex: { emissive: '#ffb703', emissiveIntensity: 0.3, metalness: 0.25, roughness: 0.4 },
};

// A palette belongs to one factory result; only the finishes actually used are created.
function palette() {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) {
      const material = new THREE.MeshStandardMaterial({
        color: COLORS[key], flatShading: true, roughness: 0.86, ...FINISHES[key],
      });
      material.name = key;
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

// Four octagonal rings give chunky blocks a small bevel with just sixty triangles.
// Geometry is bottom-aligned: every helper's y argument is its resting surface.
function blockGeometry(w, h, d, bevel = 0.008, corner = bevel * 1.5) {
  const b = Math.min(bevel, h / 3, w / 8, d / 8);
  const cut = Math.min(Math.max(corner, b * 1.1), w / 4, d / 4);
  const vertices = [];
  const indices = [];
  for (const [y, inset] of [[0, b], [b, 0], [h - b, 0], [h, b]]) {
    const a = w / 2 - inset;
    const c = d / 2 - inset;
    const k = cut - inset * 0.5;
    for (const [x, z] of [
      [-a + k, -c], [-a, -c + k], [-a, c - k], [-a + k, c],
      [a - k, c], [a, c - k], [a, -c + k], [a - k, -c],
    ]) vertices.push(x, y, z);
  }
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 8; i++) {
    const a = ring * 8 + i;
    const c = ring * 8 + (i + 1) % 8;
    indices.push(a, c, c + 8, a, c + 8, a + 8);
  }
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i, 24, 24 + i, 25 + i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function block(parent, material, w, h, d, x = 0, y = 0, z = 0, bevel = 0.008, name = '') {
  return mesh(parent, blockGeometry(w, h, d, bevel), material, x, y, z, name);
}

function cylinder(parent, material, radius, height, x, y, z, top = radius, sides = 10) {
  const geometry = new THREE.CylinderGeometry(top, radius, height, sides);
  geometry.translate(0, height / 2, 0);
  return mesh(parent, geometry, material, x, y, z);
}

function arch(parent, material, w, h, x, y, z, depth = 0.009) {
  const r = w / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, h - r);
  shape.absarc(0, h - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  return mesh(parent, new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false, curveSegments: 5, steps: 1,
  }), material, x, y, z);
}

function door(parent, m, x, y, z, w = 0.12, h = 0.22, royal = false) {
  arch(parent, m(royal ? 'paleGold' : 'paleStone'), w + 0.035, h + 0.02, x, y, z);
  arch(parent, m('dark'), w, h, x, y, z + 0.011);
}

function windowPane(parent, m, x, y, z, size = 0.055, side = false) {
  const object = block(parent, m('dark'), size, size, 0.008, x, y, z, 0.002);
  if (side) object.rotation.y = Math.PI / 2;
}

function parapet(parent, m, w, d, x, y, z, finish = 'cream', height = 0.045) {
  block(parent, m(finish), w + 0.025, 0.025, d + 0.025, x, y, z, 0.006);
  for (const sign of [-1, 1]) {
    block(parent, m(finish), w + 0.025, height, 0.03, x, y + 0.023,
      z + sign * (d / 2 - 0.002), 0.004);
    block(parent, m(finish), 0.03, height, d - 0.025,
      x + sign * (w / 2 - 0.002), y + 0.023, z, 0.004);
  }
}

function stairs(parent, m, x, y, front, w, run, rise, count = 5, finish = 'cream') {
  for (let i = 0; i < count; i++) {
    block(parent, m(finish), w, rise * (i + 1) / count, run / count + 0.001,
      x, y, front - (i + 0.5) * run / count, 0.002);
  }
}

function jar(parent, m, x, y, z, scale = 1, handles = false) {
  const points = [[0, 0], [0.03, 0], [0.045, 0.033], [0.046, 0.075],
    [0.024, 0.11], [0.024, 0.132], [0.031, 0.135], [0.031, 0.146],
    [0.018, 0.146], [0.018, 0.129], [0, 0.129]];
  const geometry = new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), 8);
  const object = mesh(parent, geometry, m('jar'), x, y, z, 'Clay amphora');
  object.scale.setScalar(scale);
  if (handles) for (const sign of [-1, 1]) {
    const handle = mesh(parent, new THREE.TorusGeometry(0.022 * scale, 0.006 * scale, 4, 8),
      m('jar'), x + sign * 0.038 * scale, y + 0.093 * scale, z);
    handle.scale.y = 1.2;
  }
}

function palm(parent, m, x, y, z, scale = 1) {
  cylinder(parent, m('wood'), 0.018 * scale, 0.34 * scale, x, y, z, 0.012 * scale, 6);
  // Five broad folded leaves read as a palm without small leaflets or coconuts.
  for (let i = 0; i < 5; i++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, 0.058, 0.045, -0.031, 0.13, -0.012, 0,
      0.058, 0.045, 0.031, 0.059, 0.027, 0,
    ].map((value) => value * scale), 3));
    geometry.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 3, 2, 0, 2, 1]);
    geometry.computeVertexNormals();
    const frond = mesh(parent, geometry, m(i % 2 ? 'leafLight' : 'leaf'), x, y + 0.33 * scale, z);
    frond.rotation.y = i * Math.PI * 2 / 5 + 0.3;
  }
}

function pool(parent, m, x, y, z, w, d, rim = 'cream') {
  block(parent, m(rim), w, 0.025, d, x, y, z, 0.006);
  block(parent, m('water'), w - 0.026, 0.009, d - 0.026, x, y + 0.025, z, 0.003);
}

function hemisphere(radius, rise, rings = 6) {
  const profile = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= rings; i++) {
    const angle = i / rings * Math.PI / 2;
    profile.push(new THREE.Vector2(i === rings ? 0 : radius * Math.cos(angle), rise * Math.sin(angle)));
  }
  // Including the bottom disk makes this a closed solid, even when placed high above zero.
  return new THREE.LatheGeometry(profile, 16);
}

function dome(parent, m, x, y, z, radius, rise = radius) {
  cylinder(parent, m('paleGold'), radius * 1.04, 0.023, x, y, z, radius * 1.04, 16);
  mesh(parent, hemisphere(radius, rise), m('dome'), x, y + 0.023, z);
}

function sunDisk(parent, m, x, y, z, radius = 0.05, glowing = false) {
  const object = mesh(parent, new THREE.CylinderGeometry(radius, radius, 0.018, 12),
    m(glowing ? 'apex' : 'gold'), x, y, z);
  object.rotation.x = Math.PI / 2;
}

function foundation(parent, m, w = 0.82, d = 0.80, height = 0.055) {
  block(parent, m('sandstone'), w, height, d, 0, 0, 0, 0.009, 'Sandstone foundation');
}

function taperedTower(parent, m, x, y, z, w, d, height, finish = 'sandstone') {
  const geometry = new THREE.BoxGeometry(w, height, d);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 0) {
    positions.setX(i, positions.getX(i) * 0.83);
    positions.setZ(i, positions.getZ(i) * 0.83);
  }
  geometry.translate(0, height / 2, 0);
  geometry.computeVertexNormals();
  mesh(parent, geometry, m(finish), x, y, z);
  block(parent, m('cream'), w * 0.90, 0.045, d * 0.90, x, y + height, z, 0.007);
}

function banner(parent, m, x, top, z, width = 0.115, height = 0.25) {
  const rod = mesh(parent, new THREE.CylinderGeometry(0.005, 0.005, width + 0.025, 6),
    m('gold'), x, top + 0.005, z);
  rod.rotation.z = Math.PI / 2;
  const geometry = new THREE.PlaneGeometry(width, height, 4, 5);
  geometry.translate(0, -height / 2, 0);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) if (positions.getY(i) < -height + 0.001) {
    positions.setY(i, -height - 0.022 * (1 - Math.abs(positions.getX(i)) / (width / 2)));
  }
  geometry.computeVertexNormals();
  const cloth = mesh(parent, geometry, m('banner'), x, top, z, 'Royal indigo banner');
  cloth.userData = {
    restPositions: positions.array.slice(), height: height + 0.022, phase: x * 9 + z * 4,
  };
  parent.userData.flags ??= [];
  parent.userData.flags.push(cloth);
}

// Keep cloth editable, and merge all static pieces into a small set of material draws.
function batchArchitecture(group) {
  group.updateMatrixWorld(true);
  const batches = new Map();
  const sources = [];
  group.traverse((object) => {
    if (!object.isMesh || object.userData.restPositions) return;
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
  for (const [material, pieces] of batches) {
    const geometry = mergeGeometries(pieces, false);
    for (const piece of pieces) piece.dispose();
    mesh(group, geometry, material, 0, 0, 0, `Sunstone architecture · ${material.name}`);
  }
}

export function createBoard() {
  const group = new THREE.Group();
  group.name = 'Sunstone Dynasty · desert oasis board';
  group.userData.kind = 'board';
  const m = palette();
  block(group, m('earth'), 3.94, 0.25, 3.94, 0, -0.74, 0, 0.035, 'Cinnamon earth');
  block(group, m('base'), 4, 0.41, 4, 0, -0.49, 0, 0.027, 'Terracotta sandstone');
  block(group, m('sandstone'), 4, 0.045, 4, 0, -0.115, 0, 0.01, 'Sandstone tile bed');
  const tileGeometry = blockGeometry(0.986, 0.08, 0.986, 0.014, 0.045);
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    const tile = mesh(group, tileGeometry, m((row + column) % 2 ? 'grass' : 'sand'),
      column - 1.5, -0.08, row - 1.5, `tile-${row}-${column}`);
    tile.userData.gridCell = { row, column };
  }
  return group;
}

function roundedSquare(half, radius, Type = THREE.Shape) {
  const path = new Type();
  path.moveTo(-half + radius, -half);
  path.lineTo(half - radius, -half);
  path.quadraticCurveTo(half, -half, half, -half + radius);
  path.lineTo(half, half - radius);
  path.quadraticCurveTo(half, half, half - radius, half);
  path.lineTo(-half + radius, half);
  path.quadraticCurveTo(-half, half, -half, half - radius);
  path.lineTo(-half, -half + radius);
  path.quadraticCurveTo(-half, -half, -half + radius, -half);
  return path;
}

export function createSelectionIndicator() {
  const group = new THREE.Group();
  group.name = 'Turquoise rounded tile frame';
  const m = palette();
  const shape = roundedSquare(0.487, 0.075);
  shape.holes.push(roundedSquare(0.460, 0.048, THREE.Path));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.02, bevelEnabled: false, steps: 1, curveSegments: 4,
  });
  geometry.rotateX(-Math.PI / 2);
  // The luminous upper face hovers at .03; the 3D body is centered at the contract's .02.
  mesh(group, geometry, m('selection'), 0, 0.01, 0, 'Glowing oasis frame');
  group.userData.selectionMaterial = m('selection');
  group.userData.animationTime = 0;
  return group;
}

function rawMaterials(group, m) {
  block(group, m('paleStone'), 0.19, 0.12, 0.20, -0.15, 0, 0.09, 0.012);
  block(group, m('paleStone'), 0.19, 0.13, 0.20, 0.08, 0, 0.09, 0.012);
  block(group, m('paleStone'), 0.31, 0.155, 0.18, -0.07, 0, -0.14, 0.013);
  jar(group, m, 0.235, 0, -0.12, 0.95);
}

function nomadHut(group, m) {
  cylinder(group, m('clay'), 0.235, 0.13, 0, 0, 0, 0.235, 16);
  mesh(group, hemisphere(0.235, 0.235 * 0.96, 8), m('clay'), 0, 0.13, 0);
  door(group, m, 0, 0, 0.229, 0.105, 0.16);
  for (const [x, z, size] of [[-0.28, 0.16, 0.026], [0.275, 0.12, 0.021]]) {
    const pebble = mesh(group, new THREE.DodecahedronGeometry(1, 0), m('paleStone'), x, size * 0.45, z);
    pebble.scale.set(size, size * 0.45, size * 0.8);
  }
}

function artisanDwelling(group, m) {
  block(group, m('adobe'), 0.48, 0.42, 0.43, 0, 0, -0.025, 0.012);
  parapet(group, m, 0.48, 0.43, 0, 0.42, -0.025, 'sandstone');
  door(group, m, 0, 0, 0.193, 0.115, 0.23);
  for (const x of [-0.155, 0.155]) windowPane(group, m, x, 0.235, 0.194);
  for (const z of [-0.11, 0.07]) windowPane(group, m, 0.244, 0.235, z, 0.055, true);
}

function oasisFarmstead(group, m) {
  block(group, m('cream'), 0.46, 0.51, 0.44, -0.11, 0, -0.09, 0.013);
  parapet(group, m, 0.46, 0.44, -0.11, 0.51, -0.09, 'paleStone');
  door(group, m, -0.11, 0, 0.134, 0.115, 0.25);
  windowPane(group, m, -0.26, 0.30, 0.135);
  windowPane(group, m, 0.124, 0.30, -0.12, 0.055, true);
  block(group, m('jar'), 0.29, 0.025, 0.28, 0.235, 0, 0.22, 0.007);
  block(group, m('soil'), 0.265, 0.009, 0.255, 0.235, 0.025, 0.22, 0.004);
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    const crop = mesh(group, new THREE.IcosahedronGeometry(0.032, 0),
      m((row + column) % 2 ? 'leafLight' : 'leaf'),
      0.235 + (column - 1) * 0.077, 0.058, 0.22 + (row - 1) * 0.074);
    crop.scale.y = 0.85;
  }
  palm(group, m, 0.25, 0, -0.24, 0.85);
}

function terraceHouse(group, m) {
  block(group, m('ochre'), 0.62, 0.35, 0.48, -0.03, 0, -0.03, 0.012);
  block(group, m('ochre'), 0.40, 0.36, 0.35, -0.10, 0.35, -0.09, 0.012);
  parapet(group, m, 0.40, 0.35, -0.10, 0.71, -0.09);
  block(group, m('cream'), 0.64, 0.022, 0.50, -0.03, 0.35, -0.03, 0.005);
  stairs(group, m, 0.327, 0, 0.26, 0.105, 0.43, 0.37, 6);
  door(group, m, -0.10, 0, 0.214, 0.115, 0.25);
  windowPane(group, m, -0.10, 0.49, 0.089, 0.07);
  windowPane(group, m, 0.284, 0.18, -0.08, 0.055, true);
  jar(group, m, 0.14, 0, 0.29, 0.9, true);
  jar(group, m, 0.255, 0, 0.30, 0.66, true);
}

function silkBazaar(group, m) {
  block(group, m('sandstone'), 0.73, 0.48, 0.44, 0, 0, -0.12, 0.012);
  block(group, m('sandstone'), 0.50, 0.32, 0.34, 0, 0.48, -0.16, 0.011);
  parapet(group, m, 0.50, 0.34, 0, 0.80, -0.16, 'cream');
  for (const [x, color] of [[-0.18, 'teal'], [0.18, 'coral']]) {
    windowPane(group, m, x * 0.7, 0.61, 0.014, 0.065);
    const awning = block(group, m(color), 0.315, 0.02, 0.25, x, 0.40, 0.225, 0.004);
    awning.rotation.x = 0.20;
    block(group, m(color), 0.315, 0.052, 0.018, x, 0.345, 0.347, 0.004);
    for (const sign of [-1, 1]) {
      cylinder(group, m('wood'), 0.009, 0.405, x + sign * 0.142, 0, 0.341, 0.009, 6);
    }
    block(group, m('cream'), 0.28, 0.145, 0.14, x, 0, 0.263, 0.008);
    block(group, m(color), 0.28, 0.025, 0.15, x, 0.145, 0.263, 0.004);
    block(group, m(color === 'teal' ? 'coral' : 'teal'), 0.105, 0.035, 0.075,
      x - 0.06, 0.17, 0.26, 0.006);
    jar(group, m, x + 0.067, 0.17, 0.26, 0.48);
  }
}

function courtyardVilla(group, m) {
  block(group, m('terracotta'), 0.74, 0.86, 0.30, 0, 0, -0.21, 0.013);
  parapet(group, m, 0.74, 0.30, 0, 0.86, -0.21);
  for (const x of [-0.275, 0.275]) {
    block(group, m('sandstone'), 0.19, 0.64, 0.37, x, 0, 0.035, 0.011);
    parapet(group, m, 0.19, 0.37, x, 0.64, 0.035, 'cream', 0.035);
    windowPane(group, m, x, 0.36, 0.224, 0.065);
    palm(group, m, x, 0, 0.30, 0.82);
  }
  door(group, m, 0, 0, -0.056, 0.14, 0.30);
  for (const x of [-0.23, 0.23]) windowPane(group, m, x, 0.55, -0.055, 0.07);
  pool(group, m, 0, 0, 0.17, 0.27, 0.29);
}

function astralHall(group, m) {
  foundation(group, m, 0.78, 0.77, 0.09);
  block(group, m('limestone'), 0.67, 0.77, 0.52, 0, 0.09, -0.08, 0.012);
  block(group, m('ivory'), 0.70, 0.035, 0.55, 0, 0.86, -0.08, 0.006);
  door(group, m, 0, 0.09, 0.183, 0.15, 0.34);
  stairs(group, m, 0, 0, 0.41, 0.46, 0.17, 0.09, 3, 'limestone');
  for (const x of [-0.245, -0.082, 0.082, 0.245]) {
    cylinder(group, m('ivory'), 0.032, 0.035, x, 0.09, 0.285, 0.032, 8);
    cylinder(group, m('ivory'), 0.023, 0.34, x, 0.125, 0.285, 0.023, 8);
    block(group, m('ivory'), 0.065, 0.027, 0.065, x, 0.465, 0.285, 0.004);
  }
  block(group, m('limestone'), 0.66, 0.055, 0.21, 0, 0.492, 0.255, 0.007);
  sunDisk(group, m, 0, 0.68, 0.192, 0.05);
  dome(group, m, 0, 0.895, -0.08, 0.235);
}

function gatehouse(group, m) {
  foundation(group, m, 0.83, 0.80);
  for (const x of [-0.225, 0.225]) {
    taperedTower(group, m, x, 0.055, -0.07, 0.31, 0.58, 1.17);
    windowPane(group, m, x, 0.64, 0.199, 0.07);
    banner(group, m, x, 1.15, 0.247, 0.12, 0.28);
    palm(group, m, x * 1.25, 0.055, 0.305, 0.75);
  }
  block(group, m('sandstone'), 0.24, 0.28, 0.42, 0, 0.78, -0.07, 0.009);
  block(group, m('paleGold'), 0.24, 0.025, 0.44, 0, 1.06, -0.07, 0.004);
  sunDisk(group, m, 0, 0.93, 0.15, 0.053);
  stairs(group, m, 0, 0, 0.40, 0.18, 0.14, 0.055, 3);
}

function sunTemple(group, m) {
  const tiers = [
    [0.80, 0.64, 0.39, 0, -0.06, 'ochre'],
    [0.66, 0.51, 0.36, 0.39, -0.105, 'ivory'],
    [0.52, 0.40, 0.33, 0.75, -0.16, 'sandstone'],
    [0.34, 0.28, 0.34, 1.08, -0.16, 'ivory'],
  ];
  for (const [w, d, h, y, z, color] of tiers) {
    block(group, m(color), w, h, d, 0, y, z, 0.011);
    block(group, m('gold'), w + 0.012, 0.017, d + 0.012, 0, y + h - 0.017, z, 0.004);
  }
  stairs(group, m, 0, 0, 0.408, 0.22, 0.148, 0.39, 5, 'ivory');
  stairs(group, m, 0, 0.39, 0.26, 0.22, 0.11, 0.36, 4, 'ivory');
  stairs(group, m, 0, 0.75, 0.15, 0.22, 0.11, 0.33, 4, 'ivory');
  door(group, m, 0, 1.08, -0.016, 0.12, 0.25, true);
  block(group, m('gold'), 0.37, 0.04, 0.31, 0, 1.42, -0.16, 0.006);
  block(group, m('gold'), 0.025, 0.06, 0.025, 0, 1.46, -0.16, 0.003);
  sunDisk(group, m, 0, 1.53, -0.16, 0.057);
  for (const x of [-0.19, 0.19]) banner(group, m, x, 0.99, 0.062, 0.10, 0.21);
}

function royalSanctuary(group, m) {
  foundation(group, m, 0.84, 0.82, 0.065);
  block(group, m('sandstone'), 0.61, 1.17, 0.31, -0.08, 0.065, -0.215, 0.013);
  block(group, m('marble'), 0.29, 1.00, 0.42, -0.24, 0.065, 0.14, 0.012);
  block(group, m('cream'), 0.27, 0.95, 0.40, 0.04, 0.065, 0.13, 0.012);
  parapet(group, m, 0.61, 0.31, -0.08, 1.235, -0.215, 'ivory', 0.035);
  parapet(group, m, 0.29, 0.42, -0.24, 1.065, 0.14, 'paleGold', 0.03);
  parapet(group, m, 0.27, 0.40, 0.04, 1.015, 0.13, 'ivory', 0.03);
  block(group, m('marble'), 0.45, 0.24, 0.28, -0.08, 1.26, -0.215, 0.01);
  block(group, m('paleGold'), 0.48, 0.025, 0.30, -0.08, 1.50, -0.215, 0.005);
  dome(group, m, -0.08, 1.525, -0.215, 0.17, 0.15);
  door(group, m, 0.04, 0.065, 0.334, 0.135, 0.33, true);
  door(group, m, -0.24, 0.065, 0.354, 0.115, 0.29, true);
  for (const x of [-0.24, 0.04]) {
    banner(group, m, x, 0.93, 0.367, 0.10, 0.25);
  }
  pool(group, m, 0.265, 0.065, 0.155, 0.17, 0.41, 'marble');
  palm(group, m, 0.29, 0.065, -0.275, 0.72);
  palm(group, m, 0.345, 0.065, -0.105, 0.54);
  palm(group, m, 0.365, 0.065, 0.30, 0.40);
  stairs(group, m, 0.04, 0, 0.408, 0.19, 0.07, 0.065, 3, 'marble');
}

function spireCitadel(group, m) {
  foundation(group, m, 0.84, 0.82, 0.06);
  block(group, m('ivory'), 0.51, 1.18, 0.49, 0, 0.06, -0.02, 0.013);
  block(group, m('gold'), 0.54, 0.035, 0.52, 0, 1.24, -0.02, 0.006);
  for (const x of [-0.315, 0.315]) {
    block(group, m('sandstone'), 0.055, 0.78, 0.61, x, 0.06, 0, 0.008);
    block(group, m('cream'), 0.07, 0.04, 0.62, x, 0.84, 0, 0.005);
  }
  block(group, m('sandstone'), 0.62, 0.80, 0.055, 0, 0.06, -0.315, 0.008);
  for (const x of [-0.22, 0.22]) {
    block(group, m('sandstone'), 0.20, 0.60, 0.06, x, 0.06, 0.315, 0.007);
  }
  block(group, m('ivory'), 0.24, 0.66, 0.13, 0, 0.06, 0.285, 0.009);
  door(group, m, 0, 0.06, 0.354, 0.135, 0.34, true);
  for (const x of [-0.30, 0.30]) for (const z of [-0.30, 0.30]) {
    block(group, m('sandstone'), 0.19, 1.00, 0.19, x, 0.06, z, 0.012);
    block(group, m('paleGold'), 0.21, 0.045, 0.21, x, 1.06, z, 0.006);
    dome(group, m, x, 1.105, z, 0.099, 0.11);
  }
  cylinder(group, m('ivory'), 0.16, 0.15, 0, 1.275, -0.02, 0.16, 12);
  dome(group, m, 0, 1.425, -0.02, 0.17, 0.14);
  cylinder(group, m('gold'), 0.10, 0.37, 0, 1.53, -0.02, 0.008, 8);
  mesh(group, new THREE.OctahedronGeometry(0.023, 0), m('gold'), 0, 1.92, -0.02);
  for (const x of [-0.17, 0.17]) banner(group, m, x, 1.16, 0.281, 0.105, 0.27);
}

function guardian(group, m, x) {
  block(group, m('paleGold'), 0.12, 0.035, 0.12, x, 0.055, 0.35, 0.006);
  block(group, m('ivory'), 0.073, 0.075, 0.095, x, 0.09, 0.34, 0.012);
  block(group, m('ivory'), 0.064, 0.075, 0.055, x, 0.145, 0.365, 0.012);
  for (const sign of [-1, 1]) {
    block(group, m('ivory'), 0.024, 0.025, 0.045, x + sign * 0.023, 0.09, 0.384, 0.004);
  }
  cylinder(group, m('gold'), 0.044, 0.035, x, 0.217, 0.365, 0.022, 6);
}

function grandMonument(group, m) {
  foundation(group, m, 0.84, 0.84, 0.06);
  const tiers = [
    [0.72, 0.68, 0.60, 0.06, -0.04, 'goldenStone'],
    [0.64, 0.57, 0.48, 0.66, -0.07, 'sand'],
    [0.54, 0.46, 0.40, 1.14, -0.10, 'goldenStone'],
    [0.44, 0.35, 0.32, 1.54, -0.13, 'sand'],
  ];
  for (const [w, d, h, y, z, color] of tiers) {
    block(group, m(color), w, h, d, 0, y, z, 0.012);
    block(group, m('gold'), w + 0.012, 0.018, d + 0.012, 0, y + h - 0.018, z, 0.004);
  }
  stairs(group, m, 0, 0.06, 0.415, 0.18, 0.12, 0.60, 6, 'ivory');
  stairs(group, m, 0, 0.66, 0.295, 0.18, 0.085, 0.48, 5, 'ivory');
  stairs(group, m, 0, 1.14, 0.21, 0.18, 0.085, 0.40, 5, 'ivory');
  stairs(group, m, 0, 1.54, 0.125, 0.18, 0.085, 0.32, 4, 'ivory');
  block(group, m('apex'), 0.28, 0.20, 0.23, 0, 1.86, -0.13, 0.01);
  door(group, m, 0, 1.86, -0.011, 0.10, 0.16, true);
  block(group, m('gold'), 0.31, 0.03, 0.26, 0, 2.06, -0.13, 0.006);
  const roof = mesh(group, new THREE.ConeGeometry(0.19, 0.10, 4), m('apex'), 0, 2.14, -0.13);
  roof.rotation.y = Math.PI / 4;
  mesh(group, new THREE.OctahedronGeometry(0.024, 0), m('apex'), 0, 2.213, -0.13);
  for (const sign of [-1, 1]) {
    guardian(group, m, sign * 0.26);
    pool(group, m, sign * 0.391, 0.06, -0.01, 0.052, 0.57, 'marble');
    banner(group, m, sign * 0.145, 1.82, 0.063, 0.115, 0.24);
  }
}

const BUILDERS = [
  rawMaterials, nomadHut, artisanDwelling, oasisFarmstead, terraceHouse,
  silkBazaar, courtyardVilla, astralHall, gatehouse, sunTemple,
  royalSanctuary, spireCitadel, grandMonument,
];

export function createBuilding(level) {
  if (!Number.isInteger(level) || level < 1 || level > 13) {
    throw new RangeError('Sunstone Dynasty building level must be an integer from 1 to 13.');
  }
  const group = new THREE.Group();
  group.name = NAMES[level - 1];
  group.userData = {
    level, assetName: group.name,
    tier: TIERS[level <= 3 ? 0 : level <= 6 ? 1 : level <= 9 ? 2 : 3],
    animationTime: level * 0.23,
  };
  BUILDERS[level - 1](group, palette());
  batchArchitecture(group);
  return group;
}

export function updateAnimations(models, deltaTime) {
  const dt = Number.isFinite(deltaTime) ? Math.min(Math.max(deltaTime, 0), 0.05) : 0;
  if (dt === 0) return;
  // Only visit the supplied roots: board children also appear separately in models.
  for (const model of models) {
    const data = model.userData;
    if (!data.flags?.length && !data.selectionMaterial) continue;
    data.animationTime = (data.animationTime || 0) + dt;
    const time = data.animationTime;
    for (const flag of data.flags || []) {
      const positions = flag.geometry.attributes.position;
      const { restPositions: rest, height, phase } = flag.userData;
      for (let i = 0; i < positions.count; i++) {
        const x = rest[i * 3];
        const down = -rest[i * 3 + 1] / height;
        const wave = Math.sin(time * 2.2 - down * 3.2 + phase)
          + 0.3 * Math.sin(time * 3.1 + x * 22 + phase);
        positions.setZ(i, rest[i * 3 + 2] + wave * 0.012 * down);
      }
      positions.needsUpdate = true;
      flag.geometry.computeVertexNormals();
      flag.geometry.computeBoundingBox();
      flag.geometry.computeBoundingSphere();
    }
    if (data.selectionMaterial) {
      data.selectionMaterial.emissiveIntensity = 0.6 + Math.sin(time * 2) * 0.08;
    }
  }
}
