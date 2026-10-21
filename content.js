(function () {
  'use strict';

  const DEBUG = true;

  const UI_SELECTORS = [
    'button',
    '[role="button"]',
    '[class*="copy"]',
    '[class*="thumbs"]',
    '[class*="feedback"]',
    '[class*="regenerate"]',
    '[class*="clipboard"]',
    '[class*="code-header"]',
    '[data-testid*="copy-turn"]',
    '[data-testid*="good-response"]',
    '[data-testid*="bad-response"]',
    '[data-testid*="regenerate"]',
    'svg[class*="icon"]',
    '.sr-only',
    '[aria-hidden="true"]'
  ];

  function log(...args) {
    if (DEBUG) {
      console.log('[ChatGPT to PDF]', ...args);
    }
  }

  const CODE_LANGUAGE_ALIASES = {
    java: 'java',
    sql: 'sql',
    mysql: 'sql',
    postgresql: 'sql',
    postgres: 'sql',
    plsql: 'sql',
    tsql: 'sql',
    javascript: 'javascript',
    js: 'javascript',
    jsx: 'javascript',
    typescript: 'typescript',
    ts: 'typescript',
    tsx: 'typescript',
    python: 'python',
    py: 'python',
    json: 'json',
    bash: 'bash',
    shell: 'bash',
    sh: 'bash',
    zsh: 'bash',
    csharp: 'csharp',
    'c#': 'csharp',
    c: 'c',
    cpp: 'cpp',
    'c++': 'cpp',
    go: 'go',
    golang: 'go',
    rust: 'rust',
    yaml: 'yaml',
    yml: 'yaml',
    html: 'markup',
    xml: 'markup',
    svg: 'markup',
    css: 'css',
    markdown: 'markdown',
    md: 'markdown'
  };

  const CODE_PLAIN_TEXT_LABELS = new Set([
    'plain text', 'plaintext', 'plain', 'text', 'txt', 'none'
  ]);

  const CODE_LANGUAGE_ATTRIBUTES = [
    'data-language', 'data-lang', 'data-code-language', 'data-highlight-language'
  ];

  /**
   * Turn a class/attribute/header value into a Prism language id.
   * Returns null for an explicit "Plain text" block and undefined when the
   * value is not a language label at all.
   */
  function normalizeCodeLanguage(value) {
    if (value === null || value === undefined) return undefined;

    let label = String(value).replace(/\s+/g, ' ').trim().toLowerCase();
    if (!label || label.length > 30) return undefined;

    label = label
      .replace(/^(?:language|lang)\s*[:\-]\s*/i, '')
      .replace(/\s+(?:code|snippet)$/i, '')
      .replace(/\s+copy(?:\s+code)?$/i, '')
      .trim();

    if (!label) return undefined;
    if (CODE_PLAIN_TEXT_LABELS.has(label)) return null;

    if (CODE_LANGUAGE_ALIASES[label]) return CODE_LANGUAGE_ALIASES[label];

    // Labels such as "Java code" or "SQL query".
    const firstWord = label.split(/\s+/)[0];
    return CODE_LANGUAGE_ALIASES[firstWord] || undefined;
  }

  function languageFromClassNames(node) {
    const className = node && node.getAttribute ? node.getAttribute('class') : '';
    if (!className) return undefined;

    const match = className.match(/(?:^|\s)(?:language|lang)-([a-z0-9+#._-]+)/i);
    if (!match) return undefined;

    return normalizeCodeLanguage(match[1]);
  }

  function detectLanguageFromNodeAttributes(node, stopAt) {
    let current = node;

    for (let depth = 0; current && current !== stopAt && depth < 5; depth += 1, current = current.parentElement) {
      const fromClass = languageFromClassNames(current);
      if (fromClass !== undefined) return fromClass;

      for (const attr of CODE_LANGUAGE_ATTRIBUTES) {
        const fromAttribute = normalizeCodeLanguage(current.getAttribute(attr));
        if (fromAttribute !== undefined) return fromAttribute;
      }
    }

    return undefined;
  }

  /**
   * Collect short text nodes/elements immediately around a code block. ChatGPT
   * renders the language name (Java, SQL, Plain text, ...) in a small header
   * above the code, and its exact wrapper changes between releases.
   */
  function getCodeLabelCandidates(code, wrapper) {
    const candidates = [];
    const seen = new Set();

    const add = (el) => {
      if (!el || el === code || el.contains(code) || seen.has(el)) return;
      seen.add(el);
      candidates.push(el);
    };

    const pre = code.closest('pre');
    if (pre) {
      add(pre.previousElementSibling);

      const parent = pre.parentElement;
      if (parent && parent !== wrapper) {
        add(parent.previousElementSibling);
        Array.from(parent.children).forEach((child) => {
          if (child === pre || child.contains(pre)) return;
          add(child);
        });
      }
    }

    let node = code;
    for (let depth = 0; node && node !== wrapper && depth < 4; depth += 1, node = node.parentElement) {
      add(node.previousElementSibling);
    }

    return candidates;
  }

  function detectCodeLanguageFromText(text) {
    const src = (text || '').trim();
    if (!src) return null;

    // JSON is the most reliable signal when the whole block parses.
    const trimmed = src.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch (_) {
        // Not valid JSON; keep looking.
      }
    }

    // C/C++.
    if (/^\s*#\s*include\s*[<"]/m.test(src) ||
        /\bstd::|using\s+namespace\s+std\b/.test(src)) {
      return 'cpp';
    }

    // C#.
    if (/\busing\s+System\b|\bConsole\.(?:Write|Read)|\bnamespace\s+[\w.]+\s*[;{]/m.test(src)) {
      return 'csharp';
    }

    // Java.
    if (/\b(?:import\s+java\.|System\.out\.print|public\s+static\s+void\s+main\b|@Override\b|^\s*package\s+[\w.]+\s*;|(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\b|\b(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+|static\s+)*(?:class|interface|enum|record)\s+[A-Z]\w*\b)/im.test(src)) {
      return 'java';
    }

    // TypeScript (before JavaScript, because type annotations are distinctive).
    if (/\b(?:interface|type)\s+\w+\s*[={]|\b:\s*(?:string|number|boolean|void|any|unknown|never)\b/.test(src)) {
      return 'typescript';
    }

    // JavaScript.
    if (/\b(?:const|let|var)\s+\w+\s*=|=>|\bfunction\s+\w+\s*\(/.test(src)) {
      return 'javascript';
    }

    // Python.
    if (/^\s*(?:def|class)\s+\w+.*:/m.test(src) || /^\s*(?:from\s+\w+\s+import|import\s+\w+)/m.test(src)) {
      return 'python';
    }

    // Bash/shell.
    if (/^#!.*\b(?:ba|z)?sh\b/m.test(src) || /^\s*(?:\$|>)\s+\w+/m.test(src)) {
      return 'bash';
    }

    // SQL.
    if (/\b(?:SELECT\b[\s\S]{0,500}?\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|CREATE\s+(?:TABLE|VIEW|INDEX)\b|ALTER\s+TABLE\b|DROP\s+(?:TABLE|VIEW|INDEX)\b|WITH\s+\w+\s+AS\s*\()/i.test(src)) {
      return 'sql';
    }

    // CSS.
    if (/^\s*[.#]?[a-z][\w-]*(?:\s+[^{]+)?\s*\{[^}]*:[^}]*\}/i.test(src)) {
      return 'css';
    }

    // HTML/XML.
    if (/^\s*<(!doctype|[a-z][\w:-]*)[\s>]/i.test(src)) {
      return 'markup';
    }

    return null;
  }

  function applyCodeLanguages(wrapper) {
    wrapper.querySelectorAll('pre > code').forEach((code) => {
      let language = detectLanguageFromNodeAttributes(code, wrapper);
      let labelElement = null;

      const candidates = getCodeLabelCandidates(code, wrapper);

      for (const candidate of candidates) {
        const text = (candidate.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 40) continue;

        const parsed = normalizeCodeLanguage(text);
        if (parsed === undefined) continue;

        if (language === undefined) language = parsed;
        labelElement = candidate;
        break;
      }

      // If ChatGPT did not label the block (or labelled it "Plain text"),
      // infer Java/SQL/etc. from the code itself.
      if (language === undefined || language === null) {
        const inferred = detectCodeLanguageFromText(code.textContent || '');
        if (inferred) language = inferred;
      }

      if (language) {
        Array.from(code.classList).forEach((className) => {
          if (/^(?:language|lang)-/i.test(className)) code.classList.remove(className);
        });
        code.classList.add('language-' + language);
      }

      // Remove the small language header above the block ("Java", "Plain
      // text", ...). Never remove a paragraph or heading (those can be real
      // answer content), and only remove a direct code-block header.
      if (labelElement) {
        const pre = code.closest('pre');
        let isDirectHeader = Boolean(
          pre && pre.parentElement && labelElement.parentElement === pre.parentElement
        );

        if (!isDirectHeader && pre) {
          let node = pre;

          for (let depth = 0; node && node !== wrapper && depth < 3; depth += 1, node = node.parentElement) {
            if (labelElement === node.previousElementSibling) {
              isDirectHeader = true;
              break;
            }
          }
        }

        const isContentElement = /^(P|H[1-6])$/.test(labelElement.tagName);

        if (isDirectHeader && !isContentElement) {
          const parent = labelElement.parentElement;
          labelElement.remove();

          if (parent && parent !== wrapper && !parent.textContent.trim() &&
              !parent.querySelector('pre, code')) {
            parent.remove();
          }
        }
      }
    });
  }

  function cleanHtml(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    wrapper.querySelectorAll(UI_SELECTORS.join(',')).forEach((el) => {
      const text = (el.textContent || '').trim();
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
        el.remove();
      } else if (text.length === 0 || text.length <= 2) {
        el.remove();
      }
    });

    // ChatGPT sometimes renders fenced code blocks (including ASCII diagrams)
    // as a block-level <code class="... CodeContent ..."> instead of a <pre>.
    // The PDF stylesheet preserves whitespace on <pre>, so wrap those code
    // elements before the markup leaves the ChatGPT page.
    wrapper.querySelectorAll('code').forEach((code) => {
      if (code.closest('pre')) return;

      const classTokens = (code.getAttribute('class') || '').split(/\s+/);
      const isBlockCode = classTokens.includes('block') ||
        classTokens.includes('whitespace-pre') ||
        classTokens.includes('whitespace-pre!');

      if (!isBlockCode && !/\n/.test(code.textContent || '')) return;

      const pre = document.createElement('pre');
      pre.appendChild(code.cloneNode(true));
      code.replaceWith(pre);
    });

    applyCodeLanguages(wrapper);

    wrapper.querySelectorAll('img').forEach((img) => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.removeAttribute('srcset');
    });

    return wrapper.innerHTML;
  }

  /**
   * Clean a message's HTML and derive its plain text from the cleaned markup,
   * so toolbar labels such as "Copy" do not end up in the preview or PDF.
   */
  function getCleanContent(el) {
    const html = cleanHtml(el.innerHTML);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    // textContent does not add line breaks between block elements; insert
    // them so multi-paragraph answers stay readable in the preview.
    wrapper.querySelectorAll(
      'p, div, section, article, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre, table'
    ).forEach((node) => {
      node.appendChild(document.createTextNode('\n'));
    });

    const text = (wrapper.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { text, html };
  }

  function hasVisibleText(el) {
    return getVisibleText(el).length > 0;
  }

  function getVisibleText(el) {
    if (!el) return '';
    // innerText respects CSS visibility, but ChatGPT's reveal animations can
    // temporarily make an answer's innerText empty even though its text is in
    // the DOM, so fall back to textContent.
    const inner = (el.innerText || '').trim();
    if (inner.length > 0) return inner;
    return (el.textContent || '').trim();
  }

  function isInsideUserMessage(el) {
    if (!el || el.nodeType !== 1) return false;
    return Boolean(el.closest(
      '[class*="bg-user-message"], [class*="text-user-message"], [class*="group/user-message"]'
    ));
  }

  /**
   * Read the speaker from the semantic markers ChatGPT has used across its
   * recent layouts. data-message-author-role is still around in places, but
   * newer layouts only expose class names such as group/user-message and
   * MarkdownRoot-XXXX for the two sides of the conversation.
   */
  function explicitRole(el) {
    if (!el || el.nodeType !== 1) return null;

    const author = (el.getAttribute('data-message-author-role') || '').toLowerCase();
    if (author === 'user' || author === 'assistant') return author;

    const turn = (el.getAttribute('data-turn') || '').toLowerCase();
    if (turn === 'user' || turn === 'assistant') return turn;

    for (const attr of ['data-message-author', 'data-conversation-role', 'data-message-role', 'data-role']) {
      const value = (el.getAttribute(attr) || '').toLowerCase();
      if (value === 'user' || value === 'assistant') return value;
    }

    const style = (el.getAttribute('data-markdown-text-style') || '').toLowerCase();
    if (style === 'user-message') return 'user';
    if (style === 'assistant-message') return 'assistant';

    for (const attr of ['data-chatgpt-search-unit-key', 'data-content-search-unit-key']) {
      const key = (el.getAttribute(attr) || '').toLowerCase();
      if (key.endsWith(':user')) return 'user';
      if (key.endsWith(':assistant')) return 'assistant';
    }

    const bubble = el.getAttribute('data-user-message-bubble');
    if (bubble !== null && bubble !== 'false') return 'user';

    const cls = (el.getAttribute('class') || '').toLowerCase();
    if (/(assistant-message|chatgpt-message|dilresponse|response-root|agent-turn|assistant-turn)/.test(cls)) return 'assistant';
    if (/(user-message|dilprompt|prompt-root|user-turn)/.test(cls)) return 'user';
    if (cls.includes('markdownroot')) return isInsideUserMessage(el) ? 'user' : 'assistant';

    // Dil renderer nodes are usually assistant responses, but prompt roots use
    // the same message-id attribute, so check the class first (above).
    if (el.hasAttribute('data-dil-message-id')) return 'assistant';

    const testid = (el.getAttribute('data-testid') || '').toLowerCase();
    if (testid.includes('assistant') && !testid.includes('user')) return 'assistant';
    if (testid.includes('user') && !testid.includes('assistant')) return 'user';

    return null;
  }

  function roleFromTree(el) {
    const direct = explicitRole(el);
    if (direct) return direct;

    let node = el.parentElement;
    let depth = 0;
    while (node && node !== document.body && depth < 12) {
      const role = explicitRole(node);
      if (role) return role;
      node = node.parentElement;
      depth += 1;
    }

    const nested = el.querySelector(
      '[data-message-author-role], [data-markdown-text-style], [data-turn], ' +
      '[data-user-message-bubble], [data-dil-message-id]'
    );
    return explicitRole(nested);
  }

  function hasMessageMarkers(root) {
    return Boolean(root.querySelector(
      '[data-message-author-role], [data-turn], [data-markdown-text-style], ' +
      '[data-user-message-bubble], [class*="bg-user-message"], [class*="text-user-message"], ' +
      '[class*="group/user-message"], [class*="MarkdownRoot"]'
    ));
  }

  function getConversationRoot() {
    // main is the reliable outer boundary in both the older and the current
    // ChatGPT layouts. data-thread-find-target="conversation" can point at a
    // navigation/preview container that does not hold the rendered messages,
    // so only accept a candidate that actually contains message markers.
    const main = document.querySelector('main, [role="main"]');
    if (main && hasMessageMarkers(main)) return main;

    const selectors = [
      '[data-thread-find-target="conversation"]',
      '#thread',
      '[data-testid="thread"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && hasMessageMarkers(el)) return el;
    }

    return document.body;
  }

  function isExcludedRegion(el) {
    // Note: do NOT exclude [data-thread-user-message-navigation-content] or
    // [role="navigation"]. Despite their names, ChatGPT uses those markers on
    // the thread content wrapper that holds the real messages.
    return Boolean(el.closest('nav, aside'));
  }

  function findMessageWrapper(el) {
    return el.closest(
      '[data-turn="user"], [data-turn="assistant"], ' +
      '[data-turn-id-container], ' +
      '[data-chatgpt-selection-message-id], ' +
      '[data-chatgpt-search-unit-key], [data-content-search-unit-key], ' +
      '[data-testid*="conversation-turn"], article'
    ) || el;
  }

  /**
   * Make sure a wrapper really represents a single message. Some ChatGPT
   * layouts put a prompt and its answer inside one container; using that as
   * the identity would merge the two messages together.
   */
  function wrapperRoleMatches(wrapper, role) {
    if (!wrapper) return false;

    const roles = new Set();
    const wrapperRole = explicitRole(wrapper);
    if (wrapperRole) roles.add(wrapperRole);

    wrapper.querySelectorAll(
      '[data-message-author-role], [data-markdown-text-style], [data-turn], ' +
      '[data-user-message-bubble], [data-dil-message-id]'
    ).forEach((node) => {
      const nodeRole = explicitRole(node);
      if (nodeRole) roles.add(nodeRole);
    });

    return roles.size <= 1 && (roles.size === 0 || roles.has(role));
  }

  function getMessageUniqueId(el) {
    let node = el;
    let depth = 0;

    while (node && node !== document.body && depth < 8) {
      const id = node.getAttribute('data-message-id') ||
        node.getAttribute('data-chatgpt-selection-message-id');
      if (id) return id;
      node = node.parentElement;
      depth += 1;
    }

    return null;
  }

  function logDomSample() {
    // Sample a broader set of elements so future layout changes are easier to diagnose.
    const nodes = Array.from(document.querySelectorAll(
      'article, [data-testid], [data-message-author-role], [data-virtualized-turn-content], ' +
      '[data-markdown-text-style], [data-user-message-bubble], [data-turn], ' +
      '[data-chatgpt-search-unit-key], [data-content-search-unit-key], ' +
      '[data-chatgpt-selection-message-id], [data-dil-message-id], ' +
      '[class*="DilResponseRoot"], [class*="DilPromptRoot"], ' +
      'main, [class*="turn"], [class*="message"], [class*="conversation"], ' +
      '[class*="user-message"], [class*="assistant-message"]'
    )).slice(0, 80);
    const sample = nodes.map((el) => {
      const attrs = [];
      if (el.tagName) attrs.push(el.tagName.toLowerCase());
      const testid = el.getAttribute('data-testid');
      if (testid) attrs.push('data-testid="' + testid + '"');
      const role = el.getAttribute('data-message-author-role');
      if (role) attrs.push('data-message-author-role="' + role + '"');
      const cls = (el.className || '').toString().split(/\s+/).slice(0, 3).join(' ');
      if (cls) attrs.push('class="' + cls + (el.classList.length > 3 ? ' ...' : '') + '"');
      return '<' + attrs.join(' ') + '>';
    }).join(', ');
    log('DOM sample:', sample || '(no matching elements)');
  }

  /**
   * Find the richest text container inside a message wrapper.
   * We prefer known ChatGPT classes first, then fall back to a
   * decent generic selector.
   */
  function findContentContainer(root, role) {
    // Dil renderer responses are self-contained: their root node already holds
    // all of the message content across multiple direct children, so do not try
    // to drill into a single child container.
    if (root.hasAttribute('data-dil-message-id')) {
      return root;
    }
    const isDilClass = (root.getAttribute('class') || '').toLowerCase().includes('dil');
    if (isDilClass && root.querySelector('[data-dil-message-id]')) {
      return root.querySelector('[data-dil-message-id]');
    }

    const roleSpecific = role === 'user'
      ? [
          '[data-markdown-text-style="user-message"]',
          '[data-user-message-bubble]',
          '[class*="bg-user-message"]',
          '[class*="text-user-message"]',
          '.whitespace-pre-wrap',
          '.break-words',
          '[class*="text-message"]',
          '[data-message-content="true"]'
        ]
      : [
          '[data-markdown-text-style="assistant-message"]',
          '[data-dil-message-id]',
          '[class*="MarkdownRoot"]',
          '.markdown',
          '.prose',
          '[class*="prose"]',
          '.break-words',
          '[class*="text-message"]',
          '[data-message-content="true"]'
        ];

    const generic = [
      'div > div:last-child',
      '> div'
    ];

    for (const selector of roleSpecific.concat(generic)) {
      try {
        const el = root.querySelector(selector);
        if (el && hasVisibleText(el)) {
          return el;
        }
      } catch (_) {
        // Ignore invalid selectors in older browsers.
      }
    }

    return root;
  }

  /**
   * Primary extractor for the current (2025/2026) ChatGPT DOM.
   *
   * The newer layout does not consistently put data-message-author-role on
   * assistant replies. User prompts may keep that attribute while ChatGPT
   * answers only expose data-markdown-text-style="assistant-message",
   * data-chatgpt-search-unit-key="...:assistant" or a Dil response root.
   * Query every known marker and merge the results so neither side is lost.
   */
  const ROLE_MARKER_GROUPS = [
    {
      selector: '[data-message-author-role]',
      priority: 1,
      role: explicitRole
    },
    {
      selector: '[data-markdown-text-style="user-message"], [data-markdown-text-style="assistant-message"]',
      priority: 2,
      role: explicitRole
    },
    {
      selector: '[data-chatgpt-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":assistant"], ' +
        '[data-content-search-unit-key$=":user"], [data-content-search-unit-key$=":assistant"], ' +
        '[data-message-author], [data-conversation-role], [data-message-role]',
      priority: 3,
      role: explicitRole
    },
    {
      selector: '[data-user-message-bubble]',
      priority: 4,
      role: explicitRole
    },
    {
      selector: '[data-dil-message-id]',
      priority: 5,
      role: explicitRole
    },
    {
      selector: '[data-turn="user"], [data-turn="assistant"]',
      priority: 6,
      role: explicitRole
    },
    {
      // Current Oct-2026 layout: user bubbles keep a user-message class while
      // assistant replies are rendered inside a MarkdownRoot-XXXX container.
      selector: '[class*="bg-user-message"], [class*="text-user-message"], ' +
        '[class*="group/user-message"], [class*="MarkdownRoot"]',
      priority: 7,
      role: explicitRole
    }
  ];

  function resolveContentElement(el, role) {
    if (el.matches(
      '[data-markdown-text-style], [data-dil-message-id], [data-user-message-bubble], ' +
      '[class*="bg-user-message"], [class*="MarkdownRoot"]'
    )) {
      return el;
    }

    if (el.matches('[data-message-author-role]')) {
      return findContentContainer(el, role);
    }

    const content = findContentContainer(el, role);
    return content === el ? findTurnContent(el) : content;
  }

  function extractByRoleMarkers() {
    const root = getConversationRoot();
    const candidates = [];
    let rawCandidates = 0;
    let excludedCandidates = 0;

    ROLE_MARKER_GROUPS.forEach((group) => {
      let nodes;
      try {
        nodes = root.querySelectorAll(group.selector);
      } catch (_) {
        return;
      }

      nodes.forEach((el) => {
        rawCandidates += 1;

        if (isExcludedRegion(el)) {
          excludedCandidates += 1;
          return;
        }

        const role = group.role(el) || roleFromTree(el);
        if (role !== 'user' && role !== 'assistant') return;

        let wrapper = findMessageWrapper(el);
        if (!wrapperRoleMatches(wrapper, role)) wrapper = el;

        candidates.push({ el, role, priority: group.priority, wrapper });
      });
    });

    log(
      'Role-marker candidates:', candidates.length,
      '| raw:', rawCandidates,
      '| excluded:', excludedCandidates
    );

    // One logical message can match several markers (for example an assistant
    // content root inside a Dil response root). Keep the best marker per
    // message instead of emitting the same answer multiple times.
    const byMessage = new Map();

    candidates.forEach((candidate) => {
      const existing = byMessage.get(candidate.wrapper);
      if (!existing) {
        byMessage.set(candidate.wrapper, candidate);
        return;
      }

      if (existing.role !== candidate.role) {
        byMessage.set(candidate.el, candidate);
        return;
      }

      if (candidate.priority < existing.priority) {
        byMessage.set(candidate.wrapper, candidate);
      }
    });

    const turns = [];

    byMessage.forEach((candidate) => {
      const content = resolveContentElement(candidate.el, candidate.role);
      const clean = getCleanContent(content);
      if (clean.text.length === 0) return;

      turns.push({
        index: 0,
        role: candidate.role,
        text: clean.text,
        html: clean.html,
        _el: content
      });
    });

    const userCount = turns.filter((t) => t.role === 'user').length;
    const assistantCount = turns.filter((t) => t.role === 'assistant').length;
    log('Role-marker turns:', turns.length, '| user:', userCount, '| assistant:', assistantCount);

    return turns;
  }

  function extractByAuthorRoles() {
    const turns = [];
    const root = getConversationRoot();

    const userEls = Array.from(root.querySelectorAll('[data-message-author-role="user"]'))
      .filter((el) => !isExcludedRegion(el));
    const assistantEls = Array.from(root.querySelectorAll('[data-message-author-role="assistant"]'))
      .filter((el) => !isExcludedRegion(el));

    log('Found user elements:', userEls.length, '| assistant elements:', assistantEls.length);

    if (userEls.length === 0 && assistantEls.length === 0) {
      log('No [data-message-author-role] elements found on this page.');
      return turns;
    }

    const all = userEls.map((el) => ({ role: 'user', el }))
      .concat(assistantEls.map((el) => ({ role: 'assistant', el })));

    // Sort by visual/DOM order.
    all.sort((a, b) => {
      const comparison = a.el.compareDocumentPosition(b.el);
      return comparison & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    all.forEach((item, index) => {
      const container = findContentContainer(item.el, item.role);
      const clean = getCleanContent(container);
      if (clean.text.length > 0) {
        turns.push({
          index: index,
          role: item.role,
          text: clean.text,
          html: clean.html,
          _el: container
        });
      } else {
        log('Skipping empty', item.role, 'message at index', index);
      }
    });

    return turns;
  }

  // ---------------------------------------------------------------------------
  // Heuristic helpers for the updated ChatGPT DOM (post-2024/2025 redesign).
  // ChatGPT no longer reliably exposes data-message-author-role at the top
  // level, so we infer the speaker from avatars / classes / data attributes.
  // ---------------------------------------------------------------------------

  function isUserAvatar(el) {
    if (!el) return false;
    const alt = (el.getAttribute('alt') || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const text = (el.textContent || '').trim().toLowerCase();
    const cls = (el.className || '').toLowerCase();
    const testid = (el.getAttribute('data-testid') || '').toLowerCase();

    if (alt.includes('user') || ariaLabel.includes('user')) return true;
    if (testid.includes('user') && !testid.includes('assistant')) return true;
    if (cls.includes('user') && !cls.includes('assistant')) return true;

    // User avatars are typically simple initials in a circle and contain no SVG logo.
    const initials = text.replace(/[^a-z]/g, '');
    if (initials.length >= 1 && initials.length <= 3 && !el.querySelector('svg')) return true;

    // Images that are not the GPT/ChatGPT logo.
    const img = el.querySelector('img') || (el.tagName === 'IMG' ? el : null);
    if (img && img.src) {
      const src = img.src.toLowerCase();
      if (!src.includes('gpt') && !src.includes('openai') && !src.includes('chatgpt')) return true;
    }

    return false;
  }

  function isAssistantAvatar(el) {
    if (!el) return false;
    const alt = (el.getAttribute('alt') || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const cls = (el.className || '').toLowerCase();
    const testid = (el.getAttribute('data-testid') || '').toLowerCase();
    const html = (el.innerHTML || '').toLowerCase();

    if (alt.includes('chatgpt') || alt.includes('assistant') || ariaLabel.includes('chatgpt') || ariaLabel.includes('assistant')) return true;
    if (testid.includes('chatgpt') || testid.includes('assistant')) return true;
    if (cls.includes('assistant') || cls.includes('chatgpt') || cls.includes('gpt')) return true;
    if (html.includes('chatgpt') || html.includes('openai') || html.includes('gpt')) return true;

    // Assistant avatars usually contain an SVG logo rather than initials.
    const svg = el.querySelector('svg');
    if (svg) {
      const svgHtml = (svg.outerHTML || '').toLowerCase();
      if (svgHtml.includes('openai') || svgHtml.includes('chatgpt') || svgHtml.includes('gpt')) return true;
      const text = (el.textContent || '').trim();
      if (text.length === 0 || text.length > 3) return true;
    }

    return false;
  }

  function determineRole(container, fallbackIndex) {
    // Walk up the tree looking for explicit role markers in classes,
    // data attributes, or testids. The role-bearing wrapper is often an
    // ancestor of the actual content node.
    let el = container;
    while (el && el !== document.body) {
      const explicit = explicitRole(el);
      if (explicit) return explicit;

      const cls = (el.className || '').toLowerCase();
      if (cls.includes('user-message') && !cls.includes('assistant-message')) return 'user';
      if (cls.includes('assistant-message') || cls.includes('chatgpt-message')) return 'assistant';
      if (cls.includes('dilresponse') || cls.includes('response-root')) return 'assistant';
      if (cls.includes('dilprompt') || cls.includes('prompt-root')) return 'user';
      if (cls.includes('user') && !cls.includes('assistant')) return 'user';
      if (cls.includes('assistant') || cls.includes('chatgpt')) return 'assistant';

      const testid = (el.getAttribute('data-testid') || '').toLowerCase();
      if (testid.includes('user') && !testid.includes('assistant')) return 'user';
      if (testid.includes('assistant') || testid.includes('chatgpt')) return 'assistant';

      if (el.hasAttribute('data-dil-message-id')) {
        const dilClass = (el.getAttribute('class') || '').toLowerCase();
        if (dilClass.includes('dilresponse')) return 'assistant';
        if (dilClass.includes('dilprompt')) return 'user';
        // Default Dil renderer nodes without a clear role class are usually
        // assistant responses in this layout.
        return 'assistant';
      }

      el = el.parentElement;
    }

    // Inspect the avatar.
    const avatar = container.querySelector('img, svg, [role="img"]');
    if (avatar) {
      let wrapper = avatar.closest('[class*="avatar"]') || avatar.parentElement;
      if (isUserAvatar(wrapper)) return 'user';
      if (isAssistantAvatar(wrapper)) return 'assistant';
      if (isUserAvatar(avatar)) return 'user';
      if (isAssistantAvatar(avatar)) return 'assistant';
    }

    // Fallback: alternate, starting with user.
    return fallbackIndex % 2 === 0 ? 'user' : 'assistant';
  }

  function findTurnContent(container) {
    // Prefer an explicitly marked content node.
    const explicit = container.querySelector('[data-message-content="true"]');
    if (explicit && hasVisibleText(explicit)) return explicit;

    // Avoid the avatar area and action bars; collect text-bearing blocks.
    const candidates = Array.from(container.querySelectorAll('div, section, article'))
      .filter((el) => {
        if (!hasVisibleText(el)) return false;
        // Skip tiny avatar wrappers (image/initial with almost no text).
        if (el.querySelector('img, svg, [role="img"]') && el.textContent.trim().length <= 3) return false;
        // Skip action bars that contain direct buttons.
        const hasDirectButton = Array.from(el.children).some((child) => {
          return child.tagName === 'BUTTON' || child.getAttribute('role') === 'button';
        });
        if (hasDirectButton) return false;
        return true;
      });

    // Remove ancestor candidates so we don't pick a wrapper that still contains
    // the avatar or other turns.
    const deepest = candidates.filter((a) => {
      return !candidates.some((b) => b !== a && a.contains(b));
    });

    // Pick the deepest block with the most visible text.
    deepest.sort((a, b) => (b.innerText || '').length - (a.innerText || '').length);
    if (deepest.length > 0) return deepest[0];

    return container;
  }

  /**
   * Extract turns from article elements. This handles both the old layout
   * (article[data-testid^="conversation-turn-"]) and newer layouts where
   * the conversation is a flat list of <article> tags inside <main>.
   */
  function extractByArticlesV2() {
    const turns = [];
    const root = getConversationRoot();

    let containers = Array.from(root.querySelectorAll('article[data-testid*="conversation-turn"]'));
    if (containers.length === 0) {
      containers = Array.from(root.querySelectorAll('article'));
    }
    if (containers.length === 0) {
      containers = Array.from(document.querySelectorAll('article'));
    }
    containers = containers.filter((el) => !isExcludedRegion(el));

    log('Article turns found:', containers.length);

    containers.forEach((article, index) => {
      const role = determineRole(article, index);
      let content = findContentContainer(article, role);
      if (content === article) {
        content = findTurnContent(article);
      }
      const clean = getCleanContent(content);
      if (clean.text.length > 0) {
        turns.push({
          index: index,
          role: role,
          text: clean.text,
          html: clean.html,
          _el: content
        });
      } else {
        log('Skipping empty article at index', index);
      }
    });

    return turns;
  }

  /**
   * Some redesigns wrap turns in <div data-testid="conversation-turn-N">
   * rather than <article>. Try those when articles fail.
   */
  function extractByTurnDivs() {
    const turns = [];
    const root = getConversationRoot();
    const turnDivs = Array.from(root.querySelectorAll('[data-testid*="conversation-turn"]'))
      .filter((el) => !isExcludedRegion(el));

    log('Turn divs found:', turnDivs.length);

    turnDivs.forEach((div, index) => {
      const role = determineRole(div, index);
      let content = findContentContainer(div, role);
      if (content === div) {
        content = findTurnContent(div);
      }
      const clean = getCleanContent(content);
      if (clean.text.length > 0) {
        turns.push({
          index: index,
          role: role,
          text: clean.text,
          html: clean.html,
          _el: content
        });
      }
    });

    return turns;
  }

  /**
   * ChatGPT's 2025/2026 layout uses classes like group/user-message and
   * bg-user-message / text-user-message instead of data-message-author-role.
   * Find those role-bearing elements directly.
   */
  function extractByMessageClasses() {
    const turns = [];
    // Broad selectors to catch both current and slightly-varied message wrappers.
    // The data-virtualized-turn-content node is the actual content node in the
    // latest ChatGPT layout, so include it as a candidate too.
    const root = getConversationRoot();
    const messageEls = Array.from(root.querySelectorAll(
      '[class*="user-message"], [class*="assistant-message"], ' +
      '[class*="chatgpt-message"], [class*="bot-message"], ' +
      '[class*="response-message"], [data-virtualized-turn-content], ' +
      '[data-dil-message-id], [class*="DilResponseRoot"], [class*="DilPromptRoot"], ' +
      '[class*="MarkdownRoot"]'
    )).filter((el) => !isExcludedRegion(el));

    log('Message-class elements found:', messageEls.length);

    if (messageEls.length === 0) {
      return turns;
    }

    // Keep the innermost matching element per message to avoid wrapping duplicates.
    const unique = messageEls.filter((a) => {
      return !messageEls.some((b) => b !== a && a.contains(b));
    });

    unique.forEach((el, index) => {
      const role = determineRole(el, index);
      let content;
      // Dil-rendered responses (and prompts) have hashed CSS classes and their
      // content is spread across multiple direct children (p, h2, h3, code
      // blocks, etc.). The root node itself is the correct container.
      const isDilElement = el.hasAttribute('data-dil-message-id') ||
        (el.getAttribute('class') || '').toLowerCase().includes('dil') ||
        el.querySelector('[data-dil-message-id]');
      if (isDilElement) {
        content = el.hasAttribute('data-dil-message-id') ? el : el.querySelector('[data-dil-message-id]');
      } else {
        content = findContentContainer(el, role);
        if (content === el) {
          content = findTurnContent(el);
        }
      }
      const clean = getCleanContent(content);
      if (clean.text.length > 0) {
        turns.push({
          index: index,
          role: role,
          text: clean.text,
          html: clean.html,
          _el: content
        });
      }
    });

    const userCount = turns.filter((t) => t.role === 'user').length;
    const assistantCount = turns.filter((t) => t.role === 'assistant').length;
    log('Message-class turns:', turns.length, '| user:', userCount, '| assistant:', assistantCount);

    return turns;
  }

  /**
   * Newer layouts mark the actual message content with
   * data-virtualized-turn-content. Use that as the content container and infer
   * the role from nearby message classes or avatars.
   */
  function extractByVirtualizedContent() {
    const turns = [];
    const root = getConversationRoot();
    const contentEls = Array.from(root.querySelectorAll('[data-virtualized-turn-content]'))
      .filter((el) => !isExcludedRegion(el));

    log('Virtualized turn content elements found:', contentEls.length);

    if (contentEls.length === 0) {
      return turns;
    }

    contentEls.forEach((el, index) => {
      // Walk up the tree looking for a role hint in ancestor classes.
      let role = roleFromTree(el);
      let ancestor = el;

      while (!role && ancestor) {
        const cls = (ancestor.className || '').toLowerCase();
        if (cls.includes('user-message') && !cls.includes('assistant-message')) {
          role = 'user';
          break;
        }
        if (cls.includes('assistant-message') || cls.includes('chatgpt-message')) {
          role = 'assistant';
          break;
        }
        ancestor = ancestor.parentElement;
      }

      if (!role) {
        role = determineRole(el, index);
      }

      const clean = getCleanContent(el);
      if (clean.text.length > 0) {
        turns.push({
          index: index,
          role: role,
          text: clean.text,
          html: clean.html,
          _el: el
        });
      }
    });

    const userCount = turns.filter((t) => t.role === 'user').length;
    const assistantCount = turns.filter((t) => t.role === 'assistant').length;
    log('Virtualized-content turns:', turns.length, '| user:', userCount, '| assistant:', assistantCount);

    return turns;
  }

  function countRoles(turns) {
    return {
      user: turns.filter((t) => t.role === 'user').length,
      assistant: turns.filter((t) => t.role === 'assistant').length
    };
  }

  function sortTurnsByDom(turns) {
    return turns.slice().sort((a, b) => {
      if (!a._el || !b._el) return 0;

      const comparison = a._el.compareDocumentPosition(b._el);
      if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (comparison & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  function sameLogicalMessage(a, b) {
    if (a.role !== b.role) return false;
    if (a._el === b._el) return true;

    const aId = getMessageUniqueId(a._el);
    const bId = getMessageUniqueId(b._el);
    if (aId && bId && aId === bId) return true;

    if (a._el && b._el && (a._el.contains(b._el) || b._el.contains(a._el))) {
      return a.text.includes(b.text) || b.text.includes(a.text);
    }

    return false;
  }

  function dedupeTurns(turns) {
    const unique = [];

    turns.forEach((turn) => {
      if (!unique.some((existing) => sameLogicalMessage(existing, turn))) {
        unique.push(turn);
      }
    });

    return unique;
  }

  function finalizeTurns(turns) {
    return sortTurnsByDom(dedupeTurns(turns))
      .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
      .filter((turn) => turn.text && turn.text.trim().length > 0)
      .map((turn, index) => ({
        index: index,
        role: turn.role,
        text: turn.text.trim(),
        html: turn.html || ''
      }));
  }

  function extractTurns() {
    const root = getConversationRoot();
    log('Conversation root:', root.tagName, root.getAttribute('data-testid') || '');

    const roleMarkerTurns = extractByRoleMarkers();
    const initialCounts = countRoles(roleMarkerTurns);

    if (initialCounts.user > 0 && initialCounts.assistant > 0) {
      return finalizeTurns(roleMarkerTurns);
    }

    log('Role-marker extraction incomplete; checking legacy layouts.');
    log('Falling back to author-role extraction.');
    log('Falling back to article-based extraction (v2).');
    log('Falling back to message-class extraction.');
    log('Falling back to virtualized-turn-content extraction.');
    log('Falling back to turn-div extraction.');

    const fallbacks = [
      extractByAuthorRoles,
      extractByArticlesV2,
      extractByMessageClasses,
      extractByVirtualizedContent,
      extractByTurnDivs
    ];

    const merged = roleMarkerTurns.slice();

    fallbacks.forEach((extractor) => {
      const counts = countRoles(merged);
      if (counts.user > 0 && counts.assistant > 0) return;

      const extra = extractor();
      if (!extra || extra.length === 0) return;

      const missingRole = counts.user === 0 ? 'user' : (counts.assistant === 0 ? 'assistant' : null);

      extra.forEach((turn) => {
        // If one role was found already, only merge the missing role so the
        // same messages are not added twice.
        if (!missingRole || turn.role === missingRole) merged.push(turn);
      });
    });

    const finalTurns = finalizeTurns(merged);
    const finalCounts = countRoles(finalTurns);

    log('Total extracted turns:', finalTurns.length, '| user:', finalCounts.user, '| assistant:', finalCounts.assistant);

    if (finalTurns.length === 0) {
      logDomSample();
    }

    return finalTurns;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'EXTRACT_CHAT') {
      try {
        const turns = extractTurns();
        sendResponse({
          turns: turns,
          title: document.title,
          url: location.href
        });
      } catch (err) {
        log('Extraction error:', err);
        sendResponse({ error: err.message });
      }
    }
    return true;
  });
})();
