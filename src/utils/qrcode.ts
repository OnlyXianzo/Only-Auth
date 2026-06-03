import { qrcodegen } from './qrcodegen';

/**
 * Generates an SVG string representation of a QR Code for the given text.
 * Uses Nayuki's QR Code generator library for correct encoding and layout.
 */
export function generateQR(text: string, moduleSize: number = 3): string {
  const QRC = qrcodegen.QrCode;
  // Encode text with Medium error correction level
  const qr = QRC.encodeText(text, QRC.Ecc.MEDIUM);
  
  const size = qr.size;
  const padding = moduleSize * 2;
  const svgSize = size * moduleSize + padding * 2;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}">\n`;
  svg += `<rect width="${svgSize}" height="${svgSize}" fill="#ffffff"/>\n`;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.getModule(c, r)) { // getModule(x, y) where x is column, y is row
        svg += `<rect x="${padding + c * moduleSize}" y="${padding + r * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="#000000"/>\n`;
      }
    }
  }

  svg += '</svg>';
  return svg;
}
