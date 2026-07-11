const tierButtons = [...document.querySelectorAll('.filter-row button')];
const cards = [...document.querySelectorAll('.paper-card')];
const search = document.querySelector('.paper-search input');
const resultCount = document.querySelector('.result-count');
let activeTier = '全部';

function renderPapers() {
  const needle = (search.value || '').trim().toLowerCase();
  let visible = 0;
  cards.forEach((card) => {
    const matchTier = activeTier === '全部' || card.dataset.tier === activeTier;
    const matchText = !needle || card.textContent.toLowerCase().includes(needle);
    card.hidden = !(matchTier && matchText);
    if (!card.hidden) visible += 1;
  });
  resultCount.textContent = visible + ' / ' + cards.length;
}

tierButtons.forEach((button) => button.addEventListener('click', () => {
  activeTier = button.textContent.trim();
  tierButtons.forEach((item) => item.classList.toggle('active', item === button));
  renderPapers();
}));
search.addEventListener('input', renderPapers);

const ablations = {
  FULL: { output: 'P(uv) + Δxyz', note: '主候选：pointmap 提供坐标系锚，残差承担人体几何修正。' },
  'NO PM': { output: 'Δxyz', note: '检验位置编码是否已经足够定位，以及 pointmap 硬锚是否反而带来噪声。' },
  'NO Δ': { output: 'P(uv)', note: '检验网络是否只会在 pointmap 上取点；若失败，证明自由三维残差不可缺。' },
};
const ablationButtons = [...document.querySelectorAll('.ablation-tabs button')];
ablationButtons.forEach((button) => button.addEventListener('click', () => {
  const key = button.querySelector('span').textContent.trim();
  const config = ablations[key];
  ablationButtons.forEach((item) => item.classList.toggle('active', item === button));
  document.querySelector('.arch-output span').textContent = '3D OUTPUT · ' + key;
  document.querySelector('.arch-output b').textContent = config.output;
  document.querySelector('.arch-note').lastChild.textContent = config.note;
}));
renderPapers();
