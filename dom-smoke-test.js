const fs = require("fs");
const path = require("path");
const vm = require("vm");

class FakeElement {
  constructor({ id = "", name = "", type = "div", dataset = {} } = {}) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.dataset = { ...dataset };
    this.value = "";
    this.checked = false;
    this.innerHTML = "";
    this.textContent = "";
    this.className = "";
    this.style = {};
    this.children = [];
    this.listeners = {};
    this.files = [];
    this.hidden = false;
  }

  addEventListener(eventName, handler) {
    this.listeners[eventName] = handler;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  prepend(child) {
    this.children.unshift(child);
    return child;
  }

  contains(child) {
    return this.children.includes(child);
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

async function main() {
  const appJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));

  const fieldsByName = new Map();
  const currencyInputs = [];
  [
    ["cashBalance", "text", true],
    ["retirementAge", "number", false],
    ["endAge", "number", false],
    ["annualSpending", "text", true],
    ["nationalPensionEndAge", "number", false],
    ["growthRate", "number", false],
    ["publicPensionStartAge", "number", false],
    ["publicPensionAnnual", "text", true],
    ["idecoBalance", "text", true],
    ["idecoAnnualContribution", "text", true],
    ["idecoContributionEndAge", "number", false],
    ["idecoServiceYears", "number", false],
    ["taxableBalance", "text", true],
    ["taxableCostBasis", "text", true],
  ].forEach(([name, type, isCurrency]) => {
    const element = new FakeElement({
      name,
      type,
      dataset: isCurrency ? { format: "currency" } : {},
    });
    fieldsByName.set(name, element);
    if (isCurrency) {
      currencyInputs.push(element);
    }
  });

  const form = new FakeElement({ id: "simulatorForm", type: "form" });
  form.elements = {
    namedItem(name) {
      return fieldsByName.get(name) ?? null;
    },
  };

  const sampleButton = new FakeElement({ id: "sampleButton", type: "button" });
  const summaryCards = new FakeElement({ id: "summaryCards" });
  const taxFilingSelect = new FakeElement({ id: "taxFilingSelect", type: "select" });
  taxFilingSelect.value = "withholding";
  const insightBox = new FakeElement({ id: "insightBox" });
  const resultStatusText = new FakeElement({ id: "resultStatusText" });
  const progressFill = new FakeElement({ id: "progressFill" });
  const progressLabel = new FakeElement({ id: "progressLabel" });
  const referenceTableBody = new FakeElement({ id: "referenceTableBody" });
  const resultTableBody = new FakeElement();
  const formPanelHeader = new FakeElement({ id: "formPanelHeader" });
  const resultPanelHeader = new FakeElement({ id: "resultPanelHeader" });
  const resultToolbar = new FakeElement({ id: "resultToolbar" });
  const resultTable = new FakeElement({ id: "resultTable" });

  const elementsById = new Map([
    ["simulatorForm", form],
    ["sampleButton", sampleButton],
    ["summaryCards", summaryCards],
    ["taxFilingSelect", taxFilingSelect],
    ["insightBox", insightBox],
    ["resultStatusText", resultStatusText],
    ["progressFill", progressFill],
    ["progressLabel", progressLabel],
    ["referenceTableBody", referenceTableBody],
    ["resultTable", resultTable],
    ["formPanelHeader", formPanelHeader],
    ["resultPanelHeader", resultPanelHeader],
    ["resultToolbar", resultToolbar],
  ]);

  class FakeFormData {
    constructor() {}

    get(name) {
      return fieldsByName.get(name)?.value ?? "";
    }
  }

  const document = {
    getElementById(id) {
      return elementsById.get(id) ?? null;
    },
    querySelector(selector) {
      if (selector === "#resultTable tbody") {
        return resultTableBody;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[data-format="currency"]') {
        return currencyInputs;
      }
      return [];
    },
    createElement() {
      return new FakeElement();
    },
  };

  const context = {
    console,
    document,
    FormData: FakeFormData,
    structuredClone,
    Intl,
    Number,
    Math,
    String,
    Array,
    Object,
    Promise,
    JSON,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      callback();
    },
    fetch() {
      return Promise.resolve({
        ok: true,
        json: async () => config,
      });
    },
  };

  vm.runInNewContext(appJs, context, { filename: "app.js" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  if (!formPanelHeader.children.length) {
    throw new Error("前提条件ヘッダーの操作エリアが追加されていません");
  }
  if (!resultToolbar.children.length) {
    throw new Error("比較結果上部の操作エリアが追加されていません");
  }
  const controlRow = formPanelHeader.children[0];
  const resultControlRow = resultToolbar.children[0];
  const runSimulationButton = resultControlRow.children.find((child) => child.id === "runSimulationButton");
  const configSelectButton = controlRow.children.find((child) => child.id === "configSelectButton");
  const configStatus = controlRow.children.find((child) => child.className === "config-status");
  if (!configSelectButton) {
    throw new Error("configSelectButton が見つかりません");
  }
  if (!runSimulationButton) {
    throw new Error("runSimulationButton が比較結果ヘッダーに見つかりません");
  }
  if (!configStatus || !configStatus.textContent.includes("config.json")) {
    throw new Error("設定ファイル表示が初期化されていません");
  }
  if (!sampleButton.textContent.includes("初期値")) {
    throw new Error("sampleButton の文言が更新されていません");
  }
  if (!referenceTableBody.innerHTML.includes("国民年金保険料")) {
    throw new Error("固定値テーブルが描画されていません");
  }
  if (!referenceTableBody.innerHTML.includes("介護保険料（65歳以上")) {
    throw new Error("65歳以上の介護保険料が固定値テーブルに反映されていません");
  }
  if (!resultStatusText.textContent.includes("シミュレーション待ち")) {
    throw new Error("初期アイドル状態のメッセージが上部ステータスに描画されていません");
  }
  if (progressLabel.textContent !== "進捗 0%") {
    throw new Error("初期進捗表示が正しくありません");
  }
  if (insightBox.textContent !== "") {
    throw new Error("初期状態の insightBox は空であるべきです");
  }
  if (typeof configSelectButton.listeners.click !== "function") {
    throw new Error("設定ファイルボタンに click handler が登録されていません");
  }

  const configFileInput = controlRow.children.find((child) => child.id === "configFileInput");
  if (!configFileInput || typeof configFileInput.listeners.change !== "function") {
    throw new Error("configFileInput が初期化されていません");
  }

  configFileInput.files = [
    {
      name: "alt-config.json",
      async text() {
        return JSON.stringify({
          defaults: {
            cashBalance: 12340000,
            taxableBalance: 56780000,
          },
        });
      },
    },
  ];
  await configFileInput.listeners.change({ target: configFileInput });

  if (!configStatus.textContent.includes("alt-config.json")) {
    throw new Error("設定ファイル切り替え後に表示が更新されていません");
  }
  if (fieldsByName.get("cashBalance").value !== "12,340,000") {
    throw new Error("設定ファイル切り替え後に初期値が反映されていません");
  }

  if (typeof runSimulationButton.listeners.click !== "function") {
    throw new Error("シミュレーションボタンに click handler が登録されていません");
  }

  runSimulationButton.listeners.click();
  for (let count = 0; count < 120; count += 1) {
    if (resultStatusText.textContent !== "" && summaryCards.innerHTML.includes("税・社会保険料累計")) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  if (!summaryCards.innerHTML.includes("税・社会保険料累計")) {
    throw new Error("シミュレーション後に比較カードが描画されていません");
  }
  if (!resultTableBody.innerHTML.includes("<tr")) {
    throw new Error("シミュレーション後に年次テーブルが描画されていません");
  }
  if (resultStatusText.textContent === "") {
    throw new Error("シミュレーション後に上部ステータスが更新されていません");
  }
  if (!String(progressFill.style.width || "").endsWith("%")) {
    throw new Error("シミュレーション後に進捗バーが更新されていません");
  }
  if (insightBox.textContent === "" && resultStatusText.textContent === "") {
    throw new Error("シミュレーション後に説明文が更新されていません");
  }

  console.log("dom-smoke-test OK");
  process.exit(0);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
