(() => {
  const $ = id => document.getElementById(id);
  const habitsKey = 'lets-todo.habits.v1';
  const eventsKey = 'lets-todo.events.v1';
  const historyKey = 'lets-todo.habit-history.v1';
  const timersKey = 'lets-todo.timers.v1';
  const sessionsKey = 'lets-todo.timer-sessions.v1';
  const colors = ['#ff4d55', '#ff9f43', '#ffd43b', '#35c78a', '#3aa8ff', '#a879ff'];
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  let habits = read(habitsKey, []);
  let events = read(eventsKey, []);
  let history = read(historyKey, {});
  let timers = read(timersKey, []);
  let sessions = read(sessionsKey, []);
  let selectedDate = localDateKey(new Date());
  let detailId = null;
  let editingId = null;
  let editorType = 'habit';
  let editorColor = colors[0];
  let habitView = 'active';
  let lastTimerActionAt = 0;
  const calendarState = { main: { month: false, anchor: dateFromKey(selectedDate) }, detail: { month: false, anchor: dateFromKey(selectedDate) } };

  function localDateKey(date) { const value = new Date(date); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
  function dateFromKey(key) { return new Date(`${key}T12:00:00`); }
  function escape(value) { return String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character])); }
  function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function allEntries() { return [...habits, ...events, ...timers]; }
  function findEntry(id) { return allEntries().find(entry => entry.id === id); }
  function countFor(id, date = selectedDate) { return Math.max(0, Number(history[id]?.[date] || 0)); }
  function saveDefinitions() { localStorage.setItem(habitsKey, JSON.stringify(habits)); localStorage.setItem(eventsKey, JSON.stringify(events)); localStorage.setItem(timersKey, JSON.stringify(timers)); }
  function saveHistory() { localStorage.setItem(historyKey, JSON.stringify(history)); }
  function saveSessions() { localStorage.setItem(sessionsKey, JSON.stringify(sessions)); }
  function notifyChange() { window.dispatchEvent(new CustomEvent('lets-todo:data-changed')); }
  function changeCount(id, delta, date = selectedDate) {
    const entry = findEntry(id); if (!entry) return;
    const current = countFor(id, date);
    const next = entry.type === 'habit' ? Math.min(Number(entry.goal || 1), Math.max(0, current + delta)) : Math.max(0, current + delta);
    history[id] ||= {};
    if (next) history[id][date] = next; else delete history[id][date];
    saveHistory(); renderAll(); notifyChange();
  }
  function activeSession() { return sessions.find(session => !session.endedAt) || null; }
  function timerActive(id) { return activeSession()?.timerId === id; }
  function dayBounds(key) { const start = new Date(`${key}T00:00:00`); const end = new Date(start); end.setDate(end.getDate() + 1); return { start: start.getTime(), end: end.getTime() }; }
  function sessionOverlap(session, key, now = Date.now()) { const bounds = dayBounds(key); return Math.max(0, Math.min(Number(session.endedAt || now), bounds.end) - Math.max(Number(session.startedAt), bounds.start)); }
  function timerTotal(id, key, now = Date.now()) { return sessions.filter(session => session.timerId === id).reduce((total, session) => total + sessionOverlap(session, key, now), 0); }
  function formatClock(duration) { const seconds = Math.max(0, Math.floor(duration / 1000)); const hours = Math.floor(seconds / 3600); const minutes = Math.floor(seconds % 3600 / 60); return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  function formatDuration(duration) { const minutes = Math.max(0, Math.floor(duration / 60000)); const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours} ч${rest ? ` ${rest} мин` : ''}` : `${rest} мин`; }
  function stopActive(at = Date.now()) { const session = activeSession(); if (!session) return; session.endedAt = at; session.duration = Math.max(0, at - Number(session.startedAt)); }
  function toggleTimer(id) {
    const now = Date.now(); if (now - lastTimerActionAt < 300) return; lastTimerActionAt = now;
    const active = activeSession();
    if (active?.timerId === id) stopActive(now);
    else { if (active) stopActive(now); sessions.push({ id: uid(), timerId: id, startedAt: now, endedAt: null, duration: null }); }
    saveSessions(); renderAll(); notifyChange();
  }
  function startOfWeek(date) { const result = new Date(date); const day = result.getDay() || 7; result.setDate(result.getDate() - day + 1); return result; }
  function dateLabel(key) { return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateFromKey(key)); }
  function dotsForDate(key, detail) {
    const entries = detail ? [findEntry(detailId)].filter(Boolean) : allEntries();
    return entries.filter(entry => entry.type === 'timer' ? timerTotal(entry.id, key) > 0 : countFor(entry.id, key) > 0).slice(0, 4).map(entry => `<i style="--dot-color:${escape(entry.color)}"></i>`).join('');
  }
  function renderCalendar(name) {
    const root = document.querySelector(`[data-calendar="${name}"]`); if (!root) return;
    const state = calendarState[name];
    const anchor = new Date(state.anchor);
    let start; let length; let label;
    if (state.month) {
      const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
      start = startOfWeek(monthStart); length = 42;
      label = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(monthStart);
    } else {
      start = startOfWeek(anchor); length = 7;
      const end = new Date(start); end.setDate(end.getDate() + 6);
      label = start.getMonth() === end.getMonth() ? new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(start) : `${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(start)} — ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(end)}`;
    }
    root.querySelector('[data-calendar-label]').textContent = label;
    root.querySelector('[data-calendar-mode]').textContent = state.month ? '⌃' : '⌄';
    const today = localDateKey(new Date());
    root.querySelector('[data-calendar-grid]').innerHTML = Array.from({ length }, (_, index) => {
      const date = new Date(start); date.setDate(date.getDate() + index); const key = localDateKey(date);
      const outside = state.month && date.getMonth() !== anchor.getMonth();
      return `<button type="button" data-calendar-date="${key}" class="${key === selectedDate ? 'selected ' : ''}${key === today ? 'today ' : ''}${outside ? 'outside' : ''}"><span>${date.getDate()}</span><em>${dotsForDate(key, name === 'detail')}</em></button>`;
    }).join('');
  }
  function row(entry) {
    const count = countFor(entry.id);
    const value = entry.type === 'habit' ? `${count}/${entry.goal}` : String(count);
    const completed = entry.type === 'habit' && count >= entry.goal;
    return `<div class="habit-row ${completed ? 'completed' : ''} ${entry.type === 'event' && count > 0 ? 'marked' : ''}" data-entry-id="${escape(entry.id)}"><button class="habit-check" type="button" data-count-change="1" style="--entry-color:${escape(entry.color)}" aria-label="Увеличить"></button><button class="habit-name" type="button" data-open-entry>${escape(entry.name)}</button><span class="habit-count">${value}</span><button class="habit-minus" type="button" data-count-change="-1" ${count ? '' : 'disabled'} aria-label="Уменьшить">−</button></div>`;
  }
  function archiveRow(entry) { return `<div class="habit-row archived" data-entry-id="${escape(entry.id)}"><span class="habit-check" style="--entry-color:${escape(entry.color)}"></span><button class="habit-name" type="button" data-open-entry>${escape(entry.name)}</button><span class="habit-count">В архиве</span><button class="habit-restore" type="button" data-restore-entry aria-label="Восстановить">↺</button></div>`; }
  function timerRow(entry, date = selectedDate, todayCard = false) { const active = timerActive(entry.id); const total = timerTotal(entry.id, date); return `<div class="habit-row timer-row ${active ? 'timer-active' : ''}" data-entry-id="${escape(entry.id)}" ${todayCard ? 'data-today-timer' : ''}><button class="habit-check timer-play" type="button" data-timer-toggle style="--entry-color:${escape(entry.color)}" aria-label="${active ? 'Остановить' : 'Запустить'}">${active ? '■' : '▶'}</button><button class="habit-name" type="button" data-open-entry>${escape(entry.name)}</button><span class="habit-count">${active ? formatClock(total) : formatDuration(total)}</span><span class="timer-state">${active ? 'Активен' : ''}</span></div>`; }
  function renderLists() {
    const activeHabits = habits.filter(entry => !entry.archivedAt);
    const archivedHabits = habits.filter(entry => entry.archivedAt);
    $('habits-selected-label').textContent = dateLabel(selectedDate);
    $('active-habit-count').textContent = activeHabits.length;
    $('archived-habit-count').textContent = archivedHabits.length;
    $('habit-list-section').hidden = habitView !== 'active'; $('event-list-section').hidden = habitView !== 'active'; $('habit-archive-section').hidden = habitView !== 'archive';
    document.querySelectorAll('[data-habit-view]').forEach(button => button.classList.toggle('active', button.dataset.habitView === habitView));
    $('habit-list').innerHTML = activeHabits.length ? activeHabits.map(row).join('') : '<div class="stats-empty">Пока нет привычек</div>';
    $('event-list').innerHTML = events.length ? events.map(row).join('') : '<div class="stats-empty">Пока нет событий</div>';
    $('timer-list').innerHTML = timers.length ? timers.map(entry => timerRow(entry)).join('') : '<div class="stats-empty">Пока нет таймеров</div>';
    $('habit-archive-list').innerHTML = archivedHabits.length ? archivedHabits.map(archiveRow).join('') : '<div class="stats-empty">Архив привычек пуст</div>';
  }
  function renderToday() {
    const today = localDateKey(new Date());
    const activeHabits = habits.filter(entry => !entry.archivedAt);
    const done = activeHabits.filter(entry => countFor(entry.id, today) >= entry.goal).length;
    $('today-habits-summary').textContent = `${done}/${activeHabits.length}`;
    const todayRows = activeHabits.map(entry => {
      const count = countFor(entry.id, today); const completed = count >= entry.goal;
      return `<div class="habit-row ${completed ? 'completed' : ''}" data-entry-id="${escape(entry.id)}" data-today-habit><button class="habit-check" type="button" data-count-change="1" style="--entry-color:${escape(entry.color)}"></button><button class="habit-name" type="button" data-open-entry>${escape(entry.name)}</button><span class="habit-count">${count}/${entry.goal}</span><button class="habit-minus" type="button" data-count-change="-1" ${count ? '' : 'disabled'}>−</button></div>`;
    });
    const timerRows = timers.map(entry => timerRow(entry, today, true));
    $('today-habit-list').innerHTML = [...todayRows, ...timerRows].length ? [...todayRows, ...timerRows].join('') : '<div class="stats-empty">Добавьте первую привычку или таймер</div>';
    renderActiveTimer();
  }
  function renderActiveTimer() { const session = activeSession(); const indicator = $('active-timer-indicator'); if (!session) { indicator.hidden = true; return; } const timer = timers.find(entry => entry.id === session.timerId); if (!timer) { stopActive(); saveSessions(); indicator.hidden = true; return; } indicator.hidden = false; indicator.dataset.timerId = timer.id; indicator.innerHTML = `<span style="--entry-color:${escape(timer.color)}">▶</span> ${escape(timer.name)} · ${formatClock(Date.now() - session.startedAt)}`; }
  function renderDetail() {
    const entry = findEntry(detailId); if (!entry) return;
    const count = countFor(entry.id);
    const isTimer = entry.type === 'timer';
    $('habit-detail-kind').textContent = entry.type === 'habit' ? 'ПРИВЫЧКА' : entry.type === 'event' ? 'СОБЫТИЕ' : 'ТАЙМЕР';
    $('habit-detail-title').innerHTML = `<span class="detail-color" style="--entry-color:${escape(entry.color)}"></span>${escape(entry.name)}`;
    $('habit-detail-date-label').textContent = dateLabel(selectedDate);
    const content = $('habit-detail-content');
    const footer = $('habit-detail-footer');
    if (isTimer) {
      content.innerHTML = `<button id="habit-detail-timer-toggle" class="timer-detail-toggle" type="button">${timerActive(entry.id) ? '■ Остановить' : '▶ Запустить'}</button><section class="habit-section"><h2>Сессии</h2><div id="timer-session-list" class="timer-session-list"></div></section>`;
      renderTimerSessions(entry.id);
    } else {
      const completed = entry.type === 'habit' && count >= entry.goal;
      content.innerHTML = `<div class="habit-detail-counter"><button id="habit-detail-minus" type="button" ${entry.archivedAt || !count ? 'disabled' : ''}>−</button><strong>${entry.type === 'habit' ? `${count}/${entry.goal}` : count}</strong><button id="habit-detail-plus" type="button" ${entry.archivedAt || completed ? 'disabled' : ''}>+</button></div>`;
    }
    footer.innerHTML = `${entry.type === 'habit' ? `<button id="archive-habit-entry" class="ui-button ui-button--secondary" type="button">${entry.archivedAt ? 'Вернуть из архива' : 'В архив'}</button>` : ''}<button id="delete-habit-entry" class="ui-button ui-button--secondary" type="button">Удалить</button>`;
    renderCalendar('detail');
  }
  function renderTimerSessions(timerId) {
    const bounds = dayBounds(selectedDate); const now = Date.now();
    const daySessions = sessions.filter(session => session.timerId === timerId && sessionOverlap(session, selectedDate, now) > 0);
    const time = value => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    $('timer-session-list').innerHTML = daySessions.length ? daySessions.map(session => { const start = Math.max(session.startedAt, bounds.start); const end = Math.min(session.endedAt || now, bounds.end); return `<div class="timer-session-row"><span>${time(start)}–${session.endedAt ? time(end) : 'сейчас'}</span><strong>${formatDuration(end - start)}</strong></div>`; }).join('') : '<div class="stats-empty">За этот день сессий нет</div>';
  }
  function renderAll() { renderCalendar('main'); renderLists(); renderToday(); if (detailId) renderDetail(); }
  function navigateDetail(id) { detailId = id; calendarState.detail.anchor = dateFromKey(selectedDate); window.dispatchEvent(new CustomEvent('lets-todo:navigate', { detail: 'habit-detail' })); renderDetail(); }

  document.querySelectorAll('.habit-calendar').forEach(calendar => {
    const name = calendar.dataset.calendar;
    calendar.addEventListener('click', event => {
      const dateButton = event.target.closest('[data-calendar-date]');
      if (dateButton) { selectedDate = dateButton.dataset.calendarDate; calendarState[name].anchor = dateFromKey(selectedDate); renderAll(); return; }
      const navigation = event.target.closest('[data-calendar-nav]');
      if (navigation) { const state = calendarState[name]; const amount = navigation.dataset.calendarNav === 'prev' ? -1 : 1; if (state.month) state.anchor.setMonth(state.anchor.getMonth() + amount); else state.anchor.setDate(state.anchor.getDate() + 7 * amount); renderCalendar(name); return; }
      if (event.target.closest('[data-calendar-mode]')) { const state = calendarState[name]; state.month = !state.month; state.anchor = dateFromKey(selectedDate); renderCalendar(name); }
    });
  });
  function listClick(event) {
    const row = event.target.closest('[data-entry-id]'); if (!row) return;
    if (event.target.closest('[data-open-entry]')) { navigateDetail(row.dataset.entryId); return; }
    if (event.target.closest('[data-timer-toggle]')) { toggleTimer(row.dataset.entryId); return; }
    const change = event.target.closest('[data-count-change]'); if (change) changeCount(row.dataset.entryId, Number(change.dataset.countChange), row.hasAttribute('data-today-habit') ? localDateKey(new Date()) : selectedDate);
  }
  $('habit-list').addEventListener('click', listClick);
  $('event-list').addEventListener('click', listClick);
  $('timer-list').addEventListener('click', listClick);
  $('habit-archive-list').addEventListener('click', event => { const row = event.target.closest('[data-entry-id]'); if (!row) return; const entry = findEntry(row.dataset.entryId); if (!entry) return; if (event.target.closest('[data-restore-entry]')) { entry.archivedAt = null; saveDefinitions(); renderAll(); notifyChange(); return; } if (event.target.closest('[data-open-entry]')) navigateDetail(entry.id); });
  $('today-habit-list').addEventListener('click', listClick);
  document.querySelectorAll('[data-habit-view]').forEach(button => button.addEventListener('click', () => { habitView = button.dataset.habitView; renderLists(); }));
  $('today-habits-toggle').addEventListener('click', () => document.querySelector('.today-habits').classList.toggle('collapsed'));
  $('active-timer-indicator').addEventListener('click', () => { const id = $('active-timer-indicator').dataset.timerId; if (id) navigateDetail(id); });

  const modal = $('habit-editor-modal');
  const editorContent = $('habit-editor-content');
  function renderColors() { $('habit-color-options').innerHTML = colors.map(color => `<button type="button" data-color="${color}" class="${color === editorColor ? 'selected' : ''}" style="--entry-color:${color}" aria-label="Выбрать цвет"></button>`).join(''); }
  function renderTypePicker() {
    editorContent.innerHTML = `<div class="quick-add-sheet habit-editor-sheet"><header><div><p class="eyebrow">НОВАЯ ЗАПИСЬ</p><h2>Выберите тип</h2></div><button class="dialog-close" data-editor-close type="button" aria-label="Закрыть">×</button></header><div class="habit-type-switch"><button type="button" data-entry-type="habit">Привычка</button><button type="button" data-entry-type="event">Событие</button><button type="button" data-entry-type="timer">Таймер</button></div></div>`;
  }
  function renderEditorForm(entry = null) {
    const type = entry?.type || editorType;
    const typeName = type === 'habit' ? 'Привычка' : type === 'event' ? 'Событие' : 'Таймер';
    const goalField = type === 'habit' ? `<label class="habit-form-field"><span>Количество в день</span><input id="habit-goal" class="ui-input" type="number" min="1" max="99" value="${entry?.goal || 1}" required></label>` : '';
    editorContent.innerHTML = `<form id="habit-editor-form" class="quick-add-sheet habit-editor-sheet"><header><div><p class="eyebrow">${entry ? 'ИЗМЕНЕНИЕ ЗАПИСИ' : `НОВАЯ ${typeName.toUpperCase()}`}</p><h2>${entry ? 'Изменить' : typeName}</h2></div><button class="dialog-close" data-editor-close type="button" aria-label="Закрыть">×</button></header><label class="habit-form-field"><span>Название</span><input id="habit-name" class="ui-input" maxlength="80" value="${escape(entry?.name || '')}" required></label><fieldset class="habit-colors"><legend>Цвет</legend><div id="habit-color-options"></div></fieldset>${goalField}<footer><button class="ui-button ui-button--primary" type="submit">Сохранить</button></footer></form>`;
    renderColors(); setTimeout(() => $('habit-name').focus(), 40);
  }
  function openEditor(entry = null) {
    editingId = entry?.id || null; editorColor = entry?.color || colors[0]; editorType = entry?.type || 'habit';
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false');
    if (entry) renderEditorForm(entry); else renderTypePicker();
  }
  function closeEditor() { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); editingId = null; }
  $('add-habit-entry').addEventListener('click', () => openEditor());
  $('edit-habit-entry').addEventListener('click', () => { const entry = findEntry(detailId); if (entry) openEditor(entry); });
  modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('[data-editor-close]')) { closeEditor(); return; } const type = event.target.closest('[data-entry-type]'); if (type) { editorType = type.dataset.entryType; renderEditorForm(); return; } const color = event.target.closest('[data-color]'); if (color) { editorColor = color.dataset.color; renderColors(); } });
  modal.addEventListener('submit', event => {
    if (event.target.id !== 'habit-editor-form') return;
    event.preventDefault(); const name = $('habit-name').value.trim(); if (!name) return;
    const existing = findEntry(editingId); const entry = existing || { id: uid(), type: editorType, createdAt: localDateKey(new Date()) };
    entry.name = name; entry.color = editorColor; if (entry.type === 'habit') entry.goal = Math.min(99, Math.max(1, Number($('habit-goal').value) || 1));
    if (!existing) { if (entry.type === 'habit') habits.push(entry); else if (entry.type === 'event') events.push(entry); else timers.push(entry); }
    saveDefinitions(); closeEditor(); renderAll(); notifyChange();
  });
  $('habit-detail-page').addEventListener('click', event => {
    if (event.target.closest('#habit-detail-minus')) { changeCount(detailId, -1); return; }
    if (event.target.closest('#habit-detail-plus')) { changeCount(detailId, 1); return; }
    if (event.target.closest('#habit-detail-timer-toggle')) { toggleTimer(detailId); return; }
    if (event.target.closest('#delete-habit-entry')) {
      const entry = findEntry(detailId); if (!entry || !confirm(`Удалить «${entry.name}» и всю историю?`)) return;
      if (entry.type === 'timer' && timerActive(entry.id)) stopActive();
      habits = habits.filter(item => item.id !== entry.id); events = events.filter(item => item.id !== entry.id); timers = timers.filter(item => item.id !== entry.id); sessions = sessions.filter(session => session.timerId !== entry.id); delete history[entry.id]; saveDefinitions(); saveHistory(); saveSessions(); detailId = null; renderAll(); notifyChange(); window.dispatchEvent(new CustomEvent('lets-todo:navigate', { detail: 'habits' })); return;
    }
    if (event.target.closest('#archive-habit-entry')) {
      const entry = findEntry(detailId); if (!entry || entry.type !== 'habit') return;
      entry.archivedAt = entry.archivedAt ? null : Date.now(); habitView = entry.archivedAt ? 'archive' : 'active'; saveDefinitions(); renderAll(); notifyChange(); window.dispatchEvent(new CustomEvent('lets-todo:navigate', { detail: 'habits' }));
    }
  });
  window.addEventListener('lets-todo:page-shown', event => { if (event.detail === 'habits') renderAll(); if (event.detail === 'habit-detail') renderDetail(); });
  window.addEventListener('storage', event => { if (![habitsKey, eventsKey, historyKey, timersKey, sessionsKey].includes(event.key)) return; habits = read(habitsKey, []); events = read(eventsKey, []); history = read(historyKey, {}); timers = read(timersKey, []); sessions = read(sessionsKey, []); renderAll(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('is-open')) closeEditor(); });
  renderAll();
  setInterval(() => { if (activeSession()) { renderToday(); renderCalendar('main'); if (detailId) renderDetail(); } }, 1000);
})();
