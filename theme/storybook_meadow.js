import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const themeMeta = {
  id: 'storybook_meadow',
  name: 'Storybook Meadow',
  backgroundColor: '#e6f4ea',
  accentColor: '#f4a261',
};

const NAMES = [
  'Camp Materials', 'Woodcutter Hut', 'Peasant Cottage', 'Meadow Farmstead',
  'Craftsman House', 'Merchant Shop', 'Guild Bakery & Barn', 'Village Chapel',
  "Knight's Keep", "Baron's Castle", 'Moat Fortress', 'Royal Crimson Citadel',
  'Grand White Palace',
];
const TIERS = ['Meadow beginnings', 'Village life', 'Village landmarks', 'Royal wonders'];
const COLORS = {
  clover: '#80b946', lime: '#95c65b', soil: '#6f4518', earth: '#583101',
  wood: '#80502f', timber: '#b5804c', endGrain: '#e5bc85', brownRoof: '#95633c',
  cream: '#fff1d3', ivory: '#f8f3e5', white: '#fffdf8', marble: '#eee9df',
  stone: '#d8cbb8', stoneShade: '#b5a38d', lavender: '#cdb4db', purple: '#9560b4',
  yellow: '#f9c74f', orange: '#f3722c', teal: '#277da1', crimson: '#e63946',
  pine: '#44865a', pineLight: '#73a65a', cabbage: '#87bb62', carrot: '#ed9449',
  window: '#354f52', glass: '#ffe5a0', gold: '#e9b85b', water: '#4cc9f0',
  ripple: '#c3f3f8', awning: '#f4a261', selection: '#fff3b0',
};

// A palette belongs to one factory result; no disposable resources cross roots.
function palette() {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) {
      const finish = key === 'gold' ? { metalness: 0.25, roughness: 0.48 }
        : key === 'water' ? { metalness: 0.04, roughness: 0.3 }
          : key === 'glass' ? { emissive: '#f9c74f', emissiveIntensity: 0.08 }
            : key === 'selection' ? { emissive: '#fff3b0', emissiveIntensity: 0.45, roughness: 0.45 }
              : {};
      const isCloth = key.endsWith('Flag');
      const material = new THREE.MeshStandardMaterial({
        color: COLORS[isCloth ? key.slice(0, -4) : key], roughness: 0.83, flatShading: true,
        ...finish, ...(isCloth ? { side: THREE.DoubleSide } : {}),
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

function box(parent, material, w, h, d, x = 0, y = h / 2, z = 0) {
  return mesh(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
}

function cylinder(parent, material, r, h, x, y, z, top = r, sides = 8) {
  return mesh(parent, new THREE.CylinderGeometry(top, r, h, sides), material, x, y, z);
}

function place(parent, x, y, z, turn = 0) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = turn;
  parent.add(group);
  return group;
}

function beam(parent, material, from, to, width, depth = width) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const object = box(parent, material, width, direction.length(), depth,
    (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return object;
}

// Four octagonal rings give a chunky, genuinely beveled toy slab with a precise top.
function slabGeometry(w, d, bottom, top, bevel = 0.012, cut = 0.035) {
  const vertices = [];
  const indices = [];
  for (const [y, inset] of [[bottom, bevel], [bottom + bevel, 0], [top - bevel, 0], [top, bevel]]) {
    const a = w / 2 - inset;
    const b = d / 2 - inset;
    const c = Math.max(0.001, cut - inset * 0.4);
    for (const [x, z] of [[-a + c, -b], [-a, -b + c], [-a, b - c], [-a + c, b],
      [a - c, b], [a, b - c], [a, -b + c], [a - c, -b]]) vertices.push(x, y, z);
  }
  for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 8; i++) {
    const a = layer * 8 + i;
    const b = layer * 8 + (i + 1) % 8;
    indices.push(a, b, b + 8, a, b + 8, a + 8);
  }
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i, 24, 24 + i, 25 + i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function slab(parent, material, w, d, bottom, top, x = 0, z = 0, bevel = 0.009, cut = 0.03) {
  return mesh(parent, slabGeometry(w, d, bottom, top, bevel, cut), material, x, 0, z);
}

function prism(points, depth) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4, steps: 1 })
    .translate(0, 0, -depth / 2);
}

function archGeometry(w, h, depth) {
  const r = w / 2;
  const outline = [[-r, 0], [r, 0]];
  for (let i = 0; i <= 6; i++) {
    const angle = i * Math.PI / 6;
    outline.push([Math.cos(angle) * r, h - r + Math.sin(angle) * r]);
  }
  return prism(outline, depth);
}

function windowAt(parent, m, x, y, z, { w = 0.064, h = 0.092, turn = 0, royal = false, arched = false } = {}) {
  const group = place(parent, x, y, z, turn);
  const trim = m(royal ? 'gold' : 'wood');
  if (arched) {
    mesh(group, archGeometry(w + 0.02, h + 0.014, 0.012), trim, 0, -h / 2 - 0.006, 0);
    mesh(group, archGeometry(w, h, 0.009), m('window'), 0, -h / 2, 0.008);
    mesh(group, archGeometry(w * 0.7, h * 0.8, 0.005), m('glass'), 0, -h * 0.4, 0.015);
  } else {
    box(group, trim, w + 0.02, h + 0.018, 0.012, 0, 0, 0);
    box(group, m('window'), w, h, 0.01, 0, 0, 0.009);
    box(group, m('glass'), w * 0.72, h * 0.78, 0.005, 0, 0, 0.017);
  }
  box(group, trim, 0.007, h * 0.84, 0.005, 0, 0, 0.021);
  if (!arched) box(group, trim, w * 0.8, 0.007, 0.005, 0, 0, 0.021);
}

function doorway(parent, m, x, y, z, w = 0.106, h = 0.18, royal = false) {
  mesh(parent, archGeometry(w + 0.035, h + 0.024, 0.02), m(royal ? 'gold' : 'stone'), x, y, z);
  mesh(parent, archGeometry(w, h, 0.014), m('wood'), x, y + 0.002, z + 0.014);
  box(parent, m('timber'), 0.007, h * 0.7, 0.005, x, y + h * 0.36, z + 0.024);
  mesh(parent, new THREE.SphereGeometry(0.007, 6, 4), m('gold'), x + w * 0.26, y + h * 0.4, z + 0.029);
  box(parent, m('stone'), w + 0.05, 0.018, 0.055, x, y + 0.009, z + 0.013);
}

function gable(parent, m, w, d, rise, x, y, z, color, wall = 'cream', timber = true) {
  mesh(parent, prism([[-w / 2, 0], [w / 2, 0], [0, rise]], d), m(color), x, y, z);
  for (const side of [-1, 1]) {
    mesh(parent, prism([[-w / 2 + 0.028, 0.005], [w / 2 - 0.028, 0.005], [0, rise - 0.03]], 0.006),
      m(wall), x, y, z + side * (d / 2 + 0.001));
    if (timber) box(parent, m('wood'), 0.019, rise - 0.035, 0.009, x, y + (rise - 0.035) / 2, z + side * (d / 2 + 0.005));
  }
  box(parent, m(color), w + 0.008, 0.023, d + 0.008, x, y, z);
  box(parent, m(color), 0.031, 0.022, d + 0.012, x, y + rise + 0.004, z);
}

function pyramid(parent, material, width, rise, x, y, z) {
  const roof = mesh(parent, new THREE.ConeGeometry(width / Math.SQRT2, rise, 4), material, x, y + rise / 2, z);
  roof.rotation.y = Math.PI / 4;
}

function house(parent, m, {
  w, d, h, rise, roof, x = 0, z = 0, floors = 1, wall = 'cream', entry = true, stoneBase = 0.028,
}) {
  const group = place(parent, x, 0, z);
  slab(group, m('stone'), w + 0.025, d + 0.025, 0, stoneBase);
  box(group, m(wall), w, h, d, 0, stoneBase + h / 2, 0);
  const top = stoneBase + h;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(group, m('wood'), 0.025, h, 0.025, sx * (w / 2 - 0.007), stoneBase + h / 2, sz * (d / 2 - 0.007));
  }
  for (let floor = 1; floor <= floors; floor++) {
    box(group, m('wood'), w + 0.015, 0.024, d + 0.015, 0, stoneBase + h * floor / floors - 0.008, 0);
  }
  if (floors > 1) for (const side of [-1, 1]) {
    beam(group, m('wood'), [side * (w / 2 - 0.022), top - h * 0.24, d / 2 + 0.006],
      [side * w * 0.23, top - 0.025, d / 2 + 0.006], 0.019, 0.013);
  }
  for (let floor = 0; floor < floors; floor++) {
    const yy = stoneBase + h * (floor + 0.54) / floors;
    const xs = w > 0.4 ? [-w * 0.28, w * 0.28] : [w * 0.27];
    for (const xx of xs) {
      if (entry && floor === 0 && w < 0.4) continue;
      windowAt(group, m, xx, yy, d / 2 + 0.006, { h: Math.min(0.106, h / floors * 0.33) });
    }
    for (const side of [-1, 1]) {
      windowAt(group, m, side * (w / 2 + 0.005), yy, -d * 0.12, { turn: side * Math.PI / 2 });
    }
  }
  if (entry) doorway(group, m, 0, stoneBase * 0.5, d / 2 + 0.008, 0.101, Math.min(0.205, h * 0.65));
  gable(group, m, w + 0.06, d + 0.06, rise, 0, top, 0, roof, wall);
  return group;
}

function chimney(parent, m, x, y, z, height, width = 0.07) {
  box(parent, m('stoneShade'), width, height, width, x, y + height / 2, z);
  box(parent, m('stone'), width + 0.022, 0.027, width + 0.022, x, y + height, z);
  box(parent, m('window'), width * 0.57, 0.005, width * 0.57, x, y + height + 0.016, z);
  for (let i = 0; i < 2; i++) box(parent, m('stone'), width * 0.55, 0.025, 0.007,
    x + (i ? -0.009 : 0.009), y + height * (i + 1) / 3, z + width / 2);
}

function pebble(parent, m, x, z, radius = 0.048) {
  const stone = mesh(parent, new THREE.SphereGeometry(1, 10, 6), m('white'), x, radius * 0.55, z);
  stone.scale.set(radius, radius * 0.55, radius * 0.8);
  stone.rotation.y = x * 4;
}

function log(parent, m, x, y, z, length, radius) {
  cylinder(parent, m('wood'), radius, length, x, y, z, radius, 10).rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    cylinder(parent, m('endGrain'), radius * 0.81, 0.003, x, y, z + side * (length / 2 + 0.001), radius * 0.81, 10)
      .rotation.x = Math.PI / 2;
  }
}

function pine(parent, m, x, z, height) {
  cylinder(parent, m('wood'), 0.017, height * 0.35, x, height * 0.175, z, 0.014, 6);
  mesh(parent, new THREE.ConeGeometry(height * 0.25, height * 0.83, 7), m('pine'), x, height * 0.585, z);
  mesh(parent, new THREE.ConeGeometry(height * 0.17, height * 0.53, 7), m('pineLight'), x, height * 0.735, z);
}

function fenceRun(parent, m, x, z, length, turn = 0) {
  const group = place(parent, x, 0, z, turn);
  for (let i = -1; i <= 1; i++) {
    box(group, m('timber'), 0.027, 0.125, 0.027, i * length / 2, 0.0625, 0);
    pyramid(group, m('endGrain'), 0.033, 0.023, i * length / 2, 0.125, 0);
  }
  for (const y of [0.044, 0.094]) box(group, m('endGrain'), length, 0.02, 0.021, 0, y, 0);
}

function vegetableGarden(parent, m) {
  const x = 0.245;
  const z = 0.235;
  box(parent, m('soil'), 0.255, 0.018, 0.255, x, 0.009, z);
  for (const side of [-1, 1]) {
    box(parent, m('timber'), 0.267, 0.024, 0.012, x, 0.012, z + side * 0.129);
    box(parent, m('timber'), 0.012, 0.024, 0.267, x + side * 0.129, 0.012, z);
  }
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    const xx = x + (column - 1) * 0.077;
    const zz = z + (row - 1) * 0.077;
    const carrot = column === 1;
    const crop = mesh(parent, new THREE.SphereGeometry(1, 7, 5), m(carrot ? 'carrot' : 'cabbage'), xx, 0.036, zz);
    crop.scale.set(carrot ? 0.018 : 0.029, carrot ? 0.02 : 0.024, carrot ? 0.018 : 0.029);
    if (carrot) box(parent, m('pine'), 0.012, 0.023, 0.012, xx, 0.062, zz);
  }
}

function awning(parent, m, front) {
  const width = 0.448;
  const depth = 0.19;
  const drop = 0.055;
  const slope = Math.atan2(drop, depth);
  for (let i = 0; i < 7; i++) {
    const material = m(i % 2 ? 'ivory' : 'awning');
    const x = (i - 3) * width / 7;
    const stripe = box(parent, material, width / 7, 0.018, Math.hypot(depth, drop), x, 0.475, front + depth / 2);
    stripe.rotation.x = slope;
    mesh(parent, prism([[-width / 14, 0], [width / 14, 0], [width / 14, -0.029],
      [width / 28, -0.039], [-width / 28, -0.039], [-width / 14, -0.029]], 0.014), material,
    x, 0.451, front + depth);
  }
  for (const side of [-1, 1]) box(parent, m('wood'), 0.018, 0.447, 0.018, side * (width / 2 - 0.008), 0.2235, front + depth - 0.008);
}

function hayBale(parent, m, x, z, w, d) {
  slab(parent, m('yellow'), w, d, 0, 0.082, x, z, 0.009, 0.015);
  for (const side of [-1, 1]) box(parent, m('timber'), 0.012, 0.085, d + 0.002, x + side * w * 0.26, 0.0425, z);
}

function stoneBlock(parent, m, { w, d, h, x = 0, y = 0.05, z = 0, wall = 'stone', royal = false, floors = 2, entry = true }) {
  const group = place(parent, x, y, z);
  box(group, m(wall), w, h, d, 0, h / 2, 0);
  box(group, m(royal ? 'marble' : 'stoneShade'), w + 0.023, 0.035, d + 0.023, 0, 0.0175, 0);
  box(group, m(royal ? 'ivory' : 'stone'), w + 0.028, 0.035, d + 0.028, 0, h - 0.012, 0);
  for (let floor = 1; floor < floors; floor++) {
    box(group, m(royal ? 'gold' : 'stoneShade'), w + 0.014, royal ? 0.012 : 0.023, d + 0.014, 0, h * floor / floors, 0);
  }
  for (let floor = 0; floor < floors; floor++) {
    const yy = h * (floor + 0.55) / floors;
    for (const fraction of (w > 0.4 ? [-0.28, 0.28] : [0])) {
      if (entry && floor === 0 && fraction === 0) continue;
      windowAt(group, m, w * fraction, yy, d / 2 + 0.006, { w: 0.058, h: 0.108, arched: true, royal });
    }
    for (const side of [-1, 1]) {
      windowAt(group, m, side * (w / 2 + 0.006), yy, 0, { w: 0.056, h: 0.105, turn: side * Math.PI / 2, arched: true, royal });
    }
  }
  if (entry) doorway(group, m, 0, 0.009, d / 2 + 0.01, royal ? 0.145 : 0.13, royal ? 0.25 : 0.225, royal);
  return group;
}

function crenels(parent, m, w, d, y, x = 0, z = 0, color = 'ivory') {
  box(parent, m(color), w, 0.034, d, x, y, z);
  const count = w > 0.4 ? 5 : 3;
  for (let i = 0; i < count; i++) for (const side of [-1, 1]) {
    box(parent, m(color), 0.054, 0.065, 0.046, x + (i / (count - 1) - 0.5) * (w - 0.065), y + 0.047, z + side * (d / 2 - 0.027));
  }
  for (const side of [-1, 1]) for (const fraction of [-0.23, 0.23]) {
    box(parent, m(color), 0.046, 0.065, 0.053, x + side * (w / 2 - 0.027), y + 0.047, z + d * fraction);
  }
}

function tower(parent, m, { x, z, y, top, radius = 0.108, rise = 0.25, roof = 'crimson', wall = 'ivory', royal = false }) {
  const h = top - y;
  cylinder(parent, m(wall), radius, h, x, y + h / 2, z);
  cylinder(parent, m(royal ? 'marble' : 'stoneShade'), radius + 0.009, 0.065, x, y + 0.0325, z);
  cylinder(parent, m(royal ? 'gold' : 'stone'), radius + 0.009, 0.022, x, y + h * 0.57, z);
  cylinder(parent, m(royal ? 'marble' : 'lavender'), radius + 0.014, 0.042, x, top - 0.014, z);
  for (const side of [0, 1]) {
    windowAt(parent, m, x + side * radius * 0.94, y + h * 0.77, z + (1 - side) * radius * 0.94,
      { w: 0.038, h: 0.087, turn: side * Math.PI / 2, royal, arched: true });
  }
  cylinder(parent, m(royal ? 'gold' : roof), radius + 0.022, 0.023, x, top + 0.016, z);
  mesh(parent, new THREE.ConeGeometry(radius + 0.022, rise, 8), m(roof), x, top + 0.026 + rise / 2, z);
  if (royal) mesh(parent, new THREE.OctahedronGeometry(0.014), m('gold'), x, top + rise + 0.038, z);
  return top + rise + (royal ? 0.052 : 0.026);
}

function castleWalls(parent, m, half, y, h, color = 'stone') {
  for (const side of [-1, 1]) {
    box(parent, m(color), 0.052, h, half * 2, side * half, y + h / 2, 0);
    box(parent, m(color), half - 0.085, h, 0.052, side * (half + 0.085) / 2, y + h / 2, half);
  }
  box(parent, m(color), half * 2, h, 0.052, 0, y + h / 2, -half);
  for (const side of [-1, 1]) for (const x of [-0.19, 0, 0.19]) {
    if (side > 0 && x === 0) continue;
    box(parent, m('ivory'), 0.055, 0.06, 0.058, x, y + h + 0.025, side * half);
  }
}

function moat(parent, m) {
  slab(parent, m('stone'), 0.85, 0.85, 0, 0.035, 0, 0, 0.01, 0.06);
  slab(parent, m('water'), 0.827, 0.827, 0.031, 0.058, 0, 0, 0.006, 0.055);
  slab(parent, m('ivory'), 0.652, 0.652, 0.033, 0.095, 0, 0, 0.012, 0.035);
  for (const z of [-0.15, 0.12]) {
    box(parent, m('ripple'), 0.007, 0.004, 0.055, -0.378, 0.061, z);
  }
  for (let i = 0; i < 6; i++) {
    box(parent, m(i % 2 ? 'endGrain' : 'timber'), 0.146, 0.02, 0.021, 0, 0.092, 0.286 + i * 0.024);
  }
}

function waveFlag(flag, time) {
  const positions = flag.mesh.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = flag.rest[i * 3];
    const y = flag.rest[i * 3 + 1];
    const reach = x / flag.width;
    positions.setZ(i, reach * (0.013 * Math.sin(reach * 5.3 + y * 8 - time * 2.8 + flag.phase)
      + 0.003 * Math.sin(reach * 10.5 + time * 2.1 + flag.phase)));
  }
  positions.needsUpdate = true;
  flag.mesh.geometry.computeVertexNormals();
}

function flag(parent, m, { x, y, z, height = 0.19, width = 0.12, turn = 0, color = 'crimson' }) {
  cylinder(parent, m('gold'), 0.005, height, x, y + height / 2, z, 0.004, 6);
  mesh(parent, new THREE.OctahedronGeometry(0.01), m('gold'), x, y + height + 0.005, z);
  const geometry = new THREE.PlaneGeometry(width, height * 0.45, 6, 2);
  geometry.translate(width / 2, -height * 0.225, 0);
  const positions = geometry.attributes.position;
  positions.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < positions.count; i++) {
    if (positions.getX(i) > width * 0.99 && Math.abs(positions.getY(i) + height * 0.225) < 0.001) {
      positions.setX(i, width * 0.84);
    }
  }
  // Cloth is the only double-sided finish and is never included in a static batch.
  const cloth = mesh(parent, geometry, m(`${color}Flag`), x + Math.cos(turn) * 0.006, y + height - 0.016, z);
  cloth.rotation.y = turn;
  cloth.userData.animatedCloth = true;
  const data = { mesh: cloth, rest: positions.array.slice(), width, phase: x * 7 + z * 4 + y * 2 };
  parent.userData.ambient ??= { time: parent.userData.level * 0.21, flags: [] };
  parent.userData.ambient.flags.push(data);
  waveFlag(data, parent.userData.ambient.time);
  geometry.computeBoundingBox();
  geometry.boundingBox.min.z = -0.017;
  geometry.boundingBox.max.z = 0.017;
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
}

// Keep tile meshes pickable and cloth editable; merge only static building parts.
function batchStatic(root) {
  root.updateMatrixWorld(true);
  const batches = new Map();
  const sources = [];
  const groups = [];
  root.traverse((object) => {
    if (object.isGroup && object !== root) groups.push(object);
    if (!object.isMesh || object.userData.animatedCloth) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    for (const attribute of Object.keys(geometry.attributes)) {
      if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
    }
    if (!batches.has(object.material)) batches.set(object.material, []);
    batches.get(object.material).push(geometry);
    sources.push(object);
  });
  for (const source of sources) {
    source.removeFromParent();
    source.geometry.dispose();
  }
  for (const group of groups.reverse()) if (!group.children.length) group.removeFromParent();
  for (const [material, pieces] of batches) {
    const combined = mergeGeometries(pieces, false);
    for (const piece of pieces) piece.dispose();
    mesh(root, combined, material, 0, 0, 0, material.name);
  }
}

export function createBoard() {
  const group = new THREE.Group();
  group.name = 'Storybook Meadow · 4 × 4 diorama';
  group.userData.kind = 'board';
  const m = palette();
  slab(group, m('earth'), 3.96, 3.96, -0.74, -0.685, 0, 0, 0.018, 0.07);
  slab(group, m('soil'), 3.985, 3.985, -0.705, -0.09, 0, 0, 0.032, 0.07);
  slab(group, m('earth'), 4, 4, -0.135, -0.065, 0, 0, 0.012, 0.065);
  const tileGeometry = slabGeometry(0.992, 0.992, -0.083, 0, 0.018, 0.034);
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    const tile = mesh(group, tileGeometry, m((row + column) % 2 ? 'lime' : 'clover'),
      column - 1.5, 0, row - 1.5, `tile-${row}-${column}`);
    tile.userData.gridCell = { row, column };
  }
  return group;
}

export function createSelectionIndicator() {
  const group = new THREE.Group();
  group.name = 'White and gold meadow frame';
  const m = palette();
  for (const side of [-1, 1]) {
    // The luminous rail sits at y=.03. Its gold body keeps the full marker centered
    // at the contract's y=.02: the combined visible bounds are .006 through .034.
    box(group, m('gold'), 0.964, 0.02, 0.025, 0, 0.016, side * 0.4695);
    box(group, m('gold'), 0.025, 0.02, 0.914, side * 0.4695, 0.016, 0);
    box(group, m('selection'), 0.956, 0.008, 0.015, 0, 0.03, side * 0.4695);
    box(group, m('selection'), 0.015, 0.008, 0.924, side * 0.4695, 0.03, 0);
  }
  group.userData.ambient = { time: 0, selectionMaterial: m('selection') };
  batchStatic(group);
  return group;
}

function camp(group, m) {
  for (let i = -1; i <= 1; i++) log(group, m, i * 0.103, 0.052, -0.035, 0.31, 0.052);
  for (const x of [-0.052, 0.052]) log(group, m, x, 0.14, -0.035, 0.28, 0.049);
  for (const [x, z, r] of [[-0.23, 0.15, 0.049], [0.22, 0.16, 0.053], [-0.23, -0.14, 0.04], [0.22, -0.15, 0.043]]) {
    pebble(group, m, x, z, r);
  }
}

function hut(group, m) {
  slab(group, m('stone'), 0.371, 0.371, 0, 0.026);
  box(group, m('timber'), 0.34, 0.244, 0.34, 0, 0.148, -0.025);
  for (const side of [-1, 1]) for (const back of [-1, 1]) {
    box(group, m('wood'), 0.028, 0.244, 0.028, side * 0.158, 0.148, -0.025 + back * 0.158);
  }
  for (let i = 0; i < 3; i++) box(group, m('endGrain'), 0.318, 0.012, 0.008, 0, 0.07 + i * 0.066, 0.148);
  doorway(group, m, 0, 0.016, 0.154, 0.089, 0.162);
  windowAt(group, m, 0.174, 0.16, -0.035, { w: 0.054, h: 0.068, turn: Math.PI / 2 });
  pyramid(group, m('brownRoof'), 0.416, 0.183, 0, 0.27, -0.025);
  box(group, m('brownRoof'), 0.416, 0.025, 0.416, 0, 0.268, -0.025);
  pebble(group, m, -0.245, 0.146, 0.043);
  pebble(group, m, 0.238, -0.13, 0.037);
}

function cottage(group, m, farm = false) {
  house(group, m, {
    w: farm ? 0.46 : 0.42, d: farm ? 0.4 : 0.38, h: farm ? 0.425 : 0.34,
    rise: farm ? 0.235 : 0.22, roof: 'yellow', x: farm ? -0.115 : -0.035, z: farm ? -0.12 : -0.055,
  });
  if (farm) {
    vegetableGarden(group, m);
    fenceRun(group, m, 0.393, 0.24, 0.29, Math.PI / 2);
    fenceRun(group, m, 0.25, 0.393, 0.28);
  } else {
    pine(group, m, -0.299, 0.22, 0.29);
    pine(group, m, 0.28, 0.205, 0.33);
  }
}

function craftsman(group, m) {
  house(group, m, { w: 0.48, d: 0.44, h: 0.62, rise: 0.25, roof: 'orange', x: -0.055, z: -0.07, floors: 2 });
  chimney(group, m, 0.09, 0.64, -0.17, 0.32);
  for (let i = 0; i < 3; i++) log(group, m, 0.236 + i * 0.052, 0.027, 0.185, 0.17, 0.027);
  for (let i = 0; i < 2; i++) log(group, m, 0.262 + i * 0.052, 0.073, 0.185, 0.15, 0.025);
}

function shop(group, m) {
  house(group, m, { w: 0.61, d: 0.47, h: 0.70, rise: 0.27, roof: 'teal', z: -0.065, floors: 2 });
  awning(group, m, 0.17);
}

function guildhouse(group, m) {
  house(group, m, { w: 0.55, d: 0.46, h: 0.78, rise: 0.28, roof: 'teal', x: -0.065, z: -0.105, floors: 2, stoneBase: 0.035 });
  box(group, m('stone'), 0.554, 0.19, 0.464, -0.065, 0.095, -0.105);
  const barn = house(group, m, { w: 0.27, d: 0.39, h: 0.56, rise: 0.2, roof: 'teal', x: 0.23, z: 0.15, wall: 'timber', entry: false });
  doorway(barn, m, 0, 0.016, 0.204, 0.145, 0.255);
  chimney(group, m, -0.21, 0.75, -0.205, 0.39, 0.081);
  hayBale(group, m, -0.225, 0.215, 0.153, 0.105);
  hayBale(group, m, -0.225, 0.328, 0.13, 0.083);
}

function chapel(group, m) {
  slab(group, m('stone'), 0.672, 0.586, 0, 0.035, 0, -0.07);
  box(group, m('white'), 0.62, 0.86, 0.52, 0, 0.465, -0.07);
  gable(group, m, 0.68, 0.585, 0.27, 0, 0.895, -0.07, 'teal', 'white', false);
  for (const side of [-1, 1]) for (const z of [-0.20, 0.065]) {
    windowAt(group, m, side * 0.315, 0.54, z, { w: 0.065, h: 0.185, turn: side * Math.PI / 2, royal: true, arched: true });
    box(group, m('stone'), 0.05, 0.41, 0.064, side * 0.315, 0.205, z - 0.066);
  }
  slab(group, m('stone'), 0.268, 0.285, 0, 0.035, 0, 0.16);
  box(group, m('white'), 0.22, 0.94, 0.245, 0, 0.505, 0.16);
  doorway(group, m, 0, 0.028, 0.29, 0.12, 0.235);
  windowAt(group, m, 0, 0.76, 0.289, { w: 0.065, h: 0.13, arched: true, royal: true });
  box(group, m('stone'), 0.254, 0.03, 0.276, 0, 0.975, 0.16);
  for (const x of [-0.088, 0.088]) for (const dz of [-0.1, 0.1]) {
    box(group, m('white'), 0.031, 0.16, 0.031, x, 1.055, 0.16 + dz);
  }
  cylinder(group, m('gold'), 0.046, 0.074, 0, 1.035, 0.16, 0.022, 8);
  cylinder(group, m('wood'), 0.006, 0.08, 0, 1.092, 0.16, 0.006, 6);
  box(group, m('white'), 0.264, 0.035, 0.285, 0, 1.145, 0.16);
  pyramid(group, m('gold'), 0.297, 0.26, 0, 1.1625, 0.16);
  mesh(group, new THREE.OctahedronGeometry(0.013), m('gold'), 0, 1.43, 0.16);
  for (let i = 0; i < 3; i++) slab(group, m('stone'), 0.107, 0.031, 0, 0.012, 0, 0.327 + i * 0.04, 0.003, 0.009);
}

function keep(group, m) {
  slab(group, m('stoneShade'), 0.685, 0.64, 0, 0.055, 0, -0.025);
  stoneBlock(group, m, { w: 0.59, d: 0.53, h: 1.055, y: 0.055, z: -0.04, wall: 'ivory', floors: 3 });
  for (const side of [-1, 1]) box(group, m('stone'), 0.09, 0.43, 0.16, side * 0.282, 0.27, 0.195);
  crenels(group, m, 0.635, 0.578, 1.108, 0, -0.04);
  pyramid(group, m('crimson'), 0.49, 0.267, 0, 1.125, -0.04);
  flag(group, m, { x: -0.035, y: 1.385, z: -0.04, height: 0.22, width: 0.162 });
}

function baronCastle(group, m) {
  slab(group, m('stoneShade'), 0.809, 0.79, 0, 0.055);
  stoneBlock(group, m, { w: 0.55, d: 0.51, h: 1.09, y: 0.055, z: -0.018, wall: 'stone', floors: 3 });
  crenels(group, m, 0.584, 0.546, 1.151, 0, -0.018, 'lavender');
  castleWalls(group, m, 0.294, 0.055, 0.45);
  for (const x of [-0.268, 0.268]) for (const z of [-0.249, 0.249]) {
    const peak = tower(group, m, { x, z, y: 0.055, top: z < 0 ? 1.21 : 1.045, rise: 0.23, roof: 'lavender', wall: 'stone' });
    flag(group, m, { x, y: peak - 0.006, z, height: 0.195, width: 0.1, color: 'purple', turn: x > 0 ? Math.PI : 0 });
  }
}

function moatFortress(group, m) {
  moat(group, m);
  stoneBlock(group, m, { w: 0.566, d: 0.52, h: 1.205, y: 0.095, z: -0.015, wall: 'stone', floors: 3 });
  crenels(group, m, 0.596, 0.55, 1.305, 0, -0.015);
  pyramid(group, m('crimson'), 0.465, 0.25, 0, 1.32, -0.015);
  castleWalls(group, m, 0.276, 0.095, 0.5);
  for (const x of [-0.244, 0.244]) for (const z of [-0.239, 0.239]) {
    const peak = tower(group, m, { x, z, y: 0.095, top: z < 0 ? 1.32 : 1.12, radius: 0.109, rise: 0.24, roof: 'crimson', wall: 'ivory' });
    if (z < 0) flag(group, m, { x, y: peak - 0.008, z, height: 0.165, width: 0.11, turn: x > 0 ? Math.PI : 0 });
  }
}

function citadel(group, m) {
  slab(group, m('stoneShade'), 0.831, 0.816, 0, 0.055);
  slab(group, m('ivory'), 0.806, 0.79, 0.043, 0.095);
  stoneBlock(group, m, { w: 0.602, d: 0.55, h: 1.05, y: 0.095, z: -0.02, wall: 'ivory', royal: true, floors: 3 });
  crenels(group, m, 0.631, 0.58, 1.15, 0, -0.02);
  stoneBlock(group, m, { w: 0.392, d: 0.365, h: 0.43, y: 1.127, z: -0.025, wall: 'white', royal: true, floors: 1, entry: false });
  cylinder(group, m('gold'), 0.263, 0.023, 0, 1.566, -0.025);
  mesh(group, new THREE.ConeGeometry(0.262, 0.29, 8), m('crimson'), 0, 1.722, -0.025);
  castleWalls(group, m, 0.296, 0.095, 0.57, 'ivory');
  for (const x of [-0.273, 0.273]) for (const z of [-0.247, 0.247]) {
    const peak = tower(group, m, { x, z, y: 0.095, top: z < 0 ? 1.31 : 1.12, radius: 0.106, rise: 0.28, roof: 'crimson', wall: 'ivory', royal: true });
    if (z < 0) flag(group, m, { x, y: peak - 0.015, z, height: 0.15, width: 0.103, turn: x > 0 ? Math.PI : 0 });
  }
  flag(group, m, { x: 0, y: 1.851, z: -0.025, height: 0.158, width: 0.14 });
}

function palace(group, m) {
  moat(group, m);
  stoneBlock(group, m, { w: 0.616, d: 0.558, h: 1.125, y: 0.095, z: -0.02, wall: 'white', royal: true, floors: 3 });
  crenels(group, m, 0.645, 0.584, 1.224, 0, -0.02, 'white');
  stoneBlock(group, m, { w: 0.414, d: 0.382, h: 0.492, y: 1.19, z: -0.027, wall: 'white', royal: true, floors: 2, entry: false });
  cylinder(group, m('white'), 0.144, 0.185, 0, 1.733, -0.027);
  cylinder(group, m('gold'), 0.168, 0.026, 0, 1.827, -0.027);
  mesh(group, new THREE.ConeGeometry(0.17, 0.265, 8), m('white'), 0, 1.968, -0.027);
  for (const side of [-1, 1]) {
    box(group, m('marble'), 0.035, 0.56, 0.038, side * 0.235, 0.375, 0.268);
    cylinder(group, m('gold'), 0.024, 0.022, side * 0.235, 0.662, 0.268);
  }
  castleWalls(group, m, 0.287, 0.095, 0.61, 'white');
  for (const x of [-0.261, 0.261]) for (const z of [-0.245, 0.245]) {
    const peak = tower(group, m, { x, z, y: 0.095, top: z < 0 ? 1.438 : 1.21, radius: 0.113, rise: z < 0 ? 0.305 : 0.274, roof: 'white', wall: 'white', royal: true });
    if (z < 0) flag(group, m, { x, y: peak - 0.018, z, height: 0.15, width: 0.115, turn: x > 0 ? Math.PI : 0 });
  }
  flag(group, m, { x: 0, y: 2.089, z: -0.027, height: 0.14, width: 0.15 });
}

export function createBuilding(level) {
  if (!Number.isInteger(level) || level < 1 || level > 13) {
    throw new RangeError('Storybook Meadow building level must be an integer from 1 to 13.');
  }
  const group = new THREE.Group();
  group.name = NAMES[level - 1];
  group.userData = {
    level, assetName: NAMES[level - 1], tier: TIERS[level <= 3 ? 0 : level <= 6 ? 1 : level <= 9 ? 2 : 3],
  };
  const m = palette();
  switch (level) {
    case 1: camp(group, m); break;
    case 2: hut(group, m); break;
    case 3: cottage(group, m); break;
    case 4: cottage(group, m, true); break;
    case 5: craftsman(group, m); break;
    case 6: shop(group, m); break;
    case 7: guildhouse(group, m); break;
    case 8: chapel(group, m); break;
    case 9: keep(group, m); break;
    case 10: baronCastle(group, m); break;
    case 11: moatFortress(group, m); break;
    case 12: citadel(group, m); break;
    case 13: palace(group, m); break;
  }
  batchStatic(group);
  return group;
}

export function updateAnimations(models, deltaTime) {
  const dt = Number.isFinite(deltaTime) ? Math.min(Math.max(deltaTime, 0), 0.05) : 0;
  if (dt === 0) return;
  for (const model of models) {
    const ambient = model?.userData?.ambient;
    if (!ambient) continue;
    ambient.time += dt;
    for (const cloth of ambient.flags || []) waveFlag(cloth, ambient.time);
    if (ambient.selectionMaterial) {
      ambient.selectionMaterial.emissiveIntensity = 0.43 + Math.sin(ambient.time * 2) * 0.07;
    }
  }
}
