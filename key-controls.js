(() => {
  const input = document.getElementById('finnhubApiKey');
  if (!input) return;
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'API 키 복사';
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.textContent = '키 보기';
  reveal.setAttribute('aria-pressed', 'false');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.style.fontSize = '13px';
  copy.addEventListener('click', async () => {
    if (!input.value.trim()) { status.textContent = '저장된 키가 없습니다.'; return; }
    try {
      await navigator.clipboard.writeText(input.value.trim());
      status.textContent = '복사했습니다. GitHub의 Secret 입력란에 붙여넣으세요.';
    } catch {
      status.textContent = '브라우저에서 복사를 허용하지 않았습니다. 키 보기를 누른 뒤 입력란에서 전체 선택하여 복사하세요.';
    }
  });
  function hide() {
    input.type = 'password';
    reveal.textContent = '키 보기';
    reveal.setAttribute('aria-pressed', 'false');
  }
  reveal.addEventListener('click', () => {
    if (input.type === 'text') { hide(); return; }
    input.type = 'text';
    reveal.textContent = '키 숨기기';
    reveal.setAttribute('aria-pressed', 'true');
    input.focus();
    input.select();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  controls.append(copy, reveal);
  input.closest('label').after(controls);
  controls.append(status);
})();
