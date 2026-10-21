# ChatGPT to PDF Chrome Extension

A Chrome extension that exports ChatGPT conversations to PDF while preserving formatting, code blocks, and tables.

## Features

- **Select loaded messages**: Only the chat turns currently rendered in the ChatGPT viewport are extracted.
- **Granular selection**: Choose individual user prompts and/or ChatGPT responses.
- **Preserves formatting**: Code blocks, inline code, tables, lists, blockquotes, and images keep their structure in the PDF.
- **Syntax highlighting**: Code blocks are colored by language, including Java, SQL, Python, JavaScript/TypeScript, JSON, Bash, C#, C/C++, Go, Rust, YAML, Markdown, HTML, and CSS.
- **ChatGPT-like layout**: User messages appear on the right, ChatGPT responses on the left.
- **Simple workflow**: Click Export → select messages → click Done → print/save as PDF.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select this extension folder (`ChatGPT to PDF extension`).
5. The extension icon will appear in your toolbar.

## How to use

1. Go to [chatgpt.com](https://chatgpt.com) and open a conversation.
2. Scroll through the conversation so all the messages you want to export are loaded on the page.
3. Click the extension icon in the Chrome toolbar, then click **Export Chat**.
4. In the popup window, select the user prompts and ChatGPT responses you want.
5. Click **Done**.
6. A new tab opens with a print-friendly preview.
7. Click **Download exact PDF** to save a PDF that looks exactly like the preview (recommended).
   - Alternatively, click **Print / Save as PDF** and choose **Save as PDF** in Chrome’s print dialog. For best results with this option, enable the **Background graphics** setting in the print dialog.

## Notes

- ChatGPT only keeps the messages currently visible in the DOM. Scroll up/down to load older messages before exporting.
- The extension works on `https://chatgpt.com/*` and `https://chat.openai.com/*`.
- If extraction fails, refresh the ChatGPT page and try again.
- **Download exact PDF** captures the preview as an image and puts it into a PDF, so it preserves colors, bubbles, and layout perfectly.
- **Print / Save as PDF** creates a selectable-text PDF, but Chrome may drop background colors unless you enable **Background graphics**.

## Files

- `manifest.json` — Extension configuration.
- `content.js` — Extracts conversation turns from ChatGPT.
- `popup.html/js/css` — Extension popup with the Export button.
- `selector.html/js/css` — Message selection window.
- `pdf.html/js/css` — Print-ready preview page.
- `libs/prism/` — Bundled Prism.js syntax highlighter and language grammars.
- `background.js` — Service worker.
- `icons/` — Toolbar icons.
