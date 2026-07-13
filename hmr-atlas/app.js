const stacks = [...document.querySelectorAll('.filter-stack')];
const [domainStack, inputStack, taskStack, settingStack, yearStack] = stacks;
const paperList = document.querySelector('.paper-list');
const emptyState = document.querySelector('.empty-state');
const cards = [...document.querySelectorAll('.paper-row')];
const search = document.querySelector('.paper-search input');
const resultCount = document.querySelector('.library-tools > span');
const resultTitle = document.querySelector('.library-head h2');
const sortSelect = document.querySelector('.library-tools select');
const publicationSelect = document.querySelector('.filter-select');
const [citationMin, citationMax] = [...document.querySelectorAll('.range-inputs input')];
const loadMore = document.querySelector('.load-more');
const selected = { domain: new Set(), inputs: new Set(), task: new Set(), setting: new Set() };
let activeYear = '全部年份';
let visibleLimit = 15;
cards.forEach((card) => card.classList.remove('hidden-by-page'));

function values(card, key) {
  return (card.dataset[key] || '').split('|').filter(Boolean);
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
    const textMatch = !needle || card.textContent.toLowerCase().includes(needle);
    return domainMatch && inputMatch && taskMatch && settingMatch && yearMatch && citationMatch && publicationMatch && textMatch;
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
    selected[dimension].has(value) ? selected[dimension].delete(value) : selected[dimension].add(value);
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
[search, sortSelect, publicationSelect, citationMin, citationMax].forEach((control) => control.addEventListener('input', () => { visibleLimit = 15; renderPapers(); }));
if (loadMore) loadMore.addEventListener('click', () => { visibleLimit += 15; renderPapers(); });
document.querySelectorAll('.interests button').forEach((button) => button.addEventListener('click', () => {
  const dimension = button.dataset.dimension;
  const value = button.dataset.filter;
  if (!dimension || !value) return;
  if (dimension === 'domain') {
    const wasActive = selected.domain.has(value);
    selected.domain.clear();
    if (!wasActive) selected.domain.add(value);
  } else {
    selected[dimension].has(value) ? selected[dimension].delete(value) : selected[dimension].add(value);
  }
  const stack = dimension === 'domain' ? domainStack : dimension === 'task' ? taskStack : settingStack;
  [...stack.querySelectorAll('button')].forEach((item) => item.classList.toggle('active', selected[dimension].has(item.textContent.trim())));
  visibleLimit = 15;
  renderPapers();
  document.querySelector('#papers').scrollIntoView({behavior:'smooth'});
}));
renderPapers();
