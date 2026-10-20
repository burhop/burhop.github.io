import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { DRACOLoader } from '../vendor/three/DRACOLoader.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';

// Asset adapter. A replacement GLB does not need to know about the flight sim.
// After correction, models must face +Z, with +Y up. Dimensions are game units.
export const VEHICLE = Object.freeze({
  url: new URL('../assets/roadster.glb', import.meta.url).href,
  rotation: [0, 0, 0], length: 44, width: 18.8, height: 11.73,
  sideMountHeight: 3.5, liftMountSpread: 13,
});

export class VehicleRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 3000);
    this.camera.position.z = 1000;
    this.rig = new THREE.Group();
    this.yaw = new THREE.Group();
    this.rig.add(this.yaw);
    this.scene.add(this.rig);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.environment = pmrem.fromScene(environment, 0.04);
    this.scene.environment = this.environment.texture;
    environment.dispose();
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x606675, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(-100, 200, 300);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcbd8ff, 1.8);
    rim.position.set(100, 60, -100);
    this.scene.add(rim);
    this.jets = [this.makeJet(), this.makeJet(), this.makeJet(), this.makeJet()];
    this.ready = false;
  }

  async load(onProgress) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(new URL('../vendor/three/', import.meta.url).href);
    draco.setDecoderConfig({ type: 'wasm' });
    draco.setWorkerLimit(2);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    try {
      const gltf = await loader.loadAsync(VEHICLE.url, onProgress);
      const correction = new THREE.Group();
      correction.rotation.set(...VEHICLE.rotation);
      correction.add(gltf.scene);
      correction.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(correction);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = VEHICLE.length / Math.max(size.x, size.z);
      correction.scale.setScalar(scale);
      correction.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      correction.traverse(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material.envMapIntensity = 1;
          if (material.name === 'car_main_paint') {
            material.color.set('#c20d24');
            material.metalness = 0.65;
            material.roughness = 0.22;
            material.clearcoat = 1;
            material.clearcoatRoughness = 0.1;
          }
          if (/Glass_(mid_tint|Tint_max)/.test(material.name)) {
            material.color.set('#18212b');
            material.transmission = 0;
            material.metalness = 0.3;
            material.roughness = 0.12;
            material.transparent = false;
            material.opacity = 1;
          }
          if (/headlights/.test(material.name)) {
            material.emissive.set('#ffffff');
            material.emissiveIntensity = 1.2;
          }
          material.needsUpdate = true;
        }
      });
      this.yaw.add(correction);
      this.model = correction;
      this.ready = true;
    } finally {
      draco.dispose();
    }
  }

  makeJet() {
    const group = new THREE.Group();
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 1.4, 12),
      new THREE.MeshStandardMaterial({ color: 0x899097, metalness: 0.8, roughness: 0.3 }));
    group.add(nozzle);
    const flame = new THREE.Group();
    for (const [width, length, opacity] of [[1.2, 11, 0.85], [0.6, 7, 1]]) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-width, -0.7, 0), new THREE.Vector3(-width * 0.6, -length * 0.45, 0),
        new THREE.Vector3(0, -length, 0), new THREE.Vector3(width * 0.6, -length * 0.45, 0), new THREE.Vector3(width, -0.7, 0),
      ]);
      flame.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity })));
    }
    group.add(flame);
    group.userData.flame = flame;
    this.rig.add(group);
    return group;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.right = width;
    this.camera.top = height;
    this.camera.updateProjectionMatrix();
  }

  draw({ x, y, scale, turn, bank = 0, thrust, time, visible = true, showJets = true }) {
    this.rig.visible = visible && this.ready;
    this.rig.position.set(x, this.height - y, 0);
    this.rig.scale.setScalar(scale);
    this.rig.rotation.z = bank;
    const yaw = (1 - turn) * Math.PI / 2;
    this.yaw.rotation.y = yaw;
    // A slight elevated view reveals the hood and roof while the tyres meet the ground.
    this.yaw.rotation.x = .12;
    this.yaw.position.y = Math.sin(.12) * (VEHICLE.length / 2 * Math.cos(yaw) + VEHICLE.width / 2 * Math.sin(yaw));
    const sideExtent = Math.hypot(VEHICLE.length / 2 * Math.sin(yaw), VEHICLE.width / 2 * Math.cos(yaw)) * .98;
    this.yaw.updateMatrix();
    for (let i = 0; i < this.jets.length; i++) {
      const jet = this.jets[i];
      jet.visible = showJets;
      let active;
      if (i < 2) {
        const side = i ? 1 : -1;
        jet.position.set(side * 6.2 * Math.cos(yaw), 2.5, side * VEHICLE.liftMountSpread * Math.sin(yaw));
        jet.position.applyMatrix4(this.yaw.matrix);
        jet.rotation.z = 0;
        active = thrust.lift;
      } else {
        const side = i === 2 ? -1 : 1;
        jet.position.set(side * sideExtent, VEHICLE.sideMountHeight + this.yaw.position.y, VEHICLE.width / 2);
        jet.rotation.z = side * Math.PI / 2;
        active = i === 2 ? Math.max(0, thrust.side) : Math.max(0, -thrust.side);
      }
      jet.userData.flame.visible = active > 0;
      jet.userData.flame.scale.y = (0.8 + 0.25 * Math.sin(time * 49 + i * 3) + 0.15 * Math.sin(time * 83)) * active;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
