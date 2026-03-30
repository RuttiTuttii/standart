// ==UserScript==
// @name         Moodle Quiz Helper
// @namespace    Userscripts
// @version      2.2
// @description  Парсит ВСЕ страницы теста через fetch, копирует для нейронки, автозаполняет
// @match        https://sdo.arcotel.ru/*
// @inject-into  auto
// @run-at       document-end
// @grant        GM.setClipboard
// ==/UserScript==

(function () {
  'use strict';

  const STORE_KEY = 'mqh_answers_' + new URL(location.href).searchParams.get('attempt');

  // textContent — работает и на DOMParser-документах (не требует рендеринга)
  function parseQuestions(doc) {
    const result = [];
    doc.querySelectorAll('.que').forEach(q => {
      const qText = q.querySelector('.qtext')?.textContent.trim();
      if (!qText) return;

      const isCheckbox = !!q.querySelector('.answer input[type="checkbox"]');

      if (isCheckbox) {
        // Множественный выбор: каждый checkbox имеет уникальный name
        const opts = [...q.querySelectorAll('.answer input[type="checkbox"]')].map(input => {
          const labelId = input.getAttribute('aria-labelledby');
          const labelEl = labelId ? q.ownerDocument.getElementById(labelId) : null;
          const text = labelEl?.querySelector('.flex-fill')?.textContent.trim() || '';
          return { text, name: input.name };
        }).filter(o => o.text);
        if (opts.length) result.push({ qText, opts, inputType: 'checkbox' });
      } else {
        // Одиночный выбор: все radio используют один name
        const answerName = q.querySelector('.answer input[type="radio"]')?.name;
        const opts = [...q.querySelectorAll('.answer input[type="radio"]')].map(input => {
          const labelId = input.getAttribute('aria-labelledby');
          const labelEl = labelId ? q.ownerDocument.getElementById(labelId) : null;
          const text = labelEl?.querySelector('.flex-fill')?.textContent.trim() || '';
          return { text, value: input.value, name: answerName };
        }).filter(o => o.text);
        if (opts.length && answerName) result.push({ qText, opts, inputType: 'radio', answerName });
      }
    });
    return result;
  }

  function parseAttemptPage(doc, pageNum) {
    const form = doc.querySelector('#responseform');
    if (!form) {
      throw new Error(`Не найдена форма responseform на странице ${pageNum + 1}`);
    }

    const formFields = [];
    form.querySelectorAll('input[type="hidden"][name], textarea[name], select[name]').forEach(field => {
      formFields.push([field.name, field.value]);
    });

    const submitButtons = [...form.querySelectorAll('input[type="submit"][name]')].map(button => ({
      name: button.name,
      value: button.value,
    }));

    const submitField = submitButtons.find(button => button.name === 'next' && !/закончить попытку/i.test(button.value))
      || submitButtons.find(button => button.name === 'previous')
      || submitButtons[0]
      || null;

    return {
      pageNum,
      formAction: form.action,
      formFields,
      submitField,
      questions: parseQuestions(doc),
    };
  }

  function baseUrl() {
    const u = new URL(location.href);
    u.hash = '';
    u.searchParams.delete('page');
    return u.toString();
  }

  function getAllPageNums() {
    const nums = new Set();
    document.querySelectorAll('[data-quiz-page]').forEach(el => {
      nums.add(+el.dataset.quizPage);
    });
    return [...nums].sort((a, b) => a - b);
  }

  async function fetchAllQuestions(statusCb) {
    const pageNums = getAllPageNums();
    if (!pageNums.length) throw new Error('Не найдены кнопки навигации [data-quiz-page]');

    const pages = [];
    const all = [];
    for (const pageNum of pageNums) {
      statusCb(`Загружаю стр. ${pageNum + 1} из ${pageNums.length}...`);
      const url = `${baseUrl()}&page=${pageNum}`;
      const html = await fetch(url, { credentials: 'same-origin' }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} на странице ${pageNum}`);
        return r.text();
      });
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const page = parseAttemptPage(doc, pageNum);
      const qs = page.questions;
      pages.push(page);
      qs.forEach(q => all.push({ pageNum, ...q }));
    }
    return { pages, questions: all };
  }

  const SYSTEM_PROMPT = [
    '=== СИСТЕМНЫЙ ПРОМПТ (читать один раз) ===',
    'Ты — ассистент для прохождения тестов. Твоя единственная задача — выбрать правильный вариант(ы) ответа для каждого вопроса.',
    '',
    'СТРОГИЕ ПРАВИЛА:',
    '1. Ответ — одна строка, где ответы на вопросы разделены запятой.',
    '2. Для вопроса с ОДНИМ ответом: просто цифра. Пример: 2',
    '3. Для вопроса с НЕСКОЛЬКИМИ ответами (помечен [НЕСКОЛЬКО]): цифры через +. Пример: 1+3',
    '4. Итоговый формат всей строки: 2,1,1+3,4,2 — ровно столько частей, сколько вопросов.',
    '5. ЗАПРЕЩЕНО: любые слова, пояснения, скобки, переносы строк, пробелы.',
    '6. Если вопрос неоднозначен — выбери наиболее вероятный вариант молча.',
    '7. Формат не меняется ни при каких условиях.',
    '=== КОНЕЦ СИСТЕМНОГО ПРОМПТА ===',
    ''
  ].join('\n');

  function buildPrompt(all) {
    const lines = [
      'Вопросы теста (отвечай строго по системному промпту):',
      ''
    ];
    all.forEach((q, i) => {
      const multi = q.inputType === 'checkbox' ? ' [НЕСКОЛЬКО — формат: 1+3]' : '';
      lines.push(`Вопрос ${i + 1}${multi}: ${q.qText}`);
      q.opts.forEach((option, j) => lines.push(`  ${j + 1}. ${option.text}`));
      lines.push('');
    });
    return lines.join('\n');
  }

  // answers — массив массивов: [[2],[1],[1,3],[4]] (1-based индексы)
  function applyCurrentPage(all, answers) {
    const currentPage = +(new URL(location.href).searchParams.get('page') || 0);
    let applied = 0;

    all.forEach((q, globalIdx) => {
      if (q.pageNum !== currentPage) return;
      const answerNums = answers[globalIdx];
      if (!answerNums?.length) return;

      for (const queEl of document.querySelectorAll('.que')) {
        if (queEl.querySelector('.qtext')?.textContent.trim() !== q.qText) continue;

        if (q.inputType === 'checkbox') {
          queEl.querySelectorAll('.answer input[type="checkbox"]').forEach((input, j) => {
            if (answerNums.includes(j + 1) && !input.checked) input.click();
          });
        } else {
          const inputs = [...queEl.querySelectorAll('.answer input[type="radio"]')];
          if (inputs[answerNums[0] - 1]) inputs[answerNums[0] - 1].click();
        }
        applied++;
        break;
      }
    });
    return applied;
  }

  async function submitAllAnswers(pages, answers, statusCb) {
    let questionIndex = 0;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      statusCb(`Сохраняю ответы: страница ${page.pageNum + 1} из ${pages.length}...`);

      const body = new URLSearchParams();
      page.formFields.forEach(([name, value]) => {
        body.append(name, value);
      });

      if (page.submitField) {
        body.append(page.submitField.name, page.submitField.value);
      }

      page.questions.forEach(question => {
        const answerNums = answers[questionIndex++];
        if (!answerNums?.length) return;

        if (question.inputType === 'checkbox') {
          // Для каждого чекбокса: 1 если выбран, скрытый 0 уже добавлен из formFields
          question.opts.forEach((opt, j) => {
            if (answerNums.includes(j + 1)) body.set(opt.name, '1');
          });
        } else {
          const selectedOption = question.opts[answerNums[0] - 1];
          if (selectedOption) body.set(question.answerName, selectedOption.value);
        }
      });

      const response = await fetch(page.formAction, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`Не удалось сохранить страницу ${page.pageNum + 1} (HTTP ${response.status})`);
      }
    }
  }

  // Автопереход на следующую страницу с обратным отсчётом
  let countdownInterval = null;
  function autoAdvance(delaySec) {
    const nextBtn = document.querySelector('#mod_quiz-next-nav');
    if (!nextBtn) return;

    if (countdownInterval) clearInterval(countdownInterval);
    let secs = delaySec;
    setStatus(`✓ Ответы подставлены. Переход через ${secs}с... (нажми ✕ чтобы отменить)`, UI_THEME.success);

    countdownInterval = setInterval(() => {
      secs--;
      if (secs <= 0) {
        clearInterval(countdownInterval);
        nextBtn.click();
      } else {
        setStatus(`✓ Ответы подставлены. Переход через ${secs}с... (нажми ✕ чтобы отменить)`, UI_THEME.success);
      }
    }, 1000);
  }

  // ===== UI =====
  const UI_THEME = {
    panelBg: 'linear-gradient(180deg, rgba(21,21,24,.98) 0%, rgba(9,9,11,.98) 100%)',
    panelBorder: '#3a3327',
    panelBorderSoft: '#26221b',
    surface: 'rgba(18,18,21,.94)',
    surfaceRaised: 'rgba(23,23,27,.94)',
    surfaceInset: 'rgba(12,12,15,.9)',
    fieldBorder: '#2d2821',
    text: '#eee6d7',
    textMuted: '#9f9583',
    textFaint: '#6f675a',
    accent: '#c5a15a',
    accentBright: '#d6b777',
    accentDim: '#6b5732',
    success: '#91a86d',
    error: '#b76d5b',
    warning: '#d1a96a',
  };

  function pixelIcon(rects, size = 16) {
    return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true" focusable="false" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" style="display:block"><g fill="currentColor">${rects}</g></svg>`;
  }

  const ICONS = {
    brand: pixelIcon(
      '<rect x="2" y="6" width="3" height="3"/>' +
      '<rect x="6" y="2" width="3" height="3"/>' +
      '<rect x="6" y="10" width="3" height="3"/>' +
      '<rect x="10" y="6" width="3" height="3"/>',
      18
    ),
    close: pixelIcon(
      '<rect x="2" y="3" width="2" height="2"/>' +
      '<rect x="4" y="5" width="2" height="2"/>' +
      '<rect x="6" y="7" width="4" height="2"/>' +
      '<rect x="10" y="5" width="2" height="2"/>' +
      '<rect x="12" y="3" width="2" height="2"/>' +
      '<rect x="10" y="9" width="2" height="2"/>' +
      '<rect x="12" y="11" width="2" height="2"/>' +
      '<rect x="4" y="9" width="2" height="2"/>' +
      '<rect x="2" y="11" width="2" height="2"/>',
      14
    ),
    refresh: pixelIcon(
      '<rect x="6" y="1" width="4" height="2"/>' +
      '<rect x="10" y="3" width="2" height="2"/>' +
      '<rect x="12" y="5" width="2" height="4"/>' +
      '<rect x="10" y="9" width="2" height="2"/>' +
      '<rect x="8" y="11" width="2" height="2"/>' +
      '<rect x="4" y="11" width="4" height="2"/>' +
      '<rect x="2" y="9" width="2" height="2"/>' +
      '<rect x="1" y="7" width="1" height="2"/>' +
      '<rect x="0" y="4" width="4" height="2"/>' +
      '<rect x="2" y="2" width="2" height="2"/>'
    ),
    copy: pixelIcon(
      '<rect x="5" y="2" width="6" height="1"/>' +
      '<rect x="4" y="3" width="1" height="7"/>' +
      '<rect x="11" y="3" width="1" height="7"/>' +
      '<rect x="5" y="10" width="6" height="1"/>' +
      '<rect x="2" y="5" width="6" height="1"/>' +
      '<rect x="1" y="6" width="1" height="7"/>' +
      '<rect x="8" y="6" width="1" height="7"/>' +
      '<rect x="2" y="13" width="6" height="1"/>'
    ),
    apply: pixelIcon(
      '<rect x="2" y="8" width="2" height="2"/>' +
      '<rect x="4" y="10" width="2" height="2"/>' +
      '<rect x="6" y="12" width="2" height="2"/>' +
      '<rect x="8" y="10" width="2" height="2"/>' +
      '<rect x="10" y="8" width="2" height="2"/>' +
      '<rect x="12" y="6" width="2" height="2"/>'
    ),
  };

  if (!document.getElementById('mqh-floating-style')) {
    const uiStyle = document.createElement('style');
    uiStyle.id = 'mqh-floating-style';
    uiStyle.textContent = `
      #mqh-floating-panel textarea::placeholder { color: ${UI_THEME.textFaint}; }
      #mqh-floating-panel textarea::selection { background: ${UI_THEME.accent}55; color: ${UI_THEME.text}; }
      #mqh-floating-panel textarea::-webkit-scrollbar { width: 10px; }
      #mqh-floating-panel textarea::-webkit-scrollbar-thumb {
        background: ${UI_THEME.accentDim};
        border: 2px solid transparent;
        background-clip: padding-box;
        border-radius: 999px;
      }
      #mqh-floating-panel textarea::-webkit-scrollbar-track { background: transparent; }
    `;
    document.head.appendChild(uiStyle);
  }

  function paintActionButton(button, hovered = false) {
    const variant = button.dataset.variant;

    if (button.disabled) {
      button.style.cursor = 'not-allowed';
      button.style.color = UI_THEME.textFaint;
      button.style.borderColor = UI_THEME.panelBorderSoft;
      button.style.background = 'rgba(17,17,20,.76)';
      button.style.boxShadow = 'none';
      button.style.transform = 'translateY(0)';
      return;
    }

    button.style.cursor = 'pointer';
    button.style.transform = hovered ? 'translateY(-1px)' : 'translateY(0)';

    if (variant === 'primary') {
      button.style.color = '#181209';
      button.style.background = hovered
        ? `linear-gradient(180deg, ${UI_THEME.accentBright} 0%, ${UI_THEME.accent} 100%)`
        : `linear-gradient(180deg, #cdb071 0%, ${UI_THEME.accent} 100%)`;
      button.style.borderColor = hovered ? UI_THEME.accentBright : UI_THEME.accent;
      button.style.boxShadow = hovered
        ? '0 12px 24px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.06) inset'
        : '0 8px 18px rgba(0,0,0,.24)';
      return;
    }

    if (variant === 'accent') {
      button.style.color = hovered ? UI_THEME.text : UI_THEME.accent;
      button.style.background = hovered ? 'rgba(197,161,90,.12)' : 'rgba(197,161,90,.06)';
      button.style.borderColor = hovered ? UI_THEME.accent : UI_THEME.accentDim;
      button.style.boxShadow = hovered ? '0 8px 18px rgba(0,0,0,.2)' : 'none';
      return;
    }

    button.style.color = hovered ? UI_THEME.text : '#d8cdbb';
    button.style.background = hovered ? UI_THEME.surfaceRaised : UI_THEME.surface;
    button.style.borderColor = hovered ? '#4a4337' : UI_THEME.fieldBorder;
    button.style.boxShadow = hovered
      ? '0 10px 22px rgba(0,0,0,.22), inset 0 0 0 1px rgba(255,255,255,.02)'
      : 'inset 0 0 0 1px rgba(255,255,255,.02)';
  }

  function createActionButton(label, iconMarkup, variant) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.variant = variant;
    button.innerHTML = `
      <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 18px;">${iconMarkup}</span>
      <span>${label}</span>
    `;
    button.style.cssText = `
      appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:10px;
      min-height:44px; width:100%; padding:0 14px; box-sizing:border-box;
      border-radius:10px; border:1px solid ${UI_THEME.fieldBorder};
      background:${UI_THEME.surface}; color:${UI_THEME.text};
      font-family:'Segoe UI',system-ui,sans-serif; font-size:12px; font-weight:600;
      line-height:1; letter-spacing:.08em; text-transform:uppercase;
      transition:transform .18s ease, border-color .18s ease, background .18s ease, color .18s ease, box-shadow .18s ease;
      outline:none;
    `;
    button.addEventListener('mouseenter', () => paintActionButton(button, true));
    button.addEventListener('mouseleave', () => paintActionButton(button, false));
    button.addEventListener('blur', () => paintActionButton(button, false));
    paintActionButton(button, false);
    return button;
  }

  function setButtonEnabled(button, enabled) {
    button.disabled = !enabled;
    paintActionButton(button, false);
  }

  const panel = document.createElement('section');
  panel.id = 'mqh-floating-panel';
  panel.style.cssText = `
    position:fixed; right:16px; bottom:16px; z-index:99999;
    width:min(380px, calc(100vw - 24px)); max-width:calc(100vw - 24px);
    padding:16px; box-sizing:border-box; overflow:hidden;
    border:1px solid ${UI_THEME.panelBorder}; border-radius:16px;
    background:${UI_THEME.panelBg}; color:${UI_THEME.text};
    box-shadow:0 24px 50px rgba(0,0,0,.48), inset 0 0 0 1px rgba(255,255,255,.03);
    font-family:'Segoe UI',system-ui,sans-serif; font-size:13px; line-height:1.5;
    backdrop-filter:blur(10px);
  `;

  const topGlow = document.createElement('div');
  topGlow.style.cssText = `
    position:absolute; top:0; left:16px; right:16px; height:1px;
    background:linear-gradient(90deg, transparent 0%, ${UI_THEME.accent} 28%, transparent 100%);
    opacity:.7; pointer-events:none;
  `;

  const innerFrame = document.createElement('div');
  innerFrame.style.cssText = `
    position:absolute; inset:8px; border-radius:11px;
    border:1px solid rgba(255,255,255,.03); pointer-events:none;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Закрыть панель');
  closeBtn.innerHTML = ICONS.close;
  closeBtn.style.cssText = `
    position:absolute; top:14px; right:14px; z-index:2;
    display:flex; align-items:center; justify-content:center;
    width:28px; height:28px; padding:0;
    border-radius:8px; border:1px solid ${UI_THEME.fieldBorder};
    background:${UI_THEME.surface}; color:${UI_THEME.textFaint};
    cursor:pointer; transition:background .18s ease, color .18s ease, border-color .18s ease;
  `;
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.color = UI_THEME.accent;
    closeBtn.style.borderColor = UI_THEME.accentDim;
    closeBtn.style.background = 'rgba(197,161,90,.08)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.color = UI_THEME.textFaint;
    closeBtn.style.borderColor = UI_THEME.fieldBorder;
    closeBtn.style.background = UI_THEME.surface;
  });
  closeBtn.onclick = () => panel.remove();

  const content = document.createElement('div');
  content.style.cssText = 'position:relative; z-index:1; display:flex; flex-direction:column; gap:12px;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex; flex-direction:column; gap:10px; padding-right:40px;';

  const headerMetaRow = document.createElement('div');
  headerMetaRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px;';

  const headerMeta = document.createElement('div');
  headerMeta.textContent = 'MANUAL / QUIZ FLOW';
  headerMeta.style.cssText = `color:${UI_THEME.textFaint}; font-size:10px; letter-spacing:.26em; text-transform:uppercase;`;

  const versionTag = document.createElement('div');
  versionTag.textContent = 'v2.1';
  versionTag.style.cssText = `
    padding:3px 8px; border-radius:999px; border:1px solid ${UI_THEME.fieldBorder};
    background:rgba(197,161,90,.06); color:${UI_THEME.accent};
    font-size:10px; letter-spacing:.16em; text-transform:uppercase;
  `;

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex; align-items:center; gap:12px;';

  const brandMark = document.createElement('div');
  brandMark.innerHTML = ICONS.brand;
  brandMark.style.cssText = `
    display:flex; align-items:center; justify-content:center;
    width:34px; height:34px; flex:0 0 34px;
    border-radius:10px; border:1px solid ${UI_THEME.fieldBorder};
    background:rgba(197,161,90,.08); color:${UI_THEME.accent};
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.02);
  `;

  const titleWrap = document.createElement('div');
  titleWrap.style.cssText = 'display:flex; flex-direction:column; gap:4px; min-width:0;';

  const title = document.createElement('div');
  title.innerHTML = `<span style="color:${UI_THEME.text}">fragment</span><span style="color:${UI_THEME.accent}">zal</span>`;
  title.style.cssText = `font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:1; letter-spacing:.04em; text-transform:lowercase;`;

  const subtitle = document.createElement('div');
  subtitle.textContent = 'moodle answer relay';
  subtitle.style.cssText = `color:${UI_THEME.textMuted}; font-size:10px; letter-spacing:.24em; text-transform:uppercase;`;

  const statusCard = document.createElement('div');
  statusCard.style.cssText = `
    padding:10px 12px 12px; border-radius:12px; border:1px solid ${UI_THEME.fieldBorder};
    background:linear-gradient(180deg, rgba(17,17,20,.92) 0%, rgba(10,10,12,.94) 100%);
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.02);
  `;

  const statusLabel = document.createElement('div');
  statusLabel.textContent = 'STATUS';
  statusLabel.style.cssText = `margin-bottom:6px; color:${UI_THEME.textFaint}; font-size:9px; letter-spacing:.28em; text-transform:uppercase;`;

  const statusEl = document.createElement('div');
  statusEl.style.cssText = `min-height:18px; color:${UI_THEME.textMuted}; font-size:12px; line-height:1.55;`;
  statusEl.textContent = 'Готов к загрузке вопросов.';

  const fieldGroup = document.createElement('div');
  fieldGroup.style.cssText = 'display:flex; flex-direction:column; gap:8px;';

  const hintRow = document.createElement('div');
  hintRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px;';

  const hint = document.createElement('div');
  hint.textContent = 'Ответ модели';
  hint.style.cssText = `color:${UI_THEME.textMuted}; font-size:11px; letter-spacing:.12em; text-transform:uppercase;`;

  const formatTag = document.createElement('div');
  formatTag.textContent = '2,1+3,4';
  formatTag.style.cssText = `
    padding:3px 8px; border-radius:999px; border:1px solid ${UI_THEME.fieldBorder};
    background:${UI_THEME.surfaceInset}; color:${UI_THEME.textFaint};
    font-size:10px; letter-spacing:.12em;
  `;

  const textareaShell = document.createElement('div');
  textareaShell.style.cssText = `
    padding:10px 12px; border-radius:12px; border:1px solid ${UI_THEME.fieldBorder};
    background:linear-gradient(180deg, rgba(12,12,15,.94) 0%, rgba(17,17,20,.94) 100%);
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.02);
    transition:border-color .18s ease, box-shadow .18s ease, background .18s ease;
  `;

  const textarea = document.createElement('textarea');
  textarea.placeholder = '2,1+3,4,2,1';
  textarea.spellcheck = false;
  textarea.style.cssText = `
    width:100%; min-height:72px; margin:0; padding:0; box-sizing:border-box;
    border:none; background:transparent; color:${UI_THEME.text}; outline:none;
    resize:vertical; font-family:Consolas,'Cascadia Mono','SFMono-Regular',monospace;
    font-size:13px; line-height:1.65; letter-spacing:.02em;
  `;
  textarea.addEventListener('focus', () => {
    textareaShell.style.borderColor = UI_THEME.accent;
    textareaShell.style.boxShadow = `inset 0 0 0 1px ${UI_THEME.accent}22`;
  });
  textarea.addEventListener('blur', () => {
    textareaShell.style.borderColor = UI_THEME.fieldBorder;
    textareaShell.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,.02)';
  });

  const secondaryActions = document.createElement('div');
  secondaryActions.style.cssText = 'display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px;';

  const loadBtn = createActionButton('Обновить вопросы', ICONS.refresh, 'secondary');
  const copyBtn = createActionButton('Скопировать промпт', ICONS.copy, 'accent');
  const applyBtn = createActionButton('Применить ответы', ICONS.apply, 'primary');

  setButtonEnabled(copyBtn, false);
  setButtonEnabled(applyBtn, false);

  headerMetaRow.append(headerMeta, versionTag);
  titleWrap.append(title, subtitle);
  titleRow.append(brandMark, titleWrap);
  header.append(headerMetaRow, titleRow);
  statusCard.append(statusLabel, statusEl);
  hintRow.append(hint, formatTag);
  textareaShell.append(textarea);
  fieldGroup.append(hintRow, textareaShell);
  secondaryActions.append(loadBtn, copyBtn);
  content.append(header, statusCard, fieldGroup, secondaryActions, applyBtn);
  panel.append(topGlow, innerFrame, closeBtn, content);
  document.body.appendChild(panel);

  let allPages = [];
  let allQuestions = null;

  function setPanelAccent(color) {
    panel.style.borderColor = color || UI_THEME.panelBorder;
  }

  function enableCopy() { setButtonEnabled(copyBtn, true); }
  function enableApply() { setButtonEnabled(applyBtn, true); }
  function setStatus(text, color) {
    const tone = color || UI_THEME.textMuted;
    statusEl.style.color = tone;
    statusEl.textContent = text;
    statusCard.style.borderColor = color ? `${tone}66` : UI_THEME.fieldBorder;
    statusCard.style.boxShadow = color
      ? `inset 0 0 0 1px ${tone}18`
      : 'inset 0 0 0 1px rgba(255,255,255,.02)';
  }

  async function doLoad() {
    setPanelAccent(UI_THEME.panelBorder);
    setButtonEnabled(loadBtn, false);
    try {
      const quizData = await fetchAllQuestions(msg => setStatus(msg));
      allPages = quizData.pages;
      allQuestions = quizData.questions;
      setStatus(`✓ Загружено вопросов: ${allQuestions.length} (страниц: ${getAllPageNums().length})`, UI_THEME.accent);
      enableCopy();

      const saved = localStorage.getItem(STORE_KEY);
      if (saved) {
        const answers = JSON.parse(saved); // [[2],[1],[1,3],...]
        textarea.value = answers.map(arr => arr.join('+')).join(',');
        enableApply();
        setStatus(`✓ ${allQuestions.length} вопросов · найдены сохранённые ответы`, UI_THEME.success);
      }
    } catch (e) {
      setPanelAccent(UI_THEME.error);
      setStatus('⚠ Ошибка: ' + e.message, UI_THEME.error);
    } finally {
      setButtonEnabled(loadBtn, true);
    }
  }

  async function copyToClipboard(text) {
    if (typeof GM !== 'undefined' && typeof GM.setClipboard === 'function') {
      await GM.setClipboard(text);
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const ghost = document.createElement('textarea');
    ghost.value = text;
    ghost.setAttribute('readonly', 'readonly');
    ghost.style.position = 'fixed';
    ghost.style.top = '-9999px';
    ghost.style.left = '-9999px';
    document.body.appendChild(ghost);
    ghost.select();
    ghost.setSelectionRange(0, ghost.value.length);

    const copied = document.execCommand('copy');
    ghost.remove();

    if (!copied) {
      throw new Error('не удалось скопировать промпт');
    }
  }

  loadBtn.onclick = doLoad;

  copyBtn.onclick = async () => {
    try {
      await copyToClipboard(SYSTEM_PROMPT + buildPrompt(allQuestions));
      setStatus('✓ Скопировано! Вставь в ChatGPT или Claude', UI_THEME.accent);
      enableApply();
    } catch (e) {
      setPanelAccent(UI_THEME.error);
      setStatus('⚠ Ошибка буфера обмена: ' + e.message, UI_THEME.error);
    }
  };

  applyBtn.onclick = async () => {
    // Парсим "2,1+3,4" в [[2],[1,3],[4]]
    const rawParts = textarea.value.trim().split(',').map(s => s.trim()).filter(Boolean);
    if (rawParts.length !== allQuestions.length) {
      setPanelAccent(UI_THEME.error);
      setStatus(`⚠ Ожидалось ${allQuestions.length} ответов, получено ${rawParts.length}`, UI_THEME.error);
      return;
    }
    const answers = rawParts.map(s => s.split('+').map(n => parseInt(n, 10)));
    if (answers.some(arr => arr.some(isNaN))) {
      setPanelAccent(UI_THEME.error);
      setStatus('⚠ Некорректный формат ответов', UI_THEME.error);
      return;
    }

    setPanelAccent(UI_THEME.accentDim);
    setButtonEnabled(applyBtn, false);
    localStorage.setItem(STORE_KEY, JSON.stringify(answers));
    const applied = applyCurrentPage(allQuestions, answers);

    try {
      await submitAllAnswers(allPages, answers, msg => setStatus(msg, UI_THEME.accent));
      setPanelAccent(UI_THEME.success);
      setStatus(`✓ Сохранены все ${allQuestions.length} ответов. На текущей странице отмечено: ${applied}`, UI_THEME.success);
    } catch (e) {
      setPanelAccent(UI_THEME.error);
      setStatus('⚠ Ошибка сохранения: ' + e.message, UI_THEME.error);
    } finally {
      enableApply();
    }
  };

  // Автозагрузка всегда при старте скрипта
  doLoad();

})();
