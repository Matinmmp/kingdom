import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const themeMeta = {
  id: 'marble_republic',
  name: 'Marble Republic',
  backgroundColor: '#dff2f8',
  accentColor: '#e06d53',
};

const COLORS = {
  meadow: '#8ab858', travertine: '#ede7dc', cliff: '#d6ccc2', cliffCap: '#e8d9c8',
  seaDeep: '#3a86ff', sea: '#00b4d8', seaLight: '#77d6de',
  sandstone: '#dfc8ae', marble: '#fff6e9', marbleShade: '#ddcbb9', ivory: '#f6e6cc',
  plaster: '#f1d7ac', cream: '#f9e7c5', timber: '#946049', cedar: '#bd8057',
  door: '#744a35', recess: '#26494d', shutter: '#4d857a', brick: '#bf684f',
  brownRoof: '#bc6c25', brownRidge: '#d28c49', peachRoof: '#e07a5f', peachRidge: '#eea287',
  orangeRoof: '#cc5828', orangeRidge: '#e5804c', terraRoof: '#cf664c', terraRidge: '#e8896a',
  redRoof: '#b74337', redRidge: '#df7253', peristyleRoof: '#a63738', peristyleRidge: '#cb6449',
  soil: '#855943', furrow: '#aa7751', sprout: '#9cb052', planter: '#9db97b',
  olive: '#8da65a', leaf: '#6d9a55', cypress: '#3b7853', youngCypress: '#568855',
  pool: '#149faf', azure: '#378fcb', glint: '#9bdfeb', dome: '#0077b6',
  gold: '#d5a04a', paleGold: '#ecc475', markerEdge: '#c78c2d', marker: '#ffd166',
  vermilion: '#c04750', imperial: '#a02f4c', cloth: '#ffffff',
};

const FINISHES = {
  pool: { roughness: 0.49 },
  azure: { roughness: 0.49 },
  dome: { roughness: 0.58 },
  gold: { roughness: 0.51, metalness: 0.12 },
  paleGold: { roughness: 0.55, metalness: 0.08 },
  marker: { emissive: COLORS.marker, emissiveIntensity: 0.58, roughness: 0.47 },
  cloth: { vertexColors: true, side: THREE.DoubleSide },
};

const ROOFS = {
  shack: ['brownRoof', 'brownRidge'],
  cottage: ['peachRoof', 'peachRidge'],
  orange: ['orangeRoof', 'orangeRidge'],
  villa: ['terraRoof', 'terraRidge'],
  red: ['redRoof', 'redRidge'],
  peristyle: ['peristyleRoof', 'peristyleRidge'],
  senate: ['redRoof', 'gold'],
  gold: ['gold', 'paleGold'],
  marble: ['marble', 'paleGold'],
};

function palette() {
  const materials = new Map();
  return (name) => {
    if (!materials.has(name)) {
      materials.set(name, new THREE.MeshStandardMaterial({
        name, color: COLORS[name], flatShading: true, roughness: 0.83, ...FINISHES[name],
      }));
    }
    return materials.get(name);
  };
}

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function place(parent, x, z, turn = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = turn;
  parent.add(group);
  return group;
}

// Architectural pieces use bottom elevations so stacked forms meet exactly.
function box(parent, material, w, h, d, x, bottom, z) {
  return mesh(parent, new THREE.BoxGeometry(w, h, d), material, x, bottom + h / 2, z);
}

function cylinder(parent, material, r, h, x, bottom, z, sides = 10, topRadius = r) {
  return mesh(parent, new THREE.CylinderGeometry(topRadius, r, h, sides),
    material, x, bottom + h / 2, z);
}

function lathe(parent, material, profile, x, bottom, z, sides = 10) {
  const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return mesh(parent, new THREE.LatheGeometry(points, sides), material, x, bottom, z);
}

function prism(points, depth) {
  const outline = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: false })
    .translate(0, 0, -depth / 2);
}

function beveledSlab(w, d, bottom, top, bevel, corner) {
  const positions = [];
  const indices = [];
  const rings = [[bottom, bevel], [bottom + bevel, 0], [top - bevel, 0], [top, bevel]];
  for (const [y, inset] of rings) {
    const x = w / 2 - inset;
    const z = d / 2 - inset;
    const cut = corner - inset * 0.42;
    for (const [px, pz] of [[-x + cut, -z], [-x, -z + cut], [-x, z - cut], [-x + cut, z],
      [x - cut, z], [x, z - cut], [x, -z + cut], [x - cut, -z]]) {
      positions.push(px, y, pz);
    }
  }
  for (let ring = 0; ring < 3; ring++) {
    for (let i = 0; i < 8; i++) {
      const a = ring * 8 + i;
      const b = ring * 8 + (i + 1) % 8;
      indices.push(a, b, b + 8, a, b + 8, a + 8);
    }
  }
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i, 24, 24 + i, 25 + i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function slab(parent, material, w, d, bottom, top, bevel, corner, x = 0, z = 0) {
  return mesh(parent, beveledSlab(w, d, bottom, top, bevel, corner), material, x, 0, z);
}

export function createBoard() {
  const board = new THREE.Group();
  board.name = 'Marble Republic Coast';
  const m = palette();
  slab(board, m('seaDeep'), 3.97, 3.97, -0.74, -0.59, 0.024, 0.14).name = 'Deep coastal water';
  slab(board, m('sea'), 4, 4, -0.618, -0.415, 0.027, 0.13).name = 'Turquoise coastal shelf';
  slab(board, m('seaLight'), 3.958, 3.958, -0.441, -0.397, 0.009, 0.121).name = 'Shallow waterline';
  slab(board, m('cliff'), 3.914, 3.914, -0.419, -0.125, 0.021, 0.108).name = 'Limestone cliff';
  slab(board, m('cliffCap'), 3.973, 3.973, -0.158, -0.063, 0.014, 0.088).name = 'Limestone ledge';

  const tileGeometry = beveledSlab(0.992, 0.992, -0.082, 0, 0.017, 0.037);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      const tile = mesh(board, tileGeometry, m((row + column) % 2 ? 'travertine' : 'meadow'),
        column - 1.5, 0, row - 1.5);
      tile.name = `tile-${row}-${column}`;
      tile.userData.gridCell = { row, column };
    }
  }
  return board;
}

export function createSelectionIndicator() {
  const indicator = new THREE.Group();
  indicator.name = 'Gold tile brackets';
  const m = palette();
  const angle = prism([[0.008, 0], [0.177, 0], [0.191, 0.013], [0.177, 0.027],
    [0.027, 0.027], [0.027, 0.177], [0.013, 0.191], [0, 0.177], [0, 0.008]], 0.01);
  for (let i = 0; i < 4; i++) {
    const corner = place(indicator, 0, 0, i * Math.PI / 2);
    // The full bracket is centered at 0.02 and its lit surface sits at 0.03.
    mesh(corner, angle, m('markerEdge'), -0.482, 0.015, -0.482).rotation.x = Math.PI / 2;
    mesh(corner, angle, m('marker'), -0.482, 0.025, -0.482).rotation.x = Math.PI / 2;
  }
  return indicator;
}

// Front façades face +Z. Rotated wings and side façades use the same profiles.
function gableRoof(parent, m, w, d, eaves, rise, roof, wall, overhang = 0.022) {
  const [tiles, ridge] = ROOFS[roof];
  const half = w / 2;
  const span = half + overhang;
  const peak = eaves + rise;
  const edge = eaves - (rise * overhang) / half;
  const thickness = 0.021;
  mesh(parent, prism([[-half, eaves], [half, eaves], [0, peak]], d), m(wall));
  mesh(parent, prism([[-span, edge], [0, peak], [span, edge], [span, edge + thickness],
    [0, peak + thickness], [-span, edge + thickness]], d + overhang * 2), m(tiles));
  const cap = mesh(parent, new THREE.CylinderGeometry(0.014, 0.014, d + overhang * 2 + 0.007, 8),
    m(ridge), 0, peak + thickness - 0.003, 0);
  cap.rotation.x = Math.PI / 2;
}

function house(parent, m, { w, d, base, eaves, rise, wall, roof, overhang }) {
  box(parent, m(wall), w, eaves - base, d, 0, base, 0);
  box(parent, m('sandstone'), w + 0.013, 0.018, d + 0.013, 0, base, 0);
  gableRoof(parent, m, w, d, eaves, rise, roof, wall, overhang);
}

function archCurve(x, spring, r) {
  const points = [];
  for (let i = 0; i <= 8; i++) {
    const angle = Math.PI * (1 - i / 8);
    points.push([x + r * Math.cos(angle), spring + r * Math.sin(angle)]);
  }
  return points;
}

function archPanel(parent, m, x, bottom, z, w, h, inset = 'recess') {
  const shape = (width, height) => [[-width / 2, 0],
    ...archCurve(0, height - width / 2, width / 2), [width / 2, 0]];
  const trim = Math.min(0.012, w * 0.13);
  mesh(parent, prism(shape(w, h), 0.012), m('ivory'), x, bottom, z);
  mesh(parent, prism(shape(w - trim * 2, h - trim * 2), 0.008), m(inset),
    x, bottom + trim, z + 0.007);
}

function windowPane(parent, m, x, bottom, z, w, h, shutters = false) {
  box(parent, m('ivory'), w + 0.022, h + 0.02, 0.016, x, bottom - 0.009, z);
  box(parent, m('recess'), w, h, 0.012, x, bottom, z + 0.009);
  if (shutters) {
    for (const side of [-1, 1]) {
      box(parent, m('shutter'), 0.022, h, 0.015, x + side * (w / 2 + 0.014), bottom, z + 0.008);
    }
  }
}

function arcade(parent, m, { w, h, d, bottom, z, count, radius, spring, stone = 'marble' }) {
  const outline = [[-w / 2, 0]];
  for (let i = 0; i < count; i++) {
    const x = w * ((i + 0.5) / count - 0.5);
    outline.push([x - radius, 0], ...archCurve(x, spring, radius), [x + radius, 0]);
  }
  outline.push([w / 2, 0], [w / 2, h], [-w / 2, h]);
  mesh(parent, prism(outline, d), m(stone), 0, bottom, z);
}

function column(parent, m, x, z, base, height, r) {
  const foot = r * 0.64;
  box(parent, m('marbleShade'), 2.48 * r, foot, 2.48 * r, x, base, z);
  cylinder(parent, m('marble'), r, height - foot * 2, x, base + foot, z, 10, r * 0.83);
  box(parent, m('marble'), 2.36 * r, foot, 2.36 * r, x, base + height - foot, z);
}

function roundTree(parent, m, x, y, z, r, color) {
  cylinder(parent, m('timber'), r * 0.17, r * 1.31, x, y, z, 6);
  const crown = mesh(parent, new THREE.IcosahedronGeometry(1, 1), m(color), x, y + r * 1.61, z);
  crown.scale.set(r, r * 0.92, r);
}

function cypress(parent, m, x, y, z, r, h, color = 'cypress') {
  cylinder(parent, m('timber'), r * 0.27, h * 0.27, x, y, z, 6);
  lathe(parent, m(color), [[0, 0], [r * 0.66, 0], [r, h * 0.16], [r * 0.84, h * 0.44],
    [r * 0.53, h * 0.70], [r * 0.22, h * 0.81], [0, h * 0.84]], x, y + h * 0.16, z, 7);
}

function steps(parent, m, w, base, top, back, depth, count) {
  const tread = depth / count;
  for (let i = 0; i < count; i++) {
    const height = (top - base) * (count - i) / count;
    box(parent, m('marble'), w, height, tread, 0, base, back + (i + 0.5) * tread);
  }
}

function fountain(parent, m, x, y, z, r) {
  lathe(parent, m('marble'), [[0, 0], [r * 0.85, 0], [r, 0.014], [r, 0.041],
    [r * 0.77, 0.041], [r * 0.73, 0.013], [0, 0.013]], x, y, z, 10);
  cylinder(parent, m('azure'), r * 0.753, 0.016, x, y + 0.013, z);
  cylinder(parent, m('marble'), r * 0.22, 0.034, x, y + 0.018, z, 8, r * 0.15);
  cylinder(parent, m('glint'), r * 0.109, 0.033, x, y + 0.047, z, 6, r * 0.052);
}

function pool(parent, m, { w, d, y, z, rim = 0.019, height = 0.037, liquid = 'pool' }) {
  box(parent, m('marbleShade'), w, 0.012, d, 0, y, z);
  for (const side of [-1, 1]) {
    box(parent, m('marble'), w, height, rim, 0, y, z + side * (d - rim) / 2);
    box(parent, m('marble'), rim, height, d - rim * 2, side * (w - rim) / 2, y, z);
  }
  box(parent, m(liquid), w - rim * 2, height - 0.02, d - rim * 2, 0, y + 0.012, z);
  box(parent, m('glint'), w * 0.27, 0.001, 0.008, w * 0.13, y + height - 0.0075, z + d * 0.1);
}

function terrace(parent, m, w, d, top) {
  slab(parent, m('marbleShade'), w, d, 0, 0.032, 0.007, 0.045);
  slab(parent, m('sandstone'), w - 0.029, d - 0.026, 0.032, top - 0.022, 0.008, 0.042);
  slab(parent, m('ivory'), w - 0.007, d - 0.007, top - 0.022, top, 0.006, 0.042);
}

function timberAndStone(root, m) {
  slab(root, m('timber'), 0.404, 0.095, 0, 0.037, 0.006, 0.013, -0.096, 0.009).rotation.y = 0.42;
  slab(root, m('cedar'), 0.35, 0.086, 0.037, 0.07, 0.005, 0.013, -0.105, 0.016).rotation.y = -0.98;
  const stones = [[0.171, -0.045, 0.071, 0.041, 0.059], [0.232, 0.093, 0.057, 0.035, 0.049],
    [0.107, 0.167, 0.046, 0.029, 0.043]];
  for (const [x, z, rx, ry, rz] of stones) {
    const stone = mesh(root, new THREE.SphereGeometry(1, 9, 5), m('marble'), x, ry, z);
    stone.scale.set(rx, ry, rz);
  }
}

function coastalShack(root, m) {
  slab(root, m('sandstone'), 0.422, 0.371, 0, 0.031, 0.008, 0.022, -0.017, -0.016);
  const hut = place(root, -0.022, -0.025);
  house(hut, m, { w: 0.36, d: 0.31, base: 0.031, eaves: 0.257, rise: 0.105, wall: 'plaster', roof: 'shack' });
  for (const x of [-0.169, 0.169]) box(hut, m('timber'), 0.029, 0.222, 0.025, x, 0.036, 0.153);
  box(hut, m('timber'), 0.358, 0.023, 0.024, 0, 0.238, 0.155);
  box(hut, m('timber'), 0.119, 0.158, 0.017, -0.061, 0.043, 0.155);
  box(hut, m('door'), 0.088, 0.143, 0.014, -0.061, 0.043, 0.166);
  windowPane(hut, m, 0.092, 0.128, 0.156, 0.063, 0.053);
  windowPane(place(hut, 0.181, 0, Math.PI / 2), m, 0.025, 0.119, 0, 0.057, 0.057);
  slab(root, m('travertine'), 0.124, 0.068, 0, 0.026, 0.005, 0.012, -0.083, 0.187);
}

function farmersCottage(root, m) {
  slab(root, m('sandstone'), 0.747, 0.632, 0, 0.038, 0.009, 0.041, -0.006, 0.014);
  const cottage = place(root, -0.126, -0.065);
  house(cottage, m, { w: 0.414, d: 0.405, base: 0.038, eaves: 0.318, rise: 0.13, wall: 'cream', roof: 'cottage' });
  archPanel(cottage, m, -0.078, 0.049, 0.205, 0.118, 0.157, 'door');
  windowPane(cottage, m, 0.095, 0.155, 0.205, 0.061, 0.069, true);
  windowPane(place(cottage, 0.208, 0, Math.PI / 2), m, 0.02, 0.145, 0, 0.064, 0.069, true);
  slab(root, m('soil'), 0.265, 0.36, 0.038, 0.069, 0.006, 0.019, 0.224, 0.088);
  for (const x of [0.144, 0.224, 0.304]) {
    slab(root, m('furrow'), 0.039, 0.309, 0.069, 0.086, 0.004, 0.008, x, 0.088);
  }
  for (const z of [-0.015, 0.086, 0.184]) {
    const sprout = mesh(root, new THREE.IcosahedronGeometry(1), m('sprout'), 0.224, 0.087, z);
    sprout.scale.set(0.022, 0.023, 0.016);
  }
  slab(root, m('travertine'), 0.124, 0.085, 0.038, 0.055, 0.004, 0.013, -0.204, 0.18);
}

function townhouse(root, m) {
  slab(root, m('sandstone'), 0.771, 0.769, 0, 0.041, 0.009, 0.036, 0, -0.006);
  const housefront = place(root, 0, -0.084);
  house(housefront, m, { w: 0.531, d: 0.531, base: 0.041, eaves: 0.413, rise: 0.146, wall: 'ivory', roof: 'orange' });
  box(housefront, m('marbleShade'), 0.54, 0.014, 0.54, 0, 0.218, 0);
  archPanel(housefront, m, 0, 0.056, 0.268, 0.134, 0.162, 'shutter');
  for (const x of [-0.139, 0.139]) windowPane(housefront, m, x, 0.257, 0.267, 0.065, 0.083, true);
  const side = place(housefront, 0.267, 0, Math.PI / 2);
  for (const x of [-0.124, 0.124]) windowPane(side, m, x, 0.263, 0, 0.061, 0.076);
  box(housefront, m('brick'), 0.065, 0.101, 0.07, 0.121, 0.488, -0.135);
  box(housefront, m('marbleShade'), 0.084, 0.022, 0.084, 0.121, 0.589, -0.135);
  roundTree(root, m, -0.274, 0.041, 0.261, 0.096, 'olive');
  roundTree(root, m, 0.271, 0.041, 0.263, 0.102, 'leaf');
  steps(root, m, 0.145, 0.041, 0.068, 0.182, 0.105, 2);
}

function archedVilla(root, m) {
  slab(root, m('sandstone'), 0.819, 0.787, 0, 0.052, 0.01, 0.044);
  house(place(root, 0, -0.114, Math.PI / 2), m, {
    w: 0.483, d: 0.664, base: 0.052, eaves: 0.488, rise: 0.16, wall: 'cream', roof: 'villa',
  });
  for (const x of [-0.214, 0, 0.214]) archPanel(root, m, x, 0.061, 0.13, 0.112, 0.177, 'shutter');
  arcade(root, m, { w: 0.663, h: 0.219, d: 0.061, bottom: 0.052, z: 0.201,
    count: 3, radius: 0.077, spring: 0.112 });
  slab(root, m('marble'), 0.684, 0.119, 0.271, 0.296, 0.005, 0.015, 0, 0.181);
  const side = place(root, 0.334, -0.116, Math.PI / 2);
  for (const x of [-0.107, 0.106]) windowPane(side, m, x, 0.263, 0, 0.062, 0.093, true);
  const dormer = place(root, -0.065, 0.025);
  box(dormer, m('ivory'), 0.164, 0.081, 0.126, 0, 0.514, 0);
  gableRoof(dormer, m, 0.164, 0.126, 0.595, 0.048, 'villa', 'ivory', 0.012);
  windowPane(dormer, m, 0, 0.548, 0.066, 0.063, 0.044);
  roundTree(root, m, -0.31, 0.052, 0.294, 0.074, 'olive');
  roundTree(root, m, 0.311, 0.052, 0.291, 0.078, 'leaf');
}

function lShapedEstate(root, m) {
  slab(root, m('sandstone'), 0.818, 0.455, 0, 0.059, 0.01, 0.039, 0, -0.177);
  slab(root, m('sandstone'), 0.423, 0.353, 0, 0.059, 0.01, 0.038, -0.183, 0.227);
  const main = place(root, 0, -0.185, Math.PI / 2);
  house(main, m, { w: 0.39, d: 0.742, base: 0.059, eaves: 0.576, rise: 0.19, wall: 'ivory', roof: 'orange' });
  archPanel(place(root, 0.373, -0.18, Math.PI / 2), m, 0, 0.302, 0, 0.119, 0.179);
  const wing = place(root, -0.183, 0.088);
  house(wing, m, { w: 0.366, d: 0.465, base: 0.059, eaves: 0.456, rise: 0.142, wall: 'cream', roof: 'villa' });
  archPanel(wing, m, 0, 0.132, 0.235, 0.143, 0.216, 'shutter');
  const wingSide = place(wing, 0.185, 0, Math.PI / 2);
  for (const x of [-0.116, 0.093]) windowPane(wingSide, m, x, 0.207, 0, 0.062, 0.095);
  const portico = place(root, 0.19, 0.104);
  slab(portico, m('ivory'), 0.362, 0.145, 0.018, 0.059, 0.007, 0.022, 0, -0.025);
  arcade(portico, m, { w: 0.35, h: 0.225, d: 0.041, bottom: 0.059, z: 0,
    count: 2, radius: 0.058, spring: 0.123 });
  slab(portico, m('terraRoof'), 0.368, 0.119, 0.284, 0.312, 0.006, 0.016, 0, -0.026);
  archPanel(portico, m, 0.087, 0.065, -0.092, 0.109, 0.165, 'door');
  slab(root, m('planter'), 0.339, 0.211, 0, 0.026, 0.005, 0.024, 0.202, 0.27);
  cypress(root, m, 0.316, 0.026, 0.228, 0.046, 0.343);
  cypress(root, m, 0.213, 0.026, 0.3, 0.038, 0.271, 'youngCypress');
}

function courtyardHall(root, m, { z, w, d, base, eaves, rise, roof, windowBottom }) {
  house(place(root, 0, z, Math.PI / 2), m, { w: d, d: w, base, eaves, rise, wall: 'ivory', roof });
  const front = z + d / 2 + 0.003;
  archPanel(root, m, 0, base + 0.014, front, 0.144, 0.237, 'shutter');
  for (const x of [-0.126, 0.126]) archPanel(root, m, x, windowBottom, front, 0.088, 0.158);
}

function atriumResidence(root, m) {
  const floor = 0.126;
  terrace(root, m, 0.824, 0.824, floor);
  courtyardHall(root, m, { z: -0.234, w: 0.742, d: 0.296, base: floor,
    eaves: 0.763, rise: 0.16, roof: 'villa', windowBottom: 0.422 });
  windowPane(place(root, 0.374, -0.234, Math.PI / 2), m, 0, 0.459, 0, 0.087, 0.112, true);
  house(place(root, -0.28, 0.065), m, { w: 0.189, d: 0.403, base: floor,
    eaves: 0.62, rise: 0.097, wall: 'cream', roof: 'villa', overhang: 0.018 });
  const right = place(root, 0.287, 0.065);
  house(right, m, { w: 0.171, d: 0.403, base: floor,
    eaves: 0.397, rise: 0.082, wall: 'cream', roof: 'villa', overhang: 0.021 });
  windowPane(place(right, 0.087, 0, Math.PI / 2), m, 0.022, 0.23, 0, 0.07, 0.087);
  arcade(root, m, { w: 0.743, h: 0.185, d: 0.06, bottom: floor, z: 0.218,
    count: 3, radius: 0.062, spring: 0.099 });
  gableRoof(place(root, 0, 0.218, Math.PI / 2), m, 0.067, 0.743, 0.311, 0.041, 'villa', 'ivory', 0.012);
  slab(root, m('planter'), 0.316, 0.123, floor, floor + 0.016, 0.004, 0.019, 0, 0.036);
  cypress(root, m, -0.105, floor + 0.016, 0.02, 0.036, 0.413);
  cypress(root, m, 0.099, floor + 0.016, 0.059, 0.036, 0.384, 'youngCypress');
  fountain(root, m, 0, floor, 0.337, 0.067);
}

function patricianPeristyle(root, m) {
  const floor = 0.174;
  terrace(root, m, 0.834, 0.832, floor);
  courtyardHall(root, m, { z: -0.229, w: 0.754, d: 0.306, base: floor,
    eaves: 0.857, rise: 0.187, roof: 'peristyle', windowBottom: 0.475 });
  const side = place(root, 0.379, -0.229, Math.PI / 2);
  for (const x of [-0.066, 0.066]) archPanel(side, m, x, 0.506, 0, 0.078, 0.174);
  house(place(root, -0.277, 0.05), m, { w: 0.194, d: 0.411, base: floor,
    eaves: 0.714, rise: 0.105, wall: 'ivory', roof: 'peristyle', overhang: 0.021 });
  for (const z of [-0.097, 0.018, 0.135, 0.235]) column(root, m, 0.312, z, floor, 0.281, 0.022);
  box(root, m('marble'), 0.148, 0.035, 0.377, 0.308, 0.455, 0.052);
  gableRoof(place(root, 0.308, 0.052), m, 0.146, 0.381, 0.49, 0.067, 'peristyle', 'ivory', 0.012);
  for (const x of [-0.316, -0.164, 0, 0.164]) column(root, m, x, 0.229, floor, 0.233, 0.023);
  box(root, m('marble'), 0.665, 0.031, 0.09, -0.035, 0.407, 0.229);
  slab(root, m('peristyleRoof'), 0.675, 0.101, 0.438, 0.458, 0.004, 0.015, -0.035, 0.229);
  slab(root, m('travertine'), 0.371, 0.25, floor, floor + 0.016, 0.004, 0.029, 0, 0.058);
  for (const x of [-0.198, 0.198]) fountain(root, m, x, floor, 0.336, 0.066);
}

function consulsPalace(root, m) {
  const floor = 0.187;
  terrace(root, m, 0.834, 0.834, floor);
  const front = 0.024;
  box(root, m('brick'), 0.752, 0.372, 0.399, 0, floor, -0.178);
  box(root, m('ivory'), 0.752, 0.433, 0.399, 0, 0.559, -0.178);
  box(root, m('marbleShade'), 0.77, 0.032, 0.414, 0, 0.542, -0.178);
  box(root, m('marble'), 0.773, 0.034, 0.417, 0, 0.951, -0.178);
  gableRoof(place(root, 0, -0.178, Math.PI / 2), m, 0.399, 0.752, 0.992, 0.211, 'red', 'ivory');
  for (const x of [-0.235, 0, 0.235]) {
    archPanel(root, m, x, x === 0 ? floor + 0.009 : 0.29, front, 0.137, x === 0 ? 0.291 : 0.188);
    windowPane(root, m, x, 0.674, front, 0.084, 0.151, true);
  }
  const side = place(root, 0.378, -0.178, Math.PI / 2);
  for (const x of [-0.098, 0.098]) {
    archPanel(side, m, x, 0.291, 0, 0.104, 0.172);
    windowPane(side, m, x, 0.688, 0, 0.074, 0.129);
  }
  pool(root, m, { w: 0.565, d: 0.248, y: floor, z: 0.226, rim: 0.028, height: 0.047 });
  for (const x of [-0.354, 0.354]) {
    box(root, m('brick'), 0.054, 0.104, 0.331, x, floor, 0.204);
    box(root, m('ivory'), 0.068, 0.023, 0.344, x, floor + 0.104, 0.204);
    box(root, m('brick'), 0.135, 0.063, 0.043, x * 0.88, floor, 0.366);
    box(root, m('ivory'), 0.145, 0.018, 0.05, x * 0.88, floor + 0.063, 0.366);
  }
}

function temple(parent, m, {
  w, d, base, eaves, rise, roof, columns, radius, doorWidth,
  porch = Math.min(d * 0.33, 0.142), gilt = false,
}) {
  const hallDepth = d - porch;
  const front = d / 2;
  const sill = Math.min(0.032, w * 0.055);
  box(parent, m('marble'), w - sill, eaves - base, hallDepth, 0, base, -porch / 2);
  box(parent, m('marbleShade'), w + 0.024, sill, d + 0.018, 0, base, 0);
  archPanel(parent, m, 0, base + sill, front - porch + 0.003, doorWidth, (eaves - base) * 0.58);
  box(parent, m('marble'), w + 0.018, sill, d + 0.008, 0, eaves - sill, 0);
  box(parent, m(gilt ? 'gold' : 'marbleShade'), w + 0.022, sill * 0.39, d + 0.012, 0, eaves - sill, 0);
  for (let i = 0; i < columns; i++) {
    const x = (w / 2 - radius * 1.58) * (2 * i / (columns - 1) - 1);
    column(parent, m, x, front - radius * 1.7, base + sill, eaves - base - sill * 2, radius);
  }
  gableRoof(parent, m, w, d + 0.008, eaves, rise, roof, 'marble', 0.018);
  const half = w / 2 - w * 0.095;
  mesh(parent, prism([[-half, eaves + rise * 0.18], [half, eaves + rise * 0.18],
    [0, eaves + rise * 0.83]], 0.009), m(gilt ? 'paleGold' : 'ivory'), 0, 0, front + 0.009);
}

function cypressBed(root, m, x, y, z, h, r = 0.041) {
  slab(root, m('planter'), r * 2.65, r * 2.44, y, y + 0.016, 0.004, 0.021, x, z);
  cypress(root, m, x, y + 0.016, z, r, h, x > 0 ? 'cypress' : 'youngCypress');
}

function marbleSenate(root, m) {
  const floor = 0.162;
  terrace(root, m, 0.833, 0.833, floor);
  slab(root, m('marbleShade'), 0.762, 0.668, floor, 0.201, 0.008, 0.031, 0, -0.065);
  slab(root, m('ivory'), 0.727, 0.647, 0.201, 0.227, 0.005, 0.024, 0, -0.063);
  temple(place(root, 0, -0.065), m, { w: 0.694, d: 0.633, base: 0.227,
    eaves: 1.142, rise: 0.175, roof: 'senate', columns: 4, radius: 0.037, doorWidth: 0.173, porch: 0.204 });
  const side = place(root, 0.333, -0.144, Math.PI / 2);
  for (const x of [-0.121, 0.121]) archPanel(side, m, x, 0.555, 0.005, 0.102, 0.241);
  steps(root, m, 0.377, floor, 0.253, 0.251, 0.143, 4);
  cypressBed(root, m, -0.312, floor, 0.329, 0.411, 0.052);
  cypressBed(root, m, 0.312, floor, 0.329, 0.452, 0.052);
}

function semicircle(parent, material, rx, rz, inset, bottom, top, z) {
  // The open diameter faces the entry. Each higher section removes more of the center.
  const arc = Array.from({ length: 17 }, (_, i) => {
    const a = i * Math.PI / 16;
    return [rx * Math.cos(a), rz * Math.sin(a)];
  });
  const inner = inset ? arc.map(([x, y]) => [x * inset, y * inset]).reverse() : [[0, 0]];
  const section = mesh(parent, prism([...arc, ...inner], top - bottom), material, 0, (top + bottom) / 2, z);
  section.rotation.x = -Math.PI / 2;
}

function amphitheater(root, m) {
  const floor = 0.274;
  const centerZ = 0.109;
  const arena = 0.753;
  const lastSeat = 1.259;
  terrace(root, m, 0.838, 0.835, floor);
  const theater = place(root, 0, 0, 0.23);
  semicircle(theater, m('marbleShade'), 0.394, 0.51, 0, floor, 0.721, centerZ);
  semicircle(theater, m('marble'), 0.403, 0.518, 0, 0.721, arena, centerZ);
  const tiers = [[0.27, arena, 0.874], [0.444, 0.874, 1.003],
    [0.61, 1.003, 1.131], [0.776, 1.131, lastSeat]];
  for (const [inner, bottom, top] of tiers) {
    semicircle(theater, m('marble'), 0.396, 0.51, inner, bottom, top - 0.021, centerZ);
    semicircle(theater, m('ivory'), 0.402, 0.519, inner - 0.025, top - 0.021, top, centerZ);
  }
  semicircle(theater, m('travertine'), 0.102, 0.133, 0, arena, arena + 0.006, centerZ);
  box(theater, m('marbleShade'), 0.711, 0.721 - floor, 0.184, 0, floor, centerZ + 0.092);
  box(theater, m('marble'), 0.724, arena - 0.721, 0.19, 0, 0.721, centerZ + 0.095);
  steps(theater, m, 0.328, floor, arena, 0.293, 0.099, 5);
  for (const x of [-0.251, 0.251]) archPanel(theater, m, x, 0.364, 0.295, 0.134, 0.259, 'sandstone');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 8;
    const b = (i + 1) * Math.PI / 8;
    const x0 = 0.387 * Math.cos(a), z0 = -0.499 * Math.sin(a);
    const x1 = 0.387 * Math.cos(b), z1 = -0.499 * Math.sin(b);
    const w = Math.hypot(x1 - x0, z1 - z0);
    const bay = place(theater, (x0 + x1) / 2, centerZ + (z0 + z1) / 2, Math.atan2(z0 - z1, x1 - x0));
    arcade(bay, m, { w: w + 0.005, h: 0.161, d: 0.033, bottom: lastSeat, z: 0,
      count: 1, radius: w * 0.31, spring: 0.08 });
    archPanel(bay, m, 0, 0.408, 0.021, w * 0.65, 0.23, 'sandstone');
  }
  semicircle(theater, m('marbleShade'), 0.404, 0.522, 0.897, 1.42, 1.452, centerZ);
  cypressBed(root, m, -0.35, floor, 0.33, 0.404, 0.047);
  cypressBed(root, m, 0.321, floor, 0.342, 0.408, 0.047);
  for (const x of [-0.337, 0.337]) cypressBed(root, m, x, floor, -0.307, 0.34, 0.041);
}

function banner(root, m, { x, z, base, top, w, h, color, phase }) {
  cylinder(root, m('marble'), 0.027, 0.024, x, base, z, 8);
  cylinder(root, m('gold'), 0.0075, top - base + 0.01, x, base + 0.024, z, 8);
  box(root, m('gold'), w + 0.029, 0.012, 0.014, x, top, z + 0.007);
  mesh(root, new THREE.IcosahedronGeometry(0.015, 0), m('paleGold'), x, top + 0.033, z);

  const columns = [0, 0.16, 0.33, 0.5, 0.67, 0.84, 1];
  const rows = [0, 0.2, 0.4, 0.6, 0.79, 0.89, 0.897, 0.946, 0.953, 1];
  const vertices = [], colors = [], uv = [], indices = [];
  const fabric = new THREE.Color(COLORS[color]);
  const hem = new THREE.Color(COLORS.paleGold);
  for (const v of rows) {
    for (const u of columns) {
      const notch = 0.13 * (1 - 2 * Math.abs(u - 0.5));
      vertices.push((u - 0.5) * w, h * (-v + notch * v ** 5), 0);
      uv.push(u, v);
      const dye = v > 0.89 && v < 0.953 ? hem : fabric;
      colors.push(dye.r, dye.g, dye.b);
    }
  }
  for (let row = 0; row < rows.length - 1; row++) {
    for (let i = 0; i < columns.length - 1; i++) {
      const a = row * columns.length + i;
      const b = a + columns.length;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const amplitude = h * 0.095;
  // Reserve all possible wind displacement in the local culling bounds.
  geometry.computeBoundingBox();
  geometry.boundingBox.min.z = -amplitude * 1.35;
  geometry.boundingBox.max.z = amplitude * 1.35;
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  const cloth = mesh(root, geometry, m('cloth'), x, top + 0.001, z + 0.011);
  cloth.userData.banner = true;
  const pose = { geometry, amplitude, phase };
  root.userData.banners ??= [];
  root.userData.banners.push(pose);
  waveBanner(pose, 0);
}

function waveBanner({ geometry, amplitude, phase }, elapsed) {
  const { position, uv } = geometry.attributes;
  const t = elapsed * 2.35 + phase;
  for (let i = 0; i < position.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    position.setZ(i, amplitude * v * (Math.sin(t + u * 3.2 - v * 3.1)
      + 0.35 * Math.sin(t - u * 4.6 + v * 2.1)));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function azurePantheon(root, m) {
  const floor = 0.205;
  const z = -0.078;
  terrace(root, m, 0.833, 0.833, floor);
  cylinder(root, m('marbleShade'), 0.37, 0.073, 0, floor, z, 16).scale.z = 0.88;
  cylinder(root, m('marble'), 0.34, 1.032, 0, 0.257, z, 16).scale.z = 0.88;
  cylinder(root, m('marbleShade'), 0.35, 0.021, 0, 1.106, z, 16).scale.z = 0.88;
  cylinder(root, m('marble'), 0.365, 0.063, 0, 1.25, z, 16).scale.z = 0.88;
  cylinder(root, m('gold'), 0.369, 0.033, 0, 1.299, z, 16).scale.z = 0.88;
  const domeProfile = [[0, 0]];
  for (let i = 0; i <= 7; i++) {
    const a = i * Math.PI / 14;
    domeProfile.push([0.359 * Math.cos(a), 0.446 * Math.sin(a)]);
  }
  lathe(root, m('dome'), domeProfile, 0, 1.331, z, 16).scale.z = 0.88;
  cylinder(root, m('gold'), 0.033, 0.036, 0, 1.764, z, 8, 0.024);
  mesh(root, new THREE.IcosahedronGeometry(0.026, 1), m('paleGold'), 0, 1.815, z);

  archPanel(root, m, 0, 0.278, 0.222, 0.165, 0.382);
  for (const a of [-0.93, 0.88, 1.61, 2.28]) {
    const radial = place(root, 0.341 * Math.sin(a), z + 0.3 * Math.cos(a), a);
    archPanel(radial, m, 0, 0.458, 0.005, 0.102, 0.26);
  }
  const porch = place(root, 0, 0.195);
  slab(porch, m('marble'), 0.46, 0.247, floor, 0.247, 0.007, 0.019);
  for (const x of [-0.171, -0.057, 0.057, 0.171]) column(porch, m, x, 0.083, 0.247, 0.557, 0.025);
  box(porch, m('marble'), 0.458, 0.06, 0.228, 0, 0.804, 0);
  gableRoof(porch, m, 0.438, 0.23, 0.864, 0.123, 'marble', 'marble', 0.013);
  box(porch, m('paleGold'), 0.443, 0.016, 0.017, 0, 0.829, 0.116);
  pool(root, m, { w: 0.45, d: 0.111, y: floor, z: 0.347, rim: 0.017, liquid: 'azure' });
  for (const x of [-0.297, 0.297]) {
    banner(root, m, { x, z: 0.283, base: floor, top: 0.698, w: 0.093, h: 0.185,
      color: 'vermilion', phase: x * 4 });
  }
}

function imperialAcropolis(root, m) {
  const floor = 0.216;
  terrace(root, m, 0.838, 0.837, floor);
  box(root, m('marble'), 0.748, 0.476, 0.521, 0, floor, -0.119);
  slab(root, m('marbleShade'), 0.791, 0.641, 0.683, 0.725, 0.008, 0.034, 0, -0.07);
  slab(root, m('ivory'), 0.796, 0.631, 0.725, 0.754, 0.006, 0.028, 0, -0.069);
  box(root, m('marble'), 0.637, 0.427, 0.461, 0, 0.754, -0.148);
  slab(root, m('marbleShade'), 0.662, 0.473, 1.16, 1.203, 0.007, 0.025, 0, -0.148);
  slab(root, m('ivory'), 0.65, 0.477, 1.203, 1.242, 0.007, 0.025, 0, -0.147);
  for (const x of [-0.326, -0.168, 0, 0.168, 0.326]) column(root, m, x, 0.208, floor, 0.471, 0.029);
  for (const x of [-0.222, 0, 0.222]) archPanel(root, m, x, floor + 0.042, 0.144, 0.126, 0.257);
  const side = place(root, 0.375, -0.119, Math.PI / 2);
  for (const x of [-0.162, 0, 0.162]) archPanel(side, m, x, 0.319, 0, 0.097, 0.22, 'marbleShade');
  steps(root, m, 0.264, 0.754, 1.233, 0.082, 0.16, 6);

  for (const x of [-0.256, 0.256]) {
    temple(place(root, x, 0.065), m, { w: 0.218, d: 0.24, base: 0.754,
      eaves: 1.209, rise: 0.081, roof: 'gold', columns: 2, radius: 0.019, doorWidth: 0.075, gilt: true });
  }
  temple(place(root, 0, -0.149), m, { w: 0.536, d: 0.452, base: 1.242,
    eaves: 1.976, rise: 0.169, roof: 'gold', columns: 4, radius: 0.029, doorWidth: 0.143, gilt: true });
  const upperSide = place(root, 0.256, -0.205, Math.PI / 2);
  for (const x of [-0.083, 0.081]) archPanel(upperSide, m, x, 1.463, 0.002, 0.09, 0.221);

  pool(root, m, { w: 0.354, d: 0.136, y: floor, z: 0.331, rim: 0.017, height: 0.037 });
  cylinder(root, m('marble'), 0.038, 0.044, 0, floor + 0.019, 0.331, 8, 0.027);
  cylinder(root, m('azure'), 0.027, 0.013, 0, floor + 0.062, 0.331, 8);
  cylinder(root, m('glint'), 0.011, 0.045, 0, floor + 0.073, 0.331, 7, 0.004);
  for (const x of [-0.308, 0.308]) {
    banner(root, m, { x, z: 0.296, base: floor, top: 0.768, w: 0.115, h: 0.237,
      color: 'imperial', phase: x * 5 });
  }
}

function batchArchitecture(root) {
  root.updateMatrixWorld(true);
  const batches = new Map();
  const pieces = [];
  root.traverse((object) => {
    if (!object.isMesh || object.userData.banner) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.deleteAttribute('uv');
    if (!batches.has(object.material)) batches.set(object.material, []);
    batches.get(object.material).push(geometry);
    pieces.push(object);
  });
  for (const object of pieces) object.geometry.dispose();
  // Banner meshes are direct children. Everything else is rebuilt as static material batches.
  for (const child of [...root.children]) if (!child.userData.banner) child.removeFromParent();
  for (const [material, geometries] of batches) {
    const combined = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
    if (geometries.length > 1) for (const geometry of geometries) geometry.dispose();
    mesh(root, combined, material).name = material.name;
  }
}

const LEVELS = [
  ['Timber & Stone', timberAndStone],
  ['Coastal Shack', coastalShack],
  ["Farmer's Cottage", farmersCottage],
  ['Townhouse', townhouse],
  ['Arched Villa', archedVilla],
  ['L-Shaped Estate', lShapedEstate],
  ['Atrium Residence', atriumResidence],
  ['Patrician Peristyle', patricianPeristyle],
  ["Consul's Palace", consulsPalace],
  ['Marble Senate', marbleSenate],
  ['Grand Amphitheater', amphitheater],
  ['Azure Dome Pantheon', azurePantheon],
  ['Imperial Acropolis', imperialAcropolis],
];

const TIERS = ['Coastal Origins', 'Villas & Estates', 'Patrician Quarter', 'Marble Landmarks'];

export function createBuilding(level) {
  if (!Number.isInteger(level) || level < 1 || level > LEVELS.length) {
    throw new RangeError('Marble Republic levels must be integers from 1 to 13.');
  }
  const [name, build] = LEVELS[level - 1];
  const root = new THREE.Group();
  root.name = name;
  root.userData = { level, assetName: name, tier: TIERS[Math.min(3, Math.floor((level - 1) / 3))] };
  build(root, palette());
  batchArchitecture(root);
  return root;
}

export function updateAnimations(models, deltaTime) {
  if (!(deltaTime > 0)) return;
  for (const model of models) {
    const { banners } = model.userData;
    if (!banners) continue;
    const elapsed = (model.userData.animationTime ?? 0) + deltaTime;
    model.userData.animationTime = elapsed;
    for (const cloth of banners) waveBanner(cloth, elapsed);
  }
}
