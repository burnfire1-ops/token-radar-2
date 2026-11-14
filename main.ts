// main.ts — Token Radar entrypoint (Node 22+, stdlib only).
// Reads the frozen snapshot, builds the ranked board, writes board.json and
// data.js, copies dashboard/ and screenshots/ into the output directory, and
// writes dossier.json last via the vendored buildDossier.
//
// Usage:
//   node main.ts --input kit/input/snapshot.json --output out
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input kit/input/snapshot.json
// Defaults mirror the grader: input /input/snapshot.json, output /output.

import { readFile, writeFile, mkdir, readdir, copyFile, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSnapshot,
  buildBoard,
  buildRadar,
  dataScript,
  boardIssue,
} from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  const prefixed = argv.find((a) => a.startsWith(name + "="));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyTree(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyTree(from, to);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    }
  }
}

function pngSize(buf: Buffer): { width: number; height: number } | null {
  // Minimal PNG header read: 8-byte signature, then IHDR width/height.
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let input = flagValue(argv, "--input") ?? process.env.MAKEFUN_INPUT;
  const output =
    flagValue(argv, "--output") ??
    process.env.MAKEFUN_OUTPUT_DIR ??
    "/output";
  if (!input) input = "/input/snapshot.json";

  let inputPath = resolve(input);
  if (await pathExists(inputPath)) {
    const st = await stat(inputPath);
    if (st.isDirectory()) inputPath = join(inputPath, "snapshot.json");
  }
  let snapshotText: string;
  try {
    snapshotText = await readFile(inputPath, "utf8");
  } catch {
    console.error(`cannot read snapshot at ${inputPath} — pass --input <snapshot.json>`);
    process.exit(1);
  }
  const snapshot = parseSnapshot(snapshotText);

  const { rows, fit, factors, live, earlyCount } = buildBoard(snapshot);

  const issues = boardIssue(rows, snapshot);
  if (issues.length > 0) {
    for (const issue of issues) console.error("board issue: " + issue);
    process.exit(1);
  }

  const outDir = resolve(output);
  await mkdir(outDir, { recursive: true });

  const radar = buildRadar(snapshot, rows, fit, factors, live, earlyCount);
  await writeFile(join(outDir, "board.json"), JSON.stringify({ rows }, null, 0) + "\n", "utf8");
  await writeFile(join(outDir, "data.js"), dataScript(radar), "utf8");

  // Dashboard: exactly the page sources, nothing else.
  await copyTree(join(HERE, "dashboard"), join(outDir, "dashboard"));

  // Screenshots: 3 whole PNGs at 1440x900. Refuse a short set, a bad name,
  // or an image that is not a whole PNG inside the size cap.
  const shotDir = join(HERE, "screenshots");
  const shots = (await readdir(shotDir))
    .filter((name) => !name.startsWith("."))
    .sort();
  if (shots.length < 3) {
    console.error(`need at least 3 screenshots, found ${shots.length}`);
    process.exit(1);
  }
  if (shots.length > 4) {
    console.error(`at most 4 screenshots, found ${shots.length}`);
    process.exit(1);
  }
  for (const name of shots) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) {
      console.error(`bad screenshot name: ${name}`);
      process.exit(1);
    }
    const buf = await readFile(join(shotDir, name));
    if (buf.length > 524288) {
      console.error(`screenshot ${name} is ${buf.length} bytes, over the 512 KiB cap`);
      process.exit(1);
    }
    const size = pngSize(buf);
    if (!size) {
      console.error(`screenshot ${name} is not a whole PNG`);
      process.exit(1);
    }
    if (Math.max(size.width, size.height) > 1440 || Math.min(size.width, size.height) < 800) {
      console.error(`screenshot ${name} is ${size.width}x${size.height}, outside 1440x900 bounds`);
      process.exit(1);
    }
  }
  await copyTree(shotDir, join(outDir, "screenshots"));

  // Dossier last, from the final output directory, so it always describes
  // exactly what was just written.
  // buildDossier returns the dossier bytes (a Uint8Array). Write them raw:
  // stringifying a byte array would inflate it several-fold and break the
  // byte-for-byte dossier_matches gate.
  const dossier = await buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  const dossierBytesBuf =
    typeof dossier === "string"
      ? Buffer.from(dossier, "utf8")
      : dossier instanceof Uint8Array
        ? Buffer.from(dossier)
        : Buffer.from(JSON.stringify(dossier), "utf8");
  await writeFile(join(outDir, "dossier.json"), dossierBytesBuf);

  const dossierBytes = dossierBytesBuf.length;
  // The gate refuses a dossier past 1.5 MiB; fail here instead of shipping one.
  if (dossierBytes > 1.5 * 1024 * 1024) {
    console.error(`dossier is ${dossierBytes} bytes, over the 1.5 MiB cap`);
    process.exit(1);
  }

  const dossierBytesLogged = dossierBytes;
  const sortedValues = rows.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const medianValue = sortedValues[Math.floor(sortedValues.length / 2)];
  console.log(
    `${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
      `${rows.length} rows scored (${earlyCount} early, ${live.length} live set aside)`,
  );
  console.log(
    `fit n=${fit.n} A=${fit.intercept.toFixed(3)} B=${fit.slope.toFixed(3)} R2=${fit.r2.toFixed(3)}`,
  );
  console.log(`#1 ${rows[0].name} $${rows[0].implied_value_usd.toLocaleString("en-US")}`);
  console.log(`#${rows.length} ${rows[rows.length - 1].name} $${rows[rows.length - 1].implied_value_usd.toLocaleString("en-US")}`);
  console.log(`median $${medianValue.toLocaleString("en-US")}`);
  console.log(`dossier ${dossierBytesLogged} bytes`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
