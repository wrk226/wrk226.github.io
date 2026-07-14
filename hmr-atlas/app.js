const READ_STORAGE_KEY = 'hmr-atlas:read-papers:v1';
const NOTE_STORAGE_KEY = 'hmr-atlas:paper-notes:v1';
const SUPABASE_BROWSER_SRC = './supabase.js?v=1';
const SYNC_TIMEOUT_MS = 12000;
const syncConfig = window.HMR_SYNC_CONFIG || {};
const syncEnabled = Boolean(syncConfig.supabaseUrl && syncConfig.supabasePublishableKey);
const stacks = [...document.querySelectorAll('.filter-stack')];
const [domainStack, inputStack, taskStack, settingStack, yearStack] = stacks;
const paperList = document.querySelector('.paper-list');
const emptyState = document.querySelector('.empty-state');
const cards = [...document.querySelectorAll('.paper-row')];
const search = document.querySelector('.paper-search input');
const resultCount = document.querySelector('.library-tools > span');
const resultTitle = document.querySelector('.library-head h2');
const sortSelect = document.querySelector('.library-tools select');
const publicationSelect = document.querySelector('#publication-filter');
const readSelect = document.querySelector('#read-filter');
const [citationMin, citationMax] = [...document.querySelectorAll('.range-inputs input')];
const loadMore = document.querySelector('.load-more');
const syncAccountButton = document.querySelector('.sync-account');
const selected = { domain: new Set(), inputs: new Set(), task: new Set(), setting: new Set() };
let activeYear = '全部年份';
let visibleLimit = 15;
let readPaperIds = loadReadPaperIds();
let paperNotes = loadPaperNotes();
let syncClient = null;
let syncUser = null;
let hydratedUserId = '';
let noteSyncTimers = {};
cards.forEach((card) => card.classList.remove('hidden-by-page'));

function setSyncStatus(status) {
  if (!syncAccountButton) return;
  syncAccountButton.classList.remove('local', 'connecting', 'synced', 'error');
  syncAccountButton.classList.add(status);
  syncAccountButton.disabled = !syncEnabled || status === 'connecting';
  const username = syncUser?.user_metadata?.user_name || syncUser?.user_metadata?.preferred_username || syncUser?.user_metadata?.full_name || syncUser?.user_metadata?.name || 'GitHub';
  const label = !syncEnabled ? '本机保存' : status === 'connecting' ? '同步中…' : status === 'error' ? '同步失败' : syncUser ? '已同步 · ' + username : 'GitHub 登录同步';
  syncAccountButton.innerHTML = '<span aria-hidden="true">' + (syncUser ? '✓' : '↻') + '</span>' + label;
  syncAccountButton.title = status === 'error' ? '同步失败，点击重试' : syncEnabled ? (syncUser ? '退出同步账号；本机记录仍保留' : '登录后在多个设备同步已读状态和注释') : '云端同步尚未配置，记录仅保存在本机';
}

function loadSupabaseBrowser() {
  if (window.supabase) return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="' + SUPABASE_BROWSER_SRC + '"]');
    const script = existing || document.createElement('script');
    const finish = () => window.supabase ? resolve(window.supabase) : reject(new Error('Supabase client failed to load'));
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Supabase client failed to load')), { once: true });
    window.setTimeout(() => reject(new Error('Supabase client load timed out')), SYNC_TIMEOUT_MS);
    if (!existing) {
      script.src = SUPABASE_BROWSER_SRC;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }
  });
}

function withSyncTimeout(request) {
  return Promise.race([
    Promise.resolve(request),
    new Promise((_, reject) => window.setTimeout(() => reject(new Error('Sync request timed out')), SYNC_TIMEOUT_MS)),
  ]);
}

function loadReadPaperIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(READ_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistReadPaperIds() {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...readPaperIds]));
  } catch {
    // Keep the marker usable for this session when browser storage is unavailable.
  }
}

function loadPaperNotes() {
  try {
    const stored = JSON.parse(localStorage.getItem(NOTE_STORAGE_KEY) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry) => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

function persistPaperNotes() {
  try {
    localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(paperNotes));
  } catch {
    // Keep notes usable for this session when browser storage is unavailable.
  }
}

async function syncOnePaper(paperId, isRead, note) {
  if (!syncClient || !syncUser) return;
  setSyncStatus('connecting');
  try {
    const { error } = await withSyncTimeout(syncClient.from('paper_user_state').upsert({
      user_id: syncUser.id,
      paper_id: paperId,
      is_read: isRead,
      note,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,paper_id' }));
    setSyncStatus(error ? 'error' : 'synced');
  } catch {
    setSyncStatus('error');
  }
}

async function mergeCloudState(user) {
  setSyncStatus('connecting');
  try {
    const localReads = loadReadPaperIds();
    const localNotes = loadPaperNotes();
    const { data, error } = await withSyncTimeout(syncClient.from('paper_user_state').select('paper_id,is_read,note,updated_at'));
    if (error) throw new Error(error.message);
    const cloudRows = data || [];
    const cloudIds = new Set(cloudRows.map((row) => row.paper_id));
    const localIds = new Set([...localReads, ...Object.keys(localNotes)]);
    const localOnlyIds = [...localIds].filter((paperId) => !cloudIds.has(paperId));
    readPaperIds = new Set(localReads);
    paperNotes = { ...localNotes };
    cloudRows.forEach((row) => {
      if (row.is_read) readPaperIds.add(row.paper_id);
      else readPaperIds.delete(row.paper_id);
      if (row.note) paperNotes[row.paper_id] = row.note;
      else delete paperNotes[row.paper_id];
    });
    persistReadPaperIds();
    persistPaperNotes();
    syncReadMarkers();
    syncNoteFields();
    renderPapers();
    if (localOnlyIds.length > 0) {
      const result = await withSyncTimeout(syncClient.from('paper_user_state').upsert(localOnlyIds.map((paperId) => ({
        user_id: user.id,
        paper_id: paperId,
        is_read: localReads.has(paperId),
        note: localNotes[paperId] || '',
        updated_at: new Date().toISOString(),
      })), { onConflict: 'user_id,paper_id' }));
      if (result.error) throw new Error(result.error.message);
    }
    setSyncStatus('synced');
  } catch {
      setSyncStatus('error');
  }
}

async function initSync() {
  setSyncStatus('local');
  if (!syncEnabled) return;
  try {
    const library = await loadSupabaseBrowser();
    syncClient = library.createClient(syncConfig.supabaseUrl, syncConfig.supabasePublishableKey, {
      auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' },
    });
    const applySession = (session) => {
      syncUser = session?.user || null;
      if (!syncUser) {
        hydratedUserId = '';
        setSyncStatus('local');
        return;
      }
      if (hydratedUserId === syncUser.id) return;
      hydratedUserId = syncUser.id;
      window.setTimeout(() => void mergeCloudState(syncUser), 0);
    };
    const { data } = await withSyncTimeout(syncClient.auth.getSession());
    applySession(data.session);
    syncClient.auth.onAuthStateChange((_event, session) => applySession(session));
  } catch {
    setSyncStatus('error');
  }
}

function values(card, key) {
  return (card.dataset[key] || '').split('|').filter(Boolean);
}

function syncReadMarkers() {
  cards.forEach((card) => {
    const isRead = readPaperIds.has(card.dataset.paperId);
    const button = card.querySelector('.read-toggle');
    card.dataset.read = isRead ? 'true' : 'false';
    card.classList.toggle('is-read', isRead);
    if (!button) return;
    button.setAttribute('aria-pressed', isRead ? 'true' : 'false');
    button.setAttribute('aria-label', (isRead ? '标记为未读：' : '标记为已读：') + (card.querySelector('h3')?.textContent || '论文'));
    button.innerHTML = '<span aria-hidden="true">' + (isRead ? '✓' : '○') + '</span>' + (isRead ? '已读' : '未读');
  });
}

function syncNoteFields() {
  cards.forEach((card) => {
    const input = card.querySelector('.paper-note-input');
    if (input) input.value = paperNotes[card.dataset.paperId] || '';
  });
}

function sortCards(items) {
  const mode = sortSelect?.value || 'date-desc';
  return items.sort((a, b) => {
    if (mode === 'date-asc') return a.dataset.date.localeCompare(b.dataset.date);
    if (mode === 'citation-desc') return Number(b.dataset.citations) - Number(a.dataset.citations) || b.dataset.date.localeCompare(a.dataset.date);
    if (mode === 'citation-asc') return Number(a.dataset.citations) - Number(b.dataset.citations) || b.dataset.date.localeCompare(a.dataset.date);
    return b.dataset.date.localeCompare(a.dataset.date);
  });
}

function renderPapers() {
  const needle = (search.value || '').trim().toLowerCase();
  const min = citationMin.value === '' ? null : Number(citationMin.value);
  const max = citationMax.value === '' ? null : Number(citationMax.value);
  const publication = publicationSelect.value;
  const readFilter = readSelect.value;
  const matchedCards = sortCards(cards.filter((card) => {
    const domainMatch = selected.domain.size === 0 || card.dataset.domain === [...selected.domain][0];
    const inputValues = values(card, 'inputs');
    const taskValues = values(card, 'tasks');
    const settingValues = values(card, 'settings');
    const inputMatch = [...selected.inputs].every((value) => inputValues.includes(value));
    const taskMatch = [...selected.task].every((value) => taskValues.includes(value));
    const settingMatch = [...selected.setting].every((value) => settingValues.includes(value));
    const yearMatch = activeYear === '全部年份' || card.dataset.year === activeYear;
    const citations = Number(card.dataset.citations || 0);
    const citationMatch = (min === null || citations >= min) && (max === null || citations <= max);
    const publicationMatch = publication === 'all' || card.dataset.publication === publication;
    const isRead = readPaperIds.has(card.dataset.paperId);
    const readMatch = readFilter === 'all' || (readFilter === 'read' ? isRead : !isRead);
    const textMatch = !needle || card.textContent.toLowerCase().includes(needle);
    return domainMatch && inputMatch && taskMatch && settingMatch && yearMatch && citationMatch && publicationMatch && readMatch && textMatch;
  }));

  matchedCards.forEach((card) => paperList.insertBefore(card, emptyState));
  const matched = matchedCards.length;
  const matchedSet = new Set(matchedCards);
  cards.forEach((card) => {
    const index = matchedCards.indexOf(card);
    const shouldShow = matchedSet.has(card) && index < visibleLimit;
    card.hidden = !shouldShow;
    card.style.setProperty('display', shouldShow ? 'grid' : 'none', 'important');
  });
  const labels = [...selected.domain, ...selected.inputs, ...selected.task, ...selected.setting];
  if (readFilter === 'read') labels.push('已读');
  if (readFilter === 'unread') labels.push('未读');
  resultTitle.textContent = labels.length ? labels.join(' × ') : '全部论文';
  resultCount.textContent = matched + ' 篇结果';
  emptyState.hidden = matched > 0;
  if (loadMore) {
    loadMore.hidden = matched <= visibleLimit;
    loadMore.innerHTML = '继续显示 <span>' + Math.max(0, matched - visibleLimit) + '</span> 篇';
  }
}

function bindMulti(stack, dimension) {
  [...stack.querySelectorAll('button')].forEach((button) => button.addEventListener('click', () => {
    const value = button.textContent.trim();
    if (selected[dimension].has(value)) selected[dimension].delete(value);
    else selected[dimension].add(value);
    button.classList.toggle('active', selected[dimension].has(value));
    visibleLimit = 15;
    renderPapers();
  }));
}

[...domainStack.querySelectorAll('button')].forEach((button) => button.addEventListener('click', () => {
  const value = button.textContent.trim();
  const wasActive = selected.domain.has(value);
  selected.domain.clear();
  if (!wasActive) selected.domain.add(value);
  [...domainStack.querySelectorAll('button')].forEach((item) => item.classList.toggle('active', selected.domain.has(item.textContent.trim())));
  visibleLimit = 15;
  renderPapers();
}));
bindMulti(inputStack, 'inputs');
bindMulti(taskStack, 'task');
bindMulti(settingStack, 'setting');
[...yearStack.querySelectorAll('button')].forEach((button) => button.addEventListener('click', () => {
  activeYear = button.textContent.trim();
  [...yearStack.querySelectorAll('button')].forEach((item) => item.classList.toggle('active', item === button));
  visibleLimit = 15;
  renderPapers();
}));
[search, sortSelect, publicationSelect, readSelect, citationMin, citationMax].forEach((control) => control.addEventListener('input', () => { visibleLimit = 15; renderPapers(); }));
if (loadMore) loadMore.addEventListener('click', () => { visibleLimit += 15; renderPapers(); });
document.querySelectorAll('.read-toggle').forEach((button) => button.addEventListener('click', () => {
  const card = button.closest('.paper-row');
  const paperId = card?.dataset.paperId;
  if (!paperId) return;
  if (readPaperIds.has(paperId)) readPaperIds.delete(paperId);
  else readPaperIds.add(paperId);
  persistReadPaperIds();
  void syncOnePaper(paperId, readPaperIds.has(paperId), paperNotes[paperId] || '');
  syncReadMarkers();
  renderPapers();
}));
document.querySelectorAll('.paper-note-input').forEach((input) => input.addEventListener('input', () => {
  const card = input.closest('.paper-row');
  const paperId = card?.dataset.paperId;
  if (!paperId) return;
  if (input.value) paperNotes[paperId] = input.value;
  else delete paperNotes[paperId];
  persistPaperNotes();
  clearTimeout(noteSyncTimers[paperId]);
  noteSyncTimers[paperId] = setTimeout(() => {
    void syncOnePaper(paperId, readPaperIds.has(paperId), input.value);
  }, 500);
}));
if (syncAccountButton) syncAccountButton.addEventListener('click', async () => {
  if (!syncEnabled || !syncClient) return;
  if (syncUser && syncAccountButton.classList.contains('error')) {
    await mergeCloudState(syncUser);
    return;
  }
  if (syncUser) {
    await syncClient.auth.signOut();
    return;
  }
  await syncClient.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
});
document.querySelectorAll('.interests button').forEach((button) => button.addEventListener('click', () => {
  const dimension = button.dataset.dimension;
  const value = button.dataset.filter;
  if (!dimension || !value) return;
  if (dimension === 'domain') {
    const wasActive = selected.domain.has(value);
    selected.domain.clear();
    if (!wasActive) selected.domain.add(value);
  } else {
    if (selected[dimension].has(value)) selected[dimension].delete(value);
    else selected[dimension].add(value);
  }
  const stack = dimension === 'domain' ? domainStack : dimension === 'task' ? taskStack : settingStack;
  [...stack.querySelectorAll('button')].forEach((item) => item.classList.toggle('active', selected[dimension].has(item.textContent.trim())));
  visibleLimit = 15;
  renderPapers();
  document.querySelector('#papers').scrollIntoView({behavior:'smooth'});
}));
window.addEventListener('storage', (event) => {
  if (event.key === READ_STORAGE_KEY) {
    readPaperIds = loadReadPaperIds();
    syncReadMarkers();
    renderPapers();
  }
  if (event.key === NOTE_STORAGE_KEY) {
    paperNotes = loadPaperNotes();
    syncNoteFields();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && syncClient && syncUser) void mergeCloudState(syncUser);
});
syncReadMarkers();
syncNoteFields();
renderPapers();
void initSync();
