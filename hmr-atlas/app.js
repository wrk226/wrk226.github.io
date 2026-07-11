const filterStacks = [...document.querySelectorAll('.filter-stack')];
const topicButtons = [...filterStacks[0].querySelectorAll('button')];
const yearButtons = [...filterStacks[1].querySelectorAll('button')];
const cards = [...document.querySelectorAll('.paper-row')];
const search = document.querySelector('.paper-search input');
const resultCount = document.querySelector('.library-head > span');
const loadMore = document.querySelector('.load-more');
let activeTopic = '全部';
let activeYear = '全部年份';
let visibleLimit = 15;
cards.forEach((card) => card.classList.remove('hidden-by-page'));

function renderPapers() {
  const needle = (search.value || '').trim().toLowerCase();
  let matched = 0;
  cards.forEach((card) => {
    const tags = card.dataset.tags.split('|');
    const matchTopic = activeTopic === '全部' || tags.includes(activeTopic);
    const matchYear = activeYear === '全部年份' || (activeYear === '经典' ? Number(card.dataset.year) <= 2023 : card.dataset.year === activeYear);
    const matchText = !needle || card.textContent.toLowerCase().includes(needle);
    const matches = matchTopic && matchYear && matchText;
    const shouldShow = matches && matched < visibleLimit;
    card.hidden = !shouldShow;
    card.style.setProperty('display', shouldShow ? 'grid' : 'none', 'important');
    if (matches) matched += 1;
  });
  resultCount.textContent = matched + ' 篇结果';
  if (loadMore) {
    loadMore.hidden = matched <= visibleLimit;
    loadMore.innerHTML = '继续显示 <span>' + Math.max(0, matched - visibleLimit) + '</span> 篇';
  }
}

topicButtons.forEach((button) => button.addEventListener('click', () => {
  activeTopic = button.textContent.trim();
  visibleLimit = 15;
  topicButtons.forEach((item) => item.classList.toggle('active', item === button));
  renderPapers();
}));
yearButtons.forEach((button) => button.addEventListener('click', () => {
  activeYear = button.textContent.trim();
  visibleLimit = 15;
  yearButtons.forEach((item) => item.classList.toggle('active', item === button));
  renderPapers();
}));
search.addEventListener('input', () => { visibleLimit = 15; renderPapers(); });
if (loadMore) loadMore.addEventListener('click', () => { visibleLimit += 15; renderPapers(); });
document.querySelectorAll('.interest-grid button').forEach((button) => button.addEventListener('click', () => {
  activeTopic = button.dataset.filter;
  visibleLimit = 15;
  topicButtons.forEach((item) => item.classList.toggle('active', item.textContent.trim() === activeTopic));
  renderPapers();
  document.querySelector('#papers').scrollIntoView({behavior:'smooth'});
}));
renderPapers();
