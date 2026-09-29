// MapLibre GL v6's tile-processing worker is a real ES module
// (maplibre-gl-worker.mjs) that imports a sibling file
// (maplibre-gl-shared.mjs) by a relative path. Turbopack/webpack don't
// resolve that pair correctly when the worker is loaded via
// `new URL(..., import.meta.url)` from inside node_modules, so both files
// are served as static same-origin assets instead, with the app calling
// `maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs")` before creating a map.
// Runs on every install so the copies never drift from the installed version.
const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "node_modules", "maplibre-gl", "dist");
const destDir = path.join(__dirname, "..", "public");

for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log("Copied maplibre-gl worker files into public/");
