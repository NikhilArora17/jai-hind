import * as THREE from 'three';
import { noise } from './noise.js';

// Fixed canvas dimensions
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

let scene, camera, renderer;
const lines = [];
const lineCount = 30;
const segmentCount = 100;

// Span full width so it’s centered left/right
let sharedLeftX  = -CANVAS_WIDTH / 2;
let sharedRightX =  CANVAS_WIDTH / 2;
let maxDist = CANVAS_WIDTH / 0.5;

// === Option B: zone controls ===
const LEFT_SOLID   = 0.28;
const LEFT_BLEND   = 0.15;
const CENTER_WHITE = 0.02;
const RIGHT_BLEND  = 0.15;

const RIGHT_SOLID = Math.max(0, 1 - (LEFT_SOLID + LEFT_BLEND + CENTER_WHITE + RIGHT_BLEND));
console.log('RIGHT_SOLID =', RIGHT_SOLID.toFixed(2));

const Z_A = LEFT_SOLID;
const Z_B = Z_A + LEFT_BLEND;
const Z_C = Z_B + CENTER_WHITE;
const Z_D = Z_C + RIGHT_BLEND;

init();
animate();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.OrthographicCamera(
    -CANVAS_WIDTH / 2, CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2, -CANVAS_HEIGHT / 2,
    1, 1000
  );
  camera.position.z = 1;

  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('canvas'),
    antialias: true,
    alpha: true
  });
  renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
  renderer.autoClearColor = false;
  renderer.setClearColor(0x000000, 0.05);
}

function createCircleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function lerpColor(a, b, t) {
  return new THREE.Color().lerpColors(a, b, t);
}

// build lines once (materials/geometries)
for (let i = 0; i < lineCount; i++) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(segmentCount * 3);
  const colors = new Float32Array(segmentCount * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 3.0,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    map: createCircleTexture(),
    alphaTest: 0.1,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  points.userData.index = i;
  lines.push(points);
  scene.add(points);
}

function animate(time) {
  requestAnimationFrame(animate);
  const t = time * 0.00032;

  renderer.clear();

  const saffron = new THREE.Color('#FF9933');
  const white   = new THREE.Color('#FFFFFF');
  const green   = new THREE.Color('#138808');

  const baseY = 0; // true vertical center of the canvas

  lines.forEach((points, lineIndex) => {
    const geometry = points.geometry;
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;

    const amplitude = 200 + lineIndex * 23;
    const phaseShift = lineIndex * 0.2;
    const verticalOffset = Math.sin(t * 2 + phaseShift) * 12;
    const horizontalJitter = Math.sin(t * 1.5 + phaseShift) * 5;

    const p0 = new THREE.Vector3(sharedLeftX + horizontalJitter,  baseY + verticalOffset, 0);
    const p4 = new THREE.Vector3(sharedRightX + horizontalJitter, baseY + verticalOffset, 0);

    const midPoints = [];
    for (let j = 0; j < 3; j++) {
      const x = sharedLeftX + ((j + 1) / 4) * (sharedRightX - sharedLeftX) + horizontalJitter;
      const y = baseY + verticalOffset + noise.perlin2(j * (0.4 + lineIndex * 0.05), t + lineIndex * 0.07) * amplitude;
      midPoints.push(new THREE.Vector3(x, y, 0));
    }

    const curve = new THREE.CatmullRomCurve3([p0, ...midPoints, p4]);
    const curvePoints = curve.getPoints(segmentCount - 1);

    // --- AUTO-CENTER THIS LINE VERTICALLY ---
    let sumY = 0;
    for (let j = 0; j < segmentCount; j++) sumY += curvePoints[j].y;
    const avgY = sumY / segmentCount;        // current center of this line
    const shiftY = baseY - avgY;             // how much to move it to center

    for (let j = 0; j < segmentCount; j++) {
      const p = curvePoints[j];
      const idx = j * 3;

      positions[idx]     = p.x;
      positions[idx + 1] = p.y + shiftY;     // apply centering shift
      positions[idx + 2] = 0;

      const tColor = j / (segmentCount - 1);
      let color;
      if (tColor <= Z_A) {
        color = saffron.clone();
      } else if (tColor <= Z_B) {
        color = lerpColor(saffron, white, (tColor - Z_A) / (Z_B - Z_A));
      } else if (tColor <= Z_C) {
        color = white.clone();
      } else if (tColor <= Z_D) {
        color = lerpColor(white, green, (tColor - Z_C) / (Z_D - Z_C));
      } else {
        color = green.clone();
      }

      colors[idx]     = color.r;
      colors[idx + 1] = color.g;
      colors[idx + 2] = color.b;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;

    // opacity modulation (optional)
    const centerIndex = Math.floor(segmentCount / 2);
    const cx = curvePoints[centerIndex].x;
    const distToCenter = Math.abs(cx);
    const fade = 1.0 - Math.min(distToCenter / maxDist, 1);
    points.material.opacity = 0.9 + 0.35 * Math.sin(t * 4 + lineIndex * 0.4) * fade;
  });

  renderer.render(scene, camera);
}
