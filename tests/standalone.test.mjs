import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
test('distributed HTML runs the 240x480 default Army game and retires stale downloads',()=>{
 execFileSync(process.env.PYTHON||'python3',['tools/build-standalone.py'],{cwd:root});
 const release=JSON.parse(readFileSync(new URL('package.json',root))).htmlRelease;
 const filename=`peninsula-2026-${release}.html`;
 const html=readFileSync(new URL(`downloads/${filename}`,root),'utf8');
 assert.equal(html,readFileSync(new URL(`dist/${filename}`,root),'utf8'));
 assert.ok(html.includes(`<title>PENINSULA 2026 ${release} · 240×480</title>`));
 const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
 new vm.Script(script); // Check the entire bundle, including UI syntax.
 const boundary=script.indexOf('const $=id=>document.getElementById(id)');
 assert.ok(boundary>0);
 const context=vm.createContext({});
 vm.runInContext(script.slice(0,boundary)+'globalThis.game=new Game();})();',context);
 const g=context.game;
 assert.equal(g.board.cols,240);assert.equal(g.board.rows,480);
 assert.equal(g.board.tiles.length,115200);
 assert.equal(g.state.units.filter(u=>u.formationId).length,55);
 assert.equal(g.state.scenario,'rok-army-v1');
 for(const directory of ['downloads','dist'])for(const file of ['peninsula-2026.html','peninsula-2026-army.html'])
  assert.equal(existsSync(new URL(`${directory}/${file}`,root)),false);
 const readme=readFileSync(new URL('README.md',root),'utf8');
 assert.ok(readme.includes(`(downloads/${filename})`));
 assert.ok(!readme.includes('(downloads/peninsula-2026.html)'));
});
