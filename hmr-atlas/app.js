const stacks = [...document.querySelectorAll('.filter-stack')];
const [domainStack, taskStack, settingStack, yearStack] = stacks;
const cards = [...document.querySelectorAll('.paper-row')];
const search = document.querySelector('.paper-search input');
const resultCount = document.querySelector('.library-head > span');
const resultTitle = document.querySelector('.library-head h2');
const loadMore = document.querySelector('.load-more');
const selected = { domain: new Set(), task: new Set(), setting: new Set() };
let activeYear = '全部年份';
let visibleLimit = 15;
cards.forEach((card) => card.classList.remove('hidden-by-page'));

function values(card, key) {
  return (card.dataset[key] || '').split('|').filter(Boolean);
}

function renderPapers() {
  const needle = (search.value || '').trim().toLowerCase();
  let matched = 0;
  cards.forEach((card) => {
    const domainMatch = [...selected.domain].every((value) => card.dataset.domain === value);
    const taskValues = values(card, 'tasks');
    const settingValues = values(card, 'settings');
    const taskMatch = [...selected.task].every((value) => taskValues.includes(value));
    const settingMatch = [...selected.setting].every((value) => settingValues.includes(value));
    const yearMatch = activeYear === '全部年份' || card.dataset.year === activeYear;
    const textMatch = !needle || card.textContent.toLowerCase().includes(needle);
    const matches = domainMatch && taskMatch && settingMatch && yearMatch && textMatch;
    const shouldShow = matches && matched < visibleLimit;
    card.hidden = !shouldShow;
    card.style.setProperty('display', shouldShow ? 'grid' : 'none', 'important');
    if (matches) matched += 1;
  });
  const labels = [...selected.domain, ...selected.task, ...selected.setting];
  resultTitle.textContent = labels.length ? labels.join(' × ') : '全部论文';
  resultCount.textContent = matched + ' 篇结果';
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

bindMulti(domainStack, 'domain');
bindMulti(taskStack, 'task');
bindMulti(settingStack, 'setting');
[...yearStack.querySelectorAll('button')].forEach((button) => button.addEventListener('click', () => {
  activeYear = button.textContent.trim();
  [...yearStack.querySelectorAll('button')].forEach((item) => item.classList.toggle('active', item === button));
  visibleLimit = 15;
  renderPapers();
}));
search.addEventListener('input', () => { visibleLimit = 15; renderPapers(); });
if (loadMore) loadMore.addEventListener('click', () => { visibleLimit += 15; renderPapers(); });
document.querySelectorAll('.interests button').forEach((button) => button.addEventListener('click', () => {
  const dimension = button.dataset.dimension;
  const value = button.dataset.filter;
  if (!dimension || !value) return;
  selected[dimension].has(value) ? selected[dimension].delete(value) : selected[dimension].add(value);
  const stack = dimension === 'domain' ? domainStack : dimension === 'task' ? taskStack : settingStack;
  [...stack.querySelectorAll('button')].forEach((item) => item.classList.toggle('active', selected[dimension].has(item.textContent.trim())));
  visibleLimit = 15;
  renderPapers();
  document.querySelector('#papers').scrollIntoView({behavior:'smooth'});
}));
renderPapers();
