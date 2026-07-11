const topicButtons = [...document.querySelectorAll('.filter-row:not(.year-row) button')];
const yearButtons = [...document.querySelectorAll('.year-row button')];
const cards = [...document.querySelectorAll('.paper-row')];
const search = document.querySelector('.paper-search input');
const resultCount = document.querySelector('.result-count');
let activeTopic = '全部';
let activeYear = '全部年份';

function renderPapers() {
  const needle = (search.value || '').trim().toLowerCase();
  let visible = 0;
  cards.forEach((card) => {
    const tags = card.dataset.tags.split('|');
    const matchTopic = activeTopic === '全部' || tags.includes(activeTopic);
    const matchYear = activeYear === '全部年份' || (activeYear === '经典' ? Number(card.dataset.year) <= 2023 : card.dataset.year === activeYear);
    const matchText = !needle || card.textContent.toLowerCase().includes(needle);
    card.hidden = !(matchTopic && matchYear && matchText);
    if (!card.hidden) visible += 1;
  });
  resultCount.textContent = '显示 ' + visible + ' / ' + cards.length;
}

topicButtons.forEach((button) => button.addEventListener('click', () => {
  activeTopic = button.textContent.trim();
  topicButtons.forEach((item) => item.classList.toggle('active', item === button));
  renderPapers();
}));
yearButtons.forEach((button) => button.addEventListener('click', () => {
  activeYear = button.textContent.trim();
  yearButtons.forEach((item) => item.classList.toggle('active', item === button));
  renderPapers();
}));
search.addEventListener('input', renderPapers);
document.querySelectorAll('.interest-grid button').forEach((button) => button.addEventListener('click', () => {
  activeTopic = button.dataset.filter;
  topicButtons.forEach((item) => item.classList.toggle('active', item.textContent.trim() === activeTopic));
  renderPapers();
  document.querySelector('#papers').scrollIntoView({behavior:'smooth'});
}));
renderPapers();
