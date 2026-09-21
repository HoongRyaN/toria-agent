(() => {
  const get = id => document.getElementById(id);
  const notes = new Map();
  let tickets = [], busy = false, retry = null;
  const labels = { system: 'TORIA', operator: '担当者役', employee: '社員役' };
  function element(tag, text, cls = '') { const node = document.createElement(tag); node.textContent = text; node.className = cls; return node; }
  function message(text) { get('ticket-notice').textContent = text; }
  function controls() {
    get('ticket-board').querySelectorAll('button, textarea').forEach(b => b.disabled = busy);
    get('ticket-retry').hidden = !retry || busy;
  }
  function button(text, action) { const b = element('button', text, 'secondary-button'); b.type = 'button'; b.addEventListener('click', action); return b; }
  function render() {
    get('ticket-count').textContent = tickets.length;
    get('ticket-list').replaceChildren();
    if (!tickets.length) get('ticket-list').append(element('p', '引き継ぎレポートを確認して模擬チケットを作成すると、ここに表示されます。', 'empty-state'));
    for (const t of tickets) {
      const card = element('article', '', 'ticket-card');
      const heading = element('div', '', 'ticket-heading');
      heading.append(element('h3', t.id), element('span', t.statusLabel, 'state-badge'));
      card.append(heading, element('p', t.issue, 'ticket-issue'), element('p', `${t.assignee} · 初診 ${t.caseNumber}`, 'tiny'));
      const report = element('details', '', 'ticket-evidence');
      report.append(element('summary', '引き継いだ証拠・未確認事項を読む'), element('pre', t.report));
      card.append(report);
      const history = element('ol', '', 'ticket-history');
      for (const h of t.history) history.append(element('li', `${labels[h.role]} · ${new Date(h.at).toLocaleString('ja-JP')}\n${h.text}`));
      card.append(history);
      const actions = element('div', '', 'ticket-actions');
      if (t.status === 'open') actions.append(button('担当者役：対応を開始', () => act(t, 'claim')));
      if (t.status === 'working') {
        const id = `note-${t.id}`;
        const label = element('label', '担当者役：対応内容（架空の内容で入力）'); label.htmlFor = id;
        const input = element('textarea'); input.id = id; input.maxLength = 1000; input.rows = 2;
        input.placeholder = '例：デモ環境で接続設定を確認。社員に社内サイトの再確認を依頼。';
        input.value = notes.get(t.id) || ''; input.addEventListener('input', () => notes.set(t.id, input.value));
        card.append(label, input);
        actions.append(button('担当者役：対応を記録して確認を依頼', () => act(t, 'propose', input.value)));
      }
      if (t.status === 'awaiting_confirmation') {
        card.append(element('p', '社員役：最初にできなかった元の作業を再開できましたか？', 'ticket-question'));
        actions.append(button('社員役：元の業務を再開できた', () => act(t, 'confirm')), button('社員役：まだ使えない', () => act(t, 'reject')));
      }
      if (t.status === 'closed') actions.append(button('社員役：再発したので再開', () => act(t, 'reopen')));
      actions.append(button('履歴付きレポートを保存 ↓', () => {
        const content = `${t.id} / ${t.statusLabel}\n\n【作成時点の初診レポート】\n${t.report}\n\n【チケット処理履歴】\n${t.history.map(h => `${h.at} [${labels[h.role]}] ${h.text}`).join('\n')}\n\nローカル模擬チケット。実際の外部通知・端末操作はありません。`;
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `${t.id}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }));
      card.append(actions); get('ticket-list').append(card);
    }
    controls();
  }
  async function load() {
    const response = await fetch('/api/tickets'); const data = await response.json();
    if (!response.ok) throw new Error(data.error || '一覧を取得できませんでした。');
    tickets = data.tickets;
  }
  async function refresh() {
    if (busy) return; busy = true; controls();
    try { await load(); message(''); } catch (e) { message(e.message); }
    finally { busy = false; render(); }
  }
  async function act(ticket, action, note = '', retryBody = null) {
    if (busy) return;
    const body = retryBody || { ticketId: ticket.id, revision: ticket.revision, action, note, requestId: crypto.randomUUID() };
    busy = true; retry = null; controls(); message('保存しています…');
    try {
      const response = await fetch('/api/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) { if (response.status >= 500) retry = body; if (response.status === 409) await load(); throw new Error(data.error || '保存できませんでした。'); }
      if (body.action === 'propose') notes.delete(body.ticketId);
      tickets = tickets.map(t => t.id === data.id ? data : t);
      message(`${data.id}：${data.statusLabel}`);
    } catch (e) { if (e instanceof TypeError) retry = body; message(e.message || '接続できませんでした。'); }
    finally { busy = false; render(); }
  }
  get('refresh-tickets').addEventListener('click', refresh);
  get('ticket-retry').addEventListener('click', () => { if (retry) act(null, null, '', retry); });
  document.addEventListener('toria-ticket-created', refresh);
  refresh();
})();
