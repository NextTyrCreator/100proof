// Fails CI if any dependency carries a license incompatible with Apache-2.0 distribution.
import { readFileSync } from 'node:fs';
const banned = [/GPL/i, /AGPL/i, /SSPL/i, /UNLICENSED/i, /UNKNOWN/i];
const data = JSON.parse(readFileSync('.licenses.json', 'utf8'));
const bad = [];
for (const [license, pkgs] of Object.entries(data)) {
  if (banned.some((re) => re.test(license))) bad.push(`${license}: ${pkgs.map((p) => p.name).join(', ')}`);
}
if (bad.length) { console.error('Incompatible licenses:\n' + bad.join('\n')); process.exit(1); }
console.log('License check passed.');
