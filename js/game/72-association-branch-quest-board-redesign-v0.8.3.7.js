'use strict';
// Presentation-only stabilization for Association branch and quest boards.
// Acceptance, objective progress, rewards, and persistence remain owned by the existing services.

function ir0837AssignmentPresentation(html, kind) {
  if (typeof html !== 'string') return html;
  let result = html
    .replace(/class="ir072-action-card"/g, 'class="ir072-action-card ir0837-quest-card"')
    .replace(/class="ir072-action-grid"/g, 'class="ir072-action-grid ir0837-quest-list"')
    .replace(/<section class="modal ir072-modal"/g, '<section class="modal ir072-modal ir0837-board"')
    .replace(/<section class="modal"/g, '<section class="modal ir0837-board"');
  const snapshot = typeof ir0836AssignmentSnapshot === 'function' ? ir0836AssignmentSnapshot() : { ok: false, assignments: [], conflict: false };
  const assignments = snapshot.ok ? snapshot.assignments : [];
  const active = assignments.length > 0 || snapshot.conflict;
  const message = !snapshot.ok
    ? `Acceptance is disabled because assignment data needs attention: ${snapshot.reason}`
    : snapshot.conflict
      ? snapshot.reason
      : active
        ? `One Association assignment is already active${assignments[0]?.record ? `: ${esc(ir0836AssignmentTitle(assignments[0]))}` : ''}. Complete or close it under its existing rules before accepting another contract or duty.`
        : 'Only one Association contract or duty can be active at a time.';
  const panel = `<div class="notice ir0837-board-rule"><strong>Assignment rule</strong><br>${esc(message)}</div>`;
  // Insert after the whole header without depending on nested div markup.
  const headerEnd = result.indexOf('</div><div class="notice');
  if (headerEnd >= 0) {
    const noticeStart = result.indexOf('<div class="notice', headerEnd);
    if (noticeStart >= 0) result = result.slice(0, noticeStart) + panel + result.slice(noticeStart);
  }
  if (active || !snapshot.ok) {
    const action = kind === 'duty' ? 'ir0833-accept-duty' : 'ir0834-accept-contract';
    result = result.replace(new RegExp(`<button\\b(?=[^>]*data-action="${action}")[^>]*>`, 'g'), tag => /\bdisabled\b/.test(tag) ? tag : tag.replace(/>$/, ' disabled aria-disabled="true">'));
  }
  if (kind === 'duty' && typeof IR_V0833_DUTY_TEMPLATES !== 'undefined') {
    for (const template of IR_V0833_DUTY_TEMPLATES) {
      const token = `data-template="${template.id}"`;
      const buttonAt = result.indexOf(token);
      if (buttonAt < 0) continue;
      const start = result.lastIndexOf('<article', buttonAt), end = result.indexOf('</article>', buttonAt);
      if (start < 0 || end < 0) continue;
      const card = result.slice(start, end + 10);
      const limit = IR_V0833_PROGRESSION_CONFIG.dailyCreditCapByCategory[template.category];
      const objective = `<p class="ir0837-objective"><strong>Type:</strong> ${esc(template.category)} · <strong>Target:</strong> ${template.quantity} ${esc(template.targetName)} · <strong>Credit:</strong> ${IR_V0833_PROGRESSION_CONFIG.creditPerCompletion} personal credit after verified completion (daily category cap ${limit}).</p>`;
      let updated = card.replace('</p>', `</p>${objective}`);
      updated = updated.replace('<strong>' + esc(template.title) + '</strong>', `<strong>${esc(template.title)} <span class="tag blue">AVAILABLE</span></strong>`);
      result = result.slice(0, start) + updated + result.slice(end + 10);
    }
  }
  return result;
}

const ir0837DutyBoardBase = ir0833DutyBoardModal;
ir0833DutyBoardModal = function () {
  return ir0837AssignmentPresentation(ir0837DutyBoardBase.apply(this, arguments), 'duty');
};

const ir0837ContractBoardBase = ir0824GuildContractBoardModal;
ir0824GuildContractBoardModal = function () {
  return ir0837AssignmentPresentation(ir0837ContractBoardBase.apply(this, arguments), 'contract');
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.3.7';
if (typeof globalThis !== 'undefined') globalThis.ir0837AssignmentPresentation = ir0837AssignmentPresentation;
