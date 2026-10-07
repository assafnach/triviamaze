import type { QualityLevel, QualitySetting } from '@/types';

export function isTouchDevice(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

/** Picks a starting quality from coarse device signals. Runtime FPS monitoring refines it. */
export function detectQuality(): QualityLevel {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* ignore */
  }
  const software = /swiftshader|llvmpipe|software|basic render/.test(gpu);
  if (software) return 'low';
  if (isTouchDevice()) {
    if (memory <= 3 || cores <= 4) return 'low';
    if (/apple gpu|adreno \(tm\) (7|8)|mali-g(7|9)|xclipse/.test(gpu)) return 'medium';
    return 'low';
  }
  if (/intel|uhd|iris|mali|adreno/.test(gpu) || cores <= 4) return 'medium';
  // Recent dedicated desktop GPUs get everything.
  if (/rtx [2-9]\d{3}|rtx [a-z]?\d{4}|radeon rx [6-9]\d{3}|radeon pro w[6-9]|apple m[2-9] (pro|max|ultra)/.test(gpu) && cores >= 8) return 'ultra';
  return 'high';
}

export function resolveQuality(setting: QualitySetting): QualityLevel {
  return setting === 'auto' ? detectQuality() : setting;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
