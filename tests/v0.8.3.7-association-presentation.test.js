'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
let snapshot = { ok: true, assignments: [], conflict: false };
const context = vm.createContext({
  document: { title: '' }, globalThis: null,
  ir0836AssignmentSnapshot: () => snapshot,
  ir0836AssignmentTitle: () => 'Route Survey',
  ir0833DutyBoardModal() { return ''; }, ir0824GuildContractBoardModal() { return ''; },
  esc: value => String(value ?? '')
});
context.globalThis = context;
vm.runInContext(fs.readFileSync(path.join(root, 'js/game/72-association-branch-quest-board-redesign-v0.8.3.7.js'), 'utf8'), context);

const board = '<div class="overlay"><section class="modal ir072-modal"><div class="modal-header"><div><h2>North Hall</h2></div><button>×</button></div><div class="notice">Membership checks apply.</div><div class="ir072-action-grid"><article class="ir072-action-card"><button class="button" data-action="ir0834-accept-contract">Accept contract</button></article></div></section></div>';
let output = context.ir0837AssignmentPresentation(board, 'contract');
assert.match(output, /ir0837-board/);
assert.match(output, /ir0837-quest-list/);
assert.match(output, /ir0837-quest-card/);
assert.match(output, /Only one Association contract or duty can be active at a time/);
assert.match(output, /data-action="ir0834-accept-contract"/);
assert.doesNotMatch(output, /data-action="ir0834-accept-contract"[^>]*disabled/);

snapshot = { ok: true, assignments: [{ kind: 'duty', record: {}, templateId: 'goblin-defeat-3' }], conflict: false };
output = context.ir0837AssignmentPresentation(board, 'contract');
assert.match(output, /One Association assignment is already active: Route Survey/);
assert.match(output, /data-action="ir0834-accept-contract"[^>]*disabled aria-disabled="true"/);

output = context.ir0837AssignmentPresentation(board.replace('ir0834-accept-contract', 'ir0833-accept-duty'), 'duty');
assert.match(output, /data-action="ir0833-accept-duty"[^>]*disabled aria-disabled="true"/);

snapshot = { ok: false, assignments: [], conflict: false, reason: 'quarantined data' };
output = context.ir0837AssignmentPresentation(board, 'contract');
assert.match(output, /quarantined data/);
assert.match(output, /disabled aria-disabled="true"/);
assert.equal(context.document.title, 'Infinite Realms — Version 0.8.3.7');
console.log('v0.8.3.7 Association presentation tests passed');
