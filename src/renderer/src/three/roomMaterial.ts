/**
 * The material for the room itself (floor, deck, walls, ceiling).
 *
 * Instead of relying on three.js spotlights, each surface point adds up the
 * beams registered in projectors.ts: inside a beam's cone it's lit by the
 * beam's colour, shaped by the gobo pattern (and the prism's copies), fading
 * with distance and with the angle it hits the surface. Add the room's
 * ambient light, and you see exactly where gobos land, on the ceiling too.
 */
import * as THREE from 'three'
import { MAX_PROJECTORS, type Projector } from './projectors'
import { goboAtlas } from './gobos'

const N = MAX_PROJECTORS

export interface RoomUniforms {
  [key: string]: THREE.IUniform
}

/** One set of uniforms shared by every room surface, so they're updated once a frame. */
const shared = {
  ambient: { value: new THREE.Color(0.05, 0.05, 0.06) },
  count: { value: 0 },
  pPos: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
  pDir: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
  pRight: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
  pColor: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
  pPrism: { value: new Array<number>(N).fill(0) },
  gobos: { value: null as THREE.Texture | null }
}

export function getRoomAmbient(): THREE.Color {
  return shared.ambient.value.clone()
}

export function setRoomAmbient(color: THREE.Color): void {
  shared.ambient.value.copy(color)
}

export function setProjectors(list: Projector[], time: number): void {
  shared.count.value = list.length
  void time
  list.forEach((p, i) => {
    shared.pPos.value[i].set(p.position.x, p.position.y, p.position.z, p.tanHalf)
    shared.pDir.value[i].set(p.direction.x, p.direction.y, p.direction.z, p.goboCell)
    shared.pRight.value[i].set(p.right.x, p.right.y, p.right.z, p.goboTurn)
    shared.pColor.value[i].set(p.color[0], p.color[1], p.color[2], p.prismSpread)
    shared.pPrism.value[i] = p.prismTurn
  })
}

/**
 * `doubleSided`: for thin things seen from both sides (scrims, drapes, skirts);
 * either side is lit by the beams that reach it.
 */
export function createRoomMaterial(hex: number, options: { doubleSided?: boolean } = {}): THREE.ShaderMaterial {
  shared.gobos.value ??= goboAtlas()
  const base = new THREE.Color(hex)
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, ...shared, base: { value: base } },
    fog: true,
    side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      #define N ${N}
      uniform vec3 base;
      uniform vec3 ambient;
      uniform int count;
      uniform vec4 pPos[N];
      uniform vec4 pDir[N];
      uniform vec4 pRight[N];
      uniform vec4 pColor[N];
      uniform float pPrism[N];
      uniform sampler2D gobos;
      varying vec3 vWorld;
      varying vec3 vNormal;

      // The gobo pattern at a point of the beam's cross-section (uv in -1..1 is inside the beam).
      float pattern(vec2 uv, float cell, float turn) {
        float r = length(uv);
        if (r >= 1.0) return 0.0;
        float edge = 1.0 - smoothstep(0.82, 1.0, r);
        if (cell < 0.5) return edge;
        float c = cos(turn), s = sin(turn);
        vec2 q = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
        vec2 cellOrigin = vec2(mod(cell, 4.0), floor(cell / 4.0));
        vec2 t = (cellOrigin + (vec2(q.x, -q.y) * 0.5 + 0.5)) / vec2(4.0, 2.0);
        return texture2D(gobos, t).r * edge;
      }

      void main() {
        vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        // Ambient: a little brighter on surfaces facing up, like a room's own light.
        vec3 light = ambient * mix(0.6, 1.0, n.y * 0.5 + 0.5);
        for (int i = 0; i < N; i++) {
          if (i >= count) break;
          vec3 toPoint = vWorld - pPos[i].xyz;
          float d = length(toPoint);
          vec3 l = toPoint / max(d, 1e-4);
          vec3 dir = pDir[i].xyz;
          float along = dot(l, dir);
          if (along <= 0.05) continue;
          float facing = dot(n, -l);
          if (facing <= 0.0) continue;
          float tanHalf = pPos[i].w;
          vec3 right = pRight[i].xyz;
          vec3 up = cross(dir, right);
          vec2 uv = vec2(dot(l, right), dot(l, up)) / (along * tanHalf);
          float spread = pColor[i].w;
          float amount;
          if (spread > 0.0) {
            // A prism: the beam plus three copies around it, turning.
            amount = pattern(uv, pDir[i].w, pRight[i].w);
            for (int k = 0; k < 3; k++) {
              float a = float(k) / 3.0 * 6.2831853 + pPrism[i];
              amount += pattern(uv - vec2(-sin(a), cos(a)) * spread, pDir[i].w, pRight[i].w);
            }
            amount *= 0.6;
          } else {
            amount = pattern(uv, pDir[i].w, pRight[i].w);
          }
          if (amount <= 0.0) continue;
          // Same light through a wider beam covers more area, so each spot is dimmer;
          // and it falls off with the square of the distance, like real light.
          float spreadLoss = 0.05 / (tanHalf * tanHalf + 0.02);
          light += pColor[i].rgb * amount * facing * spreadLoss * 110.0 / (1.0 + d * d);
        }
        gl_FragColor = vec4(base * light, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `
  })
}
