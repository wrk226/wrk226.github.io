const BARE_ARXIV_ID = /^(?:arxiv\s*:\s*)?(\d{4}\.\d{4,5})(?:v\d+)?$/i;
const ARXIV_URL = /^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?(?:[?#].*)?$/i;
const DOI_URL = /^https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/[a-z0-9._;()/:+-]+)$/i;
const OPENREVIEW_URL = /^https?:\/\/openreview\.net\/(?:forum|pdf)\?id=([A-Za-z0-9_-]+)(?:&.*)?$/i;

export function canonicalPaperId(paper) {
  const id = typeof paper?.id === "string" ? paper.id.trim() : "";
  const href = typeof paper?.href === "string" ? paper.href.trim() : "";
  const arxiv = id.match(BARE_ARXIV_ID)?.[1] || href.match(ARXIV_URL)?.[1];
  if (arxiv) return `arxiv:${arxiv}`;
  const doi = href.match(DOI_URL)?.[1];
  if (doi) return `doi:${decodeURIComponent(doi).toLowerCase()}`;
  const openreview = href.match(OPENREVIEW_URL)?.[1];
  if (openreview) return `openreview:${openreview}`;
  return null;
}

export function researchRequestIds(ids, filter, visibleCount) {
  const unique = [...new Set(ids.filter(Boolean))];
  return filter === "all" ? unique.slice(0, visibleCount) : unique;
}

export function researchCapabilityFlags(capabilities) {
  const values = new Set(capabilities);
  return {
    status: values.has("paper-status"),
    detail: values.has("paper-detail"),
    filters: values.has("research-filters"),
    open: values.has("open-resource"),
  };
}

export function createLatestSelection() {
  let generation = 0;
  return {
    begin(canonicalId) {
      const current = ++generation;
      return { canonicalId, isCurrent: () => generation === current };
    },
    cancel() {
      generation += 1;
    },
  };
}

export async function runLatestSelection(selection, canonicalId, operation, handlers) {
  const current = selection.begin(canonicalId);
  try {
    const value = await operation();
    if (current.isCurrent()) handlers.resolved(value);
  } catch (error) {
    if (current.isCurrent()) handlers.rejected(error);
  } finally {
    if (current.isCurrent()) handlers.settled();
  }
}

export function unavailableResearchState() {
  return { available: false, filter: "all", summaries: {} };
}

export function mergeResearchSummaries(current, summaries) {
  const next = { ...current };
  for (const summary of summaries) next[summary.canonicalId] = summary;
  return next;
}

export function applyResearchFilter(papers, summaries, filter, available) {
  if (!available || filter === "all") return papers;
  return papers.filter((paper) => {
    const canonicalId = paper.canonicalId ?? null;
    const summary = canonicalId ? summaries[canonicalId] : undefined;
    if (filter === "atlas-only") return canonicalId === null || summary?.status === "unmatched";
    if (!summary || summary.status !== "matched") return false;
    if (filter === "matched") return true;
    if (filter === "pdf") return summary.hasPdf;
    if (filter === "private") return summary.hasPrivateUnderstanding;
    if (filter === "discussion") return summary.hasDiscussion;
    if (filter === "experiments") return summary.hasExperiments;
    return true;
  });
}
