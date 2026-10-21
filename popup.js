(function () {
  const exportBtn = document.getElementById('exportBtn');
  const statusEl = document.getElementById('status');

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  exportBtn.addEventListener('click', async () => {
    setStatus('Reading conversation...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        setStatus('No active tab found.', 'error');
        return;
      }

      const url = tab.url || '';
      if (!url.includes('chatgpt.com') && !url.includes('chat.openai.com')) {
        setStatus('Please open ChatGPT first.', 'error');
        return;
      }

      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_CHAT' });
      } catch (err) {
        setStatus('Could not connect to the page. Please refresh ChatGPT and try again.', 'error');
        return;
      }

      if (response && response.error) {
        setStatus('Extraction error: ' + response.error, 'error');
        return;
      }

      if (!response || !response.turns) {
        setStatus('No conversation data found. Scroll to load messages.', 'error');
        return;
      }

      if (response.turns.length === 0) {
        setStatus(
          'No messages found. ChatGPT may have changed its page layout. Open DevTools (F12) → Console, click Export again, and look for "[ChatGPT to PDF]" logs.',
          'error'
        );
        return;
      }

      await chrome.storage.local.set({
        chatTurns: response.turns,
        chatTitle: response.title || document.title,
        chatUrl: response.url || url
      });

      await chrome.windows.create({
        url: chrome.runtime.getURL('selector.html'),
        type: 'popup',
        width: 520,
        height: 740,
        focused: true
      });

      setStatus('Selector opened.', 'success');
    } catch (err) {
      setStatus('Error: ' + err.message, 'error');
    }
  });
})();
