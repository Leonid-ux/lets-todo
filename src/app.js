(() => {
  const $ = id => document.getElementById(id);
  const storageKey = 'lets-todo.tasks.v1';
  let tasks = JSON.parse(localStorage.getItem(storageKey) || '[]');
  let view = 'active';
  let dueTaskId = null;
  let openCreatedTask = false;
  let detailTaskId = null;
  let currentPage = 'tasks';
  let statsPeriod = 'month';
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const formatDate = value => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const siteTag = (rawUrl, label = '') => {
    const url = String(rawUrl).replace(/\\&/g, '&');
    let host = 'ссылка';
    try { host = new URL(url).hostname.replace(/^www\./i, '').split('.')[0] || host; } catch (_) {}
    return `<a class="task-link-tag" href="${escape(url)}" target="_blank" rel="noopener noreferrer" title="${escape(url)}"><img src="https://www.google.com/s2/favicons?domain=${escape(host)}.com&sz=32" alt=""><span>${escape(host || label || 'ссылка')}</span></a>`;
  };
  const renderTaskText = value => {
    const markdown = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let html = ''; let cursor = 0; let match;
    const renderPlain = text => escape(text).replace(/https?:\/\/[^\s<]+/g, url => siteTag(url));
    while ((match = markdown.exec(String(value)))) {
      html += renderPlain(String(value).slice(cursor, match.index));
      html += siteTag(match[2], match[1]);
      cursor = match.index + match[0].length;
    }
    return html + renderPlain(String(value).slice(cursor));
  };
  const save = () => { localStorage.setItem(storageKey, JSON.stringify(tasks)); window.dispatchEvent(new CustomEvent('lets-todo:data-changed')); };
  const overdue = task => task.dueDate && task.dueDate < today() && !task.completed;
  const completionGraceMs = 5000;
  const isCompleting = task => task.completed && task.completedAt && Date.now() - task.completedAt < completionGraceMs;
  const scheduleCompletionRender = task => { if (!task.completedAt) return; setTimeout(render, Math.max(0, completionGraceMs - (Date.now() - task.completedAt) + 40)); };
  const completeTask = (task, completed) => {
    if (completed && task.recurrence) { task.completionHistory = [...(task.completionHistory || []), Date.now()]; task.dueDate = toIsoDate(nextRepeatDate(task)); task.completed = false; task.completedAt = null; task.reminderSentFor = null; save(); render(); return; }
    task.completed = completed; task.completedAt = completed ? Date.now() : null; save(); render(); if (completed) scheduleCompletionRender(task);
  };
  const monthNames = { января: 0, январь: 0, февраля: 1, февраль: 1, марта: 2, март: 2, апреля: 3, апрель: 3, мая: 4, май: 4, июня: 5, июнь: 5, июля: 6, июль: 6, августа: 7, август: 7, сентября: 8, сентябрь: 8, октября: 9, октябрь: 9, ноября: 10, ноябрь: 10, декабря: 11, декабрь: 11 };
  const weekDays = { воскресенье: 0, понедельник: 1, вторник: 2, среда: 3, среду: 3, четверг: 4, пятница: 5, пятницу: 5, суббота: 6, субботу: 6 };
  const toIsoDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const formatTaskDate = value => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
  const weekdayTokenMap = { понедельник: 1, вторник: 2, среда: 3, среду: 3, четверг: 4, пятница: 5, пятницу: 5, суббота: 6, субботу: 6, воскресенье: 0 };
  const nextWeekday = (from, weekdays) => { const result = new Date(from); for (let offset = 0; offset < 7; offset += 1) { const candidate = new Date(from); candidate.setDate(candidate.getDate() + offset); if (weekdays.includes(candidate.getDay())) return candidate; } return result; };
  function parseRecurrence(lower, base) {
    if (/каждый будний день|по будням/i.test(lower)) return { rule: { type: 'weekly', weekdays: [1,2,3,4,5], label: 'По будням' }, phrase: /каждый будний день|по будням/i };
    if (/каждый день|ежедневно/i.test(lower)) return { rule: { type: 'daily', label: 'Каждый день' }, phrase: /каждый день|ежедневно/i };
    const interval = lower.match(/каждые?\s+(\d+)\s+(дня|дней|недели|недель)/i);
    if (interval) return { rule: { type: /недел/i.test(interval[2]) ? 'intervalWeeks' : 'intervalDays', interval: Number(interval[1]), label: interval[0] }, phrase: new RegExp(interval[0], 'i') };
    if (/каждую неделю|еженедельно/i.test(lower)) return { rule: { type: 'weekly', weekdays: [base.getDay()], label: 'Каждую неделю' }, phrase: /каждую неделю|еженедельно/i };
    if (/каждый месяц|ежемесячно/i.test(lower)) return { rule: { type: 'monthly', day: base.getDate(), label: 'Каждый месяц' }, phrase: /каждый месяц|ежемесячно/i };
    const weekly = lower.match(/кажд(?:ый|ую)\s+((?:понедельник|вторник|среду?|четверг|пятницу?|субботу?|воскресенье)(?:\s*(?:и|,)\s*(?:понедельник|вторник|среду?|четверг|пятницу?|субботу?|воскресенье))*)/i);
    if (weekly) { const weekdays = [...weekly[1].matchAll(/понедельник|вторник|среду?|четверг|пятницу?|субботу?|воскресенье/gi)].map(match => weekdayTokenMap[match[0]]).filter(day => day !== undefined); if (weekdays.length) return { rule: { type: 'weekly', weekdays, label: weekly[0] }, phrase: new RegExp(weekly[0], 'i') }; }
    return null;
  }
  function firstRepeatDate(rule, base) { if (rule.type === 'weekly') return nextWeekday(base, rule.weekdays); return new Date(base); }
  function nextRepeatDate(task) { const current = new Date(`${task.dueDate || today()}T12:00:00`); const rule = task.recurrence; if (!rule) return current; if (rule.type === 'daily') current.setDate(current.getDate() + 1); else if (rule.type === 'weekly') { current.setDate(current.getDate() + 1); return nextWeekday(current, rule.weekdays); } else if (rule.type === 'monthly') current.setMonth(current.getMonth() + 1, rule.day || current.getDate()); else if (rule.type === 'intervalWeeks') current.setDate(current.getDate() + 7 * (rule.interval || 1)); else current.setDate(current.getDate() + (rule.interval || 1)); return current; }
  function parseNaturalDate(raw) {
    const text = raw.trim();
    const lower = text.toLocaleLowerCase('ru-RU');
    const base = new Date(); base.setHours(12, 0, 0, 0);
    let date = null; let phrase = null; let time = null; let timePhrase = null; let endTime = null; let rangePhrase = null;
    const recurrence = parseRecurrence(lower, base);
    const relative = [
      [/послезавтра/i, 2],
      [/завтра/i, 1],
      [/сегодня/i, 0],
    ];
    for (const [pattern, offset] of relative) {
      if (pattern.test(lower)) { date = new Date(base); date.setDate(date.getDate() + offset); phrase = pattern; break; }
    }
    if (!date && /на следующей неделе/i.test(lower)) {
      date = new Date(base); date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7)); phrase = /на следующей неделе/i;
    }
    if (!date) {
      const weekdayMatch = lower.match(/(?:в\s+)?(?:следующий\s+|следующую\s+)?(воскресенье|понедельник|вторник|среду?|четверг|пятницу?|субботу?)/i);
      if (weekdayMatch) {
        const day = weekDays[weekdayMatch[1]];
        if (day !== undefined) { date = new Date(base); let delta = (day - date.getDay() + 7) % 7; if (delta === 0 || /следующ/i.test(weekdayMatch[0])) delta += 7; date.setDate(date.getDate() + delta); phrase = new RegExp(weekdayMatch[0], 'i'); }
      }
    }
    if (!date) {
      const monthMatch = lower.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i);
      if (monthMatch) { date = new Date(base.getFullYear(), monthNames[monthMatch[2]], Number(monthMatch[1]), 12); phrase = new RegExp(monthMatch[0], 'i'); }
    }
    const timeTokens = [];
    const timePattern = /в\s+([01]?\d|2[0-3])(?::([0-5]\d))?|([01]?\d|2[0-3]):([0-5]\d)|утром|дн[её]м|вечером/gi;
    let timeMatch;
    while ((timeMatch = timePattern.exec(lower))) {
      const token = timeMatch[0];
      const value = timeMatch[1] ? `${pad(Number(timeMatch[1]))}:${timeMatch[2] || '00'}` : timeMatch[3] ? `${pad(Number(timeMatch[3]))}:${timeMatch[4]}` : /утром/i.test(token) ? '09:00' : /дн[её]м/i.test(token) ? '13:00' : '18:00';
      timeTokens.push({ token, value });
    }
    if (timeTokens.length) {
      time = timeTokens[0].value;
      timePhrase = new RegExp(timeTokens.map(item => item.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
    }
    if (!date && time) date = new Date(base);
    if (recurrence) date = firstRepeatDate(recurrence.rule, date || base);
    const rangeMatch = lower.match(/с\s+((?:[01]?\d|2[0-3]):[0-5]\d)\s+до\s+((?:[01]?\d|2[0-3]):[0-5]\d)/i);
    if (rangeMatch) { time = rangeMatch[1]; endTime = rangeMatch[2]; rangePhrase = new RegExp(rangeMatch[0], 'i'); if (!date) date = new Date(base); }
    if (!date) return { title: raw, dueDate: null, dueTime: null };
    let title = raw;
    if (recurrence?.phrase) title = title.replace(recurrence.phrase, '');
    if (phrase) title = title.replace(phrase, '');
    if (rangePhrase) title = title.replace(rangePhrase, '');
    if (timePhrase) title = title.replace(timePhrase, '');
    return { title: title.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim(), dueDate: toIsoDate(date), dueTime: time, endTime, recurrence: recurrence?.rule || null };
  }
  // Исправляет задачи, добавленные до поддержки русских дат в свободном тексте.
  let repaired = false;
  tasks.forEach(task => {
    if (!Array.isArray(task.subtasks)) { task.subtasks = []; repaired = true; }
    if (task.dueTime && task.reminderMinutes === undefined) { task.reminderMinutes = 10; repaired = true; }
    if (task.dueDate) return;
    const parsed = parseNaturalDate(task.title || '');
    if (!parsed.dueDate) return;
    task.title = parsed.title || task.title;
    task.dueDate = parsed.dueDate;
    task.dueTime = parsed.dueTime;
    repaired = true;
  });
  if (repaired) save();
  const composer = $('task-title');
  const quickComposer = $('quick-task-title');
  const composerValue = target => [...target.childNodes].map(node => node.nodeType === Node.ELEMENT_NODE && node.dataset.raw ? node.dataset.raw : node.textContent).join('');
  const composerTokenPattern = /\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s]+|каждый будний день|по будням|каждый день|ежедневно|каждую неделю|еженедельно|каждый месяц|ежемесячно|каждые?\s+\d+\s+(?:дня|дней|недели|недель)|кажд(?:ый|ую)\s+(?:понедельник|вторник|среду?|четверг|пятницу?|субботу?|воскресенье)(?:\s*(?:и|,)\s*(?:понедельник|вторник|среду?|четверг|пятницу?|субботу?|воскресенье))*|на следующей неделе|(?:в\s+)?(?:следующий\s+|следующую\s+)?(?:воскресенье|понедельник|вторник|среду?|четверг|пятницу?|субботу?)|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|послезавтра|завтра|сегодня|утром|дн[её]м|вечером|(?:[01]?\d|2[0-3]):[0-5]\d|в\s+(?:[01]?\d|2[0-3])(?::[0-5]\d)?/gi;
  const composerSite = raw => { try { return new URL(raw.replace(/.*\]\(/, '').replace(/\)$/, '').replace(/\\&/g, '&')).hostname.replace(/^www\./i, '').split('.')[0]; } catch (_) { return 'ссылка'; } };
  const composerChip = raw => {
    const isLink = /https?:\/\//i.test(raw);
    const isTime = /утром|дн[её]м|вечером|в\s+\d|\d{1,2}:\d{2}/i.test(raw);
    const kind = isLink ? 'link' : isTime ? 'time' : 'date';
    const label = isLink ? composerSite(raw) : raw;
    const icon = isLink ? `<img src="https://www.google.com/s2/favicons?domain=${escape(label)}.com&sz=32" alt="">` : '▣';
    return `<span class="composer-chip composer-chip--${kind}" contenteditable="false" data-raw="${escape(raw)}">${icon}<span>${escape(label)}</span></span>`;
  };
  const renderTaskEditor = value => {
    const links = /\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<]+/g;
    let html = ''; let cursor = 0; let match;
    while ((match = links.exec(String(value)))) { html += escape(String(value).slice(cursor, match.index)); html += composerChip(match[0]); cursor = match.index + match[0].length; }
    return html + escape(String(value).slice(cursor));
  };
  const moveComposerCaretToEnd = target => { const range = document.createRange(); range.selectNodeContents(target); range.collapse(false); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); };
  function tokenizeComposer(target, force = false) {
    const raw = composerValue(target);
    if (!force && !/\s$/.test(raw)) return;
    let cursor = 0; let match; let html = ''; let hasTokens = false;
    composerTokenPattern.lastIndex = 0;
    while ((match = composerTokenPattern.exec(raw))) { html += escape(raw.slice(cursor, match.index)); html += composerChip(match[0]); cursor = match.index + match[0].length; hasTokens = true; }
    if (!hasTokens) return;
    target.innerHTML = `${html}${escape(raw.slice(cursor))}`;
    moveComposerCaretToEnd(target);
  }
  const clipboardTextWithLinks = clipboard => {
    const plainText = clipboard?.getData('text/plain') || '';
    const html = clipboard?.getData('text/html');
    if (!html) return plainText;
    const fragment = new DOMParser().parseFromString(html, 'text/html').body;
    const read = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      if (node.tagName === 'A' && /^https?:\/\//i.test(node.href)) {
        return `[${node.textContent.trim() || node.href}](${node.href})`;
      }
      const text = [...node.childNodes].map(read).join('');
      return /^(DIV|P|BR|LI)$/i.test(node.tagName) ? `${text} ` : text;
    };
    return [...fragment.childNodes].map(read).join('').replace(/\s+/g, ' ').trim() || plainText;
  };
  const pastePlainTextOnly = target => target.addEventListener('paste', event => {
    const items = [...(event.clipboardData?.items || [])];
    if (items.some(item => item.type.startsWith('image/'))) { event.preventDefault(); return; }
    const text = clipboardTextWithLinks(event.clipboardData);
    event.preventDefault();
    document.execCommand('insertText', false, text);
    tokenizeComposer(target, true);
  });
  const readStoredList = keys => {
    for (const key of keys) {
      try { const value = JSON.parse(localStorage.getItem(key) || 'null'); if (Array.isArray(value)) return value; if (Array.isArray(value?.items)) return value.items; } catch (_) {}
    }
    return [];
  };
  const asDate = value => { if (!value) return null; const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value); return Number.isNaN(date.getTime()) ? null : date; };
  const startOfDay = value => { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; };
  const periodBounds = period => {
    const end = startOfDay(new Date()); end.setDate(end.getDate() + 1);
    const start = new Date(end);
    if (period === 'week') start.setDate(start.getDate() - 7);
    else if (period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
    else start.setTime(0);
    return { start, end };
  };
  const inBounds = (value, bounds) => { const date = asDate(value); return date && date >= bounds.start && date < bounds.end; };
  const taskCompletions = task => [...(task.completionHistory || []), ...(task.completedAt ? [task.completedAt] : [])];
  const habitEntries = habit => {
    const source = habit.completedDates || habit.completions || habit.history || habit.records || habit.entries || habit.logs || [];
    if (Array.isArray(source)) return source.map(entry => typeof entry === 'object' ? entry : { date: entry, completed: true });
    return Object.entries(source).map(([date, value]) => typeof value === 'object' ? { date, ...value } : { date, completed: Boolean(value), value });
  };
  const habitEntryReached = (habit, entry) => entry.completed === true || entry.reached === true || Number(entry.value ?? entry.count ?? entry.progress ?? 0) >= Number(habit.goal ?? habit.target ?? 1);
  const habitStatistics = bounds => {
    const habits = readStoredList(['lets-todo.habits.v1', 'lets-todo.habits', 'habits']);
    let storedHistory = {};
    try { storedHistory = JSON.parse(localStorage.getItem('lets-todo.habit-history.v1') || '{}'); } catch (_) {}
    const rows = habits.map((habit, index) => {
      const entries = Object.entries(storedHistory[habit.id] || {}).map(([date, value]) => ({ date, value, count: value, completed: Number(value) >= Number(habit.goal || 1) }));
      if (!entries.length) entries.push(...habitEntries(habit));
      const firstEntryDate = entries.map(entry => asDate(entry.date || entry.createdAt || entry.timestamp)).filter(Boolean).sort((a, b) => a - b)[0];
      const created = startOfDay(asDate(habit.createdAt || habit.createdDate || habit.created) || firstEntryDate || new Date());
      const eligibleStart = new Date(Math.max(bounds.start.getTime(), created.getTime()));
      const archived = asDate(habit.archivedAt);
      const eligibleEnd = new Date(Math.min(bounds.end.getTime(), archived ? startOfDay(archived).getTime() : bounds.end.getTime()));
      const eligibleDays = Math.max(0, Math.ceil((eligibleEnd - eligibleStart) / 86400000));
      const reachedDates = new Set(entries.filter(entry => { const date = asDate(entry.date || entry.createdAt || entry.timestamp); return habitEntryReached(habit, entry) && inBounds(date, bounds) && date >= eligibleStart && date < eligibleEnd; }).map(entry => toIsoDate(asDate(entry.date || entry.createdAt || entry.timestamp))));
      const reached = Math.min(reachedDates.size, eligibleDays);
      return { name: habit.name || habit.title || `Привычка ${index + 1}`, color: habit.color || 'var(--color-accent)', reached, eligibleDays, percent: eligibleDays ? Math.round(reached / eligibleDays * 100) : 0 };
    });
    const reached = rows.reduce((sum, row) => sum + row.reached, 0);
    const eligible = rows.reduce((sum, row) => sum + row.eligibleDays, 0);
    return { rows, reached, percent: eligible ? Math.round(reached / eligible * 100) : null };
  };
  const eventCount = bounds => {
    const events = readStoredList(['lets-todo.events.v1', 'lets-todo.events', 'events']);
    let history = {};
    try { history = JSON.parse(localStorage.getItem('lets-todo.habit-history.v1') || '{}'); } catch (_) {}
    return events.reduce((total, event) => total + Object.entries(history[event.id] || {}).filter(([date]) => inBounds(date, bounds)).reduce((sum, [, count]) => sum + Number(count || 0), 0), 0);
  };
  const completedTaskCount = bounds => tasks.reduce((total, task) => total + taskCompletions(task).filter(value => inBounds(value, bounds)).length, 0);
  function renderStatistics() {
    const bounds = periodBounds(statsPeriod);
    const habits = habitStatistics(bounds);
    $('stats-tasks-total').textContent = completedTaskCount(bounds);
    $('stats-habit-goals').textContent = habits.reached;
    $('stats-regularity').textContent = habits.percent === null ? '—' : `${habits.percent}%`;
    $('stats-regularity-progress').style.width = `${habits.percent || 0}%`;
    $('stats-events-total').textContent = eventCount(bounds);
    $('stats-habit-list').innerHTML = habits.rows.length ? habits.rows.map(row => `<div class="habit-stat-row"><div class="habit-stat-heading"><span class="habit-dot" style="--habit-color:${escape(row.color)}"></span><span>${escape(row.name)}</span><strong>${row.percent}%</strong></div><div class="habit-progress"><span style="width:${row.percent}%;--habit-color:${escape(row.color)}"></span></div></div>`).join('') : '<div class="stats-empty">Нет данных о привычках за выбранный период</div>';
  }
  function renderProfile() {
    const bounds = periodBounds('month');
    $('profile-completed-count').textContent = completedTaskCount(bounds);
    $('profile-habit-goals').textContent = habitStatistics(bounds).reached;
  }
  const showPage = page => {
    currentPage = page;
    ['tasks', 'habits', 'habit-detail', 'settings', 'profile', 'statistics'].forEach(name => { const section = $(`${name}-page`); if (section) section.hidden = name !== page; });
    document.querySelectorAll('.main-nav [data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page || (page === 'habit-detail' && button.dataset.page === 'habits')));
    if (page === 'profile') renderProfile();
    if (page === 'statistics') renderStatistics();
    window.dispatchEvent(new CustomEvent('lets-todo:page-shown', { detail: page }));
  };
  function render() {
    const active = tasks.filter(t => !t.completed || isCompleting(t)), archived = tasks.filter(t => t.completed && !isCompleting(t)), visible = view === 'archive' ? archived : active;
    $('active-count').textContent = active.length; $('archive-count').textContent = archived.length;
    renderQuickTaskList(active);
    if (currentPage === 'profile') renderProfile();
    if (currentPage === 'statistics') renderStatistics();
    document.querySelectorAll('[data-view]').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    if (!visible.length) { $('task-list').innerHTML = `<div class="empty">${view === 'archive' ? 'Выполненных задач пока нет' : 'Здесь пока нет задач. Добавьте первую сверху.'}</div>`; return; }
    const groups = new Map(); visible.forEach(t => { const key = t.dueDate || 'Без даты'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); });
    $('task-list').innerHTML = [...groups].map(([group, groupTasks]) => {
      const rows = groupTasks.map(task => {
        const subtasks = task.subtasks || []; const completedSubtasks = subtasks.filter(item => item.completed).length;
        const subtaskMeta = subtasks.length ? `<span class="subtask-status">☑ ${completedSubtasks}/${subtasks.length} подзадач</span>` : '';
        const dueMeta = task.dueDate ? `<button class="due-badge due-badge--date ${overdue(task) ? 'overdue' : ''}" data-action="date" type="button">▣ ${escape(formatTaskDate(task.dueDate))}</button>${task.dueTime ? `<button class="due-badge due-badge--time" data-action="date" type="button">◷ ${escape(task.dueTime)}${task.endTime ? `–${escape(task.endTime)}` : ''}</button>` : ''}` : '';
        const inlineSubtasks = subtasks.length ? `<div class="inline-subtasks">${subtasks.map(subtask => `<label class="inline-subtask ${subtask.completed ? 'is-completed' : ''}" data-subtask-id="${escape(subtask.id)}"><input class="subtask-check" type="checkbox" ${subtask.completed ? 'checked' : ''} aria-label="Выполнить подзадачу"><span>${escape(subtask.title)}</span></label>`).join('')}</div>` : '';
        return `<article class="task ${task.completed ? 'completed' : ''} ${isCompleting(task) ? 'is-completing' : ''}" data-id="${escape(task.id)}" role="button" tabindex="0" title="Нажмите, чтобы открыть карточку"><input class="task-check" type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Выполнить задачу"><div class="task-body"><div class="task-heading"><div class="task-title">${renderTaskText(task.title)}</div>${subtaskMeta}</div>${inlineSubtasks}${dueMeta ? `<div class="task-meta task-schedule">${dueMeta}</div>` : ''}</div></article>`;
      }).join('');
      return `<div class="section-label">${escape(group === 'Без даты' ? group : formatDate(group))}</div>${rows}`;
    }).join('');
  }
  function renderQuickTaskList(activeTasks) {
    $('quick-active-count').textContent = activeTasks.length;
    $('quick-task-list').innerHTML = activeTasks.length ? activeTasks.slice(0, 8).map(task => `<div class="quick-task-row" data-quick-task-id="${escape(task.id)}"><input class="quick-task-check" type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Выполнить задачу"><span>${renderTaskText(task.title)}</span>${task.dueDate ? `<small>${escape(formatTaskDate(task.dueDate))}${task.dueTime ? ` · ${escape(task.dueTime)}` : ''}</small>` : ''}</div>${(task.subtasks || []).map(subtask => `<label class="quick-subtask-row ${subtask.completed ? 'is-completed' : ''}" data-quick-task-id="${escape(task.id)}" data-quick-subtask-id="${escape(subtask.id)}"><input type="checkbox" ${subtask.completed ? 'checked' : ''}><span>${escape(subtask.title)}</span></label>`).join('')}`).join('') : '<div class="empty">Активных задач нет</div>';
  }
  $('date-label').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  $('window-minimize').addEventListener('click', () => window.letsTodo?.minimizeWindow?.());
  $('window-maximize').addEventListener('click', () => window.letsTodo?.toggleMaximizeWindow?.());
  $('window-close').addEventListener('click', () => window.letsTodo?.closeWindow?.());
  $('open-profile').addEventListener('click', () => showPage('profile'));
  $('open-statistics').addEventListener('click', () => showPage('statistics'));
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
  window.addEventListener('lets-todo:navigate', event => showPage(event.detail));
  document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => { statsPeriod = button.dataset.period; document.querySelectorAll('[data-period]').forEach(item => item.classList.toggle('active', item === button)); renderStatistics(); }));
  $('open-settings').addEventListener('click', () => showPage('settings'));
  composer.addEventListener('input', () => tokenizeComposer(composer));
  pastePlainTextOnly(composer);
  composer.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); openCreatedTask = event.ctrlKey; $('quick-add').requestSubmit(); } });
  const createTask = (rawTitle, afterCreate) => { const parsed = parseNaturalDate(rawTitle); const title = parsed.title || rawTitle; const task = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title, dueDate: parsed.dueDate || null, dueTime: parsed.dueTime || null, endTime: parsed.endTime || null, recurrence: parsed.recurrence || null, reminderMinutes: parsed.dueTime ? 10 : 0, completed: false, createdAt: Date.now(), subtasks: [] }; tasks.push(task); save(); render(); afterCreate?.(task); return task; };
  $('quick-add').addEventListener('submit', event => { event.preventDefault(); const rawTitle = composerValue(composer).trim(); if (!rawTitle) return composer.focus(); const shouldOpen = openCreatedTask; openCreatedTask = false; createTask(rawTitle, task => { composer.innerHTML = ''; if (shouldOpen) openTaskDetail(task, true); else composer.focus(); }); });
  quickComposer.addEventListener('input', () => tokenizeComposer(quickComposer));
  pastePlainTextOnly(quickComposer);
  quickComposer.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); openCreatedTask = event.ctrlKey; $('quick-add-modal-form').requestSubmit(); } });
  $('quick-add-modal-form').addEventListener('submit', event => { event.preventDefault(); const rawTitle = composerValue(quickComposer).trim(); if (!rawTitle) return quickComposer.focus(); const shouldOpen = openCreatedTask; openCreatedTask = false; createTask(rawTitle, task => { quickComposer.innerHTML = ''; if (shouldOpen) openTaskDetail(task, true); else quickComposer.focus(); }); });
  document.querySelectorAll('[data-view]').forEach(tab => tab.addEventListener('click', () => { view = tab.dataset.view; render(); }));
  $('clear-completed').addEventListener('click', () => { if (!tasks.some(t => t.completed)) return; if (confirm('Удалить все выполненные задачи из архива?')) { tasks = tasks.filter(t => !t.completed); save(); render(); } });
  $('task-list').addEventListener('change', event => {
    const row = event.target.closest('[data-id]'); if (!row) return;
    const task = tasks.find(t => t.id === row.dataset.id); if (!task) return;
    const subtaskRow = event.target.closest('[data-subtask-id]');
    if (subtaskRow) { const subtask = task.subtasks?.find(item => item.id === subtaskRow.dataset.subtaskId); if (subtask) subtask.completed = event.target.checked; save(); render(); return; }
    completeTask(task, event.target.checked);
  });
  const detailModal = $('task-detail-modal');
  const closeTaskDetail = () => { detailModal.classList.remove('is-open'); detailModal.setAttribute('aria-hidden', 'true'); detailTaskId = null; };
  const renderTaskDetail = () => {
    const task = tasks.find(item => item.id === detailTaskId); if (!task) return closeTaskDetail();
    const subtasks = task.subtasks || []; const done = subtasks.filter(item => item.completed).length;
    $('task-detail-title').innerHTML = renderTaskText(task.title);
    $('task-detail-name').innerHTML = renderTaskEditor(task.title);
    $('task-detail-progress').textContent = subtasks.length ? `${done} из ${subtasks.length} подзадач выполнено` : 'Нет подзадач';
    const dueButton = $('task-detail-date');
    dueButton.textContent = task.dueDate ? formatTaskDate(task.dueDate) : 'Без даты';
    $('task-detail-time').textContent = task.dueTime ? `${task.dueTime}${task.endTime ? `–${task.endTime}` : ''}` : 'Не указано';
    $('task-reminder').value = String(task.reminderMinutes || 0);
    $('task-repeat-label').textContent = task.recurrence?.label || 'Не повторяется';
    $('subtask-list').innerHTML = subtasks.length ? subtasks.map(subtask => `<label class="subtask-row ${subtask.completed ? 'is-completed' : ''}" data-subtask-id="${escape(subtask.id)}"><input type="checkbox" ${subtask.completed ? 'checked' : ''}><span>${escape(subtask.title)}</span><button class="subtask-delete" type="button" data-subtask-action="delete">Удалить</button></label>`).join('') : '<div class="empty">Добавьте первый шаг к задаче</div>';
  };
  function openTaskDetail(task, focusSubtask = false) { detailTaskId = task.id; detailModal.classList.add('is-open'); detailModal.setAttribute('aria-hidden', 'false'); renderTaskDetail(); if (focusSubtask) setTimeout(() => $('subtask-title').focus(), 50); }
  $('task-detail-close').addEventListener('click', closeTaskDetail);
  $('task-detail-delete').addEventListener('click', () => { const task = tasks.find(item => item.id === detailTaskId); if (!task || !confirm(`Удалить задачу «${task.title}»?`)) return; tasks = tasks.filter(item => item.id !== task.id); save(); render(); closeTaskDetail(); });
  detailModal.addEventListener('click', event => { if (event.target === detailModal) closeTaskDetail(); });
  $('task-detail-name').addEventListener('input', event => tokenizeComposer(event.target));
  pastePlainTextOnly($('task-detail-name'));
  $('task-detail-name').addEventListener('blur', event => { const task = tasks.find(item => item.id === detailTaskId); const title = composerValue(event.target).trim(); if (!task || !title) return renderTaskDetail(); task.title = title; save(); render(); renderTaskDetail(); });
  $('task-reminder').addEventListener('change', event => { const task = tasks.find(item => item.id === detailTaskId); if (!task) return; task.reminderMinutes = Number(event.target.value) || 0; save(); renderTaskDetail(); });
  $('task-detail-date').addEventListener('click', () => { const task = tasks.find(item => item.id === detailTaskId); if (task) openDueDialog(task); });
  $('subtask-add-form').addEventListener('submit', event => { event.preventDefault(); const title = $('subtask-title').value.trim(); const task = tasks.find(item => item.id === detailTaskId); if (!task || !title) return $('subtask-title').focus(); task.subtasks.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title, completed: false }); save(); $('subtask-title').value = ''; render(); renderTaskDetail(); $('subtask-title').focus(); });
  $('subtask-title').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('subtask-add-form').requestSubmit(); } });
  $('subtask-list').addEventListener('change', event => { const row = event.target.closest('[data-subtask-id]'); const task = tasks.find(item => item.id === detailTaskId); const subtask = task?.subtasks.find(item => item.id === row?.dataset.subtaskId); if (!subtask) return; subtask.completed = event.target.checked; save(); render(); renderTaskDetail(); });
  $('subtask-list').addEventListener('click', event => { if (event.target.dataset.subtaskAction !== 'delete') return; const row = event.target.closest('[data-subtask-id]'); const task = tasks.find(item => item.id === detailTaskId); if (!task || !row) return; task.subtasks = task.subtasks.filter(item => item.id !== row.dataset.subtaskId); save(); render(); renderTaskDetail(); });
  const dueDialog = $('due-dialog');
  const openDueDialog = task => { dueTaskId = task.id; $('due-date').value = task.dueDate || ''; $('due-time').value = task.dueTime || ''; dueDialog.showModal(); };
  $('due-form').addEventListener('submit', event => {
    if (event.submitter?.value !== 'save') return;
    event.preventDefault();
    const task = tasks.find(item => item.id === dueTaskId);
    if (task) { task.dueDate = $('due-date').value || ($('due-time').value ? today() : null); task.dueTime = $('due-time').value || null; save(); render(); if (detailTaskId) renderTaskDetail(); }
    dueDialog.close();
  });
  $('due-clear').addEventListener('click', () => { const task = tasks.find(item => item.id === dueTaskId); if (task) { task.dueDate = null; task.dueTime = null; save(); render(); if (detailTaskId) renderTaskDetail(); } dueDialog.close(); });
  $('task-list').addEventListener('click', event => { const row = event.target.closest('[data-id]'); if (!row || event.target.closest('.task-check') || event.target.closest('.subtask-check') || event.target.closest('[data-subtask-id]') || event.target.closest('[data-action]') || event.target.closest('a')) return; const task = tasks.find(t => t.id === row.dataset.id); if (task) openTaskDetail(task); });
  $('task-list').addEventListener('keydown', event => { if (event.key !== 'Enter' && event.key !== ' ') return; const row = event.target.closest('[data-id]'); if (!row || event.target.closest('[data-action]')) return; event.preventDefault(); const task = tasks.find(t => t.id === row.dataset.id); if (task) openTaskDetail(task); });
  $('task-list').addEventListener('click', event => { const action = event.target.closest('[data-action]')?.dataset.action, row = event.target.closest('[data-id]'); if (!action || !row) return; const task = tasks.find(t => t.id === row.dataset.id); if (!task) return; if (action === 'date') openDueDialog(task); if (action === 'delete' && confirm(`Удалить задачу «${task.title}»?`)) { tasks = tasks.filter(t => t.id !== task.id); save(); render(); } });
  const quickAddModal = $('quick-add-modal');
  const openQuickAdd = () => { quickAddModal.classList.add('is-open'); quickAddModal.setAttribute('aria-hidden', 'false'); setTimeout(() => quickComposer.focus(), 80); };
  const closeQuickAdd = () => { if (!quickAddModal.classList.contains('is-open')) return; quickAddModal.classList.remove('is-open'); quickAddModal.setAttribute('aria-hidden', 'true'); window.letsTodo?.closeQuickAdd?.(); };
  quickAddModal.addEventListener('click', event => { if (event.target === quickAddModal) closeQuickAdd(); });
  $('quick-task-list').addEventListener('change', event => {
    const row = event.target.closest('[data-quick-task-id]'); if (!row) return;
    const task = tasks.find(item => item.id === row.dataset.quickTaskId); if (!task) return;
    if (row.dataset.quickSubtaskId) { const subtask = task.subtasks?.find(item => item.id === row.dataset.quickSubtaskId); if (subtask) subtask.completed = event.target.checked; save(); render(); return; }
    completeTask(task, event.target.checked);
  });
  document.addEventListener('keydown', event => { if (event.key !== 'Escape') return; if (detailModal.classList.contains('is-open')) { event.preventDefault(); closeTaskDetail(); return; } if (quickAddModal.classList.contains('is-open')) { event.preventDefault(); closeQuickAdd(); } });
  document.addEventListener('click', event => { const link = event.target.closest('a[href^="http"]'); if (!link) return; event.preventDefault(); window.letsTodo?.openExternal?.(link.href); });
  window.letsTodo?.onQuickAddOpen?.(openQuickAdd);
  if (window.location.hash === '#quick-add') {
    document.body.classList.add('quick-window');
    document.documentElement.classList.add('quick-window');
    openQuickAdd();
  }
  window.addEventListener('storage', event => {
    if (event.key === storageKey) { try { tasks = JSON.parse(event.newValue || '[]'); } catch (_) {} }
    if (!event.key || event.key === storageKey || /habit|event/i.test(event.key)) render();
  });
  window.addEventListener('focus', () => { if (currentPage !== 'tasks') render(); });
  window.addEventListener('lets-todo:data-changed', render);
  const checkReminders = () => {
    const now = Date.now(); let changed = false;
    tasks.forEach(task => {
      if (task.completed || !task.dueDate || !task.dueTime || !task.reminderMinutes) return;
      const dueAt = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
      const reminderAt = dueAt - task.reminderMinutes * 60 * 1000;
      const reminderKey = `${task.dueDate}|${task.dueTime}|${task.reminderMinutes}`;
      if (now < reminderAt || now > reminderAt + 90 * 1000 || task.reminderSentFor === reminderKey) return;
      task.reminderSentFor = reminderKey; changed = true;
      window.letsTodo?.showNotification?.({ title: `Через ${task.reminderMinutes} мин: ${task.title}`, body: `Начало в ${task.dueTime}${task.endTime ? ` до ${task.endTime}` : ''}` });
    });
    if (changed) save();
  };
  setInterval(checkReminders, 30 * 1000);
  checkReminders();
  render();
})();
