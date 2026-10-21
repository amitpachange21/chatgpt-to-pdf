(function () {
  'use strict';

  let turns = [];

  const listEl = document.getElementById('list');
  const doneBtn = document.getElementById('doneBtn');
  const summaryEl = document.getElementById('summary');

  function groupTurns(items) {
    // Pair each user prompt with the ChatGPT response(s) that follow it.
    const groups = [];

    items.forEach((item) => {
      if (item.role === 'user' || groups.length === 0) {
        groups.push({ messages: [item] });
      } else {
        groups[groups.length - 1].messages.push(item);
      }
    });

    return groups;
  }

  function updateSummary() {
    const checked = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'));
    const userCount = checked.filter((cb) => cb.dataset.role === 'user').length;
    const assistantCount = checked.length - userCount;

    summaryEl.textContent = checked.length +
      (checked.length === 1 ? ' message selected' : ' messages selected') +
      ' (You: ' + userCount + ', ChatGPT: ' + assistantCount + ')';
    doneBtn.disabled = checked.length === 0;
  }

  function render() {
    listEl.innerHTML = '';

    if (!turns || turns.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No messages were found. Go back to ChatGPT, scroll to load the conversation, and try again.</div>';
      updateSummary();
      return;
    }

    const userCount = turns.filter((turn) => turn.role === 'user').length;
    const assistantCount = turns.filter((turn) => turn.role === 'assistant').length;

    if (userCount === 0 || assistantCount === 0) {
      const notice = document.createElement('div');
      notice.className = 'notice';
      notice.textContent = assistantCount === 0
        ? 'Only your messages were found. Scroll through the whole conversation in ChatGPT so its replies load, then export again.'
        : 'Only ChatGPT replies were found. Scroll up in ChatGPT so your prompts load, then export again.';
      listEl.appendChild(notice);
    }

    const groups = groupTurns(turns);

    groups.forEach((group, groupIdx) => {
      const turnDiv = document.createElement('div');
      turnDiv.className = 'turn';

      const header = document.createElement('div');
      header.className = 'turn-header';
      header.textContent = 'Chat ' + (groupIdx + 1);

      const actions = document.createElement('div');
      actions.className = 'turn-actions';

      const selectTurnBtn = document.createElement('button');
      selectTurnBtn.className = 'btn-link';
      selectTurnBtn.textContent = 'Select';
      selectTurnBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        turnDiv.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
        updateSummary();
      });

      const deselectTurnBtn = document.createElement('button');
      deselectTurnBtn.className = 'btn-link';
      deselectTurnBtn.textContent = 'Deselect';
      deselectTurnBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        turnDiv.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
        updateSummary();
      });

      actions.appendChild(selectTurnBtn);
      actions.appendChild(deselectTurnBtn);
      header.appendChild(actions);
      turnDiv.appendChild(header);

      group.messages.forEach((msg) => {
        const label = document.createElement('label');
        label.className = 'message-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.dataset.index = msg.index;
        checkbox.dataset.role = msg.role;
        checkbox.addEventListener('change', updateSummary);

        const meta = document.createElement('div');
        meta.className = 'message-meta';

        const badge = document.createElement('span');
        badge.className = 'badge ' + msg.role;
        badge.textContent = msg.role === 'user' ? 'You' : 'ChatGPT';
        meta.appendChild(badge);

        const preview = document.createElement('div');
        preview.className = 'preview';
        const snippet = msg.text.replace(/\s+/g, ' ').trim();
        preview.textContent = snippet.length > 160 ? snippet.slice(0, 160) + '...' : snippet;

        label.appendChild(checkbox);
        label.appendChild(meta);
        label.appendChild(preview);
        turnDiv.appendChild(label);
      });

      listEl.appendChild(turnDiv);
    });

    updateSummary();
  }

  function getCheckedItems() {
    const selected = [];
    document.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
      const item = turns.find((t) => t.index === parseInt(cb.dataset.index, 10) && t.role === cb.dataset.role);
      if (item) selected.push(item);
    });
    return selected;
  }

  function setAll(checked) {
    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = checked));
    updateSummary();
  }

  function setByRole(role, checked) {
    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      if (cb.dataset.role === role) cb.checked = checked;
    });
    updateSummary();
  }

  document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get('chatTurns', (data) => {
      turns = data.chatTurns || [];
      render();
    });
  });

  document.getElementById('selectAllBtn').addEventListener('click', () => setAll(true));
  document.getElementById('deselectAllBtn').addEventListener('click', () => setAll(false));
  document.getElementById('selectUserBtn').addEventListener('click', () => {
    setAll(false);
    setByRole('user', true);
  });
  document.getElementById('selectAssistantBtn').addEventListener('click', () => {
    setAll(false);
    setByRole('assistant', true);
  });

  doneBtn.addEventListener('click', async () => {
    const selected = getCheckedItems();
    if (selected.length === 0) {
      window.alert('Please select at least one message.');
      return;
    }

    await chrome.storage.local.set({ selectedTurns: selected });
    chrome.tabs.create({ url: chrome.runtime.getURL('pdf.html') });
    window.close();
  });
})();
