import {
  buildCohortAnalysis,
  buildCohortSummary,
  buildDecisionSignals,
  buildExpertReplaySummary,
  buildFamilyCarePlan,
  buildLocalAnswer,
  buildTimeline,
  classifyPages,
  filterCohortCases,
  findSimilarCases,
  getAvailableMetrics,
  getCaseById,
  getMetricTrend,
} from "./clinicalData.js";

const state = {
  cases: [],
  selectedCaseId: null,
  activeEntry: "assistant",
  activeMetricKey: null,
  reviewed: new Set(),
  uploadQueue: [],
  familyUploads: new Map(),
  chatMessages: new Map(),
  chatPending: false,
  cohortFilters: {
    disease: "all",
    genotype: "all",
    age: "all",
    metric: "all",
    treatment: "all",
  },
  search: "",
};

const el = {
  caseSearch: document.querySelector("#caseSearch"),
  caseList: document.querySelector("#caseList"),
  queueCount: document.querySelector("#queueCount"),
  pdfUpload: document.querySelector("#pdfUpload"),
  uploadQueue: document.querySelector("#uploadQueue"),
  caseCode: document.querySelector("#caseCode"),
  caseTitle: document.querySelector("#caseTitle"),
  headerBadges: document.querySelector("#headerBadges"),
  stats: document.querySelector("#stats"),
  entryNav: document.querySelector("#entryNav"),
  assistantView: document.querySelector("#assistantView"),
  similarView: document.querySelector("#similarView"),
  cohortView: document.querySelector("#cohortView"),
  visitDate: document.querySelector("#visitDate"),
  caseProfile: document.querySelector("#caseProfile"),
  aiDraft: document.querySelector("#aiDraft"),
  expertReplayStatus: document.querySelector("#expertReplayStatus"),
  expertReplay: document.querySelector("#expertReplay"),
  familyCareStatus: document.querySelector("#familyCareStatus"),
  familyCare: document.querySelector("#familyCare"),
  familyUpload: document.querySelector("#familyUpload"),
  familyUploadList: document.querySelector("#familyUploadList"),
  chatMode: document.querySelector("#chatMode"),
  chatSuggestions: document.querySelector("#chatSuggestions"),
  chatMessages: document.querySelector("#chatMessages"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  chatSubmit: document.querySelector("#chatSubmit"),
  abnormalMetrics: document.querySelector("#abnormalMetrics"),
  missingChecks: document.querySelector("#missingChecks"),
  nextStepDraft: document.querySelector("#nextStepDraft"),
  metricTabs: document.querySelector("#metricTabs"),
  metricChart: document.querySelector("#metricChart"),
  eventCount: document.querySelector("#eventCount"),
  timeline: document.querySelector("#timeline"),
  openSignalCount: document.querySelector("#openSignalCount"),
  reviewRules: document.querySelector("#reviewRules"),
  pageCount: document.querySelector("#pageCount"),
  pageGroups: document.querySelector("#pageGroups"),
  treatmentCount: document.querySelector("#treatmentCount"),
  treatments: document.querySelector("#treatments"),
  similarStatus: document.querySelector("#similarStatus"),
  similarCases: document.querySelector("#similarCases"),
  cohortStatus: document.querySelector("#cohortStatus"),
  cohortFilters: document.querySelector("#cohortFilters"),
  cohortSummary: document.querySelector("#cohortSummary"),
  cohortResults: document.querySelector("#cohortResults"),
  cohortInsights: document.querySelector("#cohortInsights"),
  cohortEffectiveness: document.querySelector("#cohortEffectiveness"),
  cohortMisdiagnosis: document.querySelector("#cohortMisdiagnosis"),
  researchTags: document.querySelector("#researchTags"),
};

async function init() {
  const response = await fetch("./data/cases.json");
  state.cases = await response.json();
  state.selectedCaseId = state.cases[0]?.id ?? null;
  state.activeMetricKey = getAvailableMetrics(state.cases[0] ?? {})[0]?.key ?? null;

  bindEvents();
  render();
}

function bindEvents() {
  el.caseSearch.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderCaseList();
  });

  el.pdfUpload.addEventListener("change", (event) => {
    const files = [...event.target.files];
    for (const file of files) {
      state.uploadQueue.unshift({
        id: `${file.name}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        status: "待 OCR",
      });
    }
    event.target.value = "";
    renderUploadQueue();
  });

  el.stats.addEventListener("click", (event) => {
    const button = event.target.closest("[data-drill]");
    if (!button) return;
    handleStatDrill(button.dataset.drill);
  });

  el.entryNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-entry]");
    if (!button) return;
    state.activeEntry = button.dataset.entry;
    renderEntryNav();
  });

  el.familyUpload.addEventListener("change", (event) => {
    const clinicalCase = getSelectedCase();
    if (!clinicalCase) return;
    const uploads = getFamilyUploads(clinicalCase.id);
    const files = [...event.target.files];
    for (const file of files) {
      uploads.unshift({
        id: `${file.name}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        status: "已整理，待医生确认",
      });
    }
    event.target.value = "";
    renderFamilyCare(clinicalCase);
  });

  el.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendChatMessage();
  });
}

function render() {
  const clinicalCase = getSelectedCase();
  if (!clinicalCase) return;

  const metrics = getAvailableMetrics(clinicalCase);
  if (!state.activeMetricKey || !metrics.some((metric) => metric.key === state.activeMetricKey)) {
    state.activeMetricKey = metrics[0]?.key ?? null;
  }

  renderCaseList();
  renderUploadQueue();
  renderHeader(clinicalCase);
  renderStats(clinicalCase);
  renderEntryNav();
  renderProfile(clinicalCase);
  renderAiDraft(clinicalCase);
  renderExpertReplay(clinicalCase);
  renderFamilyCare(clinicalCase);
  renderChat(clinicalCase);
  renderAbnormalMetrics(clinicalCase);
  renderMissingChecks(clinicalCase);
  renderNextStepDraft(clinicalCase);
  renderMetricTabs(clinicalCase);
  renderMetricChart(clinicalCase);
  renderTimeline(clinicalCase);
  renderReviewRules(clinicalCase);
  renderPageGroups(clinicalCase);
  renderTreatments(clinicalCase);
  renderSimilarCases(clinicalCase);
  renderCohort();
  renderTags(clinicalCase);
}

function getSelectedCase() {
  return getCaseById(state.cases, state.selectedCaseId);
}

function renderCaseList() {
  const filteredCases = state.cases.filter((clinicalCase) => {
    const haystack = [
      clinicalCase.code,
      clinicalCase.displayName,
      clinicalCase.diseaseFamily,
      clinicalCase.genotype,
      ...(clinicalCase.diagnosis ?? []),
      ...(clinicalCase.researchTags ?? []),
    ].join(" ").toLowerCase();
    return haystack.includes(state.search);
  });

  el.caseList.innerHTML = filteredCases.map((clinicalCase) => `
    <button class="case-button ${clinicalCase.id === state.selectedCaseId ? "is-active" : ""}" data-case-id="${clinicalCase.id}">
      <strong>${escapeHtml(clinicalCase.code)} · ${escapeHtml(clinicalCase.displayName)}</strong>
      <span>${escapeHtml(clinicalCase.diseaseFamily)} · ${escapeHtml(clinicalCase.visitDate)}</span>
    </button>
  `).join("");

  for (const button of el.caseList.querySelectorAll(".case-button")) {
    button.addEventListener("click", () => {
      state.selectedCaseId = button.dataset.caseId;
      state.activeMetricKey = null;
      render();
    });
  }
}

function renderUploadQueue() {
  el.queueCount.textContent = String(state.uploadQueue.length);

  if (!state.uploadQueue.length) {
    el.uploadQueue.innerHTML = `<p class="empty">暂无</p>`;
    return;
  }

  el.uploadQueue.innerHTML = state.uploadQueue.map((item) => `
    <div class="queue-item">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.status)} · ${formatFileSize(item.size)}</span>
    </div>
  `).join("");
}

function renderHeader(clinicalCase) {
  el.caseCode.textContent = `${clinicalCase.code} · ${clinicalCase.department}`;
  el.caseTitle.textContent = clinicalCase.displayName;
  const highSignals = buildDecisionSignals(clinicalCase).filter((signal) => signal.severity === "high").length;
  el.headerBadges.innerHTML = [
    `<span class="badge">${escapeHtml(clinicalCase.sex)} · ${escapeHtml(clinicalCase.age)}</span>`,
    `<span class="badge">${escapeHtml(clinicalCase.visitDate)}</span>`,
    `<span class="badge ${highSignals ? "is-high" : ""}">高优先级 ${highSignals}</span>`,
  ].join("");
}

function renderStats(clinicalCase) {
  const pages = clinicalCase.pages?.length ?? 0;
  const highMetrics = (clinicalCase.metrics ?? []).filter((metric) => metric.flag !== "normal").length;
  const signals = buildDecisionSignals(clinicalCase).length;
  const events = clinicalCase.events?.length ?? 0;

  el.stats.innerHTML = [
    stat("证据页", pages, "pages"),
    stat("异常指标", highMetrics, "abnormal"),
    stat("待审核", signals, "review"),
    stat("病程事件", events, "timeline"),
  ].join("");
}

function handleStatDrill(drillTarget) {
  const targetMap = {
    pages: el.pageGroups,
    abnormal: el.abnormalMetrics,
    review: el.reviewRules,
    timeline: el.timeline,
  };
  const target = targetMap[drillTarget];
  if (!target) return;

  state.activeEntry = "assistant";
  renderEntryNav();

  const section = target.closest(".clinical-section") ?? target;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  section.classList.remove("is-focused");
  window.requestAnimationFrame(() => {
    section.classList.add("is-focused");
  });
  window.setTimeout(() => {
    section.classList.remove("is-focused");
  }, 1800);
}

function renderEntryNav() {
  for (const button of el.entryNav.querySelectorAll("[data-entry]")) {
    button.classList.toggle("is-active", button.dataset.entry === state.activeEntry);
  }

  const views = {
    assistant: el.assistantView,
    similar: el.similarView,
    cohort: el.cohortView,
  };

  for (const [entry, view] of Object.entries(views)) {
    view.classList.toggle("is-active", entry === state.activeEntry);
  }
}

function renderProfile(clinicalCase) {
  el.visitDate.textContent = clinicalCase.visitDate;
  el.caseProfile.innerHTML = [
    field("诊断", clinicalCase.diagnosis.join("；")),
    field("基因型", clinicalCase.genotype),
    field("主诉", clinicalCase.chiefComplaint),
    field("专病方向", clinicalCase.diseaseFamily),
    field("摘要", clinicalCase.summary, true),
  ].join("");
}

function renderAiDraft(clinicalCase) {
  el.aiDraft.innerHTML = `
    <p>${escapeHtml(clinicalCase.aiDraft.assessment)}</p>
    <ul>
      ${clinicalCase.aiDraft.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
    </ul>
    <div class="guardrail">${escapeHtml(clinicalCase.aiDraft.guardrail)}</div>
  `;
}

function renderExpertReplay(clinicalCase) {
  const replay = buildExpertReplaySummary(clinicalCase);
  const missingCount = replay.missingChecks.length;
  el.expertReplayStatus.textContent = missingCount ? `需补 ${missingCount}项` : "结构化草稿";

  el.expertReplay.innerHTML = [
    replayBlock("关键症状", replay.keySymptoms, (item) => `${escapeHtml(item.label)}<small>${escapeHtml(item.reason)}</small>`),
    replayBlock("必须补充/复核检查", replay.requiredChecks, (item) => `${escapeHtml(item.name)}<small>${escapeHtml(item.reason)} · ${escapeHtml(checkStatusLabel(item.status))}</small>`),
    replayBlock("指标升高处理", replay.metricResponseRules, (item) => `${escapeHtml(item.metric)} ${escapeHtml(item.trigger)}<small>${escapeHtml(item.response)}</small>`),
    replayBlock("风险触发提醒", replay.riskTriggers, (item) => `${escapeHtml(item.risk)}<small>${escapeHtml(item.trigger)} - ${escapeHtml(item.response)}</small>`),
    replayBlock("处置意见草稿", replay.dispositionDraft, (item) => escapeHtml(item)),
    replayBlock("复诊计划草稿", replay.followUpPlan, (item) => escapeHtml(item)),
  ].join("");
}

function renderFamilyCare(clinicalCase) {
  const plan = buildFamilyCarePlan(clinicalCase);
  const dangerCount = plan.dangerSignals?.length ?? 0;
  el.familyCareStatus.textContent = `${dangerCount}个危险信号`;

  el.familyCare.innerHTML = [
    familyBlock("通俗版病情说明", [plan.plainExplanation ?? "暂无"], "plain"),
    familyBlock("饮食推荐", plan.diet?.recommended ?? [], "recommended"),
    familyBlock("饮食禁忌", plan.diet?.avoid ?? [], "avoid"),
    familyBlock("需要谨慎", plan.diet?.caution ?? [], "caution"),
    familyBlock("用药提醒", plan.medicationReminders ?? [], "meds"),
    familyBlock("复查提醒", plan.followUpReminders ?? [], "follow"),
    familyBlock("危险信号", plan.dangerSignals ?? [], "danger"),
    familyWorkflowBlock(plan.uploadWorkflow ?? []),
  ].join("");

  renderFamilyUploadList(clinicalCase);
}

function renderFamilyUploadList(clinicalCase) {
  const uploads = getFamilyUploads(clinicalCase.id);
  if (!uploads.length) {
    el.familyUploadList.innerHTML = `<p class="empty">暂无家属上传</p>`;
    return;
  }

  el.familyUploadList.innerHTML = uploads.map((upload) => `
    <div class="family-upload-item">
      <strong>${escapeHtml(upload.name)}</strong>
      <span>${escapeHtml(upload.status)} · ${formatFileSize(upload.size)}</span>
    </div>
  `).join("");
}

function renderChat(clinicalCase) {
  const messages = getChatMessages(clinicalCase.id);
  el.chatMode.textContent = state.chatPending ? "生成中" : "医生审核";
  el.chatSubmit.disabled = state.chatPending;
  el.chatInput.disabled = state.chatPending;

  el.chatSuggestions.innerHTML = getSuggestedQuestions(clinicalCase)
    .map((question) => `<button type="button" class="suggestion-button" data-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`)
    .join("");

  for (const button of el.chatSuggestions.querySelectorAll(".suggestion-button")) {
    button.addEventListener("click", async () => {
      el.chatInput.value = button.dataset.question;
      await sendChatMessage();
    });
  }

  if (!messages.length) {
    el.chatMessages.innerHTML = `
      <div class="chat-empty">
        <strong>暂无问答记录</strong>
        <p>回答基于当前病例上下文，需医生审核。</p>
      </div>
    `;
    return;
  }

  el.chatMessages.innerHTML = messages.map((message) => `
    <div class="chat-message ${message.role}">
      <span>${message.role === "user" ? "医生" : message.mode === "ai" ? "AI" : "本地"}</span>
      <p>${formatChatText(message.text)}</p>
      ${message.note ? `<small>${escapeHtml(message.note)}</small>` : ""}
    </div>
  `).join("");
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

async function sendChatMessage() {
  const clinicalCase = getSelectedCase();
  const question = el.chatInput.value.trim();
  if (!clinicalCase || !question || state.chatPending) return;

  const messages = getChatMessages(clinicalCase.id);
  messages.push({ role: "user", text: question });
  el.chatInput.value = "";
  state.chatPending = true;
  renderChat(clinicalCase);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: clinicalCase.id, question }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "chat failed");
    messages.push({
      role: "assistant",
      mode: body.mode,
      text: body.answer,
      note: body.note,
    });
  } catch (error) {
    const local = buildLocalAnswer(clinicalCase, question);
    messages.push({
      role: "assistant",
      mode: "local",
      text: local.text,
      note: "接口不可用，已使用浏览器本地病例上下文回答。",
    });
  } finally {
    state.chatPending = false;
    renderChat(clinicalCase);
  }
}

function getChatMessages(caseId) {
  if (!state.chatMessages.has(caseId)) {
    state.chatMessages.set(caseId, []);
  }
  return state.chatMessages.get(caseId);
}

function getFamilyUploads(caseId) {
  if (!state.familyUploads.has(caseId)) {
    state.familyUploads.set(caseId, []);
  }
  return state.familyUploads.get(caseId);
}

function getSuggestedQuestions(clinicalCase) {
  const metrics = getAvailableMetrics(clinicalCase).slice(0, 3).map((metric) => `${metric.label} 最新是多少？`);
  return [
    "杨教授会怎么看这个病例？",
    "这个病例有哪些异常指标？",
    "哪些检查必须补？",
    "家属要注意哪些危险信号？",
    "这个病例适合进入哪个科研队列？",
    "以前有没有类似患者？",
    ...metrics,
    "下一步复查重点是什么？",
  ].slice(0, 6);
}

function renderMetricTabs(clinicalCase) {
  const metrics = getAvailableMetrics(clinicalCase);
  el.metricTabs.innerHTML = metrics.map((metric) => `
    <button class="metric-tab ${metric.key === state.activeMetricKey ? "is-active" : ""}" data-metric-key="${metric.key}" role="tab">
      ${escapeHtml(metric.label)}
    </button>
  `).join("");

  for (const button of el.metricTabs.querySelectorAll(".metric-tab")) {
    button.addEventListener("click", () => {
      state.activeMetricKey = button.dataset.metricKey;
      renderMetricTabs(clinicalCase);
      renderMetricChart(clinicalCase);
    });
  }
}

function renderMetricChart(clinicalCase) {
  const trend = getMetricTrend(clinicalCase, state.activeMetricKey);
  if (!trend.latest) {
    el.metricChart.innerHTML = `<p class="empty">暂无指标</p>`;
    return;
  }

  const svg = buildChartSvg(trend.points);
  el.metricChart.innerHTML = `
    <div class="chart-wrap">
      <div class="chart-meta">
        <span><strong>${escapeHtml(trend.label)}</strong></span>
        <span>最新 ${trend.latest.value} ${escapeHtml(trend.unit)}</span>
        <span>${escapeHtml(trend.latest.date)}</span>
        <span>${escapeHtml(trend.latest.context ?? "")}</span>
      </div>
      ${svg}
    </div>
  `;
}

function renderTimeline(clinicalCase) {
  const timeline = buildTimeline(clinicalCase.events);
  el.eventCount.textContent = `${timeline.length}项`;
  el.timeline.innerHTML = timeline.map((event) => `
    <li>
      <time>${escapeHtml(event.date)}</time>
      <div>
        <strong>${escapeHtml(event.title)}</strong>
        <p>${escapeHtml(event.body)}</p>
      </div>
    </li>
  `).join("");
}

function renderAbnormalMetrics(clinicalCase) {
  const abnormal = (clinicalCase.metrics ?? []).filter((metric) => metric.flag && metric.flag !== "normal");
  if (!abnormal.length) {
    el.abnormalMetrics.innerHTML = `<p class="empty">当前结构化指标未标记异常</p>`;
    return;
  }

  el.abnormalMetrics.innerHTML = abnormal.slice(-8).reverse().map((metric) => `
    <div class="signal-row">
      <strong>${escapeHtml(metric.label)} ${escapeHtml(metric.value)} ${escapeHtml(metric.unit ?? "")}</strong>
      <p>${escapeHtml(metric.date)} · ${escapeHtml(metric.context ?? "样本记录")} · ${escapeHtml(metric.reference ?? "参考范围待确认")}</p>
    </div>
  `).join("");
}

function renderMissingChecks(clinicalCase) {
  const replay = buildExpertReplaySummary(clinicalCase);
  const checks = replay.requiredChecks ?? [];
  const missing = checks.filter((check) => check.status === "missing" || check.status === "review");

  if (!missing.length) {
    el.missingChecks.innerHTML = `<p class="empty">当前专家复盘未标记缺失检查</p>`;
    return;
  }

  el.missingChecks.innerHTML = missing.map((check) => `
    <div class="signal-row">
      <strong>${escapeHtml(check.name)}</strong>
      <p>${escapeHtml(check.reason)} · ${escapeHtml(checkStatusLabel(check.status))}</p>
    </div>
  `).join("");
}

function renderNextStepDraft(clinicalCase) {
  const replay = buildExpertReplaySummary(clinicalCase);
  const steps = [
    ...(clinicalCase.aiDraft?.nextSteps ?? []),
    ...(replay.dispositionDraft ?? []),
    ...(replay.followUpPlan ?? []),
  ].slice(0, 8);

  el.nextStepDraft.innerHTML = steps.length
    ? `<ol>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><div class="guardrail">${escapeHtml(clinicalCase.aiDraft?.guardrail ?? "必须医生确认后使用。")}</div>`
    : `<p class="empty">暂无下一步建议草稿</p>`;
}

function renderReviewRules(clinicalCase) {
  const signals = buildDecisionSignals(clinicalCase);
  el.openSignalCount.textContent = `${signals.length}项`;

  el.reviewRules.innerHTML = signals.map((signal) => {
    const checked = state.reviewed.has(`${clinicalCase.id}:${signal.id}`);
    return `
      <label class="review-item">
        <input type="checkbox" data-review-id="${signal.id}" ${checked ? "checked" : ""} />
        <span>
          <strong>${escapeHtml(signal.label)}</strong>
          <p><span class="severity ${signal.severity}">${severityLabel(signal.severity)}</span></p>
        </span>
      </label>
    `;
  }).join("");

  for (const checkbox of el.reviewRules.querySelectorAll("input")) {
    checkbox.addEventListener("change", () => {
      const key = `${clinicalCase.id}:${checkbox.dataset.reviewId}`;
      if (checkbox.checked) state.reviewed.add(key);
      else state.reviewed.delete(key);
    });
  }
}

function renderPageGroups(clinicalCase) {
  const groups = classifyPages(clinicalCase.pages);
  el.pageCount.textContent = `${clinicalCase.pages.length}页`;
  el.pageGroups.innerHTML = groups.map((group) => `
    <div class="page-group">
      <strong>${escapeHtml(group.label)} · ${group.count}页</strong>
      <div class="page-range">
        ${group.pages.map((page) => `<span class="page-pill">P${page}</span>`).join("")}
      </div>
      <p>${group.sources.map(escapeHtml).join(" / ")}</p>
    </div>
  `).join("");
}

function renderTreatments(clinicalCase) {
  el.treatmentCount.textContent = `${clinicalCase.treatments.length}项`;
  el.treatments.innerHTML = clinicalCase.treatments.map((treatment) => `
    <div class="treatment-item">
      <strong>${escapeHtml(treatment.name)}</strong>
      <p>${escapeHtml(treatment.dose)} · ${escapeHtml(treatment.route)}</p>
      <p>${escapeHtml(treatment.note)}</p>
    </div>
  `).join("");
}

function renderSimilarCases(clinicalCase) {
  const matches = findSimilarCases(state.cases, clinicalCase.id, 6);
  el.similarStatus.textContent = `${matches.length}例`;

  if (!matches.length) {
    el.similarCases.innerHTML = `<p class="empty">当前队列中暂无可对照病例</p>`;
    return;
  }

  el.similarCases.innerHTML = matches.map((match) => `
    <article class="similar-card">
      <div class="similar-score">
        <strong>${match.similarity}%</strong>
        <span>相似度</span>
      </div>
      <div class="similar-body">
        <div class="similar-title">
          <h4>${escapeHtml(match.code)} · ${escapeHtml(match.displayName)}</h4>
          <span>${escapeHtml(match.diseaseFamily ?? "未分组")}</span>
        </div>
        <div class="similar-grid">
          <div>
            <h5>相似原因</h5>
            <ul>${match.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
          </div>
          <div>
            <h5>既往处理方式</h5>
            <ul>${match.priorManagement.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        </div>
        <div class="expert-summary">
          <strong>杨教授处置摘要</strong>
          <p>${escapeHtml(match.expertDispositionSummary)}</p>
        </div>
      </div>
    </article>
  `).join("");
}

function renderCohort() {
  const filteredCases = filterCohortCases(state.cases, state.cohortFilters);
  const summary = buildCohortSummary(state.cases);
  const filteredSummary = buildCohortSummary(filteredCases);
  const analysis = buildCohortAnalysis(filteredCases);
  const abnormalReadings = filteredSummary.metricGroups.reduce((total, group) => total + group.abnormalReadings, 0);

  el.cohortStatus.textContent = `${filteredCases.length}/${summary.totalCases}例`;
  el.cohortFilters.innerHTML = [
    cohortSelect("disease", "疾病", summary.diseaseGroups.map((group) => ({ value: group.label, label: group.label }))),
    cohortSelect("genotype", "基因型", summary.genotypeGroups.map((group) => ({ value: group.label, label: group.label }))),
    cohortSelect("age", "年龄", getAgeOptions(state.cases)),
    cohortSelect("metric", "指标", summary.metricGroups.map((group) => ({ value: group.key, label: group.label }))),
    cohortSelect("treatment", "治疗", summary.treatmentGroups.map((group) => ({ value: group.label, label: group.label }))),
  ].join("");

  for (const select of el.cohortFilters.querySelectorAll("select")) {
    select.addEventListener("change", () => {
      state.cohortFilters[select.dataset.filter] = select.value;
      renderCohort();
    });
  }

  el.cohortSummary.innerHTML = [
    cohortStat("入组病例", filteredCases.length),
    cohortStat("高风险病例", filteredSummary.openHighRiskCases),
    cohortStat("异常读数", abnormalReadings),
    cohortStat("治疗维度", filteredSummary.treatmentGroups.length),
  ].join("");

  if (!filteredCases.length) {
    el.cohortResults.innerHTML = `<p class="empty">当前筛选无病例</p>`;
  } else {
    el.cohortResults.innerHTML = filteredCases.map((clinicalCase) => `
      <button class="cohort-case ${clinicalCase.id === state.selectedCaseId ? "is-active" : ""}" data-case-id="${clinicalCase.id}">
        <strong>${escapeHtml(clinicalCase.code)} · ${escapeHtml(clinicalCase.displayName)}</strong>
        <span>${escapeHtml(clinicalCase.diseaseFamily)}</span>
        <small>${escapeHtml(clinicalCase.genotype ?? "基因型未记录")}</small>
      </button>
    `).join("");
  }

  for (const button of el.cohortResults.querySelectorAll(".cohort-case")) {
    button.addEventListener("click", () => {
      state.selectedCaseId = button.dataset.caseId;
      state.activeMetricKey = null;
      render();
    });
  }

  el.cohortInsights.innerHTML = summary.rwdUseCases.map((item) => `
    <div class="rwd-item">
      <strong>${escapeHtml(item.name)}</strong>
      <p>${escapeHtml(item.detail)}</p>
    </div>
  `).join("");

  el.cohortEffectiveness.innerHTML = analysis.effectiveness.map((item) => analysisBlock(item)).join("");
  el.cohortMisdiagnosis.innerHTML = analysis.misdiagnosisPath.map((item) => analysisBlock(item)).join("");
}

function renderTags(clinicalCase) {
  el.researchTags.innerHTML = clinicalCase.researchTags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");
}

function stat(label, value, drillTarget) {
  return `
    <button class="stat" type="button" data-drill="${escapeHtml(drillTarget)}" title="查看${escapeHtml(label)}详情">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </button>
  `;
}

function field(label, value, wide = false) {
  return `
    <div class="field ${wide ? "is-wide" : ""}">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(value)}</p>
    </div>
  `;
}

function replayBlock(title, items = [], renderItem) {
  if (!items.length) return "";
  return `
    <div class="replay-block">
      <h4>${escapeHtml(title)}</h4>
      <ol>
        ${items.map((item) => `<li>${renderItem(item)}</li>`).join("")}
      </ol>
    </div>
  `;
}

function familyBlock(title, items = [], tone = "") {
  if (!items.length) return "";
  return `
    <div class="family-block ${tone}">
      <h4>${escapeHtml(title)}</h4>
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function familyWorkflowBlock(workflow = []) {
  if (!workflow.length) return "";
  return `
    <div class="family-block workflow">
      <h4>${escapeHtml("检验单上传流程")}</h4>
      <ol>
        ${workflow.map((item) => `<li><strong>${escapeHtml(ownerLabel(item.owner))}</strong>${escapeHtml(item.step)}</li>`).join("")}
      </ol>
    </div>
  `;
}

function cohortSelect(name, label, options) {
  const current = state.cohortFilters[name] ?? "all";
  const optionHtml = [
    `<option value="all">全部${escapeHtml(label)}</option>`,
    ...options.map((option) => `
      <option value="${escapeHtml(option.value)}" ${option.value === current ? "selected" : ""}>${escapeHtml(option.label)}</option>
    `),
  ].join("");

  return `
    <label class="cohort-filter">
      <span>${escapeHtml(label)}</span>
      <select data-filter="${escapeHtml(name)}">${optionHtml}</select>
    </label>
  `;
}

function cohortStat(label, value) {
  return `
    <div class="cohort-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function analysisBlock(item) {
  return `
    <div class="analysis-item">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.detail)}</p>
    </div>
  `;
}

function getAgeOptions(cases) {
  const ages = [...new Set(cases.map((clinicalCase) => clinicalCase.age).filter(Boolean))];
  return ages.map((age) => ({ value: age, label: age }));
}

function buildChartSvg(points) {
  const width = 760;
  const height = 230;
  const padding = 34;
  const values = points.map((point) => Number(point.value));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  const coordinates = points.map((point, index) => {
    const x = points.length === 1
      ? width / 2
      : padding + (index * (width - padding * 2)) / (points.length - 1);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { ...point, x, y };
  });

  const path = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const labels = coordinates.map((point) => `
    <g>
      <circle cx="${point.x}" cy="${point.y}" r="5" fill="${point.flag === "normal" ? "#2f7d4f" : "#be4b4b"}"></circle>
      <text x="${point.x}" y="${point.y - 12}" text-anchor="middle">${point.value}</text>
      <text x="${point.x}" y="${height - 8}" text-anchor="middle">${point.date.slice(5)}</text>
    </g>
  `).join("");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="指标趋势图">
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#d9dfd7"></line>
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#d9dfd7"></line>
      <polyline points="${path}" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${labels}
    </svg>
  `;
}

function severityLabel(severity) {
  return {
    high: "高优先级",
    medium: "中优先级",
    low: "低优先级",
  }[severity] ?? severity;
}

function checkStatusLabel(status) {
  return {
    done: "已见资料",
    missing: "需补充",
    review: "需复核",
  }[status] ?? status;
}

function ownerLabel(owner) {
  return {
    family: "家属",
    system: "系统",
    doctor: "医生",
  }[owner] ?? owner;
}

function formatFileSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatChatText(value) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

init();
