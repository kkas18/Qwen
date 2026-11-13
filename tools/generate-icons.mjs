/*
  Siffer ikongenerator — kjøres med: node tools/generate-icons.mjs
  Genererer komplette PNG-ikoner, maskable-ikoner, Apple-touch-ikon og SVG-ikoner
  uten eksterne avhengigheter. Alle filene plasseres i /icons.
*/
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const clamp255 = v => Math.max(0, Math.min(255, Math.round(v)));
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const over = (dst, src) => {
  const a = src[3];
  if (a <= 0) return dst;
  return [src[0] * a + dst[0] * (1 - a), src[1] * a + dst[1] * (1 - a), src[2] * a + dst[2] * (1 - a)];
};

const BG1 = hex('#1B2029'), BG2 = hex('#0B0D10');
const EQ1 = hex('#FFB224'), EQ2 = hex('#FF7A2F');
const TILE = hex('#F3F5F9'), EQ_INK = hex('#2A1503');

function sdRound(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ax, ay) - r;
}

function pixel(nx, ny, maskable) {
  const dBg = sdRound(nx, ny, 0.5, 0.5, 0.5, 0.5, maskable ? 0 : 0.225);
  let rgb = mix(BG1, BG2, clamp((nx + ny) / 2));

  const glow = Math.exp(-((nx - 0.66) ** 2 + (ny - 0.66) ** 2) / (2 * 0.17 * 0.17));
  rgb = [
    rgb[0] + (EQ1[0] - rgb[0]) * glow * 0.14,
    rgb[1] + (EQ1[1] - rgb[1]) * glow * 0.10,
    rgb[2] + (EQ1[2] - rgb[2]) * glow * 0.10
  ];

  if (!maskable) {
    const edge = Math.max(0, 1 - Math.abs(dBg) / 0.01);
    rgb = rgb.map(v => v + 22 * edge);
  }

  const ts = 0.2375, gap = 0.045, x0 = 0.24, y0 = 0.24, r = 0.055;
  const tiles = [
    [x0, y0, false],
    [x0 + ts + gap, y0, false],
    [x0, y0 + ts + gap, false],
    [x0 + ts + gap, y0 + ts + gap, true]
  ];

  for (const [tx, ty, amber] of tiles) {
    const d = sdRound(nx, ny, tx + ts / 2, ty + ts / 2, ts / 2, ts / 2, r);
    if (d < 0) {
      if (amber) {
        const t = clamp(((nx + ny) - 2 * (x0 + ts + gap)) / (2 * ts));
        let c = mix(EQ1, EQ2, t);
        const sheen = Math.max(0, 1 - (ny - ty) / 0.03);
        c = c.map(v => v + 18 * sheen);
        rgb = over(rgb, [c[0], c[1], c[2], 1]);
      } else {
        rgb = over(rgb, [TILE[0], TILE[1], TILE[2], 0.27]);
        const sheen = Math.max(0, 1 - (ny - ty) / 0.02);
        rgb = rgb.map(v => v + 10 * sheen);
      }
    }
  }

  const cx = x0 + ts + gap + ts / 2, cy = y0 + ts + gap + ts / 2;
  for (const oy of [-0.033, 0.033]) {
    const d = sdRound(nx, ny, cx, cy + oy, 0.065, 0.013, 0.013);
    if (d < 0) rgb = over(rgb, [EQ_INK[0], EQ_INK[1], EQ_INK[2], 0.94]);
  }

  return [clamp255(rgb[0]), clamp255(rgb[1]), clamp255(rgb[2]), dBg < 0 ? 255 : 0];
}

function render(size, maskable = false) {
  const ss = size <= 64 ? 6 : size <= 256 ? 4 : 3;
  const S = size * ss;
  const hi = new Uint8Array(S * S * 4);
  let p = 0;
  for (let y = 0; y < S; y++) {
    const ny = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const c = pixel((x + 0.5) / S, ny, maskable);
      hi[p++] = c[0]; hi[p++] = c[1]; hi[p++] = c[2]; hi[p++] = c[3];
    }
  }

  const out = new Uint8Array(size * size * 4);
  let q = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < ss; dy++) {
        let idx = ((y * ss + dy) * S + x * ss) * 4;
        for (let dx = 0; dx < ss; dx++) {
          r += hi[idx++]; g += hi[idx++]; b += hi[idx++]; a += hi[idx++];
        }
      }
      const n = ss * ss;
      out[q++] = Math.round(r / n);
      out[q++] = Math.round(g / n);
      out[q++] = Math.round(b / n);
      out[q++] = Math.round(a / n);
    }
  }
  return encodePNG(size, size, out);
}

function svg(maskable = false) {
  const rx = maskable ? 0 : 115;
  const border = maskable ? '' : '<rect x="1" y="1" width="510" height="510" rx="114" fill="none" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="2"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1B2029"/><stop offset="1" stop-color="#0B0D10"/></linearGradient>
<linearGradient id="e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB224"/><stop offset="1" stop-color="#FF7A2F"/></linearGradient>
<radialGradient id="g" cx="0.66" cy="0.66" r="0.42"><stop offset="0" stop-color="#FFB224" stop-opacity="0.22"/><stop offset="1" stop-color="#FFB224" stop-opacity="0"/></radialGradient>
</defs>
<rect width="512" height="512" rx="${rx}" fill="url(#b)"/>
<rect width="512" height="512" rx="${rx}" fill="url(#g)"/>
<rect x="124" y="124" width="120" height="120" rx="28" fill="#F3F5F9" fill-opacity="0.27"/>
<rect x="268" y="124" width="120" height="120" rx="28" fill="#F3F5F9" fill-opacity="0.27"/>
<rect x="124" y="268" width="120" height="120" rx="28" fill="#F3F5F9" fill-opacity="0.27"/>
<rect x="268" y="268" width="120" height="120" rx="28" fill="url(#e)"/>
<rect x="296" y="309" width="64" height="14" rx="7" fill="#2A1503" fill-opacity="0.94"/>
<rect x="296" y="333" width="64" height="14" rx="7" fill="#2A1503" fill-opacity="0.94"/>
${border}
</svg>`;
}

const files = [];
for (const size of [16, 32, 48, 72, 96, 144, 192, 256, 384, 512, 1024]) {
  const name = `icon-${size}.png`;
  writeFileSync(path.join(OUT, name), render(size, false));
  files.push(name);
}
for (const size of [192, 512]) {
  const name = `maskable-${size}.png`;
  writeFileSync(path.join(OUT, name), render(size, true));
  files.push(name);
}
writeFileSync(path.join(OUT, 'apple-touch-icon.png'), render(180, true)); files.push('apple-touch-icon.png');
writeFileSync(path.join(OUT, 'favicon-16.png'), render(16, false)); files.push('favicon-16.png');
writeFileSync(path.join(OUT, 'favicon-32.png'), render(32, false)); files.push('favicon-32.png');
writeFileSync(path.join(OUT, 'icon.svg'), svg(false)); files.push('icon.svg');
writeFileSync(path.join(OUT, 'maskable.svg'), svg(true)); files.push('maskable.svg');

console.log(`Siffer: genererte ${files.length} ikonfiler i ${OUT}`);
for (const f of files) console.log(`  ${f}`);