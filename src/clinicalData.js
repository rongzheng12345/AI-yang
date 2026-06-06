const PAGE_KIND_LABELS = {
  clinic_note: "门诊病历",
  lab_report: "检验报告",
  metabolic_report: "代谢报告",
  genetic_report: "基因报告",
  imaging: "影像报告",
  ecg: "心电图",
  bone_density: "骨密度",
  vision: "视力报告",
  prescription: "处方与处置",
};

const SEVERITY_RANK = {
  high: 0,
  medium: 1,
  low: 2,
};

export function classifyPages(pages = []) {
  const groups = new Map();

  for (const page of pages) {
    if (!groups.has(page.kind)) {
      groups.set(page.kind, {
        kind: page.kind,
        label: PAGE_KIND_LABELS[page.kind] ?? page.kind,
        count: 0,
        pages: [],
        sources: [],
      });
    }

    const group = groups.get(page.kind);
    group.count += 1;
    group.pages.push(page.page);
    if (page.source && !group.sources.includes(page.source)) {
      group.sources.push(page.source);
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    pages: group.pages.sort((a, b) => a - b),
  }));
}

export function buildTimeline(events = []) {
  return [...events].sort((a, b) => a.date.localeCompare(b.date));
}

export function getMetricTrend(clinicalCase, metricKey) {
  const points = (clinicalCase.metrics ?? [])
    .filter((metric) => metric.key === metricKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  const latest = points.at(-1) ?? null;

  return {
    key: metricKey,
    label: latest?.label ?? metricKey,
    unit: latest?.unit ?? "",
    latest,
    points,
  };
}

export function buildDecisionSignals(clinicalCase) {
  return (clinicalCase.reviewRules ?? [])
    .filter((rule) => rule.status === "open")
    .sort((a, b) => {
      const rankA = SEVERITY_RANK[a.severity] ?? 99;
      const rankB = SEVERITY_RANK[b.severity] ?? 99;
      return rankA - rankB || a.label.localeCompare(b.label, "zh-Hans-CN");
    });
}

export function getAvailableMetrics(clinicalCase) {
  const metrics = new Map();

  for (const metric of clinicalCase.metrics ?? []) {
    if (!metrics.has(metric.key)) {
      metrics.set(metric.key, {
        key: metric.key,
        label: metric.label,
        unit: metric.unit,
      });
    }
  }

  return [...metrics.values()];
}

export function getCaseById(cases, id) {
  return cases.find((clinicalCase) => clinicalCase.id === id) ?? cases[0] ?? null;
}

export function buildIntakePipelineSummary(clinicalCase) {
  const pages = clinicalCase.pages ?? [];
  const documentTypes = classifyPages(pages);
  const metricsCount = clinicalCase.metrics?.length ?? 0;
  const eventsCount = clinicalCase.events?.length ?? 0;
  const openSignals = buildDecisionSignals(clinicalCase);
  const missingChecks = buildExpertReplaySummary(clinicalCase).missingChecks ?? [];
  const lowConfidencePages = pages.filter((page) => Number(page.confidence ?? 1) < 0.85);

  return {
    totalPages: pages.length,
    documentTypes,
    lowConfidencePages,
    extracted: {
      metrics: metricsCount,
      events: eventsCount,
      treatments: clinicalCase.treatments?.length ?? 0,
      diagnoses: clinicalCase.diagnosis?.length ?? 0,
    },
    stages: [
      {
        name: "扫描病历自动入库",
        status: pages.length ? "ready" : "pending",
        value: `${pages.length}页`,
        detail: pages.length ? "PDF/扫描页已进入病例证据库，可继续OCR和结构化。" : "等待上传PDF或扫描件。",
      },
      {
        name: "OCR与证据页面分类",
        status: documentTypes.length ? "ready" : "pending",
        value: `${documentTypes.length}类`,
        detail: documentTypes.length
          ? documentTypes.map((group) => `${group.label}${group.count}页`).join("、")
          : "等待识别门诊病历、检验、代谢、影像等页面。",
      },
      {
        name: "时间轴和指标趋势结构化",
        status: metricsCount || eventsCount ? "ready" : "pending",
        value: `${eventsCount}事件 / ${metricsCount}指标`,
        detail: `已形成${eventsCount}个病程节点、${metricsCount}条指标记录，用于趋势和复盘。`,
      },
      {
        name: "医生确认入库",
        status: openSignals.length || missingChecks.length || lowConfidencePages.length ? "review" : "ready",
        value: `${openSignals.length}项待审核`,
        detail: buildDoctorConfirmationDetail(openSignals.length, missingChecks.length, lowConfidencePages.length),
      },
    ],
  };
}

export function buildCohortSummary(cases = []) {
  const diseaseGroups = new Map();
  const genotypeGroups = new Map();
  const metricGroups = new Map();
  const treatmentGroups = new Map();
  let openHighRiskCases = 0;

  for (const clinicalCase of cases) {
    incrementGroup(diseaseGroups, clinicalCase.diseaseFamily || "未分组", clinicalCase.id);
    if (clinicalCase.genotype) {
      incrementGroup(genotypeGroups, clinicalCase.genotype, clinicalCase.id);
    }

    const seenMetrics = new Set();
    for (const metric of clinicalCase.metrics ?? []) {
      const key = metric.key ?? metric.label;
      if (!metricGroups.has(key)) {
        metricGroups.set(key, {
          key,
          label: metric.label ?? key,
          caseIds: new Set(),
          abnormalCaseIds: new Set(),
          readingCount: 0,
          abnormalReadings: 0,
        });
      }

      const group = metricGroups.get(key);
      group.readingCount += 1;
      if (!seenMetrics.has(key)) {
        group.caseIds.add(clinicalCase.id);
        seenMetrics.add(key);
      }
      if (metric.flag && metric.flag !== "normal") {
        group.abnormalReadings += 1;
        group.abnormalCaseIds.add(clinicalCase.id);
      }
    }

    const seenTreatments = new Set();
    for (const treatment of clinicalCase.treatments ?? []) {
      const name = treatment.name;
      if (!name || seenTreatments.has(name)) continue;
      incrementGroup(treatmentGroups, name, clinicalCase.id);
      seenTreatments.add(name);
    }

    if (buildDecisionSignals(clinicalCase).some((signal) => signal.severity === "high")) {
      openHighRiskCases += 1;
    }
  }

  return {
    totalCases: cases.length,
    diseaseGroups: mapCountGroups(diseaseGroups),
    genotypeGroups: mapCountGroups(genotypeGroups),
    metricGroups: [...metricGroups.values()]
      .map((group) => ({
        key: group.key,
        label: group.label,
        caseCount: group.caseIds.size,
        abnormalCaseCount: group.abnormalCaseIds.size,
        readingCount: group.readingCount,
        abnormalReadings: group.abnormalReadings,
      }))
      .sort((a, b) => b.caseCount - a.caseCount || a.label.localeCompare(b.label, "zh-Hans-CN")),
    treatmentGroups: mapCountGroups(treatmentGroups).map((group) => ({
      ...group,
      caseCount: group.count,
    })),
    openHighRiskCases,
    rwdUseCases: [
      {
        name: "疗效分析",
        detail: "按治疗方案、基因型和关键指标趋势比较真实世界控制效果。",
      },
      {
        name: "误诊路径分析",
        detail: "按首发症状、确诊前检查和转诊节点复盘延误环节。",
      },
      {
        name: "长期结局分析",
        detail: "连接发育、癫痫、骨健康、心电风险和代谢指标变化。",
      },
    ],
  };
}

export function filterCohortCases(cases = [], filters = {}) {
  const disease = normalizeFilter(filters.disease);
  const genotype = normalizeFilter(filters.genotype);
  const metric = normalizeFilter(filters.metric);
  const treatment = normalizeFilter(filters.treatment);
  const age = normalizeFilter(filters.age);

  return cases.filter((clinicalCase) => {
    if (disease && !caseDiseaseHaystack(clinicalCase).includes(disease)) return false;
    if (genotype && !normalizeFilter(clinicalCase.genotype).includes(genotype)) return false;
    if (age && !normalizeFilter(clinicalCase.age).includes(age)) return false;
    if (metric && !caseHasMetric(clinicalCase, metric)) return false;
    if (treatment && !caseHasTreatment(clinicalCase, treatment)) return false;
    return true;
  });
}

export function findSimilarCases(cases = [], targetCaseId, limit = 5) {
  const target = getCaseById(cases, targetCaseId);
  if (!target) return [];

  return cases
    .filter((clinicalCase) => clinicalCase.id !== target.id)
    .map((clinicalCase) => buildSimilarityResult(target, clinicalCase))
    .sort((a, b) => b.similarity - a.similarity || a.displayName.localeCompare(b.displayName, "zh-Hans-CN"))
    .slice(0, limit);
}

export function buildCohortAnalysis(cases = []) {
  const summary = buildCohortSummary(cases);
  const abnormalMetrics = summary.metricGroups
    .filter((group) => group.abnormalReadings)
    .slice(0, 4)
    .map((group) => `${group.label}${group.abnormalReadings}条异常`)
    .join("、") || "暂无异常指标";
  const treatmentNames = summary.treatmentGroups
    .slice(0, 4)
    .map((group) => group.label)
    .join("、") || "暂无治疗方案";
  const symptomSignals = collectExpertSignals(cases, "keySymptoms").slice(0, 4).join("、") || "暂无首发表现";
  const firstEvents = cases
    .flatMap((clinicalCase) => buildTimeline(clinicalCase.events).slice(0, 2).map((event) => event.title))
    .filter(Boolean)
    .slice(0, 4)
    .join("、") || "暂无早期事件";

  return {
    cohortStats: {
      totalCases: summary.totalCases,
      diseaseTypes: summary.diseaseGroups.length,
      genotypeTypes: summary.genotypeGroups.length,
      openHighRiskCases: summary.openHighRiskCases,
    },
    effectiveness: [
      {
        title: "疗效分析视图",
        detail: `围绕${abnormalMetrics}，按${treatmentNames}和基因型分层观察治疗后指标趋势。`,
      },
      {
        title: "治疗反应分层",
        detail: "对比干预前后关键指标、复诊间隔、异常读数和待审核风险变化。",
      },
    ],
    misdiagnosisPath: [
      {
        title: "误诊路径视图",
        detail: `从${symptomSignals}等首发线索回看确诊前节点：${firstEvents}。`,
      },
      {
        title: "延误环节复盘",
        detail: "标记首诊表现、关键检查缺失、基因/代谢确认时间和转诊节点。",
      },
    ],
  };
}

export function buildQuestionContext(clinicalCase) {
  const diagnosis = (clinicalCase.diagnosis ?? []).join("；");
  const latestMetrics = getAvailableMetrics(clinicalCase)
    .map((metric) => getMetricTrend(clinicalCase, metric.key).latest)
    .filter(Boolean)
    .map((metric) => `${metric.label}: ${metric.value} ${metric.unit}`.trim())
    .join("；");
  const risks = buildDecisionSignals(clinicalCase)
    .map((signal) => `${signal.label}（${signal.severity}）`)
    .join("；");
  const treatments = (clinicalCase.treatments ?? [])
    .map((treatment) => `${treatment.name}: ${treatment.dose}`)
    .join("；");
  const replay = buildExpertReplaySummary(clinicalCase);
  const familyCare = buildFamilyCarePlan(clinicalCase);
  const intake = buildIntakePipelineSummary(clinicalCase);

  return [
    `病例: ${clinicalCase.displayName ?? clinicalCase.code}`,
    `诊断: ${diagnosis}`,
    `基因型: ${clinicalCase.genotype ?? "未记录"}`,
    `摘要: ${clinicalCase.summary ?? ""}`,
    `入库: ${intake.totalPages}页，${intake.documentTypes.length}类证据页`,
    `最新指标: ${latestMetrics}`,
    `待审核风险: ${risks}`,
    `治疗与营养: ${treatments}`,
    `专家复盘: ${replay.text}`,
    `家属管理: ${familyCare.text}`,
    "边界: 仅供医生审核的临床决策支持，不替代诊断或处方。",
  ].join("\n");
}

export function buildExpertReplaySummary(clinicalCase) {
  const replay = clinicalCase.expertReplay ?? {};
  const keySymptoms = replay.keySymptoms ?? [];
  const requiredChecks = replay.requiredChecks ?? [];
  const metricResponseRules = replay.metricResponseRules ?? [];
  const riskTriggers = replay.riskTriggers ?? [];
  const dispositionDraft = replay.dispositionDraft ?? [];
  const followUpPlan = replay.followUpPlan ?? [];
  const missingChecks = requiredChecks.filter((check) => check.status === "missing");

  const text = [
    formatReplaySection("关键症状", keySymptoms.map((item) => `${item.label}: ${item.reason}`)),
    formatReplaySection("必须补充/复核检查", requiredChecks.map((item) => `${item.name}: ${item.reason}（${checkStatusLabel(item.status)}）`)),
    formatReplaySection("指标升高处理思路", metricResponseRules.map((item) => `${item.metric} ${item.trigger}: ${item.response}`)),
    formatReplaySection("风险触发提醒", riskTriggers.map((item) => `${item.risk}: ${item.trigger} -> ${item.response}`)),
    formatReplaySection("处置意见草稿", dispositionDraft),
    formatReplaySection("复诊计划草稿", followUpPlan),
  ].filter(Boolean).join("\n");

  return {
    ...replay,
    missingChecks,
    text,
  };
}

export function buildLocalAnswer(clinicalCase, question) {
  const normalizedQuestion = String(question ?? "").toLowerCase();
  const metrics = getAvailableMetrics(clinicalCase);
  const matchedMetric = metrics.find((metric) => {
    const label = metric.label.toLowerCase();
    return normalizedQuestion.includes(label) || normalizedQuestion.includes(metric.key.toLowerCase());
  });

  if (matchedMetric) {
    const trend = getMetricTrend(clinicalCase, matchedMetric.key);
    const latest = trend.latest;
    const previous = trend.points.length > 1 ? trend.points.at(-2) : null;
    const comparison = previous
      ? `；上一次为 ${previous.value} ${previous.unit}（${previous.date}）`
      : "";
    return {
      mode: "local",
      text: `${trend.label} 最新值为 ${latest.value} ${latest.unit}（${latest.date}，${latest.context ?? "样本记录"}）${comparison}。请结合病程、治疗依从性和医生审核意见判断。`,
    };
  }

  if (/入库|扫描|ocr|页面|结构化|时间轴|趋势/.test(normalizedQuestion)) {
    const intake = buildIntakePipelineSummary(clinicalCase);
    const stages = intake.stages
      .map((stage, index) => `${index + 1}. ${stage.name}: ${stage.value}，${stage.detail}`)
      .join("\n");
    return {
      mode: "local",
      text: `当前病例入库流水线：\n${stages}\n这些内容用于医生确认后的结构化入库。`,
    };
  }

  if (/科研|队列|真实世界|rwd|疗效|误诊|筛选|结局/.test(normalizedQuestion)) {
    const abnormalMetrics = (clinicalCase.metrics ?? []).filter((metric) => metric.flag && metric.flag !== "normal");
    const treatments = (clinicalCase.treatments ?? []).map((item) => item.name).join("、") || "暂无治疗记录";
    return {
      mode: "local",
      text: `本病例可进入科研队列的维度包括：疾病=${clinicalCase.diseaseFamily ?? "未分组"}；基因型=${clinicalCase.genotype ?? "未记录"}；异常指标=${abnormalMetrics.map((metric) => metric.label).join("、") || "暂无"}；治疗=${treatments}。\n可用于真实世界疗效分析、误诊路径分析和长期结局分析，入组与分析口径需医生和伦理/数据治理流程确认。`,
    };
  }

  if (/相似|类似|以前|既往|怎么处理|处理方式/.test(normalizedQuestion)) {
    return {
      mode: "local",
      text: "相似病例入口会按诊断、基因型、异常指标、治疗方案和专家复盘要点计算相似度，并展示既往处理方式。请在页面的“相似病例”入口查看结构化结果。",
    };
  }

  if (/家属|诊后|通俗|禁忌|推荐|复查提醒|用药提醒|危险信号|检验单|上传|呕吐|嗜睡/.test(normalizedQuestion)) {
    const familyCare = buildFamilyCarePlan(clinicalCase);
    return {
      mode: "local",
      text: `诊后家属管理草稿：\n${familyCare.text}\n以上内容需医生确认后再提供给家属。`,
    };
  }

  if (/风险|异常|预警|注意|审核|问题/.test(normalizedQuestion)) {
    const signals = buildDecisionSignals(clinicalCase);
    const signalText = signals.length
      ? signals.map((signal, index) => `${index + 1}. ${signal.label}`).join("\n")
      : "当前结构化数据中没有开放的审核风险。";
    return {
      mode: "local",
      text: `需要医生审核的重点包括：\n${signalText}\n以上为病例数据整理结果，不能替代临床判断。`,
    };
  }

  if (/用药|治疗|营养|饮食|处方/.test(normalizedQuestion)) {
    const treatments = (clinicalCase.treatments ?? [])
      .map((treatment, index) => `${index + 1}. ${treatment.name}: ${treatment.dose}，${treatment.route}。${treatment.note}`)
      .join("\n");
    return {
      mode: "local",
      text: `结构化治疗与营养记录：\n${treatments || "暂无治疗记录"}\n请由医生确认剂量、适应证和禁忌。`,
    };
  }

  if (/专家|杨教授|复盘|关键症状|必须补|缺失检查|复诊计划|处置意见|怎么处理/.test(normalizedQuestion)) {
    const replay = buildExpertReplaySummary(clinicalCase);
    const missing = replay.missingChecks.length
      ? `\n当前优先补充/复核：${replay.missingChecks.map((check) => check.name).join("、")}。`
      : "\n当前结构化复盘中没有标记为缺失的检查。";
    return {
      mode: "local",
      text: `专家决策复盘草稿：\n${replay.text}${missing}\n以上为杨教授专家思路的结构化复盘草稿，必须由医生审核后使用。`,
    };
  }

  return {
    mode: "local",
    text: `我已基于当前病例整理出上下文。该病例诊断为 ${(clinicalCase.diagnosis ?? []).join("、")}。你可以继续问“最新 Hcy/Phe/C3 是多少”“有哪些风险”“治疗和营养方案是什么”。所有回答都需要医生审核。`,
  };
}

export function buildFamilyCarePlan(clinicalCase) {
  const care = clinicalCase.familyCare ?? {};
  const diet = care.diet ?? {};
  const text = [
    `通俗说明:\n${care.plainExplanation ?? "暂无通俗说明草稿。"}`,
    formatReplaySection("饮食推荐", diet.recommended ?? []),
    formatReplaySection("饮食禁忌", diet.avoid ?? []),
    formatReplaySection("需要谨慎", diet.caution ?? []),
    formatReplaySection("用药提醒", care.medicationReminders ?? []),
    formatReplaySection("复查提醒", care.followUpReminders ?? []),
    formatReplaySection("危险信号", care.dangerSignals ?? []),
    formatReplaySection("家属上传检验单流程", (care.uploadWorkflow ?? []).map((item) => `${item.step}（${familyOwnerLabel(item.owner)}）`)),
  ].filter(Boolean).join("\n");

  return {
    ...care,
    requiresDoctorApproval: true,
    text,
  };
}

function formatReplaySection(title, items) {
  if (!items.length) return "";
  return `${title}:\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`;
}

function checkStatusLabel(status) {
  return {
    done: "已见资料",
    missing: "需补充",
    review: "需复核",
  }[status] ?? status;
}

function familyOwnerLabel(owner) {
  return {
    family: "家属",
    system: "系统",
    doctor: "医生",
  }[owner] ?? owner;
}

function buildDoctorConfirmationDetail(openSignalCount, missingCheckCount, lowConfidencePageCount) {
  const items = [];
  if (openSignalCount) items.push(`${openSignalCount}项待医生审核`);
  if (missingCheckCount) items.push(`${missingCheckCount}项检查需补充`);
  if (lowConfidencePageCount) items.push(`${lowConfidencePageCount}页识别置信度偏低`);
  return items.length ? items.join("、") : "结构化结果可进入医生确认队列。";
}

function incrementGroup(groups, label, caseId) {
  if (!groups.has(label)) {
    groups.set(label, { label, caseIds: new Set() });
  }
  groups.get(label).caseIds.add(caseId);
}

function mapCountGroups(groups) {
  return [...groups.values()]
    .map((group) => ({
      label: group.label,
      count: group.caseIds.size,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-Hans-CN"));
}

function normalizeFilter(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "all" ? "" : normalized;
}

function caseDiseaseHaystack(clinicalCase) {
  return normalizeFilter([
    clinicalCase.code,
    clinicalCase.displayName,
    clinicalCase.diseaseFamily,
    ...(clinicalCase.diagnosis ?? []),
    ...(clinicalCase.researchTags ?? []),
  ].join(" "));
}

function caseHasMetric(clinicalCase, needle) {
  return (clinicalCase.metrics ?? []).some((metric) => normalizeFilter([
    metric.key,
    metric.label,
    metric.flag,
    metric.context,
  ].join(" ")).includes(needle));
}

function caseHasTreatment(clinicalCase, needle) {
  return (clinicalCase.treatments ?? []).some((treatment) => normalizeFilter([
    treatment.name,
    treatment.dose,
    treatment.route,
    treatment.note,
  ].join(" ")).includes(needle));
}

function buildSimilarityResult(target, candidate) {
  const reasons = [];
  let score = 0;

  if (target.diseaseFamily && target.diseaseFamily === candidate.diseaseFamily) {
    score += 18;
    reasons.push(`同属${candidate.diseaseFamily}`);
  }

  const sharedDiagnosis = intersectText(target.diagnosis, candidate.diagnosis);
  if (sharedDiagnosis.length) {
    score += Math.min(26, sharedDiagnosis.length * 13);
    reasons.push(`共同诊断：${sharedDiagnosis.join("、")}`);
  }

  const sharedGenes = intersectTokens(parseGenotypeTokens(target.genotype), parseGenotypeTokens(candidate.genotype));
  if (sharedGenes.length) {
    score += Math.min(18, sharedGenes.length * 9);
    reasons.push(`基因线索相近：${sharedGenes.join("、")}`);
  }

  const sharedMetrics = intersectText(
    (target.metrics ?? []).filter((metric) => metric.flag !== "normal").map((metric) => metric.label),
    (candidate.metrics ?? []).filter((metric) => metric.flag !== "normal").map((metric) => metric.label),
  );
  if (sharedMetrics.length) {
    score += Math.min(22, sharedMetrics.length * 11);
    reasons.push(`共同异常指标：${sharedMetrics.join("、")}`);
  }

  const sharedTreatments = intersectText(
    (target.treatments ?? []).map((treatment) => treatment.name),
    (candidate.treatments ?? []).map((treatment) => treatment.name),
  );
  if (sharedTreatments.length) {
    score += Math.min(16, sharedTreatments.length * 8);
    reasons.push(`治疗方案相似：${sharedTreatments.join("、")}`);
  }

  const sharedRisks = intersectText(
    buildDecisionSignals(target).map((signal) => signal.label),
    buildDecisionSignals(candidate).map((signal) => signal.label),
  );
  if (sharedRisks.length) {
    score += Math.min(10, sharedRisks.length * 5);
    reasons.push(`风险提醒相近：${sharedRisks.join("、")}`);
  }

  const replay = buildExpertReplaySummary(candidate);
  const priorManagement = [
    ...(candidate.treatments ?? []).map((treatment) => `${treatment.name}: ${treatment.dose}`),
    ...(replay.followUpPlan ?? []).slice(0, 2),
  ].filter(Boolean);

  return {
    caseId: candidate.id,
    code: candidate.code,
    displayName: candidate.displayName,
    diseaseFamily: candidate.diseaseFamily,
    genotype: candidate.genotype,
    similarity: Math.min(100, score),
    reasons: reasons.length ? reasons : ["当前队列中可作为低相似度对照病例"],
    priorManagement,
    expertDispositionSummary: (replay.dispositionDraft ?? []).join("；") || candidate.aiDraft?.assessment || "暂无处置摘要",
  };
}

function intersectText(a = [], b = []) {
  const normalizedB = new Map(b.map((item) => [normalizeFilter(item), item]));
  const result = [];
  for (const item of a) {
    const key = normalizeFilter(item);
    if (key && normalizedB.has(key) && !result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

function parseGenotypeTokens(genotype = "") {
  return String(genotype)
    .split(/[\s/；;，,]+/)
    .map((token) => token.trim())
    .filter((token) => /^[a-z0-9_.>+-]+$/i.test(token) && token.length > 2);
}

function intersectTokens(a = [], b = []) {
  const bSet = new Set(b.map(normalizeFilter));
  return a.filter((token, index) => bSet.has(normalizeFilter(token)) && a.indexOf(token) === index);
}

function collectExpertSignals(cases, field) {
  const seen = new Set();
  const result = [];
  for (const clinicalCase of cases) {
    for (const item of clinicalCase.expertReplay?.[field] ?? []) {
      const label = item.label ?? item.name ?? item.risk;
      const key = normalizeFilter(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(label);
    }
  }
  return result;
}
