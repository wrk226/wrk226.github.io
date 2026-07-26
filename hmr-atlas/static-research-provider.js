export const RESEARCH_REQUEST_EVENT = "HMR_ATLAS_RESEARCH_PROBE_V1";
export const RESEARCH_RESULT_EVENT = "HMR_ATLAS_RESEARCH_PROBE_RESULT_V1";

const MATCHED_FIELDS = new Set(["canonicalId", "status", "title", "hasPdf", "hasPrivateUnderstanding", "hasDiscussion", "hasExperiments"]);
const UNMATCHED_FIELDS = new Set(["canonicalId", "status"]);
const DETAIL_FIELDS = new Set(["canonicalId", "citekey", "title", "tldr", "sectionHeadings", "hasPdf", "hasPrivateUnderstanding", "hasDiscussion", "openToken"]);
const CANONICAL_ID = /^(?:arxiv:\d{4}\.\d{4,5}|doi:10\.\d{4,9}\/[a-z0-9._;()/:+-]+|openreview:[A-Za-z0-9_-]+|citekey:[a-z0-9][a-z0-9._-]{0,127})$/;
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;

const failure = () => Object.assign(new Error("Research companion unavailable"), { code: "companion_unavailable" });
const plain = (value) => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, fields) => plain(value) && Object.keys(value).length === fields.size && Object.keys(value).every((key) => fields.has(key));
const versioned = (value, fields) => {
  const expected = new Set(["apiVersion", "schemaVersion", ...fields]);
  return exact(value, expected) && value.apiVersion === "1" && value.schemaVersion === "1";
};
const canonical = (value) => typeof value === "string" && CANONICAL_ID.test(value);

function validSummary(summary) {
  if (!plain(summary) || !canonical(summary.canonicalId)) return false;
  if (summary.status === "unmatched") return exact(summary, UNMATCHED_FIELDS);
  return summary.status === "matched" && exact(summary, MATCHED_FIELDS) && typeof summary.title === "string"
    && [summary.hasPdf, summary.hasPrivateUnderstanding, summary.hasDiscussion, summary.hasExperiments].every((value) => typeof value === "boolean");
}

function valid(method, value) {
  if (method === "capabilities") return versioned(value, ["capabilities"]) && Array.isArray(value.capabilities) && value.capabilities.every((item) => typeof item === "string");
  if (method === "papers:batchGet") return versioned(value, ["papers"]) && Array.isArray(value.papers) && value.papers.every(validSummary);
  if (method === "open") return versioned(value, ["opened"]) && typeof value.opened === "boolean";
  if (method !== "paper" || !versioned(value, ["paper"]) || !exact(value.paper, DETAIL_FIELDS)) return false;
  const paper = value.paper;
  return canonical(paper.canonicalId) && (paper.citekey === null || typeof paper.citekey === "string")
    && typeof paper.title === "string" && typeof paper.tldr === "string"
    && Array.isArray(paper.sectionHeadings) && paper.sectionHeadings.every((item) => typeof item === "string")
    && [paper.hasPdf, paper.hasPrivateUnderstanding, paper.hasDiscussion].every((item) => typeof item === "boolean")
    && (paper.openToken === null || (typeof paper.openToken === "string" && TOKEN.test(paper.openToken)));
}

export function createStaticResearchProvider({ target = document, timeoutMs = 1200 } = {}) {
  let cache = {};
  let sequence = 0;
  const request = (method, payload) => new Promise((resolve, reject) => {
    const requestId = `static-${Date.now()}-${++sequence}`;
    let complete = false;
    const finish = (callback, value) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      target.removeEventListener(RESEARCH_RESULT_EVENT, receive);
      callback(value);
    };
    const receive = (event) => {
      if (!plain(event.detail) || event.detail.requestId !== requestId) return;
      if (event.detail.ok !== true || !valid(method, event.detail.data)) return finish(reject, failure());
      finish(resolve, event.detail.data);
    };
    const timer = setTimeout(() => finish(reject, failure()), timeoutMs);
    target.addEventListener(RESEARCH_RESULT_EVENT, receive);
    target.dispatchEvent(new CustomEvent(RESEARCH_REQUEST_EVENT, { detail: {
      type: "hmr-atlas:research-request", version: 1, requestId, method, payload,
    } }));
  });
  const batchGet = async (ids) => {
    const missing = [...new Set(ids.filter((id) => canonical(id) && !(id in cache)))];
    for (let index = 0; index < missing.length; index += 100) {
      const chunk = missing.slice(index, index + 100);
      const response = await request("papers:batchGet", { ids: chunk });
      const returnedIds = response.papers.map((item) => item.canonicalId);
      const expectedIds = new Set(chunk);
      if (returnedIds.length !== expectedIds.size
        || new Set(returnedIds).size !== expectedIds.size
        || returnedIds.some((id) => !expectedIds.has(id))) throw failure();
      cache = { ...cache, ...Object.fromEntries(response.papers.map((item) => [item.canonicalId, item])) };
    }
    return Object.fromEntries(ids.filter((id) => id in cache).map((id) => [id, cache[id]]));
  };
  const detailResponse = async (canonicalId) => {
    if (!canonical(canonicalId)) throw failure();
    const paper = (await request("paper", { canonicalId })).paper;
    if (paper.canonicalId !== canonicalId) throw failure();
    return paper;
  };
  const detail = async (canonicalId) => {
    const safeDetail = { ...await detailResponse(canonicalId) };
    delete safeDetail.openToken;
    return safeDetail;
  };
  const openPaper = async (canonicalId) => {
    const paper = await detailResponse(canonicalId);
    if (!paper.openToken) return false;
    return (await request("open", { openToken: paper.openToken, resourceType: "paper-note" })).opened;
  };
  return { request, batchGet, detail, openPaper, cachedSummaries: () => ({ ...cache }) };
}
