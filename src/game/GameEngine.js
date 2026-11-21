import * as THREE from 'three';
import { formatNumber, getTheme, populationBonus } from '../config/themesConfig.js';
import { cellKey, cloneGrid, slideGrid, spawnBuilding, startingGrid } from './boardLogic.js';

const SLIDE_MS = 110;
const POP_MS = 180;
const DRAG_THRESHOLD = 24;
const easeOut = (t) => 1 - (1 - t) ** 3;
const popScale = (t) => t < 0.45 ? 1 + 0.22 * Math.sin(t / 0.45 * Math.PI / 2)
  : 1 + 0.22 * (1 - easeOut((t - 0.45) / 0.55));
const spawnScale = (t) => t < 0.7 ? 0.001 + 1.099 * easeOut(t / 0.7)
  : 1 + 0.1 * (1 - easeOut((t - 0.7) / 0.3));

function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of [object.material].flat()) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.removeFromParent();
}

export class GameEngine {
  constructor({ canvas, viewport, labelLayer, effectsLayer, state, sound, onNotice, onStatus, onGameOver,
    onVictory, confirmPowerup = async () => ({ ok: true }) }) {
    Object.assign(this, { canvas, viewport, labelLayer, effectsLayer, state, sound, onNotice, onStatus,
      onGameOver, onVictory, confirmPowerup });
    this.paused = false;
    this.theme = getTheme(state.data.activeThemeId);
    this.models = new Map();
    this.activeModels = new Set();
    this.ambientThemes = new Map();
    this.tweens = new Set();
    this.particles = [];
    this.badges = [];
    this.inputQueue = [];
    this.motion = null;
    this.swapMode = false;
    this.selectedCell = null;
    this.pendingThemeId = null;
    this.disposed = false;
    this.overAnnounced = false;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.projection = new THREE.Vector3();
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 80);
    this.camera.position.set(10, 10.12, 10);
    this.camera.lookAt(0, 0.12, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x8b9871, 0.85));
    const sun = new THREE.DirectionalLight(0xfff5e4, 1.35);
    sun.position.set(-3, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 22 });
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0002;
    this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.17 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.765;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
    this.particleGeometry = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    this.particleMaterials = [0xe9b85b, 0x88b575, 0xfff2cf, 0xe8a17a]
      .map((color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 }));

    if (!state.data.grid) state.startNewRun(startingGrid());
    this.rebuild();
    this.bindControls();
    this.onResize = () => this.resize();
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(viewport);
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.lastFrame = performance.now();
    this.frame = this.frame.bind(this);
    this.frameId = requestAnimationFrame(this.frame);
    queueMicrotask(() => this.checkGameOver());
  }

  addAmbient(root, theme = this.theme) {
    this.activeModels.add(root);
    this.ambientThemes.set(root, theme);
    this.scene.add(root);
    return root;
  }

  createBoard(theme = this.theme) {
    return this.addAmbient(theme.module.createBoard(), theme);
  }

  createModel(level, row, column, theme = this.theme) {
    const model = theme.module.createBuilding(level);
    model.position.set(column - 1.5, 0, row - 1.5);
    model.userData.cell = { row, column };
    const label = document.createElement('span');
    label.className = `tile-value${level >= 8 ? ' tile-value--royal' : ''}`;
    label.textContent = formatNumber(2 ** level);
    this.labelLayer.append(label);
    model.userData.label = label;
    this.addAmbient(model, theme);
    return model;
  }

  retire(root) {
    if (!root || !this.activeModels.has(root)) return;
    if (root.userData.scaleTween) this.tweens.delete(root.userData.scaleTween);
    root.userData.label?.remove();
    this.activeModels.delete(root);
    this.ambientThemes.delete(root);
    disposeObject(root);
  }

  rebuild(pop = false) {
    this.theme = getTheme(this.state.data.activeThemeId);
    this.board = this.createBoard();
    this.models.clear();
    this.state.data.grid.forEach((row, r) => row.forEach((level, c) => {
      if (!level) return;
      const model = this.createModel(level, r, c);
      this.models.set(cellKey(r, c), model);
      if (pop) this.scaleModel(model, 200, spawnScale, (r + c) * 20);
    }));
  }

  animate(duration, update, complete = () => {}, delay = 0) {
    const tween = { start: performance.now() + delay, duration, update, complete };
    this.tweens.add(tween);
    return tween;
  }

  scaleModel(model, duration = POP_MS, scale = popScale, delay = 0) {
    if (model.userData.scaleTween) this.tweens.delete(model.userData.scaleTween);
    model.scale.setScalar(scale(0));
    model.userData.scaleTween = this.animate(duration, (t) => model.scale.setScalar(scale(t)), () => {
      model.scale.setScalar(1);
      delete model.userData.scaleTween;
    }, delay);
  }

  resize() {
    const { width, height, left, bottom } = this.viewport.getBoundingClientRect();
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setViewport(left, window.innerHeight - bottom, this.width, this.height);
    this.renderer.setScissor(left, window.innerHeight - bottom, this.width, this.height);
    this.renderer.setScissorTest(true);
    this.fitCamera();
  }

  fitCamera() {
    if (!this.width || !this.board) return;
    let top = 0.85;
    for (const model of this.models.values()) {
      const bounds = new THREE.Box3().setFromObject(model);
      top = Math.max(top, bounds.max.y + 0.08);
    }
    this.camera.updateMatrixWorld(true);
    const projected = new THREE.Box3();
    for (const x of [-2.12, 2.12]) for (const y of [-0.84, top]) for (const z of [-2.12, 2.12]) {
      projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse));
    }
    const size = projected.getSize(new THREE.Vector3());
    const center = projected.getCenter(new THREE.Vector3());
    const aspect = this.width / this.height;
    const height = Math.max(size.y, size.x / aspect) * 1.075;
    const width = height * aspect;
    Object.assign(this.camera, {
      left: center.x - width / 2, right: center.x + width / 2,
      top: center.y + height / 2, bottom: center.y - height / 2,
    });
    this.camera.updateProjectionMatrix();
  }

  emitStatus() {
    this.canvas.classList.toggle('is-selecting', this.swapMode);
    this.onStatus?.({ busy: Boolean(this.motion), swapMode: this.swapMode, selectedCell: this.selectedCell, paused: this.paused });
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    if (this.paused) {
      this.finishGesture();
      this.inputQueue = [];
      if (this.motion !== 'powerup-request') this.cancelSwap();
    }
    this.emitStatus();
    if (!this.paused && !this.motion) this.drainQueue();
  }

  move(direction) {
    if (this.disposed || this.paused) return false;
    if (this.motion) {
      if (this.motion !== 'powerup-request' && this.inputQueue.length < 2) this.inputQueue.push(direction);
      return false;
    }
    if (this.state.data.gameOver) { this.checkGameOver(); return false; }
    this.cancelSwap();
    const plan = slideGrid(this.state.data.grid, direction);
    if (!plan.changed) return false;
    this.motion = 'slide';
    const { grid, spawn } = spawnBuilding(plan.grid);
    const result = this.state.recordMove(grid, plan.merges);
    this.emitStatus();
    this.sound.play('move');
    const moving = plan.trajectories.map((trajectory) => ({
      ...trajectory,
      model: this.models.get(cellKey(trajectory.from.row, trajectory.from.column)),
    }));
    this.animate(SLIDE_MS, (t) => {
      const eased = easeOut(t);
      for (const { model, from, to } of moving) {
        model.position.x = THREE.MathUtils.lerp(from.column, to.column, eased) - 1.5;
        model.position.z = THREE.MathUtils.lerp(from.row, to.row, eased) - 1.5;
      }
    }, () => {
      const updated = new Map();
      for (const { model, to, merged } of moving) {
        if (merged) this.retire(model);
        else {
          model.userData.cell = { ...to };
          updated.set(cellKey(to.row, to.column), model);
        }
      }
      for (const merge of result.rewards) {
        const model = this.createModel(merge.level, merge.row, merge.column);
        updated.set(cellKey(merge.row, merge.column), model);
        this.scaleModel(model);
        this.burst(merge.row, merge.column);
        this.floatPopulation(merge, model);
      }
      if (spawn) {
        const model = this.createModel(spawn.level, spawn.row, spawn.column);
        updated.set(cellKey(spawn.row, spawn.column), model);
        this.scaleModel(model, POP_MS, spawnScale);
      }
      this.models = updated;
      if (result.rewards.length) this.sound.play(result.rewards.some((merge) => merge.level >= 8) ? 'mergeHigh' : 'mergeLow');
      for (const theme of result.unlocked) {
        this.sound.play('themeUnlock');
        this.onNotice?.(`🎉 سرزمین جدید باز شد: ${theme.title} (${populationBonus(theme)})!`, 'unlock', theme.id);
      }
      if (result.rewards.some((merge) => merge.level >= 6)) this.fitCamera();
      this.motion = null;
      this.emitStatus();
      if (result.victory) this.onVictory?.();
      this.checkGameOver();
      this.drainQueue();
    });
    return true;
  }

  drainQueue() {
    if (this.paused) { this.inputQueue = []; return; }
    if (this.pendingThemeId) {
      const id = this.pendingThemeId;
      this.pendingThemeId = null;
      this.switchTheme(id);
    } else {
      while (this.inputQueue.length && !this.motion) this.move(this.inputQueue.shift());
    }
  }

  newRun() {
    if (this.motion === 'powerup-request') return false;
    this.clearMotion();
    this.cancelSwap();
    for (const root of [...this.activeModels]) this.retire(root);
    this.state.startNewRun(startingGrid());
    this.overAnnounced = false;
    this.rebuild(true);
    this.fitCamera();
    this.emitStatus();
    this.onGameOver?.(false);
    return true;
  }

  async authorizePowerup(type) {
    this.motion = 'powerup-request';
    this.inputQueue = [];
    this.emitStatus();
    try {
      const response = await this.confirmPowerup(type);
      if (this.disposed) return false;
      if (response?.ok) return true;
      this.onNotice?.(response?.error ?? 'این کمک فعلاً در دسترس نیست؛ دوباره تلاش کنید.');
    } catch { this.onNotice?.('ارتباط برقرار نشد؛ کمک شما مصرف نشده است.'); }
    this.motion = null;
    this.emitStatus();
    return false;
  }

  async undo() {
    if (this.paused || this.motion || !this.state.data.powerups.undo || !this.state.data.undoSnapshot) return false;
    if (!await this.authorizePowerup('undo')) return false;
    this.clearMotion();
    this.cancelSwap();
    if (!this.state.undo(true)) return false;
    for (const model of this.models.values()) this.retire(model);
    this.models.clear();
    this.state.data.grid.forEach((row, r) => row.forEach((level, c) => {
      if (!level) return;
      const model = this.createModel(level, r, c);
      this.models.set(cellKey(r, c), model);
      this.scaleModel(model, POP_MS, spawnScale);
    }));
    this.fitCamera();
    this.sound.play('powerup');
    this.onNotice?.('به قبل از آخرین حرکت برگشتیم.');
    this.checkGameOver();
    this.emitStatus();
    return true;
  }

  toggleSwap() {
    if (this.motion === 'powerup-request') return false;
    if (this.swapMode) { this.cancelSwap(); return false; }
    if (this.paused || this.motion || !this.state.data.powerups.swap || this.models.size < 2) return false;
    this.swapMode = true;
    this.emitStatus();
    return true;
  }

  cancelSwap() {
    if (this.motion === 'powerup-request' && this.swapMode) return;
    this.swapMode = false;
    this.selectedCell = null;
    if (this.selection) { this.retire(this.selection); this.selection = null; }
    this.emitStatus();
  }

  async selectCell(row, column) {
    if (this.paused || !this.swapMode || this.motion || !this.state.data.grid[row]?.[column]) return false;
    if (!this.selectedCell) {
      this.selectedCell = { row, column };
      this.selection = this.addAmbient(this.theme.module.createSelectionIndicator());
      this.selection.position.set(column - 1.5, 0, row - 1.5);
      this.onNotice?.('حالا سازهٔ دوم را انتخاب کن.');
      this.emitStatus();
      return true;
    }
    const first = this.selectedCell;
    if (first.row === row && first.column === column) {
      this.retire(this.selection);
      this.selection = null;
      this.selectedCell = null;
      this.emitStatus();
      return false;
    }
    const grid = cloneGrid(this.state.data.grid);
    [grid[first.row][first.column], grid[row][column]] = [grid[row][column], grid[first.row][first.column]];
    const a = this.models.get(cellKey(first.row, first.column));
    const b = this.models.get(cellKey(row, column));
    if (!await this.authorizePowerup('swap')) return false;
    this.motion = 'swap';
    this.cancelSwap();
    if (!this.state.usePowerup('swap', grid, true)) { this.motion = null; this.emitStatus(); return false; }
    this.emitStatus();
    this.animate(180, (t) => {
      const eased = easeOut(t);
      a.position.set(THREE.MathUtils.lerp(first.column, column, eased) - 1.5,
        Math.sin(t * Math.PI) * 0.35, THREE.MathUtils.lerp(first.row, row, eased) - 1.5);
      b.position.set(THREE.MathUtils.lerp(column, first.column, eased) - 1.5,
        Math.sin(t * Math.PI) * 0.15, THREE.MathUtils.lerp(row, first.row, eased) - 1.5);
    }, () => {
      a.position.y = b.position.y = 0;
      a.userData.cell = { row, column };
      b.userData.cell = { ...first };
      this.models.set(cellKey(row, column), a);
      this.models.set(cellKey(first.row, first.column), b);
      this.motion = null;
      this.sound.play('powerup');
      this.emitStatus();
      this.checkGameOver();
      this.drainQueue();
    });
    return true;
  }

  async sweeper() {
    if (this.paused || this.motion || !this.state.data.powerups.sweeper) return false;
    const lowModels = [...this.models.values()].filter((model) => model.userData.level <= 2);
    if (!lowModels.length) return false;
    this.cancelSwap();
    const grid = cloneGrid(this.state.data.grid);
    for (const model of lowModels) {
      const { row, column } = model.userData.cell;
      grid[row][column] = 0;
    }
    // A fully swept board receives one fresh seed, so the run can always continue.
    const seeded = grid.flat().every((level) => level === 0) ? spawnBuilding(grid) : { grid, spawn: null };
    if (!await this.authorizePowerup('sweeper')) return false;
    this.motion = 'sweeper';
    if (!this.state.usePowerup('sweeper', seeded.grid, true)) { this.motion = null; this.emitStatus(); return false; }
    this.emitStatus();
    for (const model of lowModels) {
      const { row, column } = model.userData.cell;
      this.burst(row, column);
      if (model.userData.scaleTween) this.tweens.delete(model.userData.scaleTween);
      this.animate(160, (t) => model.scale.setScalar(Math.max(0.001, 1 - easeOut(t))), () => {
        this.models.delete(cellKey(row, column));
        this.retire(model);
      });
    }
    this.animate(165, () => {}, () => {
      if (seeded.spawn) {
        const { row, column, level } = seeded.spawn;
        const model = this.createModel(level, row, column);
        this.models.set(cellKey(row, column), model);
        this.scaleModel(model, POP_MS, spawnScale);
      }
      this.motion = null;
      this.emitStatus();
      this.checkGameOver();
      this.drainQueue();
    });
    this.sound.play('powerup');
    this.onNotice?.('خانه‌های کوچک کنار رفتند؛ جا برای رشد باز شد.');
    return true;
  }

  switchTheme(themeId) {
    const nextTheme = getTheme(themeId);
    if (!nextTheme || !this.state.isThemeUnlocked(themeId)) {
      this.onNotice?.('برای سفر به این سرزمین، جمعیت بیشتری جمع کن.');
      return false;
    }
    if (this.motion) { this.pendingThemeId = themeId; return true; }
    if (themeId === this.theme.id) return true;
    this.cancelSwap();
    this.motion = 'theme';
    this.theme = nextTheme;
    this.state.setActiveTheme(themeId);
    this.emitStatus();
    const oldBoard = this.board;
    this.animate(120, (t) => oldBoard.scale.setScalar(1 - easeOut(t) * 0.06), () => {
      this.retire(oldBoard);
      this.board = this.createBoard();
      this.animate(160, (t) => this.board.scale.setScalar(0.94 + easeOut(t) * 0.06));
    });
    const previousModels = [...this.models.entries()];
    this.models.clear();
    for (const [key, old] of previousModels) {
      const { row, column } = old.userData.cell;
      const level = old.userData.level;
      if (old.userData.scaleTween) this.tweens.delete(old.userData.scaleTween);
      this.animate(120, (t) => old.scale.setScalar(Math.max(0.001, 1 - easeOut(t))), () => {
        this.retire(old);
        const model = this.createModel(level, row, column);
        this.models.set(key, model);
        this.scaleModel(model, 160, spawnScale);
      }, (row + column) * 30);
    }
    this.animate(470, () => {}, () => {
      this.motion = null;
      this.fitCamera();
      this.emitStatus();
      this.checkGameOver();
      this.drainQueue();
    });
    return true;
  }

  burst(row, column) {
    for (let index = 0; index < 8; index++) {
      const mesh = new THREE.Mesh(this.particleGeometry, this.particleMaterials[index % this.particleMaterials.length]);
      const angle = index / 8 * Math.PI * 2 + Math.random() * 0.3;
      const speed = 0.6 + Math.random() * 0.8;
      const start = new THREE.Vector3(column - 1.5, 0.23, row - 1.5);
      const velocity = new THREE.Vector3(Math.cos(angle) * speed, 1.5 + Math.random(), Math.sin(angle) * speed);
      mesh.position.copy(start);
      this.scene.add(mesh);
      this.particles.push({ mesh, start, velocity, born: performance.now(), duration: 560 });
    }
  }

  floatPopulation(reward, model) {
    const element = document.createElement('span');
    element.className = 'population-float';
    element.dir = 'ltr';
    element.textContent = `+${formatNumber(reward.population)} 👥`;
    this.effectsLayer.append(element);
    const top = new THREE.Box3().setFromObject(model).max.y;
    this.badges.push({ element, position: new THREE.Vector3(reward.column - 1.5, top + 0.22, reward.row - 1.5), born: performance.now() });
  }

  checkGameOver() {
    const over = this.state.data.gameOver;
    if (over && !this.overAnnounced) {
      this.overAnnounced = true;
      this.sound.play('gameOver');
      this.onGameOver?.(true);
    } else if (!over) {
      this.overAnnounced = false;
      this.onGameOver?.(false);
    }
  }

  pick(clientX, clientY) {
    const bounds = this.viewport.getBoundingClientRect();
    this.pointer.set((clientX - bounds.left) / bounds.width * 2 - 1,
      -(clientY - bounds.top) / bounds.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.models.values()], true);
    if (hits.length) {
      let object = hits[0].object;
      while (object && !object.userData.cell) object = object.parent;
      if (object?.userData.cell) this.selectCell(object.userData.cell.row, object.userData.cell.column);
    }
  }

  dragDirection(dx, dy) {
    this.camera.updateMatrixWorld(true);
    const origin = new THREE.Vector3(0, 0, 0).project(this.camera);
    const axisCol = new THREE.Vector3(1, 0, 0).project(this.camera).sub(origin);
    const axisRow = new THREE.Vector3(0, 0, 1).project(this.camera).sub(origin);
    // NDC is offset from the projected origin and scaled into actual screen pixels.
    // Screen Y grows downwards, so invert its sign before comparing drag vectors.
    const screenCol = new THREE.Vector2(axisCol.x * this.width, -axisCol.y * this.height).normalize();
    const screenRow = new THREE.Vector2(axisRow.x * this.width, -axisRow.y * this.height).normalize();
    const drag = new THREE.Vector2(dx, dy);
    const colProjection = drag.dot(screenCol);
    const rowProjection = drag.dot(screenRow);
    return Math.abs(colProjection) >= Math.abs(rowProjection)
      ? colProjection > 0 ? 'right' : 'left'
      : rowProjection > 0 ? 'down' : 'up';
  }

  finishGesture() {
    const gesture = this.gesture;
    this.gesture = null;
    this.canvas.classList.remove('is-dragging');
    if (gesture && this.canvas.hasPointerCapture(gesture.id)) this.canvas.releasePointerCapture(gesture.id);
  }

  bindControls() {
    const keys = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
    this.onKeyDown = (event) => {
      if (this.paused) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Escape') { this.cancelSwap(); return; }
      if (keys[event.code]) { event.preventDefault(); this.move(keys[event.code]); }
    };
    this.onPointerDown = (event) => {
      if (this.paused || !event.isPrimary || event.button !== 0 || this.gesture) return;
      event.preventDefault();
      this.canvas.focus({ preventScroll: true });
      this.gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, consumed: false };
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add('is-dragging');
    };
    const handleDrag = (event) => {
      const gesture = this.gesture;
      if (!gesture || gesture.id !== event.pointerId || gesture.consumed) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      gesture.consumed = true;
      this.move(this.dragDirection(dx, dy));
    };
    this.onPointerMove = (event) => {
      if (this.gesture?.id !== event.pointerId) return;
      event.preventDefault();
      handleDrag(event);
    };
    this.onPointerUp = (event) => {
      const gesture = this.gesture;
      if (gesture?.id !== event.pointerId) return;
      event.preventDefault();
      handleDrag(event);
      if (!gesture.consumed && this.swapMode) this.pick(event.clientX, event.clientY);
      this.finishGesture();
    };
    this.onPointerCancel = (event) => {
      if (event.pointerId === undefined || this.gesture?.id === event.pointerId) this.finishGesture();
    };
    this.onContextMenu = (event) => event.preventDefault();
    this.onContextLost = (event) => {
      event.preventDefault();
      this.onNotice?.('نمای سه‌بعدی متوقف شد؛ برای ادامه صفحه را تازه کن.');
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('blur', this.onPointerCancel);
    this.canvas.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    this.canvas.addEventListener('pointermove', this.onPointerMove, { passive: false });
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('lostpointercapture', this.onPointerCancel);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  frame(now) {
    if (this.disposed) return;
    const deltaTime = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    for (const tween of [...this.tweens]) {
      if (!this.tweens.has(tween) || now < tween.start) continue;
      const progress = Math.min(1, (now - tween.start) / tween.duration);
      tween.update(progress);
      if (progress === 1) { this.tweens.delete(tween); tween.complete(); }
    }
    const groups = new Map();
    for (const model of this.activeModels) {
      const theme = this.ambientThemes.get(model);
      if (!groups.has(theme)) groups.set(theme, []);
      groups.get(theme).push(model);
    }
    for (const [theme, activeModels] of groups) theme.module.updateAnimations(activeModels, deltaTime);

    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      const age = (now - particle.born) / 1000;
      const progress = age * 1000 / particle.duration;
      if (progress >= 1) { particle.mesh.removeFromParent(); this.particles.splice(index, 1); continue; }
      particle.mesh.position.copy(particle.start).addScaledVector(particle.velocity, age);
      particle.mesh.position.y -= 3.3 * age * age;
      particle.mesh.rotation.set(age * 6, age * 5, age * 3);
      particle.mesh.scale.setScalar(1 - progress);
    }
    this.scene.updateMatrixWorld();
    for (const model of this.activeModels) {
      const label = model.userData.label;
      if (!label) continue;
      this.projection.copy(model.position).add(new THREE.Vector3(0.31, 0.04, 0.31)).project(this.camera);
      const x = (this.projection.x + 1) * this.width / 2;
      const y = (1 - this.projection.y) * this.height / 2;
      label.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) scale(${Math.min(1, model.scale.x)})`;
    }
    for (let index = this.badges.length - 1; index >= 0; index--) {
      const badge = this.badges[index];
      const progress = (now - badge.born) / 900;
      if (progress >= 1) { badge.element.remove(); this.badges.splice(index, 1); continue; }
      this.projection.copy(badge.position);
      this.projection.y += easeOut(progress) * 0.8;
      this.projection.project(this.camera);
      badge.element.style.transform = `translate3d(${(this.projection.x + 1) * this.width / 2}px,${(1 - this.projection.y) * this.height / 2}px,0) translate(-50%,-50%)`;
      badge.element.style.opacity = String(Math.min(1, (1 - progress) * 3));
    }
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.frame);
  }

  clearMotion() {
    this.finishGesture();
    this.tweens.clear();
    this.inputQueue = [];
    this.pendingThemeId = null;
    this.motion = null;
    for (const particle of this.particles) particle.mesh.removeFromParent();
    this.particles = [];
    for (const badge of this.badges) badge.element.remove();
    this.badges = [];
    for (const model of this.activeModels) { model.scale.setScalar(1); delete model.userData.scaleTween; }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('blur', this.onPointerCancel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onPointerCancel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.clearMotion();
    for (const root of [...this.activeModels]) this.retire(root);
    disposeObject(this.ground);
    this.particleGeometry.dispose();
    for (const material of this.particleMaterials) material.dispose();
    this.renderer.dispose();
  }
}
