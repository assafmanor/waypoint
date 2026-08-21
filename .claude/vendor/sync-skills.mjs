#!/usr/bin/env node
// Re-materialise the vendored third-party skills in .claude/skills/ from the pins in
// skills.json (ADR-0200). Idempotent: it removes and rewrites only the directories it
// owns, so this repo's own skills — design-mockups — are never in reach.
//
//   node .claude/vendor/sync-skills.mjs            # restore the pinned state
//   node .claude/vendor/sync-skills.mjs --check     # exit 1 if the tree has drifted
//   node .claude/vendor/sync-skills.mjs --bump      # move every pin to upstream head
//
// The owned set is derived, not listed: it is whatever the pinned commits contain. That
// is the point of pinning — the manifest cannot claim a skill the upstream no longer has.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VENDOR_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(VENDOR_DIR, '..', '..');
const SKILLS_ROOT = join(REPO_ROOT, '.claude', 'skills');
const MANIFEST = join(VENDOR_DIR, 'skills.json');

const mode = process.argv.includes('--bump') ? 'bump' : process.argv.includes('--check') ? 'check' : 'sync';
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Fetch one pinned commit into a throwaway dir. Shallow: we want a tree, not a history. */
function fetchSource(src, workDir) {
  mkdirSync(workDir, { recursive: true });
  git(['init', '--quiet'], workDir);
  git(['remote', 'add', 'origin', src.repo], workDir);
  const ref = mode === 'bump' ? src.branch : src.commit;
  git(['fetch', '--quiet', '--depth', '1', 'origin', ref], workDir);
  return git(['rev-parse', 'FETCH_HEAD'], workDir);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** Apply the manifest's rewrites in place. Text files only — binaries pass through. */
function applyRewrites(skillDir, rewrites) {
  if (!rewrites.length) return;
  for (const file of walk(skillDir)) {
    const rules = rewrites.filter((r) => !r.include || new RegExp(r.include).test(file));
    if (!rules.length) continue;
    const before = readFileSync(file, 'latin1'); // byte-preserving: never corrupt a .ttf
    let after = before;
    for (const r of rules) after = after.split(r.find).join(r.replace);
    if (after !== before) writeFileSync(file, after, 'latin1');
  }
}

/** A renamed skill's frontmatter label has to match the directory, which is what is invocable. */
function relabel(skillDir, name) {
  const file = join(skillDir, 'SKILL.md');
  if (!existsSync(file)) return;
  const body = readFileSync(file, 'utf8');
  writeFileSync(file, body.replace(/^name:.*$/m, `name: ${name}`));
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const staging = mkdtempSync(join(tmpdir(), 'waypoint-skills-'));
const owned = [];
let bumped = false;

// --check must not repair what it is checking: it materialises somewhere else and compares.
// (It did repair-then-check once, which made it pass unconditionally.)
const OUT_ROOT = mode === 'check' ? mkdtempSync(join(tmpdir(), 'waypoint-skills-expected-')) : SKILLS_ROOT;

/** Every path under dir, relative and sorted — the shape to compare. */
function manifestOf(dir) {
  return existsSync(dir) ? walk(dir).map((f) => relative(dir, f)).sort() : [];
}

/** Byte-for-byte comparison of two skill directories. Returns human-readable differences. */
function compare(expected, actual, name) {
  const [want, have] = [manifestOf(expected), manifestOf(actual)];
  const diffs = [
    ...want.filter((f) => !have.includes(f)).map((f) => `missing   ${name}/${f}`),
    ...have.filter((f) => !want.includes(f)).map((f) => `unexpected ${name}/${f}`),
  ];
  for (const f of want.filter((f) => have.includes(f))) {
    if (!readFileSync(join(expected, f)).equals(readFileSync(join(actual, f)))) diffs.push(`modified  ${name}/${f}`);
  }
  return diffs;
}

try {
  for (const src of manifest.sources) {
    const workDir = join(staging, src.id);
    const head = fetchSource(src, workDir);
    if (mode === 'bump' && head !== src.commit) {
      console.log(`${src.id}: ${src.commit.slice(0, 10)} → ${head.slice(0, 10)}`);
      src.commit = head;
      bumped = true;
    }
    git(['checkout', '--quiet', 'FETCH_HEAD'], workDir);

    const from = join(workDir, src.skillsDir);
    if (!existsSync(from)) throw new Error(`${src.id}: no ${src.skillsDir} at ${head.slice(0, 10)}`);

    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (!entry.isDirectory() || !existsSync(join(from, entry.name, 'SKILL.md'))) continue;
      const name = src.renames[entry.name] ?? entry.name;
      const dest = join(OUT_ROOT, name);
      if (owned.includes(name)) throw new Error(`two sources both claim the skill name "${name}"`);
      owned.push(name);
      rmSync(dest, { recursive: true, force: true });
      cpSync(join(from, entry.name), dest, { recursive: true });
      applyRewrites(dest, src.rewrites ?? []);
      if (name !== entry.name) relabel(dest, name);
    }
  }
  if (mode === 'check') {
    const drift = owned.flatMap((name) => compare(join(OUT_ROOT, name), join(SKILLS_ROOT, name), name));
    if (drift.length) {
      console.error(`.claude/skills has drifted from the pins in skills.json:\n  ${drift.join('\n  ')}`);
      console.error(`\nRun \`node .claude/vendor/sync-skills.mjs\` to restore, or --bump if upstream is meant to move.`);
      process.exitCode = 1;
    } else {
      console.log('.claude/skills matches its pins.');
    }
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
  if (OUT_ROOT !== SKILLS_ROOT) rmSync(OUT_ROOT, { recursive: true, force: true });
}

if (mode === 'bump' && bumped) {
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nPins updated. Review the diff before committing — a skill is instructions to yourself.`);
}

// Anything left in .claude/skills that no source claims is either ours or stale. Say which,
// and never delete: guessing wrong here would silently drop a skill someone wrote.
const present = readdirSync(SKILLS_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(SKILLS_ROOT, e.name, 'SKILL.md')))
  .map((e) => e.name);
const unclaimed = present.filter((n) => !owned.includes(n));

console.log(`${owned.length} vendored skills in ${relative(REPO_ROOT, SKILLS_ROOT)}/`);
if (unclaimed.length) console.log(`not vendored (left alone): ${unclaimed.join(', ')}`);
