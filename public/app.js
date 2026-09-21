const $ = id => document.getElementById(id);
let session = null;
let pending = false;
let retry = null;
let selectedImage = null;
const GREETING = 'こんにちは、TORIAです。\n今回は「会社のサイトが開かない」を一緒に確認します。専門用語は使わなくて大丈夫です。';
const stateLabels = { triaging: '初診中', handoff_ready: '引き継ぎ準備完了 · 未送信', resolved_reported: '社員が復旧を申告' };
function el(tag, text, className = '') { const e = document.createElement(tag); e.textContent = text; e.className = className; return e; }
function notice(text) { $('notice').textContent = text || ''; $('notice').hidden = !text; }
function addMessage(role, text) {
  const row = el('div', '', `message ${role}`);
  row.append(el('span', role === 'assistant' ? 'TORIA' : 'あなた', 'message-label'), el('p', text));
  $('messages').append(row);
}
function controls() {
  const active = !session || session.status === 'triaging';
  $('send').disabled = pending || !active;
  $('message').disabled = pending || !active;
  $('reset').disabled = pending;
  $('handoff').disabled = pending || !session || session.status !== 'triaging';
  $('verify').disabled = pending || !session || session.status !== 'triaging';
  $('reopen').disabled = pending;
  $('create-ticket').disabled = pending || Boolean(session?.ticket);
  $('copy-report').disabled = pending || !session;
  $('download-report').disabled = pending || !session;
  $('send').textContent = pending ? '確認中…' : session ? '補足を送る ↑' : '相談を始める ↑';
  document.querySelectorAll('[data-prompt], .answer-button').forEach(b => b.disabled = pending);
  $('retry').hidden = !retry || pending;
  document.querySelectorAll('[data-demo], #image-file, #image-clear').forEach(b => b.disabled = pending);
  $('image-submit').disabled = pending || !selectedImage;
}
function render() {
  $('messages').replaceChildren(); addMessage('assistant', GREETING);
  for (const message of session?.messages || []) addMessage(message.role, message.content);
  $('messages').scrollTop = $('messages').scrollHeight;
  $('suggestions').hidden = Boolean(session);
  $('case-id').textContent = session?.displayId || '新しい相談';
  $('case-state').textContent = session?.ticket ? '模擬チケット作成済み' : session ? stateLabels[session.status] : '相談待ち';
  $('case-state').dataset.state = session?.status || '';
  $('reopen').hidden = !session || session.status === 'triaging' || Boolean(session.ticket);
  $('check-card').hidden = !session?.currentCheck;
  $('image-card').hidden = !['vpn', 'error_screen'].includes(session?.currentCheck?.id);
  $('answers').replaceChildren();
  if (session?.currentCheck) {
    $('check-title').textContent = session.currentCheck.title;
    $('check-mode').textContent = session.currentCheck.mode === 'ai' ? 'AIが次の確認を選択' : session.currentCheck.mode === 'fallback' ? '基本手順で継続' : '社内手順による確認';
    for (const option of session.currentCheck.options) {
      const b = el('button', option.label, 'answer-button'); b.type = 'button';
      b.addEventListener('click', () => act({ action: 'answer', checkId: session.currentCheck.id, value: option.value }));
      $('answers').append(b);
    }
  }
  $('evidence').replaceChildren();
  $('evidence-count').textContent = session?.evidence.length || 0;
  if (!session?.evidence.length) $('evidence').append(el('p', '相談を始めると、確認の記録がここに残ります。', 'empty-state'));
  for (const item of session?.evidence || []) {
    const row = el('li', '', 'evidence-item');
    row.append(el('span', item.kind === 'discrepancy' ? '要追加確認' : item.kind === 'observed' ? '画像の観察（AI）' : item.kind === 'not_completed' ? '未実施・不明' : '社員の申告', `evidence-badge ${item.kind}`), el('strong', item.title), el('p', item.detail), el('small', `${item.id} · ${new Date(item.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`));
    $('evidence').append(row);
  }
  $('sources').replaceChildren();
  for (const doc of session?.sources || []) {
    const details = document.createElement('details'); details.className = 'source';
    details.append(el('summary', `${doc.id} · ${doc.title}`), el('small', `v${doc.version} · ${doc.updated} · 架空資料`), el('p', doc.content));
    $('sources').append(details);
  }
  if (!session?.sources.length) $('sources').append(el('p', '青葉デザイン（架空）の手順書を、相談に応じて参照します。', 'empty-state'));
  $('report').value = session?.report || '相談後に引き継ぎレポートが作成されます。';
  $('handoff-note').hidden = session?.status !== 'handoff_ready';
  $('create-ticket').hidden = Boolean(session?.ticket);
  $('handoff-title').textContent = session?.ticket ? `模擬チケット ${session.ticket.id} を保存しました。` : '引き継ぎレポートを準備しました。';
  $('handoff-description').textContent = session?.ticket ? 'ページ下の模擬チケットで、担当者の対応と社員の復旧確認を体験できます。外部への通知はありません。' : '下のレポートを確認したら、このPCに模擬チケットを作成できます。実際の担当者への通知はありません。';
  $('resolved-note').hidden = session?.status !== 'resolved_reported';
  const meta = session?.latestRequest;
  $('model').textContent = meta?.model || '未取得';
  $('latency').textContent = meta ? `${(meta.durationMs / 1000).toFixed(1)} 秒` : '—';
  $('cost').textContent = meta ? meta.costUsd === null ? '未取得' : `$${meta.costUsd.toFixed(6)}` : '—';
  $('tokens').textContent = meta?.totalTokens ?? '—';
  const usage = session?.usage;
  $('total-cost').textContent = usage ? `$${usage.knownCostUsd.toFixed(6)}${usage.unknownCosts ? ` ＋ 未取得 ${usage.unknownCosts} 件` : ''}` : '—';
  controls();
}
async function act(event, reuse = false) {
  if (pending) return;
  const body = reuse ? event : { ...event, sessionId: session?.id, revision: session?.revision, requestId: crypto.randomUUID() };
  pending = true; retry = null; notice(''); controls();
  $('activity').hidden = false;
  $('activity').textContent = body.action === 'image' ? '画像と現在の確認項目を照らし合わせています…' : '社内手順を参照して、次の確認を選んでいます…';
  try {
    const response = await fetch('/api/triage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) {
      if (response.status >= 500) retry = body;
      if (response.status === 409 && session) {
        const current = await fetch(`/api/triage?id=${encodeURIComponent(session.id)}`);
        if (current.ok) session = await current.json();
      }
      throw new Error(data.error || '処理に失敗しました。');
    }
    session = data;
    if (body.action === 'create_ticket') document.dispatchEvent(new Event('toria-ticket-created'));
    clearImage();
    sessionStorage.setItem('toria-case', session.id);
    $('message').value = '';
    notice(session.lastSelection?.warning);
  } catch (error) {
    if (error instanceof TypeError) retry = body;
    notice(error.message || '接続できませんでした。');
  } finally {
    pending = false; $('activity').hidden = true; render();
  }
}
async function checkConfig() {
  try {
    const response = await fetch('/api/status'); const data = await response.json();
    $('connection').textContent = data.configured ? '● OrcaRouter キー設定済み' : '○ APIキー未設定 · 基本手順で利用可能';
    $('connection').classList.toggle('ready', data.configured);
  } catch { $('connection').textContent = 'ローカルサーバーを確認してください'; }
}
$('refresh').addEventListener('click', checkConfig);
$('reset').addEventListener('click', () => { if (pending) return; session = null; retry = null; clearImage(); sessionStorage.removeItem('toria-case'); $('message').value = ''; notice(''); render(); });
$('handoff').addEventListener('click', () => act({ action: 'handoff' }));
$('create-ticket').addEventListener('click', () => act({ action: 'create_ticket' }));
$('verify').addEventListener('click', () => act({ action: 'verify' }));
$('reopen').addEventListener('click', () => act({ action: 'reopen' }));
$('retry').addEventListener('click', () => { if (retry) act(retry, true); });
$('copy-report').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(session.report); notice('レポートをコピーしました。送信は行っていません。'); }
  catch { $('report').focus(); $('report').select(); notice('レポートを選択しました。Ctrl+Cでコピーできます。'); }
});
$('download-report').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([session.report], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `${session.displayId}-handoff.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.querySelectorAll('[data-prompt]').forEach(b => b.addEventListener('click', () => act({ action: 'start', text: b.dataset.prompt })));
$('chat-form').addEventListener('submit', event => {
  event.preventDefault(); const text = $('message').value.trim();
  if (!text) return;
  if (/sk-orca-[A-Za-z0-9_-]+/.test(text)) return notice('APIキーはここに入力しないでください。');
  act({ action: session ? 'note' : 'start', text });
});
async function init() {
  render(); await checkConfig();
  const id = sessionStorage.getItem('toria-case');
  if (id) {
    try { const response = await fetch(`/api/triage?id=${encodeURIComponent(id)}`); if (response.ok) session = await response.json(); else sessionStorage.removeItem('toria-case'); }
    catch { notice('以前の案件を読み込めません。接続を確認してください。'); }
    render();
  }
}
function clearImage() {
  selectedImage = null; $('image-file').value = ''; $('image-preview').removeAttribute('src'); $('image-preview-wrap').hidden = true;
}
async function previewImage(file) {
  if (pending) return;
  if (!file || !['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) return notice('2MB以内のPNGまたはJPEGを選んでください。');
  try {
    const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    if (pending) return;
    selectedImage = url; $('image-preview').src = url; $('image-preview-wrap').hidden = false; notice('送信前に、画像に機密情報が含まれていないか確認してください。'); controls();
  } catch { notice('画像を読み込めませんでした。'); }
}
$('image-file').addEventListener('change', () => previewImage($('image-file').files[0]));
$('image-clear').addEventListener('click', () => { clearImage(); controls(); });
$('image-submit').addEventListener('click', () => { if (selectedImage) act({ action: 'image', checkId: session.currentCheck.id, image: selectedImage }); });
document.querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', async () => {
  try { const response = await fetch(`/demo/${b.dataset.demo}.png`); if (!response.ok) throw new Error(); await previewImage(await response.blob()); }
  catch { notice('デモ画像を読み込めませんでした。'); }
}));
init();
