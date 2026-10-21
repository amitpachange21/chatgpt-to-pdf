(function () {
  'use strict';

  function sanitizeImages(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    wrapper.querySelectorAll('img').forEach((img) => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.removeAttribute('srcset');
    });

    // Remove any lingering empty button wrappers.
    wrapper.querySelectorAll('button, [role="button"]').forEach((el) => el.remove());

    return wrapper.innerHTML;
  }

  function renderTurn(item) {
    const turnDiv = document.createElement('div');
    turnDiv.className = 'turn ' + (item.role === 'user' ? 'user-turn' : 'assistant-turn');

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = item.role === 'user' ? 'You' : 'AI';

    const message = document.createElement('div');
    message.className = 'message';
    message.innerHTML = sanitizeImages(item.html);

    if (item.role === 'user') {
      turnDiv.appendChild(message);
      turnDiv.appendChild(avatar);
    } else {
      turnDiv.appendChild(avatar);
      turnDiv.appendChild(message);
    }

    return turnDiv;
  }

  function render() {
    chrome.storage.local.get(['selectedTurns', 'chatTitle', 'chatUrl'], (data) => {
      const turns = data.selectedTurns || [];
      const title = data.chatTitle || 'ChatGPT Conversation';
      const url = data.chatUrl || '';

      document.title = title + ' - PDF';
      document.getElementById('chatTitle').textContent = title;
      document.getElementById('docTitle').textContent = title;
      document.getElementById('docUrl').textContent = url;

      const conversation = document.getElementById('conversation');
      conversation.innerHTML = '';

      if (turns.length === 0) {
        conversation.innerHTML = '<p>No messages selected.</p>';
        return;
      }

      turns.forEach((item) => {
        conversation.appendChild(renderTurn(item));
      });

      if (window.Prism && typeof window.Prism.highlightAllUnder === 'function') {
        try {
          window.Prism.highlightAllUnder(conversation);
        } catch (err) {
          console.error('Syntax highlighting failed:', err);
        }
      }
    });
  }

  async function downloadExactPdf() {
    const pageEl = document.querySelector('.page');
    const downloadBtn = document.getElementById('downloadBtn');
    const originalText = downloadBtn.textContent;

    if (!pageEl || !window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF libraries are not loaded. Please try the Print button instead.');
      return;
    }

    downloadBtn.textContent = 'Capturing...';
    downloadBtn.disabled = true;

    try {
      const canvas = await window.html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: pageEl.scrollWidth,
        windowHeight: pageEl.scrollHeight
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = pdfWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;

      let heightLeft = scaledHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, scaledHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - scaledHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, scaledHeight);
        heightLeft -= pdfHeight;
      }

      const safeTitle = document.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'chatgpt_export';
      pdf.save(safeTitle + '.pdf');
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Could not generate PDF: ' + err.message + '\n\nTry using the "Print / Save as PDF" button instead.');
    } finally {
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', render);

  document.getElementById('printBtn').addEventListener('click', () => {
    window.print();
  });

  document.getElementById('downloadBtn').addEventListener('click', downloadExactPdf);
})();
