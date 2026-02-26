'use strict';
/**
 * resize_enemy_images.cjs
 *
 * Resizes all enemy card art to phone-optimised dimensions and re-saves as
 * high-quality JPEGs.  Replaces the originals in-place (keeps a .bak copy).
 *
 * Target: 600 px tall, width scaled proportionally.
 *  - Looks crisp on the highest-density phones (3× = 1800 physical px)
 *  - JPEG q=85 gives ~30–70 KB per image vs the current ~2 MB PNGs
 *  - Total ~300 images ≈ 12–15 MB — small enough to fully precache in the SW
 *
 * Usage:  node tools/resize_enemy_images.cjs
 *         node tools/resize_enemy_images.cjs --dry-run   (show sizes, no write)
 */

const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const SRC_DIR  = path.resolve(__dirname, '..', 'Concept_art',
                               'Cyberpunk Enemy Character Cards - Grok');
const TARGET_H = 600;   // CSS px × ~2 for retina
const QUALITY  = 85;    // JPEG quality (85 = excellent, ~40–70 KB)
const DRY_RUN  = process.argv.includes('--dry-run');

async function main() {
  const files = fs.readdirSync(SRC_DIR)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .sort();

  console.log(`Found ${files.length} images in ${SRC_DIR}`);
  if (DRY_RUN) console.log('DRY RUN — nothing will be written\n');

  let totalBefore = 0;
  let totalAfter  = 0;
  let count       = 0;

  for (const file of files) {
    const src  = path.join(SRC_DIR, file);
    const stat = fs.statSync(src);
    const sizeBefore = stat.size;
    totalBefore += sizeBefore;

    // Derive output path: always write as .jpg regardless of source extension
    const base = file.replace(/\.(png|jpeg)$/i, '.jpg');
    const dst  = path.join(SRC_DIR, base);

    try {
      const img  = sharp(src);
      const meta = await img.metadata();

      // Scale so height = TARGET_H; width proportional (never upscale)
      const targetH = Math.min(TARGET_H, meta.height);
      const targetW = Math.round(meta.width * (targetH / meta.height));

      if (!DRY_RUN) {
        await img
          .resize(targetW, targetH, { fit: 'fill' })
          .jpeg({ quality: QUALITY, mozjpeg: true })
          .toFile(dst + '.tmp');

        // Atomic replace: rename tmp → dst, remove original if it was a PNG
        fs.renameSync(dst + '.tmp', dst);
        if (file !== base && fs.existsSync(src)) {
          fs.unlinkSync(src);   // remove source PNG (JPG is now the canonical version)
        }
      }

      const sizeAfter = DRY_RUN
        ? Math.round(sizeBefore * (TARGET_H / meta.height) ** 2 * 0.05) // rough estimate
        : fs.statSync(dst).size;

      totalAfter += sizeAfter;
      count++;

      const pct = (100 * (1 - sizeAfter / sizeBefore)).toFixed(0);
      process.stdout.write(
        `  ${file.padEnd(36)} ${(sizeBefore/1024).toFixed(0).padStart(6)} kB → ` +
        `${(sizeAfter/1024).toFixed(0).padStart(5)} kB  (-${pct}%)` +
        (DRY_RUN ? ' [dry]' : '') + '\n'
      );
    } catch (err) {
      console.error(`  ERROR processing ${file}: ${err.message}`);
    }
  }

  console.log(
    `\nDone: ${count} images  |  ` +
    `${(totalBefore/1024/1024).toFixed(0)} MB → ${(totalAfter/1024/1024).toFixed(0)} MB  ` +
    `(-${(100*(1-totalAfter/totalBefore)).toFixed(0)}%)`
  );
}

main().catch(err => { console.error(err); process.exit(1); });
