const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const app = process.env.CINDER_APP || path.resolve(__dirname, '../../cinder');
const appRequire = createRequire(path.join(app, 'package.json'));
const ts = appRequire('typescript');
const parser = {exports:{}};
const input = fs.readFileSync(path.join(app, 'src/extensions/HTMLParser.ts'), 'utf8');
const compiled = ts.transpileModule(input, {
  compilerOptions: {module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020},
});
vm.runInNewContext(compiled.outputText, {exports:parser.exports, require:appRequire});
module.exports = {parser:parser.exports, URL:appRequire('whatwg-url-minimum').URL};
