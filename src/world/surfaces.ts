// Procedural surface detail (brick, asphalt, paving, ground), computed in the
// shader from world position. No image files to download, no UVs required.
type Kind = 'brick' | 'asphalt' | 'pavement' | 'ground'

const HELPERS = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNrm;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
`

const BODY: Record<Kind, string> = {
  brick: /* glsl */ `
    if (abs(vWNrm.y) < 0.5) {
      // Walls: running-bond brickwork, grime near the ground, big soft stains
      vec2 t = normalize(vec2(-vWNrm.z, vWNrm.x));
      float u = dot(vWPos.xz, t);
      float v = vWPos.y;
      vec2 bs = vec2(0.66, 0.22);
      float row = floor(v / bs.y);
      float uu = u / bs.x + mod(row, 2.0) * 0.5;
      vec2 cell = vec2(floor(uu), row);
      vec2 f = vec2(fract(uu), fract(v / bs.y));
      float aa = max(fwidth(v / bs.y), fwidth(uu));
      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float mortar = 1.0 - smoothstep(0.05, 0.05 + aa * 1.5 + 0.01, edge);
      float detail = 1.0 - smoothstep(0.1, 0.38, aa); // fade pattern out with distance (stops shimmer)
      float tint = 0.86 + 0.28 * h21(cell);
      diffuseColor.rgb *= mix(1.0, tint * (1.0 - 0.38 * mortar), detail);
      diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 2.6, vWPos.y));
      diffuseColor.rgb *= 0.88 + 0.24 * vnoise(vec2(u * 0.18, v * 0.35));
    } else if (vWNrm.y > 0.5) {
      // Roofs: darker, mottled
      diffuseColor.rgb *= 0.5 + 0.12 * vnoise(vWPos.xz * 2.5) + 0.08 * vnoise(vWPos.xz * 0.4);
    }
  `,
  asphalt: /* glsl */ `
    {
      float fw = fwidth(vWPos.x) + fwidth(vWPos.z);
      float grain = h21(floor(vWPos.xz * 22.0)) * (1.0 - smoothstep(0.03, 0.09, fw));
      float blotch = vnoise(vWPos.xz * 0.25) * 0.55 + vnoise(vWPos.xz * 1.7) * 0.45;
      diffuseColor.rgb *= 0.78 + 0.34 * blotch + 0.1 * (grain - 0.5);
    }
  `,
  pavement: /* glsl */ `
    {
      vec2 g = vWPos.xz / 0.6;
      vec2 f = fract(g);
      float aa = max(fwidth(g.x), fwidth(g.y));
      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float line = 1.0 - smoothstep(0.03, 0.03 + aa * 1.5 + 0.01, edge);
      float detail = 1.0 - smoothstep(0.2, 0.6, aa);
      float tint = 0.9 + 0.2 * h21(floor(g));
      diffuseColor.rgb *= mix(1.0, tint * (1.0 - 0.22 * line), detail);
      diffuseColor.rgb *= 0.92 + 0.12 * vnoise(vWPos.xz * 0.3);
    }
  `,
  ground: /* glsl */ `
    {
      float n = vnoise(vWPos.xz * 0.02) * 0.6 + vnoise(vWPos.xz * 0.2) * 0.4;
      diffuseColor.rgb *= 0.82 + 0.3 * n;
      // Faint 4 m concrete slabs: gives the open ground scale and a sense of movement
      vec2 g = vWPos.xz / 4.0;
      vec2 f = fract(g);
      float aa = max(fwidth(g.x), fwidth(g.y));
      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float line = 1.0 - smoothstep(0.006, 0.006 + aa * 1.5 + 0.004, edge);
      float detail = 1.0 - smoothstep(0.08, 0.3, aa);
      diffuseColor.rgb *= 1.0 - 0.14 * line * detail;
      diffuseColor.rgb *= 1.0 + (h21(floor(g)) - 0.5) * 0.07 * detail;
    }
  `,
}

export function patchSurface(kind: Kind) {
  return (shader: { vertexShader: string; fragmentShader: string }) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
          'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' +
          'vWNrm = normalize(mat3(modelMatrix) * objectNormal);',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HELPERS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + BODY[kind])
  }
}

// Stable references (and explicit cache keys) so three.js compiles each variant once.
export const brickPatch = patchSurface('brick')
export const asphaltPatch = patchSurface('asphalt')
export const pavementPatch = patchSurface('pavement')
export const groundPatch = patchSurface('ground')
