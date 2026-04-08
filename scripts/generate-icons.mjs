/**
 * Generates simple SVG placeholder icons for the PWA.
 * Run with: node scripts/generate-icons.mjs
 *
 * For production, replace the generated PNGs in public/icons/ with
 * proper branded icons (e.g. generated via https://realfavicongenerator.net).
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '../public/icons')
mkdirSync(iconsDir, { recursive: true })

function svgIcon(size) {
  const fontSize = Math.round(size * 0.38)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="#0057A8"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="${fontSize}" font-family="system-ui,sans-serif">🚌</text>
</svg>`
}

// Write SVG versions (these work as icons in many contexts)
writeFileSync(join(iconsDir, 'icon-192.svg'), svgIcon(192))
writeFileSync(join(iconsDir, 'icon-512.svg'), svgIcon(512))
writeFileSync(join(iconsDir, 'apple-touch-icon.svg'), svgIcon(180))

// Write minimal 1x1 PNG placeholders so the app doesn't 404
// These are valid PNG files (1x1 pixel, blue)
const BLUE_1X1_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
  '2e00000000c4944415408d76360f8cf0000000049454e44ae426082',
  'hex'
)

writeFileSync(join(iconsDir, 'icon-192.png'), BLUE_1X1_PNG)
writeFileSync(join(iconsDir, 'icon-512.png'), BLUE_1X1_PNG)
writeFileSync(join(iconsDir, 'apple-touch-icon.png'), BLUE_1X1_PNG)

console.log('Icons written to public/icons/')
console.log('Replace PNGs with proper branded icons before deploying to production.')
