import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("index.html", "utf8");
const app = readFileSync("src/app.js", "utf8");

test("case assistant view includes expert replay and family care modules", () => {
  assert.match(html, /杨教授专家决策复盘/);
  assert.match(html, /id="expertReplay"/);
  assert.match(html, /诊后家属管理助手/);
  assert.match(html, /id="familyCare"/);
});

test("frontend renders expert replay and family care modules", () => {
  assert.match(app, /renderExpertReplay\(clinicalCase\)/);
  assert.match(app, /renderFamilyCare\(clinicalCase\)/);
});

test("case overview stats drill into their supporting detail sections", () => {
  assert.match(app, /stat\("证据页", pages, "pages"\)/);
  assert.match(app, /stat\("异常指标", highMetrics, "abnormal"\)/);
  assert.match(app, /stat\("待审核", signals, "review"\)/);
  assert.match(app, /stat\("病程事件", events, "timeline"\)/);
  assert.match(app, /data-drill="\$\{escapeHtml\(drillTarget\)\}"/);
  assert.match(app, /function handleStatDrill/);
  assert.match(app, /scrollIntoView/);
  assert.match(html, /id="pageGroups"/);
  assert.match(html, /id="abnormalMetrics"/);
  assert.match(html, /id="reviewRules"/);
  assert.match(html, /id="timeline"/);
});
