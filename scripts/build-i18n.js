/* يدمج scripts/i18n-extra.json (عربي ← إنكليزي) في public/i18n-en.js دون المساس ببقية الملف.
   التشغيل: node scripts/build-i18n.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const file = path.join(root, 'public/i18n-en.js');
const lines = fs.readFileSync(file, 'utf8').split('\n');
const win = {}; vm.runInNewContext(lines.slice(0, 2).join('\n'), { window: win });
const extra = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-extra.json'), 'utf8').replace(/^\uFEFF/, ''));
const merged = { ...extra, ...win.EN_DICT };   // القاموس الأصلي يتفوّق عند التعارض
lines[1] = 'window.EN_DICT = ' + JSON.stringify(merged) + ';';
fs.writeFileSync(file, lines.join('\n'));
console.log('entries', Object.keys(merged).length, '(extra', Object.keys(extra).length + ')');
