import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next/package.json")] }));

for (const theme of ["light", "dark"]) {
  await sharp(`public/brand/icon-${theme}.png`).resize(64, 64).png().toFile(`public/brand/icon-${theme}-64.png`);
}
await sharp("public/brand/icon-light.png").resize(192, 192).png().toFile("public/brand/icon-192.png");
await sharp("public/brand/icon-light.png").resize(180, 180).flatten({ background: "#f6f5f1" }).png().toFile("src/app/apple-icon.png");
await sharp("public/brand/social-card.svg").png().toFile("public/brand/social-card.png");

// ICO supports embedded PNG frames. Include common native favicon sizes.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map(size => sharp("src/app/icon.svg").resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index]; header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...frames]));
console.log("UsageMax native icon derivatives, favicon, and social card generated.");
