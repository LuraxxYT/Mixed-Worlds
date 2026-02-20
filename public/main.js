import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { PointerLockControls } from "https://unpkg.com/three@0.164.1/examples/jsm/controls/PointerLockControls.js";
import { SimplexNoise } from "https://unpkg.com/three@0.164.1/examples/jsm/math/SimplexNoise.js";

const canvas = document.getElementById("scene");
const loginButton = document.getElementById("google-login");
const loginStatus = document.getElementById("login-status");
const loginCard = document.getElementById("login-card");
const infoCard = document.getElementById("info-card");
const playerLabel = document.getElementById("player-label");
const playerCount = document.getElementById("player-count");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#09101f");
scene.fog = new THREE.Fog("#0c1220", 35, 360);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const controls = new PointerLockControls(camera, renderer.domElement);

const ambient = new THREE.HemisphereLight(0x7fb2ff, 0x0f0b08, 0.65);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xdde8ff, 1.2);
sun.position.set(55, 120, 30);
sun.castShadow = true;
scene.add(sun);

const simplex = new SimplexNoise();
const terrain = buildTerrain(simplex);
const caves = buildCaves(simplex);
scene.add(terrain, caves.group);

const stars = makeStars();
scene.add(stars);

camera.position.set(0, 10, 12);
scene.add(controls.getObject());

const keys = { forward: false, back: false, left: false, right: false, up: false, down: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

const socket = io();
let me = null;
const others = new Map();

socket.on("world:state", (players) => {
  players.forEach((p) => {
    if (p.id !== socket.id) upsertOtherPlayer(p);
  });
  updatePlayerCount();
});

socket.on("player:joined", (player) => {
  upsertOtherPlayer(player);
  updatePlayerCount();
});

socket.on("player:moved", (player) => {
  if (!others.has(player.id)) {
    upsertOtherPlayer(player);
  }
  const entity = others.get(player.id);
  if (!entity) return;
  entity.group.position.set(player.x, player.y, player.z);
  entity.group.rotation.y = player.yaw;
});

socket.on("player:left", (playerId) => {
  const entity = others.get(playerId);
  if (!entity) return;
  scene.remove(entity.group);
  others.delete(playerId);
  updatePlayerCount();
});

loginButton.addEventListener("click", handleGoogleLogin);
window.addEventListener("resize", onResize);
window.addEventListener("keydown", onKeyChange(true));
window.addEventListener("keyup", onKeyChange(false));

document.body.addEventListener("click", () => {
  if (me) controls.lock();
});

requestAnimationFrame(tick);

async function handleGoogleLogin() {
  if (!window.firebase || !window.FIREBASE_CONFIG) {
    loginStatus.textContent = "Fehlende Firebase-Konfiguration. Siehe firebase-config.js.";
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await firebase.auth().signInWithPopup(provider);
    const user = result.user;

    me = { uid: user.uid, name: user.displayName || "Explorer" };
    playerLabel.textContent = `Du bist: ${me.name}`;
    loginCard.classList.add("hidden");
    infoCard.classList.remove("hidden");
    socket.emit("player:join", me);
    controls.lock();
  } catch (error) {
    loginStatus.textContent = `Login fehlgeschlagen: ${error.message}`;
  }
}

function buildTerrain(noise) {
  const geometry = new THREE.PlaneGeometry(600, 600, 280, 280);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position;
  const vector = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 1) {
    vector.fromBufferAttribute(pos, i);
    const h = layeredNoise(noise, vector.x * 0.006, vector.z * 0.006);
    pos.setY(i, h * 24 + 4);
  }

  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0x3d4f3c,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildCaves(noise) {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x121922, roughness: 0.92 });

  for (let i = 0; i < 8; i += 1) {
    const points = [];
    const baseX = (noise.noise(i * 2.1, 2.3) - 0.5) * 230;
    const baseZ = (noise.noise(4.4, i * 2.7) - 0.5) * 230;

    for (let p = 0; p < 7; p += 1) {
      points.push(
        new THREE.Vector3(
          baseX + (noise.noise(i, p * 1.7) - 0.5) * 45,
          -12 - p * 6 + noise.noise(p * 2.3, i * 1.2) * 2,
          baseZ + p * 18 + (noise.noise(i * 4.1, p) - 0.5) * 30
        )
      );
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 3.8, 18, false), rockMat);
    tube.castShadow = true;
    group.add(tube);

    const entrance = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 24, 16), rockMat);
    entrance.position.set(points[0].x, 0, points[0].z);
    group.add(entrance);
  }

  return { group };
}

function layeredNoise(noise, x, z) {
  return (
    noise.noise(x, z) * 0.55 +
    noise.noise(x * 2.1, z * 2.1) * 0.25 +
    noise.noise(x * 4.7, z * 4.7) * 0.2
  );
}

function makeStars() {
  const geometry = new THREE.BufferGeometry();
  const points = [];
  for (let i = 0; i < 1200; i += 1) {
    points.push((Math.random() - 0.5) * 900, Math.random() * 350 + 40, (Math.random() - 0.5) * 900);
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.PointsMaterial({ color: 0xd5e6ff, size: 0.8, sizeAttenuation: true });
  return new THREE.Points(geometry, material);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyChange(isDown) {
  return (event) => {
    if (event.code === "KeyW") keys.forward = isDown;
    if (event.code === "KeyS") keys.back = isDown;
    if (event.code === "KeyA") keys.left = isDown;
    if (event.code === "KeyD") keys.right = isDown;
    if (event.code === "Space") keys.up = isDown;
    if (event.code === "ShiftLeft") keys.down = isDown;
  };
}

function tick() {
  requestAnimationFrame(tick);

  const speed = controls.isLocked ? 0.3 : 0;
  direction.z = Number(keys.forward) - Number(keys.back);
  direction.x = Number(keys.right) - Number(keys.left);
  direction.y = Number(keys.up) - Number(keys.down);
  direction.normalize();

  velocity.x = THREE.MathUtils.lerp(velocity.x, direction.x * speed, 0.16);
  velocity.z = THREE.MathUtils.lerp(velocity.z, direction.z * speed, 0.16);
  velocity.y = THREE.MathUtils.lerp(velocity.y, direction.y * speed, 0.2);

  controls.moveRight(velocity.x);
  controls.moveForward(velocity.z);
  controls.getObject().position.y += velocity.y;

  const p = controls.getObject().position;
  const terrainHeight = layeredNoise(simplex, p.x * 0.006, p.z * 0.006) * 24 + 6.5;
  const nearEntrance = caves.group.children.some((mesh) => {
    const d = mesh.position.distanceTo(new THREE.Vector3(p.x, mesh.position.y, p.z));
    return d < 10;
  });

  if (!nearEntrance && p.y < terrainHeight) {
    p.y = terrainHeight;
  }

  if (me) {
    const yaw = controls.getObject().rotation.y;
    const pitch = camera.rotation.x;
    socket.emit("player:update", { x: p.x, y: p.y, z: p.z, yaw, pitch });
  }

  renderer.render(scene, camera);
}

function upsertOtherPlayer(player) {
  if (player.id === socket.id) return;
  let entity = others.get(player.id);
  if (!entity) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, 1.2, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0x8de6ff, roughness: 0.45 })
    );
    body.castShadow = true;
    group.add(body);

    const name = makeNameTag(player.name);
    name.position.y = 1.5;
    group.add(name);
    scene.add(group);

    entity = { group, nameTag: name };
    others.set(player.id, entity);
  }

  entity.group.position.set(player.x, player.y, player.z);
  entity.group.rotation.y = player.yaw;
}

function makeNameTag(text) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(5,10,20,0.7)";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#dff4ff";
  ctx.font = "26px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2);

  const texture = new THREE.CanvasTexture(c);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.5, 0.9, 1);
  return sprite;
}

function updatePlayerCount() {
  playerCount.textContent = String(others.size + (me ? 1 : 0));
}
