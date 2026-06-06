import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCohortAnalysis,
  buildCohortSummary,
  buildDecisionSignals,
  buildExpertReplaySummary,
  buildFamilyCarePlan,
  buildIntakePipelineSummary,
  buildLocalAnswer,
  buildQuestionContext,
  buildTimeline,
  classifyPages,
  filterCohortCases,
  findSimilarCases,
  getMetricTrend,
} from "../src/clinicalData.js";

const sampleCase = {
  id: "case-demo",
  code: "MMA-001",
  displayName: "MMA 合并型随访病例",
  diseaseFamily: "有机酸血症/钴胺素代谢异常",
  age: "7岁7月",
  diagnosis: ["MMA合并型", "同型半胱氨酸血症"],
  genotype: "MMACHC c.80A>G / c.658_660delAAG",
  pages: [
    { page: 3, source: "门诊病历", kind: "clinic_note" },
    { page: 7, source: "血氨基酸酰基肉碱谱", kind: "metabolic_report" },
    { page: 35, source: "心电图", kind: "ecg" },
    { page: 36, source: "超声骨密度", kind: "bone_density" },
    { page: 9, source: "尿有机酸谱", kind: "metabolic_report" },
  ],
  metrics: [
    { key: "hcy", label: "Hcy", value: 24.9, unit: "umol/L", date: "2025-03-23", flag: "high" },
    { key: "hcy", label: "Hcy", value: 42.9, unit: "umol/L", date: "2026-04-12", flag: "high" },
    { key: "c3", label: "C3", value: 15.64, unit: "umol/L", date: "2026-04-12", flag: "high" },
  ],
  events: [
    { date: "2026-04-17", title: "复诊", kind: "visit" },
    { date: "2023-03-02", title: "丙酰肉碱升高", kind: "lab" },
    { date: "2025-03-23", title: "羟钴胺治疗后复查", kind: "treatment" },
  ],
  reviewRules: [
    { id: "hcy-high", label: "Hcy高于目标范围", severity: "high", status: "open" },
    { id: "ecg-risk", label: "QT间期延长需复核", severity: "medium", status: "open" },
    { id: "diet", label: "低蛋白饮食依从性", severity: "medium", status: "closed" },
  ],
  treatments: [
    { name: "羟钴胺", dose: "10mg", route: "肌肉注射", note: "代谢支持" },
    { name: "甜菜碱", dose: "每日3g", route: "口服", note: "Hcy 管理" },
  ],
  expertReplay: {
    keySymptoms: [
      { label: "发育迟缓", reason: "提示神经发育受累" },
      { label: "癫痫史", reason: "提示代谢失衡或神经系统风险" },
    ],
    requiredChecks: [
      { name: "Hcy", status: "done", reason: "评估合并型 MMA 控制情况" },
      { name: "尿有机酸", status: "missing", reason: "复核甲基丙二酸负荷" },
    ],
    metricResponseRules: [
      { metric: "Hcy", trigger: "升高", response: "复核羟钴胺、甜菜碱和依从性" },
    ],
    riskTriggers: [
      { risk: "癫痫", trigger: "既往发作或脑电异常", response: "维持神经系统随访" },
    ],
    dispositionDraft: ["复核代谢指标", "确认治疗依从性"],
    followUpPlan: ["3个月复查 Hcy 和尿有机酸"],
  },
  familyCare: {
    plainExplanation: "这是一个需要长期随访的遗传代谢病。",
    diet: {
      recommended: ["按医生方案安排蛋白摄入"],
      avoid: ["自行加量高蛋白食物"],
      caution: ["感染或食欲下降时及时联系医生"],
    },
    medicationReminders: ["羟钴胺按医嘱注射", "甜菜碱按医嘱服用"],
    followUpReminders: ["3个月复查 Hcy 和尿有机酸"],
    dangerSignals: ["呕吐", "嗜睡", "抽搐"],
    uploadWorkflow: [
      { step: "家属上传新检验单", owner: "family" },
      { step: "系统整理指标和异常", owner: "system" },
      { step: "医生确认后反馈", owner: "doctor" },
    ],
  },
};

test("classifyPages groups evidence pages by clinical document type", () => {
  const groups = classifyPages(sampleCase.pages);

  assert.deepEqual(groups.map((group) => group.kind), [
    "clinic_note",
    "metabolic_report",
    "ecg",
    "bone_density",
  ]);
  assert.equal(groups[1].count, 2);
  assert.deepEqual(groups[1].pages, [7, 9]);
});

test("buildTimeline returns events sorted from oldest to newest", () => {
  const timeline = buildTimeline(sampleCase.events);

  assert.deepEqual(timeline.map((event) => event.date), [
    "2023-03-02",
    "2025-03-23",
    "2026-04-17",
  ]);
});

test("getMetricTrend extracts one metric with latest value", () => {
  const trend = getMetricTrend(sampleCase, "hcy");

  assert.equal(trend.label, "Hcy");
  assert.equal(trend.unit, "umol/L");
  assert.equal(trend.latest.value, 42.9);
  assert.equal(trend.points.length, 2);
});

test("buildDecisionSignals prioritizes open high severity review rules", () => {
  const signals = buildDecisionSignals(sampleCase);

  assert.equal(signals[0].id, "hcy-high");
  assert.equal(signals[0].severity, "high");
  assert.equal(signals.some((signal) => signal.id === "diet"), false);
});

test("buildQuestionContext keeps a compact clinical grounding packet", () => {
  const context = buildQuestionContext(sampleCase);

  assert.match(context, /MMA合并型/);
  assert.match(context, /Hcy: 42.9 umol\/L/);
  assert.match(context, /Hcy高于目标范围/);
  assert.match(context, /羟钴胺/);
});

test("buildLocalAnswer answers metric questions from latest values", () => {
  const answer = buildLocalAnswer(sampleCase, "Hcy 最新是多少？");

  assert.equal(answer.mode, "local");
  assert.match(answer.text, /Hcy 最新值为 42.9 umol\/L/);
  assert.match(answer.text, /2026-04-12/);
});

test("buildLocalAnswer summarizes open risks for doctor review", () => {
  const answer = buildLocalAnswer(sampleCase, "这个病例有什么风险？");

  assert.match(answer.text, /Hcy高于目标范围/);
  assert.match(answer.text, /QT间期延长需复核/);
  assert.match(answer.text, /医生审核/);
});

test("buildExpertReplaySummary exposes expert reasoning sections and missing checks", () => {
  const replay = buildExpertReplaySummary(sampleCase);

  assert.equal(replay.missingChecks.length, 1);
  assert.equal(replay.missingChecks[0].name, "尿有机酸");
  assert.match(replay.text, /关键症状/);
  assert.match(replay.text, /复核羟钴胺/);
});

test("buildLocalAnswer answers expert replay questions", () => {
  const answer = buildLocalAnswer(sampleCase, "杨教授会怎么看这个病例，哪些检查必须补？");

  assert.match(answer.text, /专家决策复盘/);
  assert.match(answer.text, /尿有机酸/);
  assert.match(answer.text, /医生审核/);
});

test("buildFamilyCarePlan exposes controlled family-facing guidance", () => {
  const plan = buildFamilyCarePlan(sampleCase);

  assert.match(plan.text, /通俗说明/);
  assert.match(plan.text, /呕吐/);
  assert.match(plan.text, /医生确认后反馈/);
  assert.equal(plan.requiresDoctorApproval, true);
});

test("buildLocalAnswer answers family care questions with doctor approval boundary", () => {
  const answer = buildLocalAnswer(sampleCase, "家属要注意哪些危险信号？");

  assert.match(answer.text, /诊后家属管理草稿/);
  assert.match(answer.text, /嗜睡/);
  assert.match(answer.text, /医生确认/);
});

test("buildIntakePipelineSummary turns scanned pages into a clinical ingestion workflow", () => {
  const intake = buildIntakePipelineSummary(sampleCase);

  assert.equal(intake.totalPages, 5);
  assert.equal(intake.documentTypes.length, 4);
  assert.deepEqual(intake.stages.map((stage) => stage.name), [
    "扫描病历自动入库",
    "OCR与证据页面分类",
    "时间轴和指标趋势结构化",
    "医生确认入库",
  ]);
  assert.equal(intake.stages[2].status, "ready");
  assert.match(intake.stages[3].detail, /2项待医生审核/);
});

test("buildCohortSummary aggregates research-ready real world data dimensions", () => {
  const pkuCase = {
    ...sampleCase,
    id: "case-pku",
    age: "19岁",
    diseaseFamily: "苯丙氨酸代谢异常",
    diagnosis: ["苯丙酮尿症"],
    genotype: "PAH c.728G>A",
    metrics: [
      { key: "phe", label: "Phe", value: 10.2, unit: "mg/dL", date: "2026-01-01", flag: "high" },
    ],
    treatments: [
      { name: "低苯丙氨酸饮食", dose: "持续", route: "营养管理", note: "PKU管理" },
    ],
    reviewRules: [
      { id: "pku-phe", label: "Phe偏高", severity: "high", status: "open" },
    ],
  };

  const summary = buildCohortSummary([sampleCase, pkuCase]);

  assert.equal(summary.totalCases, 2);
  assert.equal(summary.diseaseGroups.find((group) => group.label === "苯丙氨酸代谢异常").count, 1);
  assert.equal(summary.metricGroups.find((group) => group.key === "hcy").caseCount, 1);
  assert.equal(summary.treatmentGroups.find((group) => group.label === "羟钴胺").caseCount, 1);
  assert.equal(summary.openHighRiskCases, 2);
});

test("filterCohortCases supports disease genotype metric and treatment filters", () => {
  const pkuCase = {
    ...sampleCase,
    id: "case-pku",
    age: "19岁",
    diseaseFamily: "苯丙氨酸代谢异常",
    diagnosis: ["苯丙酮尿症"],
    genotype: "PAH c.728G>A",
    metrics: [
      { key: "phe", label: "Phe", value: 10.2, unit: "mg/dL", date: "2026-01-01", flag: "high" },
    ],
    treatments: [
      { name: "低苯丙氨酸饮食", dose: "持续", route: "营养管理", note: "PKU管理" },
    ],
  };
  const cases = [sampleCase, pkuCase];

  assert.deepEqual(filterCohortCases(cases, { disease: "MMA", metric: "hcy" }).map((item) => item.id), ["case-demo"]);
  assert.deepEqual(filterCohortCases(cases, { genotype: "PAH", treatment: "低苯丙氨酸" }).map((item) => item.id), ["case-pku"]);
  assert.deepEqual(filterCohortCases(cases, { age: "7岁" }).map((item) => item.id), ["case-demo"]);
});

test("findSimilarCases explains similarity and prior expert management", () => {
  const similarCase = {
    ...sampleCase,
    id: "case-similar",
    code: "MMA-002",
    displayName: "MMA 合并型对照病例",
    genotype: "MMACHC c.80A>G / c.609G>A",
    treatments: [
      { name: "羟钴胺", dose: "10mg", route: "肌肉注射", note: "代谢支持" },
      { name: "左卡尼汀", dose: "每日", route: "口服", note: "代谢支持" },
    ],
    expertReplay: {
      ...sampleCase.expertReplay,
      dispositionDraft: ["复核 Hcy 与尿有机酸", "加强羟钴胺和甜菜碱依从性评估"],
    },
  };
  const differentCase = {
    ...sampleCase,
    id: "case-pku",
    code: "PKU-002",
    displayName: "PKU 对照病例",
    age: "19岁",
    diseaseFamily: "苯丙氨酸代谢异常",
    diagnosis: ["苯丙酮尿症"],
    genotype: "PAH c.728G>A",
    metrics: [{ key: "phe", label: "Phe", value: 10.2, unit: "mg/dL", date: "2026-01-01", flag: "high" }],
    treatments: [{ name: "低苯丙氨酸饮食", dose: "持续", route: "营养管理", note: "PKU管理" }],
  };

  const matches = findSimilarCases([sampleCase, similarCase, differentCase], sampleCase.id);

  assert.equal(matches[0].caseId, "case-similar");
  assert.ok(matches[0].similarity >= 70);
  assert.match(matches[0].reasons.join("；"), /MMA合并型/);
  assert.match(matches[0].priorManagement.join("；"), /羟钴胺/);
  assert.match(matches[0].expertDispositionSummary, /复核 Hcy/);
});

test("buildCohortAnalysis summarizes effectiveness and misdiagnosis path views", () => {
  const analysis = buildCohortAnalysis([sampleCase]);

  assert.match(analysis.effectiveness[0].title, /疗效分析/);
  assert.match(analysis.effectiveness[0].detail, /Hcy/);
  assert.match(analysis.misdiagnosisPath[0].title, /误诊路径/);
  assert.match(analysis.misdiagnosisPath[0].detail, /发育迟缓/);
  assert.equal(analysis.cohortStats.totalCases, 1);
});
