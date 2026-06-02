// ─── Minimal Zero-Dependency QR Code Generator (SVG output) ──────────────────
//
// Implements QR code generation per ISO/IEC 18004 for URI data.
// Supports byte mode, auto version selection, ECC level M, SVG output.

// GF(256) log/antilog tables (primitive polynomial 0x11D)
const LOG: number[] = new Array(256);
const ALOG: number[] = new Array(256);
(function initGF() {
  let v = 1;
  for (let i = 0; i < 255; i++) {
    LOG[v] = i;
    ALOG[i] = v;
    v = (v << 1) ^ (v >= 128 ? 0x11D : 0);
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return ALOG[(LOG[a] + LOG[b]) % 255];
}

function gfPolyMul(poly: number[], a: number): number[] {
  return poly.map(c => gfMul(c, a));
}

function gfPolyAdd(a: number[], b: number[]): number[] {
  const maxLen = Math.max(a.length, b.length);
  const result = new Array(maxLen).fill(0);
  for (let i = 0; i < a.length; i++) result[result.length - a.length + i] = a[i];
  for (let i = 0; i < b.length; i++) result[result.length - b.length + i] ^= b[i];
  return result;
}

function rsGeneratorPoly(eccCount: number): number[] {
  let poly = [1];
  for (let i = 0; i < eccCount; i++) {
    poly = gfPolyMul(poly, ALOG[i]);
    poly = gfPolyAdd(poly, [1, ALOG[i]]);
  }
  return poly;
}

function rsEncode(data: number[], eccCount: number): number[] {
  const gen = rsGeneratorPoly(eccCount);
  const padded = [...data, ...new Array(eccCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    if (padded[i] !== 0) {
      const factor = LOG[padded[i]];
      for (let j = 0; j < gen.length; j++) {
        padded[i + j] ^= ALOG[(factor + LOG[gen[j]]) % 255];
      }
    }
  }
  return padded.slice(data.length);
}

// Version data capacity for byte mode, ECC level M
// [version, totalDataCodewords, eccCodewordsPerBlock, blocks]
const VERSION_TABLE = [
  [1, 16, 10, 1], [2, 28, 16, 1], [3, 44, 26, 1], [4, 64, 18, 2],
  [5, 86, 24, 2], [6, 108, 16, 4], [7, 124, 18, 4], [8, 154, 22, 4],
  [9, 172, 22, 4], [10, 192, 26, 4], [11, 224, 30, 4], [12, 260, 22, 6],
  [13, 288, 22, 6], [14, 320, 24, 6], [15, 360, 24, 6], [16, 408, 28, 6],
  [17, 448, 28, 7], [18, 504, 26, 8], [19, 546, 26, 8], [20, 600, 28, 9],
  [21, 644, 28, 9], [22, 690, 28, 10], [23, 750, 30, 10], [24, 810, 30, 11],
  [25, 870, 30, 11], [26, 952, 32, 12], [27, 1008, 30, 13], [28, 1080, 30, 14],
  [29, 1152, 30, 15], [30, 1248, 30, 16], [31, 1312, 30, 17], [32, 1376, 30, 18],
  [33, 1440, 30, 19], [34, 1536, 30, 20], [35, 1600, 30, 21], [36, 1664, 30, 22],
  [37, 1728, 30, 23], [38, 1792, 30, 24], [39, 1856, 30, 25], [40, 1920, 30, 26],
];

function getVersionInfo(dataLen: number): { ver: number; eccCount: number; blocks: number; totalData: number } {
  for (const [ver, totalData, eccCount, blocks] of VERSION_TABLE) {
    if (totalData >= dataLen + 3) return { ver, eccCount, blocks, totalData };
  }
  return { ver: 40, eccCount: 30, blocks: 26, totalData: 1920 };
}

// Format info for ECC level M, masks 0-7
const FORMAT_INFO = [0x5C37, 0x5C26, 0x5C15, 0x5C04, 0x5D77, 0x5D46, 0x5D75, 0x5D44];

function isFunctionPattern(ver: number, row: number, col: number): boolean {
  const size = ver * 4 + 17;
  // Finder patterns (7x7 at corners)
  if ((row < 9 && col < 9) || (row < 9 && col >= size - 8) || (row >= size - 8 && col < 9)) return true;
  // Timing patterns
  if (row === 6 || col === 6) return true;
  // Alignment patterns
  if (ver >= 2) {
    const positions = getAlignmentPositions(ver);
    for (const r of positions) {
      for (const c of positions) {
        if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
        if (Math.abs(row - r) <= 2 && Math.abs(col - c) <= 2) return true;
      }
    }
  }
  // Format info areas
  if ((row < 9 && (col === 8 || col === size - 1)) || (col < 9 && (row === 8 || row === size - 1))) return true;
  // Version info (version >= 7)
  if (ver >= 7 && row >= size - 11 && row <= size - 9 && col >= 0 && col <= 5) return true;
  if (ver >= 7 && row >= 0 && row <= 5 && col >= size - 11 && col <= size - 9) return true;
  return false;
}

function getAlignmentPositions(ver: number): number[] {
  if (ver === 1) return [6];
  if (ver === 2) return [6, 18];
  if (ver === 3) return [6, 22];
  if (ver === 4) return [6, 26];
  if (ver === 5) return [6, 30];
  if (ver === 6) return [6, 34];
  if (ver === 7) return [6, 22, 38];
  if (ver === 8) return [6, 24, 42];
  if (ver === 9) return [6, 26, 46];
  if (ver === 10) return [6, 28, 50];
  if (ver === 11) return [6, 30, 54];
  if (ver === 12) return [6, 32, 58];
  if (ver === 13) return [6, 34, 62];
  if (ver === 14) return [6, 26, 46, 66];
  if (ver === 15) return [6, 26, 48, 70];
  if (ver === 16) return [6, 26, 50, 74];
  if (ver === 17) return [6, 30, 54, 78];
  if (ver === 18) return [6, 30, 56, 82];
  if (ver === 19) return [6, 30, 58, 86];
  if (ver === 20) return [6, 34, 62, 90];
  if (ver === 21) return [6, 28, 50, 72, 94];
  if (ver === 22) return [6, 26, 50, 74, 98];
  if (ver === 23) return [6, 30, 54, 78, 102];
  if (ver === 24) return [6, 28, 54, 80, 106];
  if (ver === 25) return [6, 32, 58, 84, 110];
  if (ver === 26) return [6, 30, 58, 86, 114];
  if (ver === 27) return [6, 34, 62, 90, 118];
  if (ver === 28) return [6, 26, 50, 74, 98, 122];
  if (ver === 29) return [6, 30, 54, 78, 102, 126];
  if (ver === 30) return [6, 26, 52, 78, 104, 130];
  if (ver === 31) return [6, 30, 56, 82, 108, 134];
  if (ver === 32) return [6, 34, 60, 86, 112, 138];
  if (ver === 33) return [6, 30, 58, 86, 114, 142];
  if (ver === 34) return [6, 34, 62, 90, 118, 146];
  if (ver === 35) return [6, 30, 54, 78, 102, 126, 150];
  if (ver === 36) return [6, 24, 50, 76, 102, 128, 154];
  if (ver === 37) return [6, 28, 54, 80, 106, 132, 158];
  if (ver === 38) return [6, 32, 58, 84, 110, 136, 162];
  if (ver === 39) return [6, 26, 54, 82, 110, 138, 166];
  if (ver === 40) return [6, 30, 58, 86, 114, 142, 170];
  return [6];
}

function evaluatePenalty(matrix: number[][]): number {
  const size = matrix.length;
  let score = 0;
  // Adjacent modules in rows
  for (let r = 0; r < size; r++) {
    let count = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) {
        count++;
      } else {
        if (count >= 5) score += count - 2;
        count = 1;
      }
    }
    if (count >= 5) score += count - 2;
  }
  // Adjacent modules in columns
  for (let c = 0; c < size; c++) {
    let count = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r][c] === matrix[r - 1][c]) {
        count++;
      } else {
        if (count >= 5) score += count - 2;
        count = 1;
      }
    }
    if (count >= 5) score += count - 2;
  }
  // 2x2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      if (matrix[r][c] === matrix[r][c + 1] && matrix[r][c] === matrix[r + 1][c] && matrix[r][c] === matrix[r + 1][c + 1]) {
        score += 3;
      }
    }
  }
  // Balance
  const darkCount = matrix.reduce((sum, row) => sum + row.reduce((s, v) => s + (v ? 1 : 0), 0), 0);
  const percent = (darkCount * 100) / (size * size);
  const prev = Math.abs(Math.floor(percent / 5) * 5 - 50) / 5;
  score += prev * 10;
  return score;
}

export function generateQR(text: string, moduleSize: number = 3): string {
  const encoder = new TextEncoder();
  const dataBytes = Array.from(encoder.encode(text));
  const mode = 4; // byte mode indicator: 0100

  const maxBytes = dataBytes.length + 3; // 3 bytes for mode + length header (version 1-9 in byte mode)
  const vi = getVersionInfo(maxBytes);
  const ver = vi.ver;
  const size = ver * 4 + 17;

  // Build data codewords
  const charCountBits = ver < 10 ? 8 : 16;
  const totalBits = charCountBits + 4;
  const headerBits = (mode << charCountBits) | dataBytes.length;

  // Convert header + data to bit stream then codewords
  const allBits: number[] = [];
  for (let i = charCountBits + 4 - 1; i >= 0; i--) {
    allBits.push((headerBits >> i) & 1);
  }
  for (const b of dataBytes) {
    for (let i = 7; i >= 0; i--) {
      allBits.push((b >> i) & 1);
    }
  }

  // Pad to total data capacity
  while (allBits.length < vi.totalData * 8) {
    allBits.push(allBits.length % 2 === 0 ? 0xEC >> 7 : 0x11 >> 7);
    if (allBits.length < vi.totalData * 8) {
      allBits.push(allBits.length % 2 === 0 ? (0xEC >> 6) & 1 : (0x11 >> 6) & 1);
    }
  }

  // Convert bits to data codewords
  const dataCodewords: number[] = [];
  for (let i = 0; i < vi.totalData * 8; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (allBits[i + j] || 0);
    }
    dataCodewords.push(byte);
  }

  // RS error correction
  const eccWords = rsEncode(dataCodewords, vi.eccCount);

  // Interleave data and ECC
  const interleaved = [...dataCodewords, ...eccWords];
  while (interleaved.length < vi.totalData + vi.eccCount) {
    interleaved.push(0);
  }

  // Build matrix
  const matrix: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));

  // Place finder patterns
  function placeFinder(r: number, c: number) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (dr === -1 || dr === 7 || dc === -1 || dc === 7) { matrix[nr][nc] = 0; continue; }
        if (dr === 0 || dr === 6 || dc === 0 || dc === 6) { matrix[nr][nc] = 1; continue; }
        if ((dr === 2 || dr === 4) && (dc >= 2 && dc <= 4)) { matrix[nr][nc] = 1; continue; }
        if ((dc === 2 || dc === 4) && (dr >= 2 && dr <= 4)) { matrix[nr][nc] = 1; continue; }
        if (dr === 3 && (dc === 2 || dc === 4)) { matrix[nr][nc] = 1; continue; }
        if (dc === 3 && (dr === 2 || dr === 4)) { matrix[nr][nc] = 1; continue; }
      }
    }
    // Separator
    const sep = -1;
    for (let dr = sep; dr <= 7; dr++) {
      for (let dc = sep; dc <= 7; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (dr < 0 || dr > 6 || dc < 0 || dc > 6) matrix[nr][nc] = 1;
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = (i % 2 === 0) ? 1 : 0;
    matrix[i][6] = (i % 2 === 0) ? 1 : 0;
  }

  // Dark module
  matrix[size - 8][8] = 1;

  // Place alignment patterns
  if (ver >= 2) {
    const positions = getAlignmentPositions(ver);
    for (const r of positions) {
      for (const c of positions) {
        if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            if (dr === -2 || dr === 2 || dc === -2 || dc === 2) { matrix[nr][nc] = 1; }
            else if (dr === 0 && dc === 0) { matrix[nr][nc] = 1; }
            else { matrix[nr][nc] = 0; }
          }
        }
      }
    }
  }

  // Place data bits
  let dataIdx = 0;
  let bitIdx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < 2; col++) {
        const c = right - col;
        const r = (right % 2 === 0) ? size - 1 - row : row;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        if (isFunctionPattern(ver, r, c)) continue;

        let bit = 0;
        if (dataIdx < interleaved.length) {
          bit = (interleaved[dataIdx] >> (7 - bitIdx)) & 1;
          bitIdx++;
          if (bitIdx >= 8) { dataIdx++; bitIdx = 0; }
        }
        matrix[r][c] = bit;
      }
    }
  }

  // Apply mask - try all 8 and pick best
  let bestScore = Infinity;
  let bestMask = 0;
  const maskedMatrices: number[][][] = [];

  for (let mask = 0; mask < 8; mask++) {
    const mm = matrix.map(row => [...row]);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (isFunctionPattern(ver, r, c)) continue;
        const cond = [
          (r + c) % 2 === 0,
          r % 2 === 0,
          c % 3 === 0,
          (r + c) % 3 === 0,
          (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
          (r * c) % 2 + (r * c) % 3 === 0,
          ((r * c) % 2 + (r * c) % 3) % 2 === 0,
          ((r + c) % 2 + (r * c) % 3) % 2 === 0,
        ][mask];
        if (cond) mm[r][c] = mm[r][c] ? 0 : 1;
      }
    }
    const score = evaluatePenalty(mm);
    maskedMatrices.push(mm);
    if (score < bestScore) { bestScore = score; bestMask = mask; }
  }

  const finalMatrix = maskedMatrices[bestMask];

  // Place format info
  const formatBits = FORMAT_INFO[bestMask];
  const fmtFn = (i: number) => (formatBits >> (14 - (i % 15))) & 1;
  const fmtCoords: [number, number][] = [
    [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],[8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [8,size-1],[8,size-2],[8,size-3],[8,size-4],[8,size-5],[8,size-6],[8,size-7],[size-8,8],
    [size-7,8],[size-6,8],[size-5,8],[size-4,8],[size-3,8],[size-2,8],[size-1,8],
  ];
  for (let i = 0; i < 31 && i < fmtCoords.length; i++) {
    const [r, c] = fmtCoords[i];
    if (r >= 0 && r < size && c >= 0 && c < size) finalMatrix[r][c] = fmtFn(i);
  }

  // Version info for ver >= 7
  if (ver >= 7) {
    // BCH(18,6) version info
    let v = ver << 12;
    let poly = 0x1F25; // x^12 + x^11 + x^10 + x^9 + x^8 + x^5 + x^2 + 1
    for (let i = 0; i < 12; i++) {
      if ((v << i) & 0x8000) v ^= poly << i;
    }
    const verInfo = (ver << 12) | (v & 0xFFF);
    for (let i = 0; i < 18; i++) {
      const bit = (verInfo >> (17 - i)) & 1;
      const r1 = i < 6 ? size - 11 + (i % 3) : size - 11 + ((i - 6) % 3);
      const c1 = i < 6 ? Math.floor(i / 3) : Math.floor((i - 6) / 3);
      const r2 = Math.floor(i / 3);
      const c2 = i < 6 ? size - 11 + (i % 3) : size - 11 + ((i - 6) % 3);
      if (r1 >= 0 && r1 < size && c1 >= 0 && c1 < size) finalMatrix[r1][c1] = bit;
      if (r2 >= 0 && r2 < size && c2 >= 0 && c2 < size) finalMatrix[r2][c2] = bit;
    }
  }

  // Render to SVG
  const padding = moduleSize * 2;
  const svgSize = size * moduleSize + padding * 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}">\n`;
  svg += `<rect width="${svgSize}" height="${svgSize}" fill="#ffffff"/>\n`;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (finalMatrix[r][c]) {
        svg += `<rect x="${padding + c * moduleSize}" y="${padding + r * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="#000000"/>\n`;
      }
    }
  }

  svg += '</svg>';
  return svg;
}
