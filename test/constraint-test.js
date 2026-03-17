const fs = require("fs");
const path = require("path");
const vm = require("vm");
const MAX_DURATION_MS = 30000;

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

function createContext(config) {
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

  const elementsById = new Map([
    ["simulatorForm", form],
    ["sampleButton", new FakeElement({ id: "sampleButton", type: "button" })],
    ["summaryCards", new FakeElement({ id: "summaryCards" })],
    ["taxFilingSelect", new FakeElement({ id: "taxFilingSelect", type: "select" })],
    ["insightBox", new FakeElement({ id: "insightBox" })],
    ["resultStatusText", new FakeElement({ id: "resultStatusText" })],
    ["progressFill", new FakeElement({ id: "progressFill" })],
    ["progressLabel", new FakeElement({ id: "progressLabel" })],
    ["referenceTableBody", new FakeElement({ id: "referenceTableBody" })],
    ["resultTable", new FakeElement({ id: "resultTable" })],
    ["formPanelHeader", new FakeElement({ id: "formPanelHeader" })],
    ["resultPanelHeader", new FakeElement({ id: "resultPanelHeader" })],
    ["resultToolbar", new FakeElement({ id: "resultToolbar" })],
  ]);

  class FakeFormData {
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
        return new FakeElement();
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

  return {
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
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildInputs(config, filingMode) {
  return {
    ...config.defaults,
    nationalPensionAnnual: config.nationalPension.monthlyPremium * 12,
    growthRate: config.defaults.growthRate / 100,
    taxFilingMode: filingMode,
    insuranceDeduction: config.insurance.deduction,
  };
}

async function loadSimulator(configFileName) {
  const projectRoot = path.resolve(__dirname, "..");
  const appJs = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, configFileName), "utf8"));
  const context = createContext(config);
  vm.runInNewContext(appJs, context, { filename: "app.js" });
  vm.runInContext("yieldDuringHeavyWork = async () => {}", context);
  vm.runInContext("waitForNextPaint = async () => {}", context);
  vm.runInContext(
    `
      idecoPensionGrossCandidates.splice(0, idecoPensionGrossCandidates.length, 600000, 1200000, 1800000);
      idecoStartAgeRange.max = Math.min(idecoStartAgeRange.max, 65);
      idecoPensionYearsRange.min = Math.max(idecoPensionYearsRange.min, 10);
      idecoPensionYearsRange.max = Math.min(idecoPensionYearsRange.max, 15);
    `,
    context
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  return {
    config,
    optimizeIdecoPlan: vm.runInContext("optimizeIdecoPlan", context),
    strategies: vm.runInContext("strategies", context),
  };
}

function mergeConfig(baseConfig, overrides = {}) {
  const merged = JSON.parse(JSON.stringify(baseConfig));
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      merged[key] = mergeConfig(merged[key] ?? {}, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function assertIdecoPensionConstraints(result, configName, filingMode) {
  if (result.strategy.key === "ideco-lump-sum") {
    return;
  }

  const pensionRows = result.rows.filter((row) => row.idecoPensionGross > 0);
  if (!pensionRows.length) {
    return;
  }

  for (let index = 1; index < pensionRows.length; index += 1) {
    assert(
      pensionRows[index].age === pensionRows[index - 1].age + 1,
      `${configName} ${result.strategy.key} ${filingMode}: iDeCo年金受取年が連続していません`
    );
  }

  const standardGross = result.idecoPlan.annualGross ?? 0;
  if (pensionRows.length > 1 && standardGross > 0) {
    pensionRows.slice(0, -1).forEach((row) => {
      assert(
        Math.abs(row.idecoPensionGross - standardGross) <= 1,
        `${configName} ${result.strategy.key} ${filingMode}: iDeCo年金受取額が期間中一定ではありません`
      );
    });

    const finalGross = pensionRows.at(-1).idecoPensionGross;
    assert(
      finalGross >= standardGross * 0.5 - 1 && finalGross <= standardGross * 2 + 1,
      `${configName} ${result.strategy.key} ${filingMode}: 最終年のiDeCo清算額が通常年額の範囲外です (final=${finalGross}, standard=${standardGross})`
    );
  }
}

function assertRowBalanceConstraints(result, configName, filingMode) {
  result.rows.forEach((row) => {
    const computedIncomeTotal =
      row.publicPensionGross +
      row.idecoReceiptGross +
      row.taxableSaleGross;
    assert(
      Math.abs(row.incomeTotal - computedIncomeTotal) <= 1,
      `${configName} ${result.strategy.key} ${filingMode}: 収入合計が内訳と一致しません (age=${row.age})`
    );

    const computedExpenseTotal =
      row.spending +
      row.nationalPensionPayment +
      row.idecoContribution +
      row.incomeTax +
      row.residentTax +
      row.insurance;
    assert(
      Math.abs(row.expenseTotal - computedExpenseTotal) <= 1,
      `${configName} ${result.strategy.key} ${filingMode}: 支出合計が内訳と一致しません (age=${row.age})`
    );

    const computedTotalAssets = row.cashEndAssets + row.idecoEndAssets + row.yearEndAssets;
    assert(
      Math.abs(row.totalEndAssets - computedTotalAssets) <= 1,
      `${configName} ${result.strategy.key} ${filingMode}: 総資産が内訳と一致しません (age=${row.age})`
    );
  });
}

function assertCashConstraint(result, configName, filingMode) {
  const badRow = result.rows.find((row) => row.totalEndAssets > 0 && row.cashEndAssets < -1);
  assert(
    !badRow,
    `${configName} ${result.strategy.key} ${filingMode}: 総資産が残っているのに現金がマイナスです (age=${badRow?.age}, cash=${badRow?.cashEndAssets}, total=${badRow?.totalEndAssets})`
  );
}

function assertIdecoContributionConstraints(result, inputs, configName, filingMode) {
  result.rows.forEach((row) => {
    const shouldContribute = row.age <= inputs.idecoContributionEndAge && row.age < result.idecoPlan.startAge;
    if (shouldContribute) {
      assert(
        Math.abs(row.idecoContribution - inputs.idecoAnnualContribution) <= 1,
        `${configName} ${result.strategy.key} ${filingMode}: iDeCo拠出額が前提どおりではありません (age=${row.age})`
      );
    } else {
      assert(
        Math.abs(row.idecoContribution) <= 1,
        `${configName} ${result.strategy.key} ${filingMode}: iDeCo拠出してはいけない年で拠出しています (age=${row.age})`
      );
    }
  });
}

function assertIdecoReceiptModeConstraints(result, configName, filingMode) {
  const lumpRows = result.rows.filter((row) => row.idecoLumpSumGross > 0);
  const pensionRows = result.rows.filter((row) => row.idecoPensionGross > 0);

  if (result.strategy.key === "ideco-lump-sum") {
    assert(
      lumpRows.length <= 1,
      `${configName} ${result.strategy.key} ${filingMode}: iDeCo一時金の受取が複数年に分かれています`
    );
    assert(
      pensionRows.length === 0,
      `${configName} ${result.strategy.key} ${filingMode}: iDeCo一時金戦略で年金受取が発生しています`
    );
  } else {
    assert(
      lumpRows.length === 0,
      `${configName} ${result.strategy.key} ${filingMode}: 年金戦略でiDeCo一時金が発生しています`
    );
    const finalIdecoAssets = result.rows.at(-1)?.idecoEndAssets ?? 0;
    assert(
      finalIdecoAssets <= 1,
      `${configName} ${result.strategy.key} ${filingMode}: 期間終了時にiDeCo残高が残っています (${finalIdecoAssets})`
    );
  }
}

function assertStrategyDifferentiation(results, configName, filingMode) {
  const pensionStrategies = results.filter((result) => result.strategy.key !== "ideco-lump-sum");
  const signatures = pensionStrategies.map((result) =>
    [
      result.strategy.key,
      result.idecoPlan.startAge,
      result.idecoPlan.pensionYears,
      result.idecoPlan.annualGross ?? 0,
      Math.round(result.totalBurden),
    ].join(":")
  );
  const uniquePlanSignatures = new Set(signatures.map((signature) => signature.split(":").slice(1).join(":")));
  assert(
    uniquePlanSignatures.size >= 2,
    `${configName} ${filingMode}: 年金戦略の結果が同一化しています`
  );
}

async function main() {
  const startedAt = Date.now();
  const baseSimulator = await loadSimulator("config.json");
  const testMatrix = [
    {
      label: "config-base",
      config: baseSimulator.config,
      optimizeIdecoPlan: baseSimulator.optimizeIdecoPlan,
      strategyKeys: ["taxable-first", "ideco-pension-first", "deduction-aware", "ideco-lump-sum"],
      filingModes: ["withholding"],
    },
    {
      label: "high-spend-personal-shape",
      config: mergeConfig(baseSimulator.config, {
        defaults: {
          cashBalance: 16000000,
          annualSpending: 5000000,
          publicPensionStartAge: 75,
          publicPensionAnnual: 2900000,
          idecoBalance: 18000000,
          idecoAnnualContribution: 816000,
          idecoContributionEndAge: 64,
          idecoServiceYears: 25,
          taxableBalance: 90000000,
          taxableCostBasis: 45000000,
        },
      }),
      optimizeIdecoPlan: baseSimulator.optimizeIdecoPlan,
      strategyKeys: ["taxable-first", "ideco-lump-sum"],
      filingModes: ["withholding", "separate"],
    },
  ];

  for (const target of testMatrix) {
    const modeResultsMap = new Map();
    for (const strategy of baseSimulator.strategies.filter((entry) => target.strategyKeys.includes(entry.key))) {
      for (const filingMode of target.filingModes) {
        const inputs = buildInputs(target.config, filingMode);
        const result = await target.optimizeIdecoPlan(inputs, strategy);
        const modeResults = modeResultsMap.get(filingMode) ?? [];
        modeResults.push(result);
        modeResultsMap.set(filingMode, modeResults);
        assertCashConstraint(result, target.label, filingMode);
        assertIdecoPensionConstraints(result, target.label, filingMode);
        assertRowBalanceConstraints(result, target.label, filingMode);
        assertIdecoContributionConstraints(result, inputs, target.label, filingMode);
        assertIdecoReceiptModeConstraints(result, target.label, filingMode);
      }
    }
    if (target.label === "config-base") {
      for (const filingMode of target.filingModes) {
        assertStrategyDifferentiation(modeResultsMap.get(filingMode) ?? [], target.label, filingMode);
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  assert(
    durationMs <= MAX_DURATION_MS,
    `constraint-test: 実行時間超過 (${durationMs}ms > ${MAX_DURATION_MS}ms)`
  );

  console.log(`constraint-test OK (${durationMs}ms)`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
