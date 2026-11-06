// A very small PNG reader for the real-shell tests (no dependency): 8-bit RGB or RGBA, not interlaced, which is what the browser's screenshots are.
// Returns { width, height, data } with data as RGBA bytes, so a test can count pixels (for example, where the printed text meets the artwork).
import { inflateSync } from 'node:zlib';

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG file');
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let interlace = 0;
  const parts = [];
  while (off < buf.length) {
    const length = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      parts.push(body);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + length;
  }
  if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, colour type ${colour}, interlace ${interlace})`);
  const bpp = colour === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(parts));
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[dst + x - bpp] : 0;
      const b = y > 0 ? rows[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? rows[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rows[dst + x] = v & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += bpp) {
    data[i * 4] = rows[j];
    data[i * 4 + 1] = rows[j + 1];
    data[i * 4 + 2] = rows[j + 2];
    data[i * 4 + 3] = bpp === 4 ? rows[j + 3] : 255;
  }
  return { width, height, data };
}

/** How dark a pixel is (0 = black, 255 = white), the way a grey print would show it. */
export const luma = (data, i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
