import * as THREE from 'three';

let shared = null;

export class ThumbnailRenderer {
  constructor() {
    if (shared) return shared;
    this.cache = new Map();
    this.disposed = false;
    this.warmHandle = null;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(180, 180);
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 30);
    this.camera.position.set(6, 6.06, 6);
    this.camera.lookAt(0, 0.5, 0);
    this.scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x8b9871, 0.85));
    const sun = new THREE.DirectionalLight(0xfff5e4, 1.35);
    sun.position.set(-3, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 20 });
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun);
    this.sun = sun;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.13 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.015;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    shared = this;
  }

  render(theme, level) {
    const key = `${theme.id}:${level}`;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.disposed) throw new Error('Thumbnail renderer is disposed.');
    const model = theme.module.createBuilding(level);
    this.scene.add(model);
    try {
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      bounds.setFromObject(model);
      this.camera.updateMatrixWorld(true);
      const projected = new THREE.Box3();
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y - 0.05, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse));
      }
      const size = projected.getSize(new THREE.Vector3());
      const target = projected.getCenter(new THREE.Vector3());
      const half = Math.max(size.x, size.y, 0.35) * 0.61;
      Object.assign(this.camera, { left: target.x - half, right: target.x + half,
        top: target.y + half, bottom: target.y - half });
      this.camera.updateProjectionMatrix();
      theme.module.updateAnimations([model], 0.016);
      this.renderer.render(this.scene, this.camera);
      const png = this.renderer.domElement.toDataURL('image/png');
      this.cache.set(key, png);
      return png;
    } finally {
      const geometries = new Set();
      const materials = new Set();
      model.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) for (const material of [object.material].flat()) materials.add(material);
      });
      model.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      this.renderer.renderLists.dispose();
    }
  }

  warm(entries) {
    if (window.cancelIdleCallback) cancelIdleCallback(this.warmHandle);
    else clearTimeout(this.warmHandle);
    const epoch = this.warmEpoch = (this.warmEpoch ?? 0) + 1;
    const queue = entries.filter(({ theme, level }) => !this.cache.has(`${theme.id}:${level}`));
    const next = () => {
      if (this.disposed || epoch !== this.warmEpoch || !queue.length) return;
      const { theme, level } = queue.shift();
      try { this.render(theme, level); } catch { /* Visible cards can display their text fallback. */ }
      if (queue.length) this.warmHandle = window.requestIdleCallback
        ? requestIdleCallback(next, { timeout: 800 }) : setTimeout(next, 60);
    };
    this.warmHandle = window.requestIdleCallback ? requestIdleCallback(next, { timeout: 800 }) : setTimeout(next, 60);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (window.cancelIdleCallback) cancelIdleCallback(this.warmHandle);
    else clearTimeout(this.warmHandle);
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.cache.clear();
    shared = null;
  }
}
