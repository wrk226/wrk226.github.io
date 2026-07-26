import { applyResearchFilter, canonicalPaperId, createLatestSelection, researchCapabilityFlags, researchRequestIds, runLatestSelection, unavailableResearchState } from "./static-research-model.js";
import { createStaticResearchProvider } from "./static-research-provider.js";

const root = document.querySelector('[data-research-root="true"]');
const cards = [...document.querySelectorAll(".paper-row")];
const sidebar = document.querySelector(".library-sidebar");
const paperList = document.querySelector(".paper-list");

if (root && sidebar && paperList && cards.length > 0) {
  const provider = createStaticResearchProvider();
  const papers = cards.map((card) => {
    const href = card.querySelector("h3 a")?.href || "";
    return { card, id: card.dataset.paperId || "", href, canonicalId: canonicalPaperId({ id: card.dataset.paperId, href }) };
  });
  let available = false;
  let summaries = {};
  let filter = "all";
  let flags = researchCapabilityFlags([]);
  const selection = createLatestSelection();

  const group = document.createElement("div");
  group.className = "sidebar-group research-filters";
  group.hidden = true;
  const label = document.createElement("span");
  label.textContent = "研究状态";
  const select = document.createElement("select");
  select.className = "filter-select";
  select.setAttribute("aria-label", "研究状态");
  [
    ["all", "全部论文"], ["matched", "Paper Bank 已收录"], ["pdf", "有本地 PDF"],
    ["private", "有“我的理解”"], ["discussion", "有讨论结论"], ["experiments", "有实验记录"],
    ["atlas-only", "仅 Atlas 未收录"],
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  });
  group.append(label, select);
  sidebar.append(group);

  const drawer = document.createElement("div");
  drawer.className = "paper-bank-overlay";
  drawer.hidden = true;
  const panel = document.createElement("aside");
  panel.className = "paper-bank-drawer";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  drawer.append(panel);
  document.body.append(drawer);

  const markUnavailable = () => {
    const next = unavailableResearchState({ available, filter, summaries });
    available = next.available;
    filter = next.filter;
    summaries = next.summaries;
    flags = researchCapabilityFlags([]);
    queryGeneration += 1;
    lastQueryKey = "";
    closeDrawer();
    select.value = "all";
    group.hidden = true;
    document.querySelectorAll(".paper-bank-status").forEach((element) => element.remove());
    window.HMR_ATLAS_RESEARCH_MATCHES = () => true;
    document.dispatchEvent(new Event("hmr-atlas:research-filter"));
  };

  const closeDrawer = () => {
    selection.cancel();
    drawer.hidden = true;
    panel.replaceChildren();
  };
  drawer.addEventListener("mousedown", (event) => {
    if (event.target === drawer) closeDrawer();
  });

  const handleDetailFailure = () => markUnavailable();
  const handleCapabilityFailure = () => markUnavailable();

  const showDetail = async (canonicalId) => {
    if (!flags.detail) return;
    drawer.hidden = false;
    panel.textContent = "正在读取本机 Paper Bank…";
    await runLatestSelection(selection, canonicalId, () => provider.detail(canonicalId), {
      resolved: (detail) => {
        panel.replaceChildren();
        const close = document.createElement("button");
        close.className = "paper-bank-close";
        close.type = "button";
        close.textContent = "×";
        close.setAttribute("aria-label", "关闭 Paper Bank 详情");
        close.addEventListener("click", closeDrawer);
        const heading = document.createElement("h2");
        heading.textContent = detail.title;
        const tldr = document.createElement("p");
        tldr.textContent = detail.tldr;
        const open = document.createElement("button");
        open.className = "paper-bank-open";
        open.type = "button";
        open.textContent = "在 Obsidian 中打开";
        open.hidden = !flags.open;
        open.addEventListener("click", async () => {
          open.disabled = true;
          try {
            if (!(await provider.openPaper(canonicalId))) throw new Error("not opened");
          } catch {
            open.textContent = "当前无法打开";
          } finally {
            open.disabled = false;
          }
        });
        panel.append(close, heading, tldr, open);
      },
      rejected: handleDetailFailure,
      settled: () => {},
    });
  };

  const decorate = () => {
    papers.forEach(({ card, canonicalId }) => {
      const summary = canonicalId ? summaries[canonicalId] : null;
      if (summary?.status !== "matched" || card.querySelector(".paper-bank-status")) return;
      const button = document.createElement("button");
      button.className = "paper-bank-status";
      button.type = "button";
      button.disabled = !flags.detail;
      const strong = document.createElement("b");
      strong.textContent = "Paper Bank 已收录";
      const flags = [summary.hasPdf && "PDF", summary.hasPrivateUnderstanding && "我的理解", summary.hasDiscussion && "讨论", summary.hasExperiments && "实验"].filter(Boolean);
      button.append(strong);
      if (flags.length) {
        const text = document.createElement("span");
        text.textContent = flags.join(" · ");
        button.append(text);
      }
      button.addEventListener("click", () => void showDetail(canonicalId));
      card.querySelector(".paper-tags")?.before(button);
    });
  };

  const syncFilter = () => {
    const allowed = new Set(applyResearchFilter(papers, summaries, filter, available).map((paper) => paper.card));
    window.HMR_ATLAS_RESEARCH_MATCHES = (card) => allowed.has(card);
    document.dispatchEvent(new Event("hmr-atlas:research-filter"));
  };
  select.addEventListener("change", () => {
    filter = select.value;
    lastQueryKey = "";
    void queryVisiblePapers().catch(handleCapabilityFailure);
  });

  let lastVisibleIds = papers.filter(({ card }) => !card.hidden).map(({ id }) => id);
  let lastQueryKey = "";
  let queryGeneration = 0;
  let queryQueue = Promise.resolve();
  const queryVisiblePapers = () => {
    if (!flags.status) return Promise.resolve();
    const visibleSet = new Set(lastVisibleIds);
    const candidates = filter === "all" ? papers.filter(({ id }) => visibleSet.has(id)) : papers;
    const ids = researchRequestIds(candidates.map((paper) => paper.canonicalId), filter, candidates.length);
    const queryKey = `${filter}\n${ids.join("\n")}`;
    if (queryKey === lastQueryKey) return queryQueue;
    const generation = ++queryGeneration;
    lastQueryKey = queryKey;
    queryQueue = queryQueue.then(async () => {
      if (generation !== queryGeneration || !flags.status) return;
      const next = await provider.batchGet(ids);
      if (generation !== queryGeneration || !flags.status) return;
      summaries = { ...summaries, ...next };
      decorate();
      syncFilter();
    }).catch((error) => {
      if (generation === queryGeneration && flags.status) handleCapabilityFailure(error);
    });
    return queryQueue;
  };

  document.addEventListener("hmr-atlas:papers-rendered", (event) => {
    lastVisibleIds = Array.isArray(event.detail?.visibleIds) ? event.detail.visibleIds : [];
    void queryVisiblePapers().catch(handleCapabilityFailure);
  });

  window.HMR_ATLAS_RESEARCH_MATCHES = () => true;
  void provider.request("capabilities", {}).then(async (capabilities) => {
    flags = researchCapabilityFlags(capabilities.capabilities);
    if (!flags.status) return;
    available = flags.status;
    group.hidden = !flags.filters;
    if (lastVisibleIds.length > 0) await queryVisiblePapers();
  }).catch(handleCapabilityFailure);
}
