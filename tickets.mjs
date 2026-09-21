import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class TicketError extends Error { constructor(status, message) { super(message); this.status = status; } }
const labels = { open: '受付済み', working: '対応中', awaiting_confirmation: '社員の確認待ち', closed: '社員が復旧を確認・終了' };
export function createTicketStore(directory) {
  const path = join(directory, 'tickets.json');
  function read() {
    if (!existsSync(path)) return [];
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.tickets)) throw new Error();
      return data.tickets;
    } catch { throw new TicketError(503, '保存済みチケットを読み込めません。既存ファイルは上書きしていません。'); }
  }
  function save(tickets) {
    mkdirSync(directory, { recursive: true });
    const temp = join(directory, `tickets-${randomUUID()}.tmp`);
    writeFileSync(temp, JSON.stringify({ version: 1, tickets }, null, 2), { encoding: 'utf8', flag: 'wx' });
    renameSync(temp, path);
  }
  function view(t) { return { ...structuredClone(t), statusLabel: labels[t.status] }; }
  return {
    list() { return read().map(view).reverse(); },
    create(s, report) {
      const tickets = read();
      const previous = tickets.find(t => t.caseId === s.id);
      if (previous) return view(previous);
      if (tickets.length >= 100) throw new TicketError(429, 'デモチケットの上限（100件）です。');
      const now = new Date().toISOString();
      const t = { id: `TOR-${randomUUID().slice(0, 8).toUpperCase()}`, caseId: s.id, caseNumber: s.displayId,
        issue: s.issue, assignee: s.assignee, status: 'open', revision: 1, createdAt: now, updatedAt: now,
        evidence: structuredClone(s.evidence), sources: [...s.sources], report,
        history: [{ at: now, role: 'system', text: 'TORIAの初診レポートを受け付けました。ローカルの模擬チケットです。', action: 'created' }] };
      tickets.push(t); save(tickets); return view(t);
    },
    update(body) {
      if (!body || typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(body.requestId)) throw new TicketError(400, '操作IDが必要です。');
      const tickets = read(); const t = tickets.find(t => t.id === body.ticketId);
      if (!t) throw new TicketError(404, 'チケットが見つかりません。');
      const note = typeof body.note === 'string' ? body.note.trim() : '';
      if (note.length > 1000 || /sk-orca-[A-Za-z0-9_-]+/.test(note)) throw new TicketError(400, '秘密情報を含めず、1000文字以内で記録してください。');
      const prior = t.history.find(h => h.requestId === body.requestId);
      if (prior) {
        if (prior.action !== body.action || prior.note !== note) throw new TicketError(409, '同じ操作IDで異なる内容は送れません。');
        return view(t);
      }
      if (body.revision !== t.revision) throw new TicketError(409, 'チケットが更新されています。一覧を更新してください。');
      let status, role, text;
      if (body.action === 'claim' && t.status === 'open') { status = 'working'; role = 'operator'; text = '担当者役が対応を開始しました。'; }
      else if (body.action === 'propose' && t.status === 'working') {
        if (!note) throw new TicketError(400, '担当者役の対応内容を記入してください。');
        status = 'awaiting_confirmation'; role = 'operator'; text = `担当者役の対応記録：${note}\n社員による元の業務の再開確認を待っています。`;
      } else if (body.action === 'confirm' && t.status === 'awaiting_confirmation') { status = 'closed'; role = 'employee'; text = '社員役が元の業務を再開できたと確認しました（申告・端末の独立検証なし）。'; }
      else if (body.action === 'reject' && t.status === 'awaiting_confirmation') { status = 'working'; role = 'employee'; text = '社員役がまだ元の業務を再開できないと回答。担当者へ差し戻しました。'; }
      else if (body.action === 'reopen' && t.status === 'closed') { status = 'working'; role = 'employee'; text = '社員役が再発を申告。同じチケットを再開し、以前の証拠を保持しました。'; }
      else throw new TicketError(409, '現在のチケット状態では、この操作はできません。');
      const now = new Date().toISOString();
      t.status = status; t.revision++; t.updatedAt = now;
      t.history.push({ at: now, role, text, action: body.action, requestId: body.requestId, note });
      save(tickets); return view(t);
    },
  };
}
