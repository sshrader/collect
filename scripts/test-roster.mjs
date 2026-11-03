import assert from 'node:assert/strict';
import { buildRoster, combos, validateCollection, SLOTS } from '../server/roster.mjs';

const good = { theme: 'space frogs on a mining crew', traits: [
  { label: 'Species', options: ['frog', 'toad', 'newt', 'axolotl'] },
  { label: 'Hat', options: ['helmet', 'crown', 'beanie', 'hardhat', 'cap'] },
  { label: 'Item', options: ['pickaxe', 'torch', 'gem'] },
] };
const v = validateCollection(good);
assert.ok(v.ok, v.error);
assert.equal(combos(v.value.traits), 60);
let r = buildRoster(v.value, 'Frog', 'seed1');
assert.equal(r.length, SLOTS);
assert.equal(new Set(r.map((s) => s.attributes.map((a) => a.value).join('|'))).size, SLOTS, 'all unique');
assert.deepEqual(r.map((s) => s.n), Array.from({ length: SLOTS }, (_, i) => i + 1));
assert.deepEqual(buildRoster(v.value, 'Frog', 'seed1'), r, 'same seed, same 40');
assert.notDeepEqual(buildRoster(v.value, 'Frog', 'seed2').map((s) => s.prompt), r.map((s) => s.prompt));
// exactly 40 combos still works
const exact = validateCollection({ theme: 'abc', traits: [{ label: 'A', options: ['1','2','3','4','5','6','7','8'] }, { label: 'B', options: ['a','b','c','d','e'] }] });
assert.ok(exact.ok);
assert.equal(new Set(buildRoster(exact.value, 'X', 's').map((s) => s.prompt)).size, 40);
// rejects
assert.ok(!validateCollection({ theme: 'abc', traits: [{ label: 'A', options: ['1','2','3'] }, { label: 'B', options: ['a','b','c'] }] }).ok, 'too few combos');
assert.ok(!validateCollection({ theme: 'ab', traits: good.traits }).ok, 'short theme');
assert.ok(!validateCollection({ theme: 'abc', traits: [good.traits[0]] }).ok, 'one list');
assert.ok(!validateCollection({ theme: 'abc', traits: [{ label: 'A', options: ['x'] }, good.traits[1]] }).ok, 'one option');
assert.ok(!validateCollection({ theme: 'abc<script>', traits: good.traits }).ok, 'angle brackets');
assert.ok(validateCollection({ theme: 'abc', traits: [...good.traits, { label: '', options: [] }] }).ok, 'blank row skipped');
// duplicate options collapse
const d = validateCollection({ theme: 'abc', traits: [{ label: 'A', options: ['x', 'X', 'y', 'z', 'w', 'v', 'u', 't', 's'] }, { label: 'B', options: ['1', '2', '3', '4', '5'] }] });
assert.equal(d.value.traits[0].options.length, 8);
console.log('roster: all checks passed');
