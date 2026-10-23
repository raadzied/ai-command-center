const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const chat = document.getElementById('chat');
const modal = document.getElementById('approval-modal');

let pending = false;

function appendMessage(role, content, meta) {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const header = document.createElement('div');
  header.className = 'msg-header';
  header.textContent =
    role === 'user' ? 'أنت' : role === 'error' ? 'خطأ' : meta?.agent ?? 'النظام';

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = content;

  div.appendChild(header);
  div.appendChild(body);

  if (meta?.elapsedMs) {
    const m = document.createElement('div');
    m.className = 'msg-meta';
    m.textContent = `${meta.elapsedMs}ms · intent: ${meta.intent}`;
    div.appendChild(m);
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

async function send() {
  const text = input.value.trim();
  if (!text || pending) return;

  pending = true;
  input.value = '';
  sendBtn.disabled = true;

  appendMessage('user', text);

  try {
    const result = await window.api.sendInput(text);
    if (result.ok) {
      appendMessage('agent', result.content, {
        agent: result.agentUsed ?? 'chat',
        intent: result.intent,
        elapsedMs: result.elapsedMs,
      });
    } else {
      appendMessage('error', result.error ?? 'خطأ غير معروف');
    }
  } catch (err) {
    appendMessage('error', String(err));
  } finally {
    pending = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

sendBtn.addEventListener('click', send);

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

window.api.onApprovalRequest(({ auditId, action }) => {
  document.getElementById('ap-type').textContent = action.type;
  document.getElementById('ap-target').textContent = action.target;
  document.getElementById('ap-reason').textContent = action.reason;
  document.getElementById('ap-explanation').textContent = action.explanation;

  modal.hidden = false;

  const approve = document.getElementById('ap-approve');
  const deny = document.getElementById('ap-deny');

  const respond = (approved) => {
    modal.hidden = true;
    window.api.respondApproval(auditId, approved);
    approve.removeEventListener('click', onApprove);
    deny.removeEventListener('click', onDeny);
  };

  const onApprove = () => respond(true);
  const onDeny = () => respond(false);

  approve.addEventListener('click', onApprove);
  deny.addEventListener('click', onDeny);
});

input.focus();