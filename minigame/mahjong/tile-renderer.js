import * as THREE from './vendor/three/three.module.min.js';
import {RoundedBoxGeometry} from './vendor/three/RoundedBoxGeometry.js';

const faces = Array.from({length:34}, (_, t) => t < 27
  ? ['Man', 'Pin', 'Sou'][Math.floor(t / 9)] + (t % 9 + 1)
  : ['Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun'][t - 27]);
const flip = new THREE.Matrix4().makeScale(1, -1, 1);

// The DOM owns layout, accessibility and input. Its existing table camera also
// drives these meshes, so changing the tile material cannot move the table.
export async function attachTileRenderer(stage, world) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, powerPreference:'low-power'});
  } catch { return; }
  const canvas = renderer.domElement;
  canvas.className = 'tile-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 100, 5000);
  camera.position.z = 1900;
  const table = new THREE.Group();
  table.rotation.x = -45 * Math.PI / 180;
  scene.add(table);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x526f69, 2.15));
  const key = new THREE.DirectionalLight(0xfff8e9, 2.5);
  key.position.set(-600, 900, 1200);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd8eeff, .65);
  fill.position.set(900, -300, 500);
  scene.add(fill);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;

  async function material(name) {
    const image = await new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = reject;
      img.src = new URL(`./assets/tiles/${name}.svg`, import.meta.url).href;
    });
    // Composite the unmodified standard SVG over the same ivory as the body.
    const surface = document.createElement('canvas');
    surface.width = 300; surface.height = 400;
    const ctx = surface.getContext('2d');
    ctx.fillStyle = '#faf9ef'; ctx.fillRect(0, 0, 300, 400);
    const inset = name === 'Back' ? 0 : 7;
    if (name === 'Back') {
      ctx.fillStyle = '#df993c'; ctx.fillRect(0, 0, 300, 400);
      ctx.fillStyle = '#f4b24f'; ctx.fillRect(0, 0, 300, 36);
    } else ctx.drawImage(image, inset, inset, 300 - inset * 2, 400 - inset * 2);
    const map = new THREE.CanvasTexture(surface);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    // Keep the standard ink colors readable from every seat; the surrounding
    // solid body receives the directional lighting and bevel highlights.
    return new THREE.MeshBasicMaterial({map, toneMapped:false});
  }
  let faceMaterials, backMaterial;
  try {
    [faceMaterials, backMaterial] = await Promise.all([Promise.all(faces.map(material)), material('Back')]);
  } catch { renderer.dispose(); return; }

  const ivory = new THREE.MeshPhysicalMaterial({color:0xf3f0df, roughness:.65, clearcoat:.08, clearcoatRoughness:.35});
  const red = new THREE.MeshStandardMaterial({color:0xd59638, roughness:.38});
  const highlightedFaces = faceMaterials.map(m => {const copy=m.clone();copy.color.set(0x9ed9ff);return copy;});
  const selectedIvory = ivory.clone(); selectedIvory.color.set(0x8ac9ee);
  const selectedBase = red.clone(); selectedBase.color.set(0x69b8e6);
  const geometries = new Map();
  function shape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const geometry = new THREE.ShapeGeometry(s, 5), uv = geometry.attributes.uv, pos = geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + .5, pos.getY(i) / h + .5);
    return geometry;
  }
  function geometry(w, h) {
    const key = `${w}:${h}`;
    if (!geometries.has(key)) {
      const depth = w * .55, seam = depth * .38, radius = w * .055;
      geometries.set(key, {depth, seam,
        body:new RoundedBoxGeometry(w, h, depth - seam + 1, 3, radius),
        base:new RoundedBoxGeometry(w - .25, h - .25, seam + 1.5, 3, Math.min(radius, seam / 2)),
        face:shape(w - radius * 1.75, h - radius * 1.75, radius * .65)});
    }
    return geometries.get(key);
  }

  // A soft contact shadow stays on the felt, including under upright hands.
  const shadowSurface = document.createElement('canvas');
  shadowSurface.width = shadowSurface.height = 128;
  const shadowContext = shadowSurface.getContext('2d');
  shadowContext.filter = 'blur(9px)'; shadowContext.fillStyle = '#001b20b8';
  shadowContext.beginPath(); shadowContext.roundRect(17, 17, 94, 94, 13); shadowContext.fill();
  const shadowMaterial = new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowSurface), transparent:true, depthWrite:false, opacity:.72});
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  let queued = false, failed = false, size = '', motionUntil = 0;
  let round = null, dealStarted=0;
  const pieces = new Map(), flights = new Map(), handSlides = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function origin(el) {
    let x = 0, y = 0;
    for (let node = el; node && node !== world; node = node.offsetParent) {
      x += node.offsetLeft; y += node.offsetTop;
    }
    return {x, y};
  }
  function cssMatrix(el, cache) {
    if (el === world) return new DOMMatrix();
    if (cache.has(el)) return cache.get(el);
    const parent = el.parentElement, a = origin(el), b = origin(parent);
    const style = getComputedStyle(el), pivot = style.transformOrigin.split(' ').map(parseFloat);
    const own = new DOMMatrix().translate(a.x - b.x + pivot[0], a.y - b.y + pivot[1], pivot[2] || 0)
      .multiply(new DOMMatrix(style.transform === 'none' ? undefined : style.transform))
      .translate(-pivot[0], -pivot[1], -(pivot[2] || 0));
    const result = cssMatrix(parent, cache).multiply(own);
    cache.set(el, result); return result;
  }
  function matrix(css) {
    return new THREE.Matrix4().makeTranslation(-world.clientWidth / 2, world.clientHeight / 2, 0)
      .multiply(flip).multiply(new THREE.Matrix4().fromArray(css.toFloat64Array())).multiply(flip);
  }
  function build(el) {
    const w = el.offsetWidth, h = el.offsetHeight, g = geometry(w, h), group = new THREE.Group();
    const body = new THREE.Mesh(g.body, ivory), base = new THREE.Mesh(g.base, red);
    body.position.set(w / 2, -h / 2, (g.depth + g.seam - 1) / 2);
    base.position.set(w / 2, -h / 2, (g.seam + 1.5) / 2);
    const front = new THREE.Mesh(g.face, el.dataset.tile === undefined ? backMaterial : faceMaterials[Number(el.dataset.tile)]);
    front.position.set(w / 2, -h / 2, g.depth + .15);
    const back = new THREE.Mesh(g.face, backMaterial);
    back.position.set(w / 2, -h / 2, -.15); back.rotation.y = Math.PI;
    group.add(base, body, front, back); group.matrixAutoUpdate = false;
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial.clone()); shadow.matrixAutoUpdate = false;
    shadow.renderOrder = -1; table.add(shadow, group);
    return {group, shadow, body, base, front, w, h, depth:g.depth};
  }
  function beginFlight(flight, piece) {
    const center = new THREE.Matrix4().makeTranslation(piece.w / 2, -piece.h / 2, piece.depth / 2);
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    if (flight.source.matrix) {
      const s = flight.source;
      s.matrix.clone().multiply(new THREE.Matrix4().makeScale(s.w / piece.w, s.h / piece.h, s.w / piece.w))
        .multiply(center).decompose(position, rotation, scale);
    } else {
      const rect = flight.source.rect;
      scale.set(rect.width / piece.w, rect.height / piece.h, rect.width / piece.w);
      const point = new THREE.Vector3((rect.x + rect.width / 2) / stage.clientWidth * 2 - 1,
        1 - (rect.y + rect.height / 2) / stage.clientHeight * 2, .5).unproject(camera);
      const ray = point.sub(camera.position);
      const z = -piece.depth / 2 * scale.z;
      position.copy(camera.position).addScaledVector(ray, (z - camera.position.z) / ray.z)
        .applyQuaternion(table.quaternion.clone().invert());
      rotation.copy(table.quaternion).invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 7 * Math.PI / 180));
    }
    flight.start = {position, rotation, scale};
    flight.started = performance.now();
  }
  function animateFlight(flight, piece, target) {
    if (!flight.start) beginFlight(flight, piece);
    const t = Math.min(1, (performance.now() - flight.started) / 240);
    if (t === 1) return false;
    // Zero speed and acceleration at both ends; no scale pop or hard bounce.
    const progress = t * t * t * (10 + t * (-15 + 6 * t));
    const endPosition = new THREE.Vector3(), endRotation = new THREE.Quaternion(), endScale = new THREE.Vector3();
    target.clone().multiply(new THREE.Matrix4().makeTranslation(piece.w / 2, -piece.h / 2, piece.depth / 2))
      .decompose(endPosition, endRotation, endScale);
    const position = flight.start.position.clone().lerp(endPosition, progress);
    const lift = Math.sin(Math.PI * progress);
    position.z += lift * (flight.source.rect ? 48 : 30);
    const rotation = flight.start.rotation.clone().slerp(endRotation, progress);
    const scale = flight.start.scale.clone().lerp(endScale, progress);
    piece.group.matrix.compose(position, rotation, scale)
      .multiply(new THREE.Matrix4().makeTranslation(-piece.w / 2, piece.h / 2, -piece.depth / 2));
    const shadowPosition = new THREE.Vector3(), shadowRotation = new THREE.Quaternion(), shadowScale = new THREE.Vector3();
    piece.shadow.matrix.decompose(shadowPosition, shadowRotation, shadowScale);
    shadowPosition.x += position.x - endPosition.x;
    shadowPosition.y += position.y - endPosition.y;
    shadowScale.multiplyScalar(1 + lift * .35);
    piece.shadow.matrix.compose(shadowPosition, shadowRotation, shadowScale);
    const contact = flight.source.rect ? THREE.MathUtils.smoothstep(progress, .35, 1) : 1;
    piece.shadow.material.opacity = .72 * (1 - lift * .6) * contact;
    piece.shadow.visible = contact > 0;
    return true;
  }
  function draw() {
    queued = false;
    if (failed) return;
    try {
      const w = stage.clientWidth, h = stage.clientHeight;
      const scale = stage.getBoundingClientRect().width / w;
      const nextSize = `${w}:${h}:${scale}:${devicePixelRatio}`;
      if (size !== nextSize) {
        size = nextSize;
        renderer.setPixelRatio(Math.min(2, devicePixelRatio) * scale);
        renderer.setSize(w, h, false);
        camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / 3800));
        camera.aspect = w / h;
        const boardY = parseFloat(stage.style.getPropertyValue('--board-y'));
        camera.setViewOffset(w, h, 0, h / 2 - boardY, w, h);
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();
      const cache = new Map(), active = new Set(world.querySelectorAll('.tile'));
      const presentKeys = new Set([...active].map(el => el.parentElement.dataset.motionKey));
      for (const key of flights.keys()) if (!presentKeys.has(key)) flights.delete(key);
      for (const [el, piece] of pieces) if (!active.has(el)) {
        table.remove(piece.group, piece.shadow); piece.shadow.material.dispose(); pieces.delete(el);
      }
      for (const el of active) {
        let piece = pieces.get(el);
        if (!piece) { piece = build(el); pieces.set(el, piece); }
        const css = cssMatrix(el, cache);
        const target = matrix(css);
        piece.group.matrix.copy(target);
        const dealElapsed=performance.now() - dealStarted;
        const dealIndex=[...el.parentElement.querySelectorAll('.tile')].indexOf(el);
        piece.group.visible = !world.classList.contains('dealing') || !el.closest('.opponent-hand') || dealElapsed >= Math.floor(dealIndex/4)*230;
        const hand = el.closest('.opponent-hand');
        const slide = hand && handSlides.get(hand.id);
        if (slide) {
          const index = [...hand.querySelectorAll('.tile')].indexOf(el);
          const start = slide.matrices[index];
          const t = Math.max(0, Math.min(1, (performance.now() - slide.started - 240) / 130));
          if (start && t < 1) {
            const a = new THREE.Vector3(), aq = new THREE.Quaternion(), as = new THREE.Vector3();
            const b = new THREE.Vector3(), bq = new THREE.Quaternion(), bs = new THREE.Vector3();
            start.decompose(a, aq, as); target.decompose(b, bq, bs);
            const k = t * t * (3 - 2 * t);
            piece.group.matrix.compose(a.lerp(b, k), aq.slerp(bq, k), as.lerp(bs, k));
          }
          if (t === 1) handSlides.delete(hand.id);
        }
        piece.shadow.visible = true; piece.shadow.material.opacity = .72;
        const highlighted = el.classList.contains('tile-match') || el.parentElement.classList.contains('latest');
        piece.body.material = el.classList.contains('tile-match') ? selectedIvory : ivory;
        piece.base.material = el.classList.contains('tile-match') ? selectedBase : red;
        if (el.dataset.tile !== undefined) piece.front.material = el.classList.contains('tile-match') ? highlightedFaces[Number(el.dataset.tile)] : faceMaterials[Number(el.dataset.tile)];
        const upright = el.closest('.opponent-hand') && !el.closest('.winner-revealed');
        const ground = upright ? css.translate(0, piece.h).rotateAxisAngle(1, 0, 0, 90) : css;
        const shadowH = upright ? piece.depth : piece.h;
        piece.shadow.matrix.copy(matrix(ground)).multiply(new THREE.Matrix4().makeTranslation(piece.w / 2 + 2, -shadowH / 2 - 3, .1))
          .multiply(new THREE.Matrix4().makeScale(piece.w + 17, shadowH + 17, 1));
        const cell = el.parentElement, key = cell.dataset.motionKey, flight = flights.get(key);
        const moving = flight && animateFlight(flight, piece, target);
        if (flight && !moving) flights.delete(key);
        if (cell.classList.contains('in-flight') !== !!moving) cell.classList.toggle('in-flight', !!moving);
      }
      renderer.render(scene, camera);
      stage.classList.add('solid-tiles');
      canvas.dataset.activeFlights = String(flights.size);
      if (flights.size || handSlides.size || world.classList.contains('dealing') || performance.now() < motionUntil) schedule();
    } catch (error) {
      failed = true; stage.classList.remove('solid-tiles'); canvas.remove(); renderer.dispose();
      console.warn('Tile rendering fallback', error);
    }
  }
  function schedule() { if (!queued && !failed) { queued = true; requestAnimationFrame(draw); } }
  const observer = new MutationObserver(records => {
    if (world.classList.contains('dealing') && !dealStarted) dealStarted=performance.now();
    if (!world.classList.contains('dealing')) dealStarted=0;
    if (records.some(r => r.type === 'childList')) motionUntil = performance.now() + 300;
    schedule();
  });
  observer.observe(world, {subtree:true, childList:true, attributes:true, attributeFilter:['class', 'style']});
  const resize = new ResizeObserver(schedule); resize.observe(stage); resize.observe(world);
  addEventListener('resize', schedule);
  reducedMotion.addEventListener('change', () => { flights.clear(); schedule(); });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); stage.classList.remove('solid-tiles'); failed = true;
  });
  stage.append(canvas);
  schedule();
  return {
    prepare(transitions, options) {
      if (options.round !== round) { round = options.round; flights.clear(); }
      if (reducedMotion.matches || !stage.classList.contains('solid-tiles')) return;
      const cache = new Map(), stageRect = stage.getBoundingClientRect(), stageScale = stageRect.width / stage.clientWidth;
      for (const move of transitions) {
        let source;
        if (move.player === 0) {
          const selected = stage.querySelector(`#hand button[data-index="${options.ownIndex}"]`);
          const el = selected?.dataset.tile === String(move.tile) ? selected
            : stage.querySelector(`#hand .drawn[data-tile="${move.tile}"]`) || stage.querySelector(`#hand button[data-tile="${move.tile}"]`);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          source = {rect:{x:(r.x - stageRect.x) / stageScale, y:(r.y - stageRect.y) / stageScale,
            width:r.width / stageScale, height:r.height / stageScale}};
        } else {
          const tiles = [...world.querySelectorAll(`#concealed-${move.player} .tile`)];
          const sourceIndex = move.tsumogiri ? tiles.length - 1 : Math.floor((tiles.length - 1) / 2);
          const el = tiles[sourceIndex];
          if (!move.tsumogiri) handSlides.set(`concealed-${move.player}`, {started:performance.now(), matrices:tiles.filter((_, i) => i !== sourceIndex).map(tile => matrix(cssMatrix(tile, cache)))});
          if (!el) continue;
          source = {matrix:matrix(cssMatrix(el, cache)), w:el.offsetWidth, h:el.offsetHeight};
        }
        flights.set(move.key, {source, started:null, start:null});
      }
      schedule();
    }
  };
}
