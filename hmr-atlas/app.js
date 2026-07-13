const READ_STORAGE_KEY = 'hmr-atlas:read-papers:v1';
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
const selected = { domain: new Set(), inputs: new Set(), task: new Set(), setting: new Set() };
let activeYear = '全部年份';
let visibleLimit = 15;
let readPaperIds = loadReadPaperIds();
cards.forEach((card) => card.classList.remove('hidden-by-page'));

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
  syncReadMarkers();
  renderPapers();
}));
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
  if (event.key !== READ_STORAGE_KEY) return;
  readPaperIds = loadReadPaperIds();
  syncReadMarkers();
  renderPapers();
});
syncReadMarkers();
renderPapers();
