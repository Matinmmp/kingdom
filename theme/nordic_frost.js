import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const themeMeta = {
  id: 'nordic_frost',
  name: 'Nordic Frost',
  backgroundColor: '#e4eef8',
  accentColor: '#3a86ff',
};

const NAMES = [
  'Firewood & Stones', 'A-Frame Timber Hut', 'Cozy Pine Cabin',
  'Winter Greenhouse Farm', 'Two-Story Chalet', 'Fjord Trading Post',
  'Hot-Spring Lodge', 'Frost Clock-Hall', 'Granite Watch-Fort',
  'Four-Tower Frost Castle', 'Ice-Moat Citadel', 'Crystal Dome Sanctuary',
  'Grand Citadel of the North',
];
const TIERS = ['Cozy beginnings', 'Alpine village', 'Fjord landmarks', 'Northern royalty'];
const COLORS = {
  snow: '#f1f5f9', white: '#ffffff', sage: '#6b9080', rock: '#475569', bedrock: '#1e293b',
  granite: '#94a3b8', graniteLight: '#cbd5e1', graniteShade: '#64748b',
  marble: '#f8fafc', marbleShade: '#dbe6ef', wood: '#bc6c25', woodDark: '#714627',
  woodLight: '#d9a066', endGrain: '#f5c98b', cream: '#fff0cf',
  orange: '#e85d04', red: '#d62828', cobalt: '#2563eb', royal: '#3b82f6', roofShade: '#1743a2',
  pine: '#386653', pineLight: '#52816b', window: '#ffda75', recess: '#263b53',
  water: '#48cae4', ice: '#4cc9f0', glass: '#b8e8ef', gold: '#ffb703',
  flame: '#ff7b16', flameCore: '#ffd166', steam: '#f8fafc', cloth: '#ffffff',
};
const FINISHES = {
  window: { emissive: '#ffb84d', emissiveIntensity: 0.23, roughness: 0.52 },
  flame: { emissive: '#ff6a00', emissiveIntensity: 0.65, roughness: 0.65 },
  flameCore: { emissive: '#ffb703', emissiveIntensity: 0.7 },
  ice: { emissive: '#4cc9f0', emissiveIntensity: 0.28, metalness: 0.08, roughness: 0.35 },
  water: { emissive: '#48cae4', emissiveIntensity: 0.17, metalness: 0.08, roughness: 0.24 },
  glass: { transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, roughness: 0.26 },
  gold: { metalness: 0.38, roughness: 0.42 },
  steam: { transparent: true, opacity: 0.28, depthWrite: false },
  cloth: { vertexColors: true, side: THREE.DoubleSide, roughness: 0.92 },
};

// A palette cache belongs to one factory call, never to another model or board.
function palette() {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) {
      const material = new THREE.MeshStandardMaterial({
        color: COLORS[key], roughness: 0.84, flatShading: true, ...FINISHES[key],
      });
      material.name = `Nordic Frost / ${key}`;
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

function place(parent, x, y, z, turn = 0) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = turn;
  parent.add(group);
  return group;
}

function box(parent, material, w, h, d, x = 0, y = h / 2, z = 0) {
  return mesh(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
}

function cylinder(parent, material, radius, height, x, y, z, sides = 8, top = radius) {
  return mesh(parent, new THREE.CylinderGeometry(top, radius, height, sides), material, x, y, z);
}

function beam(parent, material, start, end, width, depth = width) {
  const direction = new THREE.Vector3(...end).sub(new THREE.Vector3(...start));
  const object = box(parent, material, width, direction.length(), depth,
    (start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return object;
}

function prism(points, depth) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 3 })
    .translate(0, 0, -depth / 2);
}

// Four octagonal rings give crisp bevels without rounding the playable Y datum.
function slabGeometry(w, d, bottom, top, bevel = 0.008, cut = 0.025) {
  const vertices = [];
  const indices = [];
  const rings = [[bottom, bevel], [bottom + bevel, 0], [top - bevel, 0], [top, bevel]];
  for (const [y, inset] of rings) {
    const a = w / 2 - inset;
    const b = d / 2 - inset;
    const c = Math.max(0.002, cut - inset * 0.4);
    for (const [x, z] of [[-a + c, -b], [-a, -b + c], [-a, b - c], [-a + c, b],
      [a - c, b], [a, b - c], [a, -b + c], [a - c, -b]]) vertices.push(x, y, z);
  }
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 8; i++) {
    const a = ring * 8 + i;
    const b = ring * 8 + (i + 1) % 8;
    indices.push(a, b, b + 8, a, b + 8, a + 8);
  }
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i, 24, 24 + i, 25 + i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function slab(parent, material, w, d, bottom, top, x = 0, z = 0, bevel = 0.008, cut = 0.025) {
  return mesh(parent, slabGeometry(w, d, bottom, top, bevel, cut), material, x, 0, z);
}

function pebble(parent, material, x, y, z, rx, ry, rz) {
  const object = mesh(parent, new THREE.IcosahedronGeometry(1, 0), material, x, y, z);
  object.scale.set(rx, ry, rz);
  return object;
}

function foundation(parent, m, w, d, top = 0.05) {
  slab(parent, m('rock'), w, d, 0, top - 0.012, 0, 0, 0.006, 0.042);
  slab(parent, m('snow'), w - 0.008, d - 0.008, top - 0.019, top, 0, 0, 0.005, 0.038);
  return top;
}

function pathStones(parent, m, x, y, z, count = 2) {
  for (let i = 0; i < count; i++) {
    slab(parent, m('graniteLight'), 0.1, 0.039, y, y + 0.012, x, z + i * 0.052, 0.003, 0.012);
  }
}

function archPoints(w, h) {
  const r = w / 2;
  const points = [[-r, 0], [r, 0]];
  for (let i = 0; i <= 6; i++) {
    const angle = i * Math.PI / 6;
    points.push([Math.cos(angle) * r, h - r + Math.sin(angle) * r]);
  }
  return points;
}

function windowAt(parent, m, x, y, z, { w = 0.065, h = 0.095, turn = 0, royal = false, stone = false } = {}) {
  const g = place(parent, x, y, z, turn);
  const frame = m(royal ? 'gold' : stone ? 'graniteLight' : 'woodDark');
  box(g, frame, w + 0.018, h + 0.018, 0.014, 0, 0, 0);
  box(g, m('recess'), w, h, 0.01, 0, 0, 0.009);
  box(g, m('window'), w * 0.77, h * 0.8, 0.006, 0, 0, 0.016);
  box(g, frame, 0.007, h * 0.86, 0.007, 0, 0, 0.021);
  box(g, m(royal || stone ? 'snow' : 'woodLight'), w + 0.028, 0.011, 0.025, 0, -h / 2 - 0.008, 0.008);
}

function doorway(parent, m, x, y, z, w = 0.11, h = 0.19, royal = false, stone = false) {
  const frame = m(royal ? 'gold' : stone ? 'graniteLight' : 'woodDark');
  mesh(parent, prism(archPoints(w + 0.033, h + 0.022), 0.019), frame, x, y, z);
  mesh(parent, prism(archPoints(w, h), 0.014), m('woodDark'), x, y + 0.004, z + 0.014);
  box(parent, m(royal ? 'cobalt' : 'wood'), w * 0.76, h * 0.69, 0.008, x, y + h * 0.37, z + 0.024);
  box(parent, m('gold'), 0.012, 0.009, 0.006, x + w * 0.23, y + h * 0.43, z + 0.031);
}

function pitchedRoof(parent, m, { w, d, rise, y, x = 0, z = 0, roof = 'red', face = 'cream', snow = true, turn = 0 }) {
  const g = place(parent, x, y, z, turn);
  mesh(g, prism([[-w / 2, 0], [w / 2, 0], [0, rise]], d), m(roof));
  const triangle = [[-w / 2 + 0.018, 0.002], [w / 2 - 0.018, 0.002], [0, rise - 0.024]];
  for (const sign of [-1, 1]) {
    mesh(g, prism(triangle, 0.006), m(face), 0, 0, sign * (d / 2 + 0.001));
    for (const side of [-1, 1]) {
      beam(g, m(roof === 'glass' ? 'woodLight' : 'woodDark'),
        [side * (w / 2 - 0.005), 0.006, sign * (d / 2 + 0.006)],
        [0, rise + 0.004, sign * (d / 2 + 0.006)], roof === 'glass' ? 0.009 : 0.014);
    }
  }
  box(g, m(snow ? 'snow' : roof === 'glass' ? 'woodLight' : 'roofShade'), 0.021, 0.015, d + 0.014, 0, rise + 0.006, 0);
  if (snow) {
    const slope = Math.hypot(w / 2, rise);
    for (const side of [-1, 1]) {
      const patch = box(g, m('snow'), slope * 0.19, 0.011, d * 0.91,
        side * w * 0.435, rise * 0.13 + 0.009, 0);
      patch.rotation.z = -side * Math.atan2(rise, w / 2);
    }
  }
  return g;
}

function timberHouse(parent, m, { w, d, h, rise, x = 0, y, z = 0, roof = 'red', floors = 1, logs = false, entry = true }) {
  const g = place(parent, x, y, z);
  slab(g, m('graniteShade'), w + 0.021, d + 0.021, 0, 0.058, 0, 0, 0.007, 0.018);
  box(g, m(logs ? 'woodDark' : 'cream'), w, h - 0.042, d, 0, (h + 0.042) / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(g, m('woodDark'), 0.026, h - 0.052, 0.026, sx * (w / 2 - 0.004), (h + 0.052) / 2, sz * (d / 2 - 0.004));
  }
  if (logs) {
    for (let row = 0; row < 5; row++) {
      const yy = 0.082 + row * (h - 0.09) / 5;
      for (const sign of [-1, 1]) {
        box(g, m(row % 2 ? 'wood' : 'woodLight'), w + 0.018, 0.033, 0.023, 0, yy, sign * d / 2);
        box(g, m(row % 2 ? 'woodLight' : 'wood'), 0.023, 0.033, d + 0.018, sign * w / 2, yy + 0.009, 0);
      }
    }
  }
  for (let floor = 0; floor <= floors; floor++) {
    box(g, m('wood'), w + 0.025, 0.022, d + 0.025, 0, 0.055 + (h - 0.055) * floor / floors, 0);
  }
  for (let floor = 0; floor < floors; floor++) {
    const yy = 0.055 + (h - 0.055) * (floor + 0.54) / floors;
    for (const frac of (w > 0.47 ? [-0.27, 0.27] : [0.25])) {
      windowAt(g, m, frac * w, yy, d / 2 + 0.009, { h: Math.min(0.105, h / floors * 0.4) });
    }
    for (const frac of [-0.24, 0.24]) {
      windowAt(g, m, w / 2 + 0.009, yy, d * frac, { turn: Math.PI / 2, w: 0.056, h: Math.min(0.1, h / floors * 0.39) });
    }
  }
  if (entry) doorway(g, m, w > 0.47 ? 0 : -0.075, 0.044, d / 2 + 0.014, 0.102, Math.min(0.19, h * 0.56));
  pitchedRoof(g, m, { w: w + 0.058, d: d + 0.055, rise, y: h, roof, face: logs ? 'woodLight' : 'cream' });
  return g;
}

function chimney(parent, m, x, y, z, height = 0.19) {
  box(parent, m('graniteShade'), 0.065, height, 0.065, x, y + height / 2, z);
  for (let row = 0; row < 3; row++) {
    box(parent, m('graniteLight'), 0.033, 0.016, 0.005, x + (row % 2 ? -0.009 : 0.009), y + height * (row + 1) / 4, z + 0.034);
  }
  box(parent, m('snow'), 0.084, 0.021, 0.082, x, y + height, z);
  box(parent, m('recess'), 0.043, 0.004, 0.042, x, y + height + 0.012, z);
}

function pine(parent, m, x, y, z, scale = 1) {
  const g = place(parent, x, y, z);
  g.scale.setScalar(scale);
  cylinder(g, m('woodDark'), 0.017, 0.14, 0, 0.07, 0, 6);
  for (let tier = 0; tier < 3; tier++) {
    const radius = 0.094 - tier * 0.021;
    const base = 0.075 + tier * 0.075;
    mesh(g, new THREE.ConeGeometry(radius, 0.16, 7), m(tier % 2 ? 'pineLight' : 'pine'), 0, base + 0.08, 0);
    mesh(g, new THREE.ConeGeometry(radius * 0.66, 0.107, 7), m('snow'), 0, base + 0.114, 0);
  }
}

function log(parent, m, x, y, z, length, radius) {
  const g = place(parent, x, y, z);
  cylinder(g, m('woodDark'), radius, length, 0, 0, 0, 7).rotation.x = Math.PI / 2;
  for (const sign of [-1, 1]) {
    cylinder(g, m('endGrain'), radius * 0.81, 0.004, 0, 0, sign * length / 2, 7).rotation.x = Math.PI / 2;
    cylinder(g, m('wood'), radius * 0.34, 0.005, 0, 0, sign * (length / 2 + 0.002), 7).rotation.x = Math.PI / 2;
  }
}

function crate(parent, m, x, y, z, size = 0.095) {
  const g = place(parent, x, y, z);
  box(g, m('wood'), size, size, size);
  for (const sign of [-1, 1]) {
    box(g, m('woodLight'), size, 0.013, 0.008, 0, size * (0.5 + sign * 0.35), size / 2 + 0.003);
  }
  beam(g, m('endGrain'), [-size * 0.38, size * 0.15, size / 2 + 0.009],
    [size * 0.38, size * 0.85, size / 2 + 0.009], 0.012, 0.006);
}

function balcony(parent, m, y, z, w = 0.43, d = 0.11) {
  box(parent, m('woodDark'), w, 0.027, d, 0, y, z);
  for (let i = 0; i < 5; i++) {
    box(parent, m('woodLight'), 0.018, 0.073, 0.017, (i / 4 - 0.5) * (w - 0.025), y + 0.045, z + d / 2 - 0.009);
  }
  box(parent, m('wood'), w, 0.017, 0.023, 0, y + 0.085, z + d / 2 - 0.009);
  for (const sign of [-1, 1]) {
    beam(parent, m('woodDark'), [sign * w * 0.36, y - 0.075, z - d * 0.4],
      [sign * w * 0.36, y - 0.01, z + d * 0.32], 0.022);
  }
}

function stoneBlock(parent, m, { w, d, h, y, x = 0, z = 0, royal = false, floors = 2, entry = true }) {
  const g = place(parent, x, y, z);
  box(g, m(royal ? 'marble' : 'granite'), w, h, d);
  slab(g, m('graniteShade'), w + 0.024, d + 0.024, 0, 0.085, 0, 0, 0.01, 0.022);
  box(g, m(royal ? 'gold' : 'graniteLight'), w + 0.028, 0.028, d + 0.028, 0, h - 0.015, 0);
  for (let floor = 1; floor < floors; floor++) {
    box(g, m(royal ? 'marbleShade' : 'graniteLight'), w + 0.014, 0.017, d + 0.014, 0, h * floor / floors, 0);
  }
  // Sparse corner quoins read as cut stone without a noisy brick texture.
  for (const sign of [-1, 1]) for (const yy of [h * 0.26, h * 0.7]) {
    box(g, m(royal ? 'marbleShade' : 'graniteLight'), 0.043, 0.039, 0.012, sign * (w / 2 - 0.018), yy, d / 2 + 0.002);
  }
  for (let floor = 0; floor < floors; floor++) {
    const yy = h * (floor + 0.56) / floors;
    for (const fraction of (w > 0.35 ? [-0.27, 0.27] : [0])) {
      if (entry && floor === 0 && fraction === 0) continue;
      windowAt(g, m, w * fraction, yy, d / 2 + 0.008, { w: w > 0.35 ? 0.065 : 0.053, h: Math.min(0.117, h / floors * 0.45), royal, stone: true });
    }
    for (const fraction of (d > 0.35 ? [-0.25, 0.25] : [0])) {
      windowAt(g, m, w / 2 + 0.008, yy, d * fraction, { w: 0.057, h: Math.min(0.11, h / floors * 0.43), turn: Math.PI / 2, royal, stone: true });
    }
  }
  if (entry) doorway(g, m, 0, 0.032, d / 2 + 0.015, 0.13, Math.min(0.24, h * 0.56), royal, true);
  return g;
}

function battlements(parent, m, w, d, y, x = 0, z = 0, royal = false) {
  const trim = m(royal ? 'marble' : 'graniteLight');
  for (const sign of [-1, 1]) {
    box(parent, trim, w, 0.045, 0.035, x, y + 0.018, z + sign * (d / 2 - 0.0175));
    box(parent, trim, 0.035, 0.045, d, x + sign * (w / 2 - 0.0175), y + 0.018, z);
    for (let i = 0; i < 5; i++) {
      const along = i / 4 - 0.5;
      box(parent, trim, 0.05, 0.055, 0.045, x + along * (w - 0.05), y + 0.065, z + sign * (d / 2 - 0.023));
      if (i > 0 && i < 4) box(parent, trim, 0.045, 0.055, 0.05, x + sign * (w / 2 - 0.023), y + 0.065, z + along * (d - 0.05));
    }
  }
}

function tower(parent, m, { x, z, y, top, radius = 0.1, rise = 0.26, royal = false, roof = 'royal' }) {
  const h = top - y;
  const g = place(parent, x, y, z);
  cylinder(g, m(royal ? 'marble' : 'granite'), radius, h, 0, h / 2, 0, 8, radius * 0.95);
  cylinder(g, m('graniteShade'), radius + 0.01, 0.072, 0, 0.036, 0);
  cylinder(g, m(royal ? 'gold' : 'graniteLight'), radius + 0.013, 0.035, 0, h - 0.023, 0);
  cylinder(g, m('snow'), radius + 0.015, 0.015, 0, h + 0.001, 0);
  for (const yy of [h * 0.43, h * 0.77]) {
    windowAt(g, m, 0, yy, radius * 0.95, { w: 0.043, h: 0.087, royal, stone: true });
  }
  mesh(g, new THREE.ConeGeometry(radius + 0.018, rise, 8), m(roof), 0, h + rise / 2 + 0.009, 0);
  cylinder(g, m(royal ? 'gold' : 'ice'), 0.009, 0.027, 0, h + rise + 0.018, 0, 6, 0.004);
  return top + rise + 0.0315;
}

function enclosure(parent, m, y, height = 0.24, royal = false, half = 0.345, front = 0.312) {
  const material = m(royal ? 'marbleShade' : 'granite');
  const run = (x, z, length, turn) => {
    const g = place(parent, x, y, z, turn);
    box(g, material, length, height, 0.044);
    box(g, m('snow'), length, 0.02, 0.049, 0, height, 0);
    const count = Math.max(2, Math.round(length / 0.1));
    for (let i = 0; i < count; i++) {
      box(g, m(royal ? 'marble' : 'graniteLight'), 0.044, 0.045, 0.05,
        (i / (count - 1) - 0.5) * (length - 0.047), height + 0.029, 0);
    }
  };
  for (const sign of [-1, 1]) {
    run(sign * half, 0, front * 2, Math.PI / 2);
    run(sign * (half + 0.09) / 2, front, half - 0.09, 0);
  }
  run(0, -front, half * 2, 0);
}

function moatFoundation(parent, m) {
  slab(parent, m('rock'), 0.844, 0.824, 0, 0.055, 0, 0, 0.009, 0.038);
  for (const sign of [-1, 1]) {
    box(parent, m('water'), 0.08, 0.026, 0.78, sign * 0.372, 0.066, 0);
    box(parent, m('water'), 0.664, 0.026, 0.074, 0, 0.066, sign * 0.363);
  }
  slab(parent, m('marbleShade'), 0.682, 0.653, 0.048, 0.145, 0, 0, 0.01, 0.026);
  box(parent, m('snow'), 0.15, 0.034, 0.117, 0, 0.112, 0.353);
  box(parent, m('marble'), 0.15, 0.026, 0.055, 0, 0.138, 0.327);
  return 0.145;
}

function waveCloth(flag, time) {
  const { positions, rest, width, height, draped, phase } = flag;
  for (let i = 0; i < positions.count; i++) {
    const x = rest[i * 3];
    const y = rest[i * 3 + 1];
    const u = draped ? x / width + 0.5 : x / width;
    const v = Math.max(0, Math.min(1, -y / height));
    const reach = draped ? v : u;
    positions.setZ(i, reach * (0.012 * Math.sin(u * 6.5 + v * 2.5 - time * 2.2 + phase)
      + 0.003 * Math.sin(v * 5 + time * 1.4 + phase)));
  }
  positions.needsUpdate = true;
  flag.geometry.computeVertexNormals();
}

function cloth(root, m, { x, y, z, width = 0.105, height = 0.075, draped = false, royal = false }) {
  const vertices = [];
  const colors = [];
  const indices = [];
  const blue = new THREE.Color(COLORS.cobalt);
  const border = new THREE.Color(royal ? COLORS.gold : COLORS.ice);
  const crest = new THREE.Color(COLORS.snow);
  for (let row = 0; row <= 4; row++) for (let column = 0; column <= 8; column++) {
    const u = column / 8;
    const v = row / 4;
    const notch = draped ? 0.13 * Math.pow(v, 8) * (1 - 2 * Math.abs(u - 0.5)) : 0;
    const tail = draped ? 0 : 0.17 * Math.pow(u, 8) * (1 - 2 * Math.abs(v - 0.5));
    vertices.push((draped ? u - 0.5 : u - tail) * width, -(v - notch) * height, 0);
    const seam = row === 0 || row === 4 || column === 0 || (draped && column === 8);
    const emblem = Math.abs(u - 0.5) + Math.abs(v - 0.5) < 0.27;
    const color = seam ? border : emblem ? crest : blue;
    colors.push(color.r, color.g, color.b);
    if (row < 4 && column < 8) {
      const a = row * 9 + column;
      indices.push(a, a + 9, a + 1, a + 1, a + 9, a + 10);
    }
  }
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.Float32BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  // The entire wave envelope is reserved once; animation never changes X or Y.
  geometry.boundingBox.min.z = -0.016;
  geometry.boundingBox.max.z = 0.016;
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  const object = mesh(root, geometry, m('cloth'), x, y, z, royal ? 'Royal frost banner' : 'Blue fjord pennant');
  object.userData.animatedCloth = true;
  const flag = { geometry, positions, rest: positions.array.slice(), width, height, draped, phase: x * 9 + z * 5 + y * 2 };
  root.userData.ambient.flags.push(flag);
  waveCloth(flag, root.userData.ambient.time);
  if (draped) box(root, m('gold'), width + 0.024, 0.011, 0.015, x, y + 0.003, z);
}

function pennant(root, m, x, y, z, pole = 0.17, width = 0.105, royal = false) {
  cylinder(root, m('gold'), 0.0045, pole, x, y + pole / 2, z, 6);
  pebble(root, m('gold'), x, y + pole + 0.004, z, 0.009, 0.01, 0.009);
  cloth(root, m, { x: x + 0.005, y: y + pole - 0.008, z, width, height: pole * 0.44, royal });
}

// Merge only static architecture. Each returned group retains its own materials,
// and the animated cloth keeps its vertex colors and editable position buffer.
function batchArchitecture(root) {
  root.updateMatrixWorld(true);
  const batches = new Map();
  const originals = [];
  const groups = [];
  root.traverse((object) => {
    if (object.isGroup && object !== root) groups.push(object);
    if (!object.isMesh || object.userData.animatedCloth) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    for (const key of Object.keys(geometry.attributes)) {
      if (key !== 'position' && key !== 'normal') geometry.deleteAttribute(key);
    }
    if (!batches.has(object.material)) batches.set(object.material, []);
    batches.get(object.material).push(geometry);
    originals.push(object);
  });
  for (const object of originals) {
    object.removeFromParent();
    object.geometry.dispose();
  }
  for (const group of groups.reverse()) if (!group.children.length) group.removeFromParent();
  for (const [material, pieces] of batches) {
    const combined = mergeGeometries(pieces, false);
    for (const geometry of pieces) geometry.dispose();
    mesh(root, combined, material, 0, 0, 0, material.name);
  }
}

export function createBoard() {
  const board = new THREE.Group();
  board.name = 'Nordic Frost / alpine cross-section';
  board.userData.kind = 'board';
  const m = palette();
  slab(board, m('bedrock'), 3.94, 3.94, -0.74, -0.515, 0, 0, 0.027, 0.09).name = 'Deep navy bedrock';
  slab(board, m('rock'), 3.98, 3.98, -0.54, -0.095, 0, 0, 0.025, 0.065).name = 'Slate mountain rock';
  slab(board, m('white'), 4, 4, -0.126, -0.052, 0, 0, 0.012, 0.042).name = 'Thin alpine snow rim';
  const geometry = slabGeometry(0.986, 0.986, -0.067, 0, 0.015, 0.029);
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    const tile = mesh(board, geometry, m((row + column) % 2 ? 'sage' : 'snow'),
      column - 1.5, 0, row - 1.5, `tile-${row}-${column}`);
    tile.userData.gridCell = { row, column };
  }
  return board;
}

export function createSelectionIndicator() {
  const indicator = new THREE.Group();
  indicator.name = 'Glowing ice-cyan square';
  const m = palette();
  const material = m('ice');
  // The contract centers the 3D frame at .02; its luminous top is exactly .03.
  for (const sign of [-1, 1]) {
    box(indicator, material, 0.976, 0.02, 0.022, 0, 0.02, sign * 0.477);
    box(indicator, material, 0.022, 0.02, 0.932, sign * 0.477, 0.02, 0);
  }
  indicator.userData.ambient = { time: 0, marker: material };
  return indicator;
}

function camp(g, m) {
  const y = foundation(g, m, 0.55, 0.5, 0.036);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) {
    log(g, m, -0.17 + row * 0.036 + i * 0.073, y + 0.034 + row * 0.059, -0.055, 0.25 - row * 0.018, 0.035);
  }
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7;
    pebble(g, m(i % 2 ? 'granite' : 'graniteShade'), 0.148 + Math.cos(angle) * 0.07, y + 0.016,
      0.138 + Math.sin(angle) * 0.065, 0.026, 0.019, 0.023);
  }
  const fire = place(g, 0.148, y + 0.024, 0.138, 0.6);
  log(fire, m, -0.017, 0.007, 0, 0.092, 0.013);
  log(fire, m, 0.017, 0.007, 0, 0.092, 0.013);
  mesh(fire, new THREE.ConeGeometry(0.037, 0.092, 5), m('flame'), 0, 0.056, 0);
  mesh(fire, new THREE.ConeGeometry(0.019, 0.067, 5), m('flameCore'), 0.004, 0.051, 0.012);
  pebble(g, m('granite'), -0.202, y + 0.023, 0.162, 0.036, 0.028, 0.032);
  g.userData.ambient.fire = m('flame');
}

function hut(g, m) {
  const y = foundation(g, m, 0.625, 0.59, 0.044);
  box(g, m('woodDark'), 0.442, 0.026, 0.42, 0, y + 0.013, -0.032);
  pitchedRoof(g, m, { w: 0.48, d: 0.46, rise: 0.39, y: y + 0.025, z: -0.032, roof: 'wood', face: 'woodLight' });
  doorway(g, m, 0, y + 0.026, 0.207, 0.108, 0.203);
  windowAt(g, m, 0, y + 0.292, 0.207, { w: 0.039, h: 0.045 });
  pathStones(g, m, 0, y, 0.253, 1);
}

function cabin(g, m) {
  const y = foundation(g, m, 0.704, 0.665, 0.048);
  timberHouse(g, m, { w: 0.433, d: 0.4, h: 0.33, rise: 0.23, x: -0.07, y, z: -0.065, roof: 'orange', logs: true });
  chimney(g, m, 0.055, 0.427, -0.144, 0.235);
  pine(g, m, 0.263, y, 0.17, 0.86);
  pathStones(g, m, -0.145, y, 0.223, 2);
}

function farm(g, m) {
  const y = foundation(g, m, 0.748, 0.708, 0.051);
  timberHouse(g, m, { w: 0.44, d: 0.43, h: 0.46, rise: 0.235, x: -0.115, y, z: -0.065, roof: 'orange' });
  chimney(g, m, -0.015, 0.59, -0.17, 0.2);
  const garden = place(g, 0.258, y, 0.16);
  slab(garden, m('wood'), 0.225, 0.313, 0, 0.035, 0, 0, 0.005, 0.012);
  box(garden, m('sage'), 0.194, 0.012, 0.278, 0, 0.038, 0);
  for (const x of [-0.049, 0.049]) for (const z of [-0.085, 0, 0.085]) {
    pebble(garden, m('pineLight'), x, 0.065, z, 0.025, 0.026, 0.024);
  }
  box(garden, m('glass'), 0.213, 0.162, 0.3, 0, 0.119, 0);
  for (const x of [-0.106, 0.106]) for (const z of [-0.15, 0.15]) {
    box(garden, m('cream'), 0.011, 0.175, 0.011, x, 0.12, z);
  }
  for (const z of [-0.15, 0.15]) box(garden, m('woodLight'), 0.22, 0.011, 0.012, 0, 0.2, z);
  pitchedRoof(garden, m, { w: 0.229, d: 0.315, rise: 0.097, y: 0.2, roof: 'glass', face: 'glass', snow: false });
  pathStones(g, m, -0.19, y, 0.227, 2);
}

function chalet(g, m) {
  const y = foundation(g, m, 0.774, 0.734, 0.054);
  timberHouse(g, m, { w: 0.532, d: 0.48, h: 0.61, rise: 0.275, y, z: -0.07, roof: 'red', floors: 2 });
  balcony(g, m, 0.43, 0.224, 0.445, 0.118);
  windowAt(g, m, 0, 0.55, 0.181, { w: 0.058, h: 0.102 });
  pathStones(g, m, 0, y, 0.285, 2);
}

function tradingPost(g, m) {
  const y = foundation(g, m, 0.806, 0.768, 0.058);
  timberHouse(g, m, { w: 0.67, d: 0.47, h: 0.7, rise: 0.29, y, z: -0.1, roof: 'red', floors: 2 });
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 0.075;
    const material = m(i % 2 ? 'white' : 'cobalt');
    box(g, material, 0.075, 0.018, 0.192, x, 0.447, 0.247).rotation.x = 0.17;
    box(g, material, 0.075, 0.046, 0.014, x, 0.414, 0.341);
  }
  for (const x of [-0.217, 0.217]) box(g, m('woodDark'), 0.018, 0.362, 0.018, x, y + 0.181, 0.335);
  crate(g, m, 0.3, y, 0.257, 0.097);
  crate(g, m, 0.298, y + 0.097, 0.252, 0.084);
  crate(g, m, -0.307, y, 0.277, 0.1);
}

function hotSpring(g, m) {
  const y = foundation(g, m, 0.824, 0.798, 0.061);
  timberHouse(g, m, { w: 0.69, d: 0.32, h: 0.79, rise: 0.27, y, z: -0.205, roof: 'cobalt', floors: 2, entry: false });
  timberHouse(g, m, { w: 0.255, d: 0.53, h: 0.63, rise: 0.23, x: -0.215, y, z: -0.035, roof: 'cobalt', floors: 2 });
  box(g, m('granite'), 0.697, 0.14, 0.328, 0, y + 0.07, -0.205);
  box(g, m('granite'), 0.262, 0.14, 0.537, -0.215, y + 0.07, -0.035);
  chimney(g, m, -0.12, 0.977, -0.228, 0.21);
  slab(g, m('graniteLight'), 0.374, 0.315, y, 0.123, 0.143, 0.162, 0.01, 0.056);
  slab(g, m('water'), 0.306, 0.247, 0.119, 0.135, 0.143, 0.162, 0.004, 0.038);
  for (const [x, yy, z, r] of [[0.1, 0.204, 0.154, 0.019], [0.107, 0.255, 0.15, 0.024],
    [0.095, 0.31, 0.148, 0.019], [0.217, 0.196, 0.18, 0.016], [0.226, 0.245, 0.18, 0.021]]) {
    pebble(g, m('steam'), x, yy, z, r, r * 1.5, r * 0.7);
  }
  pine(g, m, 0.319, y, 0.003, 0.62);
  pine(g, m, -0.303, y, 0.292, 0.59);
}

function clockFace(parent, m, x, y, z, turn = 0) {
  const g = place(parent, x, y, z, turn);
  cylinder(g, m('roofShade'), 0.067, 0.014, 0, 0, 0, 12).rotation.x = Math.PI / 2;
  cylinder(g, m('cream'), 0.055, 0.009, 0, 0, 0.01, 12).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const tick = box(g, m('gold'), 0.006, 0.012, 0.004, Math.sin(angle) * 0.042, Math.cos(angle) * 0.042, 0.017);
    tick.rotation.z = -angle;
  }
  beam(g, m('recess'), [0, 0, 0.02], [0.006, 0.033, 0.02], 0.006, 0.004);
  beam(g, m('recess'), [0, 0, 0.022], [-0.025, 0.008, 0.022], 0.008, 0.004);
}

function clockHall(g, m) {
  const y = foundation(g, m, 0.828, 0.804, 0.066);
  stoneBlock(g, m, { w: 0.68, d: 0.48, h: 0.83, y, z: -0.105, floors: 2, entry: false });
  pitchedRoof(g, m, { w: 0.738, d: 0.538, rise: 0.24, y: y + 0.83, z: -0.105, roof: 'cobalt', face: 'granite' });
  for (const sign of [-1, 1]) {
    stoneBlock(g, m, { w: 0.142, d: 0.31, h: 0.51, x: sign * 0.278, y, z: 0.112, floors: 1, entry: false });
    pitchedRoof(g, m, { w: 0.178, d: 0.342, rise: 0.16, x: sign * 0.278, y: y + 0.51, z: 0.112, roof: 'cobalt', face: 'granite' });
  }
  const towerGroup = stoneBlock(g, m, { w: 0.214, d: 0.222, h: 1.04, y, z: 0.147, floors: 3 });
  clockFace(towerGroup, m, 0, 0.927, 0.119);
  clockFace(towerGroup, m, 0.115, 0.927, 0, Math.PI / 2);
  box(towerGroup, m('snow'), 0.251, 0.027, 0.253, 0, 1.049, 0);
  for (const x of [-0.085, 0.085]) for (const z of [-0.088, 0.088]) {
    box(towerGroup, m('graniteLight'), 0.026, 0.151, 0.026, x, 1.131, z);
  }
  cylinder(towerGroup, m('gold'), 0.037, 0.058, 0, 1.142, 0, 8, 0.018);
  pebble(towerGroup, m('gold'), 0, 1.103, 0, 0.012, 0.015, 0.012);
  const roof = mesh(towerGroup, new THREE.ConeGeometry(0.182, 0.17, 4), m('cobalt'), 0, 1.292, 0);
  roof.rotation.y = Math.PI / 4;
  cylinder(towerGroup, m('ice'), 0.008, 0.031, 0, 1.386, 0, 6, 0.003);
  for (let step = 0; step < 3; step++) {
    box(g, m('graniteLight'), 0.27 - step * 0.023, 0.024 * (step + 1), 0.126 - step * 0.033,
      0, y + 0.012 * (step + 1), 0.328 - step * 0.016);
  }
}

function watchFort(g, m) {
  const y = foundation(g, m, 0.832, 0.813, 0.069);
  stoneBlock(g, m, { w: 0.66, d: 0.57, h: 1.045, y, z: -0.035, floors: 3 });
  battlements(g, m, 0.682, 0.592, y + 1.045, 0, -0.035);
  for (const x of [-0.295, 0.295]) {
    box(g, m('graniteShade'), 0.057, 0.43, 0.075, x, y + 0.215, 0.227);
  }
  const peak = tower(g, m, { x: 0.235, z: -0.205, y, top: 1.235, radius: 0.108, rise: 0.245 });
  enclosure(g, m, y, 0.193, false, 0.347, 0.315);
  pennant(g, m, 0.235, peak - 0.015, -0.205, 0.166, 0.11);
  pathStones(g, m, 0, y, 0.292, 2);
}

function frostCastle(g, m) {
  const y = foundation(g, m, 0.838, 0.82, 0.081);
  stoneBlock(g, m, { w: 0.61, d: 0.57, h: 1.1, y, z: -0.015, floors: 3 });
  battlements(g, m, 0.625, 0.585, y + 1.1, 0, -0.015);
  pitchedRoof(g, m, { w: 0.48, d: 0.44, rise: 0.22, y: 1.23, z: -0.015, roof: 'royal', face: 'graniteLight' });
  for (const x of [-0.285, 0.285]) for (const z of [-0.245, 0.25]) {
    tower(g, m, { x, z, y, top: z < 0 ? 1.36 : 1.28, radius: 0.105, rise: z < 0 ? 0.29 : 0.26 });
  }
  enclosure(g, m, y, 0.252, false, 0.346, 0.315);
  doorway(g, m, 0, y, 0.335, 0.145, 0.255, false, true);
  pennant(g, m, -0.04, 1.449, -0.015, 0.233, 0.114);
  pathStones(g, m, 0, y, 0.374, 1);
}

function iceCitadel(g, m) {
  const y = moatFoundation(g, m);
  stoneBlock(g, m, { w: 0.605, d: 0.57, h: 1.16, y, z: -0.012, floors: 3 });
  battlements(g, m, 0.628, 0.593, y + 1.16, 0, -0.012, true);
  stoneBlock(g, m, { w: 0.38, d: 0.36, h: 0.28, y: 1.29, z: -0.012, royal: true, floors: 1, entry: false });
  pitchedRoof(g, m, { w: 0.423, d: 0.403, rise: 0.22, y: 1.57, z: -0.012, roof: 'cobalt', face: 'marble' });
  for (const x of [-0.268, 0.268]) for (const z of [-0.242, 0.234]) {
    tower(g, m, { x, z, y, top: z < 0 ? 1.51 : 1.24, radius: 0.09, rise: 0.26, royal: true });
  }
  enclosure(g, m, y, 0.275, true, 0.308, 0.29);
  doorway(g, m, 0, y, 0.309, 0.144, 0.274, true, true);
  for (const x of [-0.196, 0.196]) cloth(g, m, { x, y: 1.112, z: 0.296, width: 0.084, height: 0.22, draped: true, royal: true });
}

function crystalDome(g, m, x, y, z, radius = 0.225, height = 0.29) {
  const dome = place(g, x, y, z);
  cylinder(dome, m('marble'), radius * 0.84, 0.184, 0, -0.092, 0, 10);
  cylinder(dome, m('gold'), radius * 1.045, 0.024, 0, 0, 0, 10);
  const profile = [[0, 0], [radius, 0], [radius * 0.96, height * 0.3],
    [radius * 0.73, height * 0.68], [radius * 0.35, height * 0.93], [0, height]];
  const geometry = new THREE.LatheGeometry(profile.map(([r, yy]) => new THREE.Vector2(r, yy)), 10);
  mesh(dome, geometry, m('ice'), 0, 0.012, 0);
  cylinder(dome, m('gold'), 0.032, 0.032, 0, height + 0.025, 0, 8, 0.022);
  const crystal = mesh(dome, new THREE.OctahedronGeometry(0.038, 0), m('ice'), 0, height + 0.091, 0);
  crystal.scale.y = 1.55;
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    cylinder(dome, m('gold'), 0.008, 0.04, Math.cos(angle) * radius, 0.028, Math.sin(angle) * radius, 5, 0.003);
  }
}

function sanctuary(g, m) {
  const y = foundation(g, m, 0.846, 0.824, 0.096);
  slab(g, m('marbleShade'), 0.791, 0.763, y - 0.007, 0.115, 0, 0, 0.005, 0.033);
  stoneBlock(g, m, { w: 0.62, d: 0.575, h: 1.19, y: 0.115, z: -0.014, royal: true, floors: 3 });
  stoneBlock(g, m, { w: 0.42, d: 0.4, h: 0.277, y: 1.282, z: -0.014, royal: true, floors: 1, entry: false });
  box(g, m('cobalt'), 0.483, 0.06, 0.463, 0, 1.555, -0.014);
  box(g, m('gold'), 0.495, 0.018, 0.475, 0, 1.59, -0.014);
  for (const x of [-0.275, 0.275]) for (const z of [-0.245, 0.24]) {
    tower(g, m, { x, z, y: 0.115, top: z < 0 ? 1.405 : 1.16, radius: 0.097, rise: 0.25, royal: true, roof: 'cobalt' });
  }
  enclosure(g, m, 0.115, 0.285, true, 0.343, 0.31);
  doorway(g, m, 0, 0.115, 0.331, 0.15, 0.29, true, true);
  for (const x of [-0.188, 0.188]) cloth(g, m, { x, y: 1.109, z: 0.311, width: 0.086, height: 0.225, draped: true, royal: true });
  crystalDome(g, m, 0, 1.61, -0.014);
  pathStones(g, m, 0, y, 0.375, 1);
}

function grandCitadel(g, m) {
  const y = foundation(g, m, 0.848, 0.826, 0.116);
  slab(g, m('marbleShade'), 0.798, 0.778, y - 0.007, 0.133, 0, 0, 0.005, 0.035);
  stoneBlock(g, m, { w: 0.64, d: 0.59, h: 1.3, y: 0.133, z: -0.015, royal: true, floors: 4 });
  battlements(g, m, 0.661, 0.611, 1.426, 0, -0.015, true);
  stoneBlock(g, m, { w: 0.46, d: 0.43, h: 0.35, y: 1.407, z: -0.015, royal: true, floors: 1, entry: false });
  pitchedRoof(g, m, { w: 0.509, d: 0.475, rise: 0.15, y: 1.752, z: -0.015, roof: 'cobalt', face: 'marble' });
  stoneBlock(g, m, { w: 0.294, d: 0.278, h: 0.15, y: 1.706, z: -0.015, royal: true, floors: 1, entry: false });
  for (const x of [-0.278, 0.278]) for (const z of [-0.246, 0.246]) {
    tower(g, m, { x, z, y: 0.133, top: z < 0 ? 1.65 : 1.37, radius: 0.103, rise: 0.3, royal: true, roof: 'royal' });
    if (z < 0) pennant(g, m, x, 1.95, z, 0.202, 0.105, true);
  }
  enclosure(g, m, 0.133, 0.335, true, 0.347, 0.314);
  doorway(g, m, 0, 0.133, 0.335, 0.15, 0.337, true, true);
  for (const x of [-0.18, 0.18]) cloth(g, m, { x, y: 1.233, z: 0.316, width: 0.092, height: 0.25, draped: true, royal: true });
  const crown = place(g, 0, 0, -0.015);
  cylinder(crown, m('gold'), 0.119, 0.071, 0, 1.886, 0, 8, 0.104);
  cylinder(crown, m('cobalt'), 0.092, 0.067, 0, 1.94, 0, 8, 0.069);
  const crystal = mesh(crown, new THREE.OctahedronGeometry(1, 0), m('ice'), 0, 2.07, 0);
  crystal.scale.set(0.078, 0.195, 0.078);
  cylinder(crown, m('gold'), 0.082, 0.017, 0, 2.045, 0, 8);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    beam(crown, m('gold'), [Math.cos(angle) * 0.066, 1.94, Math.sin(angle) * 0.066],
      [Math.cos(angle) * 0.082, 2.045, Math.sin(angle) * 0.082], 0.008);
    beam(crown, m('gold'), [Math.cos(angle) * 0.082, 2.045, Math.sin(angle) * 0.082],
      [0, 2.271, 0], 0.008);
  }
  mesh(crown, new THREE.ConeGeometry(0.015, 0.06, 6), m('gold'), 0, 2.285, 0);
  pathStones(g, m, 0, y, 0.377, 1);
}

const BUILDERS = [camp, hut, cabin, farm, chalet, tradingPost, hotSpring, clockHall,
  watchFort, frostCastle, iceCitadel, sanctuary, grandCitadel];

export function createBuilding(level) {
  if (!Number.isInteger(level) || level < 1 || level > 13) {
    throw new RangeError('Nordic Frost building level must be an integer from 1 to 13.');
  }
  const group = new THREE.Group();
  group.name = NAMES[level - 1];
  group.userData = {
    level,
    assetName: NAMES[level - 1],
    tier: TIERS[level <= 3 ? 0 : level <= 6 ? 1 : level <= 9 ? 2 : 3],
    ambient: { time: 0, flags: [] },
  };
  BUILDERS[level - 1](group, palette());
  batchArchitecture(group);
  return group;
}

export function updateAnimations(models, deltaTime) {
  if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;
  for (const model of models) {
    const ambient = model?.userData?.ambient;
    if (!ambient || (!ambient.flags?.length && !ambient.marker && !ambient.fire)) continue;
    ambient.time += deltaTime;
    for (const flag of ambient.flags || []) waveCloth(flag, ambient.time);
    if (ambient.marker) ambient.marker.emissiveIntensity = 0.3 + Math.sin(ambient.time * 1.8) * 0.07;
    if (ambient.fire) ambient.fire.emissiveIntensity = 0.65 + Math.sin(ambient.time * 5) * 0.08;
  }
}
