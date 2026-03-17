const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "index.html");
const appPath = path.join(root, "app.js");
const configPath = path.join(root, "config.json");

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasId(html, id) {
  return new RegExp(`id=["']${id}["']`).test(html);
}

function hasName(html, name) {
  return new RegExp(`name=["']${name}["']`).test(html);
}

function main() {
  const html = readUtf8(indexPath);
  const app = readUtf8(appPath);
  const config = JSON.parse(readUtf8(configPath));

  assert(/<title>FIREキャッシュフローシミュレータ<\/title>/.test(html), "title が見つかりません");
  assert(hasId(html, "simulatorForm"), "simulatorForm が見つかりません");
  assert(hasId(html, "sampleButton"), "sampleButton が見つかりません");
  assert(hasId(html, "summaryCards"), "summaryCards が見つかりません");
  assert(hasId(html, "resultStatusText"), "resultStatusText が見つかりません");
  assert(hasId(html, "progressFill"), "progressFill が見つかりません");
  assert(hasId(html, "progressLabel"), "progressLabel が見つかりません");
  assert(hasId(html, "taxFilingSelect"), "taxFilingSelect が見つかりません");
  assert(hasId(html, "insightBox"), "insightBox が見つかりません");
  assert(hasId(html, "referenceTableBody"), "referenceTableBody が見つかりません");
  assert(hasId(html, "resultTable"), "resultTable が見つかりません");

  [
    "cashBalance",
    "retirementAge",
    "endAge",
    "annualSpending",
    "nationalPensionEndAge",
    "growthRate",
    "publicPensionStartAge",
    "publicPensionAnnual",
    "idecoBalance",
    "idecoAnnualContribution",
    "idecoContributionEndAge",
    "idecoServiceYears",
    "taxableBalance",
    "taxableCostBasis",
  ].forEach((name) => {
    assert(hasName(html, name), `input name="${name}" が見つかりません`);
  });

  assert(typeof config.defaults === "object", "config.defaults が不正です");
  assert(typeof config.nationalPension?.monthlyPremium === "number", "国民年金保険料の設定が不正です");
  assert(typeof config.insurance?.deduction === "number", "保険料基礎控除の設定が不正です");
  assert(Array.isArray(config.insurance?.under75) && config.insurance.under75.length >= 2, "75歳未満の保険料設定が不正です");
  assert(Array.isArray(config.insurance?.care65Plus?.nonTaxableStages) && config.insurance.care65Plus.nonTaxableStages.length >= 3, "65歳以上介護保険料の非課税段階設定が不正です");
  assert(Array.isArray(config.insurance?.care65Plus?.taxableStages) && config.insurance.care65Plus.taxableStages.length >= 5, "65歳以上介護保険料の課税段階設定が不正です");
  assert(Array.isArray(config.insurance?.over75) && config.insurance.over75.length >= 1, "75歳以上の保険料設定が不正です");

  [
    'document.getElementById("simulatorForm")',
    'document.getElementById("sampleButton")',
    'document.getElementById("summaryCards")',
    'document.getElementById("taxFilingSelect")',
    'document.getElementById("insightBox")',
    'document.getElementById("referenceTableBody")',
    'document.createElement("button")',
    'document.createElement("input")',
    'fetch("./config.json"',
    'runSimulationButton.addEventListener("click"',
    'configSelectButton.addEventListener("click"',
  ].forEach((snippet) => {
    assert(app.includes(snippet), `app.js に必要な記述がありません: ${snippet}`);
  });

  console.log("smoke-test OK");
}

main();
