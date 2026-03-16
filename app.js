const idecoStartAgeRange = { min: 60, max: 75 };
const idecoPensionYearsRange = { min: 5, max: 20 };
const idecoPensionGrossCandidates = [300000, 500000, 600000, 800000, 1000000, 1200000, 1500000, 1800000, 2400000, 3000000, 4000000];
const fallbackConfig = {
  defaults: {
    cashBalance: 10000000,
    retirementAge: 50,
    endAge: 95,
    annualSpending: 2700000,
    nationalPensionEndAge: 59,
    growthRate: 4,
    publicPensionStartAge: 65,
    publicPensionAnnual: 900000,
    idecoBalance: 5000000,
    idecoAnnualContribution: 816000,
    idecoContributionEndAge: 64,
    idecoServiceYears: 25,
    taxableBalance: 45000000,
    taxableCostBasis: 33000000,
    taxFilingMode: "withholding",
  },
  nationalPension: {
    monthlyPremium: 17510,
  },
  insurance: {
    deduction: 430000,
    under75: [
      { label: "国民健康保険 医療分", rate: 0.0771, fixed: 47300 },
      { label: "国民健康保険 後期高齢者支援金分", rate: 0.0269, fixed: 16800 },
    ],
    care40to64: { label: "国民健康保険 介護分", rate: 0.0225, fixed: 16600 },
    care65Plus: {
      assumption: "単身前提・前年所得ベース",
      nonTaxableStages: [
        { stage: 1, maxReferenceIncome: 800000, annualPremium: 22572 },
        { stage: 2, maxReferenceIncome: 1200000, annualPremium: 29304 },
        { stage: 3, maxReferenceIncome: Number.POSITIVE_INFINITY, annualPremium: 54252 },
      ],
      taxableStages: [
        { stage: 6, maxTotalIncome: 1250000, annualPremium: 89100 },
        { stage: 7, maxTotalIncome: 1900000, annualPremium: 99000 },
        { stage: 8, maxTotalIncome: 2500000, annualPremium: 118800 },
        { stage: 9, maxTotalIncome: 3500000, annualPremium: 132660 },
        { stage: 10, maxTotalIncome: 5000000, annualPremium: 150480 },
        { stage: 11, maxTotalIncome: 7500000, annualPremium: 188100 },
        { stage: 12, maxTotalIncome: 10000000, annualPremium: 209880 },
        { stage: 13, maxTotalIncome: 15000000, annualPremium: 233640 },
        { stage: 14, maxTotalIncome: 20000000, annualPremium: 261360 },
        { stage: 15, maxTotalIncome: Number.POSITIVE_INFINITY, annualPremium: 289080 },
      ],
    },
    over75: [{ label: "後期高齢者医療保険", rate: 0.0967, fixed: 47300 }],
  },
};

let appConfig = structuredClone(fallbackConfig);
let defaultValues = {
  ...appConfig.defaults,
  nationalPensionAnnual: appConfig.nationalPension.monthlyPremium * 12,
  insuranceDeduction: appConfig.insurance.deduction,
};

const strategies = [
  {
    key: "taxable-first",
    label: "特定口座先行",
    description: "iDeCo受取を後ろへ寄せ、特定口座を先に使う方針。",
    merit: "60歳前の現金繰りに強く、受給開始を遅らせやすい点。",
    drawback: "譲渡益課税が先に出やすく、相場影響も受けやすい点。",
  },
  {
    key: "ideco-pension-first",
    label: "iDeCo年金先行",
    description: "iDeCo年金を先に使い、特定口座を後ろへ残す方針。",
    merit: "特定口座を温存しやすく、売却益課税を後ろへずらせる点。",
    drawback: "雑所得が早く立ち上がり、税や保険料が先に増えやすい点。",
  },
  {
    key: "deduction-aware",
    label: "控除枠活用",
    description: "公的年金等控除を意識し、受取額を抑えて配分する方針。",
    merit: "税と社会保険料を抑えやすく、手取り効率を見やすい点。",
    drawback: "受取額を抑える年があり、他資産の取り崩しが増えやすい点。",
  },
  {
    key: "ideco-lump-sum",
    label: "iDeCo一時金",
    description: "iDeCoを一時金で受け取り、その後は他資産中心の方針。",
    merit: "退職所得控除がはまると、税負担を小さくしやすい点。",
    drawback: "受取年の税、保険料、現金配分が偏りやすい点。",
  },
];

const incomeTaxBrackets = [
  { limit: 1949000, rate: 0.05, deduction: 0 },
  { limit: 3299000, rate: 0.1, deduction: 97500 },
  { limit: 6949000, rate: 0.2, deduction: 427500 },
  { limit: 8999000, rate: 0.23, deduction: 636000 },
  { limit: 17999000, rate: 0.33, deduction: 1536000 },
  { limit: 39999000, rate: 0.4, deduction: 2796000 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.45, deduction: 4796000 },
];

const residentTaxRate = 0.1;
const residentBasicDeduction = 430000;

const form = document.getElementById("simulatorForm");
const sampleButton = document.getElementById("sampleButton");
const formPanelHeader = document.getElementById("formPanelHeader");
const resultToolbar = document.getElementById("resultToolbar");
const resultStatusText = document.getElementById("resultStatusText");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const summaryCards = document.getElementById("summaryCards");
const taxFilingSelect = document.getElementById("taxFilingSelect");
const resultTableBody = document.querySelector("#resultTable tbody");
const insightBox = document.getElementById("insightBox");
const referenceTableBody = document.getElementById("referenceTableBody");
const currencyInputs = Array.from(document.querySelectorAll('input[data-format="currency"]'));

let latestResults = [];
let comparisonResults = {};
let selectedStrategy = null;
let selectedTaxFilingMode = defaultValues.taxFilingMode;
let activeRenderToken = 0;
let hasSimulationResults = false;
let currentConfigLabel = "config.json";

const referenceSources = {
  nationalPension: {
    label: "日本年金機構 国民年金保険料",
    url: "https://www.nenkin.go.jp/service/kokunen/hokenryo/hokenryo.html",
  },
  sumidaInsurance: {
    label: "墨田区 国民健康保険料の計算",
    url: "https://www.city.sumida.lg.jp/kurashi/kenkouhoken/kokuminkenkouhoken/kokuhoryoukeisan.html",
  },
  sumidaLongTermCare: {
    label: "墨田区 65歳以上の介護保険料",
    url: "https://www.city.sumida.lg.jp/kenko_fukushi/koureisya_kaigohoken/kaigo_riyou_houhou/kaigohokennryo.html",
  },
  tokyoOver75: {
    label: "東京都後期高齢者医療広域連合 保険料",
    url: "https://www.tokyo-ikiiki.net/seido/insurance/insurance01.html",
  },
};

function cloneConfig(config) {
  if (typeof structuredClone === "function") {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config));
}

function mergeConfig(baseConfig, overrideConfig) {
  const merged = cloneConfig(baseConfig);
  const source = overrideConfig ?? {};

  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      merged[key] = value;
      return;
    }
    if (value && typeof value === "object") {
      merged[key] = mergeConfig(merged[key] ?? {}, value);
      return;
    }
    merged[key] = value;
  });

  return merged;
}

function rebuildDefaultValues() {
  defaultValues = {
    ...appConfig.defaults,
    nationalPensionAnnual: appConfig.nationalPension.monthlyPremium * 12,
    insuranceDeduction: appConfig.insurance.deduction,
  };
  selectedTaxFilingMode = defaultValues.taxFilingMode;
}

function applyConfigData(configData, sourceLabel) {
  appConfig = mergeConfig(fallbackConfig, configData);
  currentConfigLabel = sourceLabel;
  configStatus.textContent = `設定: ${currentConfigLabel}`;
  rebuildDefaultValues();
  applyDefaults();
  renderReferenceTable();
  taxFilingSelect.value = selectedTaxFilingMode;
  renderIdleState();
}

function formatYen(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatThousands(value) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 0,
  }).format(Math.round((Number(value) || 0) / 1000));
}

function formatThousandsLabel(value) {
  return `${formatThousands(value)}千円`;
}

function formatAgeLabel(value) {
  return Number.isFinite(value) ? `${value}歳` : "-";
}

function parseNumber(value) {
  if (typeof value === "number") {
    return value;
  }
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  if (normalized === "") {
    return 0;
  }
  return Number(normalized);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 0,
  }).format(Math.round(Number(value) || 0));
}

function formatPercent(value) {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

async function yieldDuringHeavyWork(stepCounter) {
  if (stepCounter % 12 === 0) {
    await waitForNextPaint();
  }
}

function setProgress(progress, label) {
  const bounded = Math.max(0, Math.min(1, Number(progress) || 0));
  if (progressFill) {
    progressFill.style.width = `${Math.round(bounded * 100)}%`;
  }
  if (progressLabel) {
    progressLabel.textContent = label ?? `進捗 ${Math.round(bounded * 100)}%`;
  }
}

const runSimulationButton = document.createElement("button");
runSimulationButton.type = "button";
runSimulationButton.id = "runSimulationButton";
runSimulationButton.className = "ghost-button primary-button";
runSimulationButton.textContent = "シミュレーションする";

const configSelectButton = document.createElement("button");
configSelectButton.type = "button";
configSelectButton.id = "configSelectButton";
configSelectButton.className = "ghost-button";
configSelectButton.textContent = "設定ファイルを選ぶ";

const configFileInput = document.createElement("input");
configFileInput.type = "file";
configFileInput.id = "configFileInput";
configFileInput.accept = ".json,application/json";
configFileInput.hidden = true;

const configStatus = document.createElement("span");
configStatus.className = "config-status";
configStatus.textContent = `設定: ${currentConfigLabel}`;

sampleButton.textContent = "初期値に戻す";
if (formPanelHeader) {
  let controlRow = formPanelHeader.querySelector(".control-row");
  if (!controlRow) {
    controlRow = document.createElement("div");
    controlRow.className = "control-row";
    formPanelHeader.appendChild(controlRow);
  }
  controlRow.prepend(configStatus);
  controlRow.prepend(configSelectButton);
  if (!controlRow.contains(sampleButton)) {
    controlRow.appendChild(sampleButton);
  }
  if (!controlRow.contains(configFileInput)) {
    controlRow.appendChild(configFileInput);
  }
}
if (resultToolbar) {
  let resultControlRow = resultToolbar.querySelector(".control-row");
  if (!resultControlRow) {
    resultControlRow = document.createElement("div");
    resultControlRow.className = "control-row";
    resultToolbar.prepend(resultControlRow);
  }
  resultControlRow.prepend(runSimulationButton);
}

function readInputs() {
  const formData = new FormData(form);
  return {
    cashBalance: parseNumber(formData.get("cashBalance")),
    retirementAge: Number(formData.get("retirementAge")),
    endAge: Number(formData.get("endAge")),
    annualSpending: parseNumber(formData.get("annualSpending")),
    nationalPensionAnnual: appConfig.nationalPension.monthlyPremium * 12,
    nationalPensionEndAge: Number(formData.get("nationalPensionEndAge")),
    growthRate: Number(formData.get("growthRate")) / 100,
    publicPensionStartAge: Number(formData.get("publicPensionStartAge")),
    publicPensionAnnual: parseNumber(formData.get("publicPensionAnnual")),
    idecoBalance: parseNumber(formData.get("idecoBalance")),
    idecoAnnualContribution: parseNumber(formData.get("idecoAnnualContribution")),
    idecoContributionEndAge: Number(formData.get("idecoContributionEndAge")),
    idecoServiceYears: Number(formData.get("idecoServiceYears")),
    taxableBalance: parseNumber(formData.get("taxableBalance")),
    taxableCostBasis: parseNumber(formData.get("taxableCostBasis")),
    taxFilingMode: selectedTaxFilingMode,
    insuranceDeduction: appConfig.insurance.deduction,
  };
}

function applyDefaults() {
  Object.entries(defaultValues).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) {
      return;
    }
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
      return;
    }
    if (field.dataset.format === "currency") {
      field.value = formatNumber(value);
      return;
    }
    field.value = value;
  });
}

function renderReferenceTable() {
  const careNonTaxableMin = appConfig.insurance.care65Plus.nonTaxableStages[0]?.annualPremium ?? 0;
  const careNonTaxableMax = appConfig.insurance.care65Plus.nonTaxableStages.at(-1)?.annualPremium ?? 0;
  const careTaxableMin = appConfig.insurance.care65Plus.taxableStages[0]?.annualPremium ?? 0;
  const careTaxableMax = appConfig.insurance.care65Plus.taxableStages.at(-1)?.annualPremium ?? 0;
  const rows = [
    {
      item: "国民年金保険料",
      value: `月額${formatNumber(appConfig.nationalPension.monthlyPremium)}円 / 年額${formatNumber(
        appConfig.nationalPension.monthlyPremium * 12
      )}円`,
      source: referenceSources.nationalPension,
    },
    ...appConfig.insurance.under75.map((entry, index) => ({
      item: index === 0 ? "国保 医療分" : "国保 後期高齢者支援金分",
      value: `${formatPercent(entry.rate)} + ${formatNumber(entry.fixed)}円`,
      source: referenceSources.sumidaInsurance,
    })),
    {
      item: "国保 介護分（40〜64歳）",
      value: `${formatPercent(appConfig.insurance.care40to64.rate)} + ${formatNumber(
        appConfig.insurance.care40to64.fixed
      )}円`,
      source: referenceSources.sumidaInsurance,
    },
    {
      item: "介護保険料（65歳以上・非課税段階）",
      value: `${formatNumber(careNonTaxableMin)}円〜${formatNumber(careNonTaxableMax)}円`,
      source: referenceSources.sumidaLongTermCare,
    },
    {
      item: "介護保険料（65歳以上・課税段階）",
      value: `${formatNumber(careTaxableMin)}円〜${formatNumber(careTaxableMax)}円`,
      source: referenceSources.sumidaLongTermCare,
    },
    {
      item: "介護保険料モデル",
      value: appConfig.insurance.care65Plus.assumption,
      source: referenceSources.sumidaLongTermCare,
    },
    {
      item: "後期高齢者医療保険",
      value: `${formatPercent(appConfig.insurance.over75[0].rate)} + ${formatNumber(
        appConfig.insurance.over75[0].fixed
      )}円`,
      source: referenceSources.tokyoOver75,
    },
    {
      item: "保険料算定の基礎控除",
      value: `${formatNumber(appConfig.insurance.deduction)}円`,
      source: referenceSources.sumidaInsurance,
    },
  ];

  referenceTableBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.item}</td>
          <td>${row.value}</td>
          <td><a href="${row.source.url}" target="_blank" rel="noreferrer">${row.source.label}</a></td>
        </tr>
      `
    )
    .join("");
}

function attachCurrencyFormatting() {
  currencyInputs.forEach((input) => {
    input.addEventListener("focus", () => {
      input.value = String(parseNumber(input.value) || "");
    });

    input.addEventListener("blur", () => {
      const value = parseNumber(input.value);
      input.value = value === 0 && input.value.trim() === "" ? "" : formatNumber(value);
    });
  });
}

function getBasicDeduction(totalIncome) {
  if (totalIncome <= 1320000) {
    return 950000;
  }
  if (totalIncome <= 3360000) {
    return 880000;
  }
  if (totalIncome <= 4890000) {
    return 680000;
  }
  if (totalIncome <= 6550000) {
    return 630000;
  }
  if (totalIncome <= 23500000) {
    return 580000;
  }
  if (totalIncome <= 24000000) {
    return 480000;
  }
  if (totalIncome <= 24500000) {
    return 320000;
  }
  if (totalIncome <= 25000000) {
    return 160000;
  }
  return 0;
}

function calcPublicPensionIncome(gross, age, otherIncome = 0) {
  const thresholdGroup = otherIncome <= 10000000 ? 0 : otherIncome <= 20000000 ? 1 : 2;
  const isSenior = age >= 65;
  const rules = isSenior
    ? [
        [
          { max: 3299999, fn: (amount) => Math.max(0, amount - 1100000) },
          { max: 4099999, fn: (amount) => amount * 0.75 - 275000 },
          { max: 7699999, fn: (amount) => amount * 0.85 - 685000 },
          { max: 9999999, fn: (amount) => amount * 0.95 - 1455000 },
          { max: Number.POSITIVE_INFINITY, fn: (amount) => amount - 1955000 },
        ],
        [
          { max: 3299999, fn: (amount) => Math.max(0, amount - 1000000) },
          { max: 4099999, fn: (amount) => amount * 0.75 - 175000 },
          { max: 7699999, fn: (amount) => amount * 0.85 - 585000 },
          { max: 9999999, fn: (amount) => amount * 0.95 - 1355000 },
          { max: Number.POSITIVE_INFINITY, fn: (amount) => amount - 1855000 },
        ],
        [
          { max: 3299999, fn: (amount) => Math.max(0, amount - 900000) },
          { max: 4099999, fn: (amount) => amount * 0.75 - 75000 },
          { max: 7699999, fn: (amount) => amount * 0.85 - 485000 },
          { max: 9999999, fn: (amount) => amount * 0.95 - 1255000 },
          { max: Number.POSITIVE_INFINITY, fn: (amount) => amount - 1755000 },
        ],
      ]
    : [
        [
          { max: 1299999, fn: (amount) => Math.max(0, amount - 600000) },
          { max: 4099999, fn: (amount) => amount * 0.75 - 275000 },
          { max: 7699999, fn: (amount) => amount * 0.85 - 685000 },
          { max: 9999999, fn: (amount) => amount * 0.95 - 1455000 },
          { max: Number.POSITIVE_INFINITY, fn: (amount) => amount - 1955000 },
        ],
        [
          { max: 1299999, fn: (amount) => Math.max(0, amount - 500000) },
          { max: 4099999, fn: (amount) => amount * 0.75 - 175000 },
          { max: 7699999, fn: (amount) => amount * 0.85 - 585000 },
          { max: 9999999, fn: (amount) => amount * 0.95 - 1355000 },
          { max: Number.POSITIVE_INFINITY, fn: (amount) => amount - 1855000 },
        ],
        [
          { max: 1299999, fn: (amount) => Math.max(0, amount - 400000) },
          { max: 4099999, fn: (amount) => amount * 0.75 - 75000 },
          { max: 7699999, fn: (amount) => amount * 0.85 - 485000 },
          { max: 9999999, fn: (amount) => amount * 0.95 - 1255000 },
          { max: Number.POSITIVE_INFINITY, fn: (amount) => amount - 1755000 },
        ],
      ];

  const rule = rules[thresholdGroup].find((candidate) => gross <= candidate.max);
  return Math.max(0, Math.floor(rule.fn(gross)));
}

function calcIncomeTax(taxableIncome) {
  if (taxableIncome <= 0) {
    return 0;
  }
  const roundedIncome = Math.floor(taxableIncome / 1000) * 1000;
  const bracket = incomeTaxBrackets.find((candidate) => roundedIncome <= candidate.limit);
  const baseTax = roundedIncome * bracket.rate - bracket.deduction;
  return Math.max(0, Math.round(baseTax * 1.021));
}

function calcResidentTax(taxableIncome) {
  return Math.max(0, Math.round(taxableIncome * residentTaxRate));
}

function getIncomeTaxBreakdown(taxableIncome) {
  const roundedIncome = taxableIncome > 0 ? Math.floor(taxableIncome / 1000) * 1000 : 0;
  const bracket = incomeTaxBrackets.find((candidate) => roundedIncome <= candidate.limit) ?? incomeTaxBrackets.at(-1);
  const baseTax = Math.max(0, roundedIncome * bracket.rate - bracket.deduction);
  const reconstructionTax = Math.round(baseTax * 0.021);
  const totalTax = taxableIncome > 0 ? Math.max(0, Math.round(baseTax * 1.021)) : 0;

  return {
    roundedIncome,
    bracket,
    baseTax,
    reconstructionTax,
    totalTax,
  };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildLongTermCareContext({
  ordinaryIncome,
  pensionMiscIncome,
  publicPensionGross,
  idecoPensionGross,
  idecoLumpSumTaxable,
  realizedGain,
  residentTaxBase,
  includeCapitalGainsInInsurance,
}) {
  const capitalGainsIncluded = includeCapitalGainsInInsurance ? realizedGain : 0;
  const totalIncome = Math.max(0, ordinaryIncome + idecoLumpSumTaxable + capitalGainsIncluded);
  const pensionGross = Math.max(0, publicPensionGross + idecoPensionGross);
  const nonPensionIncome = Math.max(0, totalIncome - pensionMiscIncome);
  const referenceIncome = Math.max(0, nonPensionIncome + pensionGross);
  const residentTaxable =
    residentTaxBase > 0 || idecoLumpSumTaxable > 0 || capitalGainsIncluded > 0;

  return {
    totalIncome,
    referenceIncome,
    residentTaxable,
  };
}

function resolveLongTermCareEntry(longTermCareContext) {
  const careConfig = appConfig.insurance.care65Plus;
  const fallbackStage = careConfig.nonTaxableStages[0];
  const context =
    longTermCareContext ??
    {
      totalIncome: 0,
      referenceIncome: 0,
      residentTaxable: false,
      isFallback: true,
    };

  if (context.residentTaxable) {
    const stage =
      careConfig.taxableStages.find((entry) => context.totalIncome < entry.maxTotalIncome) ??
      careConfig.taxableStages.at(-1);
    return {
      label: `介護保険料（65歳以上・第${stage.stage}段階）`,
      amount: stage.annualPremium,
      formula: `介護保険料（65歳以上）: 前年の合計所得金額 ${formatYen(context.totalIncome)} に基づき第${stage.stage}段階を適用 = ${formatYen(
        stage.annualPremium
      )}`,
      note: "単身前提。前年所得ベースの墨田区段階表。",
    };
  }

  const stage =
    careConfig.nonTaxableStages.find((entry) => context.referenceIncome <= entry.maxReferenceIncome) ??
    fallbackStage;
  const upperBound =
    Number.isFinite(stage.maxReferenceIncome) ? formatYen(stage.maxReferenceIncome) : "上限なし";
  return {
    label: `介護保険料（65歳以上・第${stage.stage}段階）`,
    amount: stage.annualPremium,
    formula: `介護保険料（65歳以上）: 前年の非課税判定用所得 ${formatYen(
      context.referenceIncome
    )} が ${upperBound} 以下のため第${stage.stage}段階 = ${formatYen(stage.annualPremium)}`,
    note: context.isFallback
      ? "初年度。前年所得なし。第1段階仮置き。"
      : "単身前提。前年所得ベースの墨田区段階表。",
  };
}

function calcInsuranceBreakdown(age, baseIncome, inputs, longTermCareContext) {
  const assessmentBase = Math.max(0, baseIncome - inputs.insuranceDeduction);
  const entries = [];
  const notes = [];

  if (age < 75) {
    entries.push(...appConfig.insurance.under75);

    if (age >= 40 && age < 65) {
      entries.push(appConfig.insurance.care40to64);
    } else if (age >= 65) {
      const careEntry = resolveLongTermCareEntry(longTermCareContext);
      entries.push(careEntry);
      notes.push(careEntry.note);
    }
  } else {
    entries.push(...appConfig.insurance.over75);
    const careEntry = resolveLongTermCareEntry(longTermCareContext);
    entries.push(careEntry);
    notes.push(careEntry.note);
  }

  const detailedEntries = entries.map((entry) => {
    if (typeof entry.amount === "number" && !("rate" in entry)) {
      return entry;
    }
    const amount = Math.round(entry.fixed + assessmentBase * entry.rate);
    return {
      ...entry,
      base: assessmentBase,
      amount,
    };
  });

  return {
    amount: detailedEntries.reduce((sum, entry) => sum + entry.amount, 0),
    entries: detailedEntries,
    notes,
    assessmentBase,
  };
}

function calcRetirementIncomeTaxable(lumpSum, serviceYears) {
  if (lumpSum <= 0) {
    return { taxableIncome: 0, taxFreeAllowance: 0 };
  }

  const allowance =
    serviceYears <= 20
      ? Math.max(800000, serviceYears * 400000)
      : 8000000 + (serviceYears - 20) * 700000;

  return {
    taxableIncome: Math.max(0, (lumpSum - allowance) / 2),
    taxFreeAllowance: allowance,
  };
}

function calcRetirementTaxes(taxableIncome) {
  return {
    incomeTax: calcIncomeTax(taxableIncome),
    residentTax: calcResidentTax(taxableIncome),
  };
}

function getCapitalGainsTaxRate() {
  return 0.20315;
}

function getCapitalGainsIncomeTaxRate() {
  return 0.15315;
}

function getCapitalGainsResidentTaxRate() {
  return 0.05;
}

function withdrawTaxable(state, netNeeded, taxRate) {
  if (netNeeded <= 0 || state.balance <= 0) {
    return {
      grossWithdrawal: 0,
      netCash: 0,
      realizedGain: 0,
      tax: 0,
    };
  }

  let grossEstimate = Math.min(state.balance, netNeeded / Math.max(0.0001, 1 - taxRate));

  for (let count = 0; count < 8; count += 1) {
    const gainRatio = state.balance > 0 ? Math.max(0, (state.balance - state.costBasis) / state.balance) : 0;
    const realizedGain = grossEstimate * gainRatio;
    const tax = realizedGain * taxRate;
    const netCash = grossEstimate - tax;
    const delta = netNeeded - netCash;

    if (Math.abs(delta) < 1) {
      break;
    }

    grossEstimate = Math.min(state.balance, grossEstimate + delta);
  }

  const gainRatio = state.balance > 0 ? Math.max(0, (state.balance - state.costBasis) / state.balance) : 0;
  const grossWithdrawal = Math.min(state.balance, grossEstimate);
  const realizedGain = grossWithdrawal * gainRatio;
  const tax = realizedGain * taxRate;
  const netCash = grossWithdrawal - tax;
  const previousBalance = state.balance;
  const previousCostBasis = state.costBasis;
  const costBasisReduction = previousBalance > 0 ? previousCostBasis * (grossWithdrawal / previousBalance) : 0;

  state.balance = Math.max(0, previousBalance - grossWithdrawal);
  state.costBasis = Math.max(0, previousCostBasis - costBasisReduction);

  return {
    grossWithdrawal,
    netCash,
    realizedGain,
    tax,
  };
}

function determineIdecoPension(age, state, inputs, strategy) {
  if (age < inputs.idecoStartAge || state.idecoBalance <= 0 || state.idecoPensionYearsTaken >= inputs.idecoPensionYears) {
    return 0;
  }

  if (strategy.key === "ideco-lump-sum") {
    return 0;
  }

  const remainingYears = Math.max(1, inputs.idecoPensionYears - state.idecoPensionYearsTaken);
  if (remainingYears === 1) {
    return state.idecoBalance;
  }

  return Math.min(state.idecoBalance, inputs.idecoAnnualPensionGross);
}

function getPlannedIdecoPensionGross(state, inputs) {
  if (state.idecoBalance <= 0 || state.idecoPensionYearsTaken >= inputs.idecoPensionYears) {
    return 0;
  }
  const remainingYears = Math.max(1, inputs.idecoPensionYears - state.idecoPensionYearsTaken);
  if (remainingYears === 1) {
    return state.idecoBalance;
  }
  return Math.min(state.idecoBalance, inputs.idecoAnnualPensionGross);
}

function buildNumberRange(min, max, step = 1) {
  const values = [];
  for (let value = min; value <= max; value += step) {
    values.push(value);
  }
  if (!values.includes(max)) {
    values.push(max);
  }
  return values;
}

function uniqueSortedNumbers(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function getPublicPensionAllowanceCeiling(age) {
  return age >= 65 ? 1100000 : 600000;
}

function getDeductionAwareTargetGross(inputs, startAge) {
  const ceiling = getPublicPensionAllowanceCeiling(startAge);
  const publicPensionAtStart = startAge >= inputs.publicPensionStartAge ? inputs.publicPensionAnnual : 0;
  return Math.max(0, ceiling - publicPensionAtStart);
}

function estimateIdecoBalanceAtStart(inputs, startAge) {
  let balance = inputs.idecoBalance;
  let serviceYears = inputs.idecoServiceYears;
  for (let age = inputs.retirementAge; age <= Math.min(inputs.endAge, startAge - 1); age += 1) {
    balance *= 1 + inputs.growthRate;
    if (age <= inputs.idecoContributionEndAge && age < startAge) {
      balance += inputs.idecoAnnualContribution;
      serviceYears += 1;
    }
  }
  return { balance, serviceYears };
}

function getDynamicIdecoAnnualGrossCandidates(inputs, startAge, pensionYears) {
  if (pensionYears <= 0) {
    return [];
  }
  const { balance: projectedBalance } = estimateIdecoBalanceAtStart(inputs, startAge);
  const baseline = projectedBalance / Math.max(1, pensionYears);
  const anchors = [0.6, 0.8, 1, 1.2, 1.4].map((multiplier) => Math.max(300000, Math.round((baseline * multiplier) / 100000) * 100000));
  return uniqueSortedNumbers(anchors);
}

function getStrategyPenalty(candidate, inputs, strategy) {
  if (strategy.key === "ideco-lump-sum") {
    return 0;
  }

  const minStartAge = Math.max(idecoStartAgeRange.min, inputs.retirementAge);
  const startAge = candidate.idecoPlan.startAge ?? minStartAge;
  const annualGross = candidate.idecoPlan.annualGross ?? 0;

  if (strategy.key === "taxable-first") {
    const lateStartFloor = Math.max(minStartAge, Math.min(inputs.publicPensionStartAge, inputs.endAge));
    return Math.max(0, lateStartFloor - startAge) * 500000 + annualGross * 0.35;
  }

  if (strategy.key === "ideco-pension-first") {
    return Math.max(0, startAge - minStartAge) * 500000 + Math.max(0, 1500000 - annualGross) * 0.5;
  }

  if (strategy.key === "deduction-aware") {
    const targetGross = getDeductionAwareTargetGross(inputs, startAge);
    return Math.abs(annualGross - targetGross) + Math.abs(startAge - inputs.publicPensionStartAge) * 250000;
  }

  return 0;
}

function buildStrategySearchProfile(inputs, strategy, minStartAge, maxStartAge) {
  const allStartAges = buildNumberRange(minStartAge, maxStartAge, 2);
  const allPensionYears = uniqueSortedNumbers([5, 8, 10, 12, 15, 18, 20].filter((years) => years >= idecoPensionYearsRange.min && years <= idecoPensionYearsRange.max));

  if (strategy.key === "taxable-first") {
    return {
      coarseStartAges: allStartAges,
      coarsePensionYears: allPensionYears,
    };
  }

  if (strategy.key === "ideco-pension-first") {
    return {
      coarseStartAges: buildNumberRange(minStartAge, Math.min(maxStartAge, minStartAge + 6), 2),
      coarsePensionYears: allPensionYears,
    };
  }

  if (strategy.key === "deduction-aware") {
    const anchorAge = Math.max(minStartAge, Math.min(inputs.publicPensionStartAge, maxStartAge));
    return {
      coarseStartAges: buildNumberRange(Math.max(minStartAge, anchorAge - 4), Math.min(maxStartAge, anchorAge + 4), 2),
      coarsePensionYears: allPensionYears,
    };
  }

  return {
    coarseStartAges: allStartAges,
    coarsePensionYears: allPensionYears,
  };
}

function getAnnualGrossCandidatesForPlan(inputs, strategy, startAge, pensionYears, seedGross = null) {
  const dynamicCandidates = getDynamicIdecoAnnualGrossCandidates(inputs, startAge, pensionYears);
  const pensionFirstGrosses = idecoPensionGrossCandidates.filter((value) => value >= 800000);

  if (strategy.key === "deduction-aware") {
    const targetGross = getDeductionAwareTargetGross(inputs, startAge);
    return uniqueSortedNumbers(
      idecoPensionGrossCandidates
        .filter((value) => Math.abs(value - targetGross) <= 700000)
        .concat([300000, 500000, 600000, 800000, 1000000, 1200000], dynamicCandidates, seedGross ?? [])
    );
  }

  if (strategy.key === "ideco-pension-first") {
    return uniqueSortedNumbers(pensionFirstGrosses.concat(dynamicCandidates, seedGross ?? []));
  }

  if (strategy.key === "taxable-first") {
    return uniqueSortedNumbers(idecoPensionGrossCandidates.concat(dynamicCandidates, seedGross ?? []));
  }

  return uniqueSortedNumbers(idecoPensionGrossCandidates.concat(dynamicCandidates, seedGross ?? []));
}

function compareResults(candidate, best, inputs, strategy) {
  if (!best) {
    return -1;
  }
  if (candidate.hasIrregularIdecoSettlement !== best.hasIrregularIdecoSettlement) {
    return candidate.hasIrregularIdecoSettlement ? 1 : -1;
  }
  if (candidate.hasFailure !== best.hasFailure) {
    return candidate.hasFailure ? 1 : -1;
  }
  const candidatePenalty = getStrategyPenalty(candidate, inputs, strategy);
  const bestPenalty = getStrategyPenalty(best, inputs, strategy);
  if (candidatePenalty !== bestPenalty) {
    return candidatePenalty - bestPenalty;
  }
  if (candidate.totalBurden !== best.totalBurden) {
    return candidate.totalBurden - best.totalBurden;
  }
  const candidateFailureAge = candidate.firstFailureAge ?? Number.POSITIVE_INFINITY;
  const bestFailureAge = best.firstFailureAge ?? Number.POSITIVE_INFINITY;
  if (candidateFailureAge !== bestFailureAge) {
    return bestFailureAge - candidateFailureAge;
  }
  if (candidate.finalAssets !== best.finalAssets) {
    return best.finalAssets - candidate.finalAssets;
  }
  const candidateAnnualGross = candidate.idecoPlan.annualGross ?? Number.POSITIVE_INFINITY;
  const bestAnnualGross = best.idecoPlan.annualGross ?? Number.POSITIVE_INFINITY;
  if (candidateAnnualGross !== bestAnnualGross) {
    return candidateAnnualGross - bestAnnualGross;
  }
  const candidateStartAge = candidate.idecoPlan.startAge ?? Number.POSITIVE_INFINITY;
  const bestStartAge = best.idecoPlan.startAge ?? Number.POSITIVE_INFINITY;
  return candidateStartAge - bestStartAge;
}

function assessIdecoSettlement(rows, idecoPlan) {
  if (!idecoPlan || idecoPlan.pensionYears <= 0 || !idecoPlan.annualGross) {
    return { hasIrregularIdecoSettlement: false, irregularSettlementAge: null, irregularSettlementGross: 0 };
  }

  const pensionRows = rows.filter((row) => row.idecoPensionGross > 0);
  if (pensionRows.length <= 1) {
    return { hasIrregularIdecoSettlement: false, irregularSettlementAge: null, irregularSettlementGross: 0 };
  }

  const finalPensionRow = pensionRows.at(-1);
  const lowerBound = idecoPlan.annualGross * 0.5;
  const upperBound = idecoPlan.annualGross * 2;
  const hasIrregularIdecoSettlement =
    finalPensionRow.idecoPensionGross < lowerBound - 1 || finalPensionRow.idecoPensionGross > upperBound + 1;

  return {
    hasIrregularIdecoSettlement,
    irregularSettlementAge: hasIrregularIdecoSettlement ? finalPensionRow.age : null,
    irregularSettlementGross: hasIrregularIdecoSettlement ? finalPensionRow.idecoPensionGross : 0,
  };
}

function simulateStrategy(inputs, strategy, idecoPlan, options = {}) {
  const includeFormulas = options.includeFormulas !== false;
  const state = {
    cashBalance: inputs.cashBalance,
    idecoBalance: inputs.idecoBalance,
    idecoServiceYears: inputs.idecoServiceYears,
    taxable: {
      balance: inputs.taxableBalance,
      costBasis: Math.min(inputs.taxableCostBasis, inputs.taxableBalance),
    },
    idecoPensionYearsTaken: 0,
    idecoLumpSumUsed: false,
  };
  const effectiveInputs = {
    ...inputs,
    idecoStartAge: idecoPlan.startAge,
    idecoPensionYears: idecoPlan.pensionYears,
    idecoAnnualPensionGross: idecoPlan.annualGross ?? 0,
  };

  const rows = [];
  let totalIncomeTax = 0;
  let totalResidentTax = 0;
  let totalInsurance = 0;
  let priorLongTermCareContext = null;
  for (let age = inputs.retirementAge; age <= inputs.endAge; age += 1) {
    const idecoBalanceBeforeGrowth = state.idecoBalance;
    const taxableBalanceBeforeGrowth = state.taxable.balance;
    state.idecoBalance *= 1 + inputs.growthRate;
    state.taxable.balance *= 1 + inputs.growthRate;
    const idecoGrowth = Math.max(0, state.idecoBalance - idecoBalanceBeforeGrowth);
    const taxableGrowth = Math.max(0, state.taxable.balance - taxableBalanceBeforeGrowth);
    const idecoContribution =
      age <= inputs.idecoContributionEndAge && age < effectiveInputs.idecoStartAge
        ? inputs.idecoAnnualContribution
        : 0;
    if (idecoContribution > 0) {
      state.idecoBalance += idecoContribution;
      state.idecoServiceYears += 1;
    }
    const spending = age >= inputs.retirementAge ? inputs.annualSpending : 0;
    const nationalPensionPayment = age <= inputs.nationalPensionEndAge ? inputs.nationalPensionAnnual : 0;
    const publicPensionGross =
      age >= inputs.publicPensionStartAge
        ? Math.round(inputs.publicPensionAnnual)
        : 0;

    let idecoLumpSumGross = 0;
    let idecoLumpSumTaxable = 0;
    let idecoLumpSumAllowance = 0;
    let idecoLumpIncomeTax = 0;
    let idecoLumpResidentTax = 0;
    if (!state.idecoLumpSumUsed && strategy.key === "ideco-lump-sum" && age >= effectiveInputs.idecoStartAge && state.idecoBalance > 0) {
      idecoLumpSumGross = state.idecoBalance;
      const retirementIncome = calcRetirementIncomeTaxable(idecoLumpSumGross, state.idecoServiceYears);
      idecoLumpSumTaxable = retirementIncome.taxableIncome;
      idecoLumpSumAllowance = retirementIncome.taxFreeAllowance;
      const retirementTaxes = calcRetirementTaxes(idecoLumpSumTaxable);
      idecoLumpIncomeTax = retirementTaxes.incomeTax;
      idecoLumpResidentTax = retirementTaxes.residentTax;
      state.idecoBalance = 0;
      state.idecoLumpSumUsed = true;
    }

    const idecoBalanceAtStart = state.idecoBalance;

    function buildBaseYear(idecoPensionGross) {
      const pensionGrossTotal = publicPensionGross + idecoPensionGross;
      const pensionMiscIncome = calcPublicPensionIncome(pensionGrossTotal, age, 0);
      const ordinaryIncome = pensionMiscIncome;
      const basicDeduction = getBasicDeduction(ordinaryIncome);
      const taxableIncome = Math.max(0, ordinaryIncome - basicDeduction - idecoContribution);
      const incomeTax = calcIncomeTax(taxableIncome);
      const residentTaxBase = Math.max(0, ordinaryIncome - residentBasicDeduction - idecoContribution);
      const residentTax = calcResidentTax(residentTaxBase);
      const cashInflowsBeforeSale =
        publicPensionGross +
        idecoPensionGross +
        idecoLumpSumGross;
      const cashOutflowsExcludingSale =
        spending +
        nationalPensionPayment +
        idecoContribution +
        incomeTax +
        residentTax +
        idecoLumpIncomeTax +
        idecoLumpResidentTax;

      return {
        idecoPensionGross,
        pensionMiscIncome,
        ordinaryIncome,
        basicDeduction,
        taxableIncome,
        incomeTax,
        residentTaxBase,
        residentTax,
        cashInflowsBeforeSale,
        cashOutflowsExcludingSale,
        idecoContribution,
      };
    }

    let idecoPensionGross = determineIdecoPension(
      age,
      { ...state, idecoBalance: idecoBalanceAtStart },
      effectiveInputs,
      strategy
    );
    let yearBase = buildBaseYear(idecoPensionGross);
    let taxableSaleGross = 0;
    let taxableSaleNet = 0;
    let realizedGain = 0;
    let capitalGainsTax = 0;
    let capitalGainsIncomeTax = 0;
    let capitalGainsResidentTax = 0;
    let insuranceBase = yearBase.ordinaryIncome;
    let insuranceBreakdown = { amount: 0, entries: [], notes: [], assessmentBase: 0 };
    let insurance = 0;
    let endingCash = state.cashBalance;
    let finalTaxableState = { ...state.taxable };
    const includeCapitalGainsInInsurance = inputs.taxFilingMode === "separate";

    for (let iteration = 0; iteration < 8; iteration += 1) {
      yearBase = buildBaseYear(idecoPensionGross);
      const workingTaxable = {
        balance: state.taxable.balance,
        costBasis: state.taxable.costBasis,
      };

      taxableSaleGross = 0;
      taxableSaleNet = 0;
      realizedGain = 0;
      capitalGainsTax = 0;
      capitalGainsIncomeTax = 0;
      capitalGainsResidentTax = 0;
      insuranceBase = yearBase.ordinaryIncome;
      insuranceBreakdown =
        age >= inputs.retirementAge
          ? calcInsuranceBreakdown(age, insuranceBase, inputs, priorLongTermCareContext)
          : { amount: 0, entries: [], notes: [], assessmentBase: 0 };
      insurance = insuranceBreakdown.amount;

      for (let count = 0; count < 8; count += 1) {
        const availableCash =
          state.cashBalance +
          yearBase.cashInflowsBeforeSale +
          taxableSaleNet -
          yearBase.cashOutflowsExcludingSale -
          insurance;

        const additionalCashNeeded = Math.max(0, -availableCash);
        if (additionalCashNeeded <= 1 || workingTaxable.balance <= 0) {
          break;
        }

        const sale = withdrawTaxable(
          workingTaxable,
          additionalCashNeeded,
          getCapitalGainsTaxRate()
        );

        taxableSaleGross += sale.grossWithdrawal;
        taxableSaleNet += sale.netCash;
        realizedGain += sale.realizedGain;
        capitalGainsTax += sale.tax;
        capitalGainsIncomeTax = realizedGain * getCapitalGainsIncomeTaxRate();
        capitalGainsResidentTax = realizedGain * getCapitalGainsResidentTaxRate();

        insuranceBase = yearBase.ordinaryIncome + (includeCapitalGainsInInsurance ? realizedGain : 0);
        insuranceBreakdown =
          age >= inputs.retirementAge
            ? calcInsuranceBreakdown(age, insuranceBase, inputs, priorLongTermCareContext)
            : { amount: 0, entries: [], notes: [], assessmentBase: 0 };
        insurance = insuranceBreakdown.amount;
      }

      endingCash =
        state.cashBalance +
        yearBase.cashInflowsBeforeSale +
        taxableSaleNet -
        yearBase.cashOutflowsExcludingSale -
        insurance;
      if (Math.abs(endingCash) <= 10) {
        endingCash = 0;
      }
      finalTaxableState = workingTaxable;

      const canSupplementFromIdeco =
        strategy.key === "taxable-first" &&
        age >= effectiveInputs.idecoStartAge &&
        idecoPensionGross <= 0 &&
        idecoBalanceAtStart > 0;
      if (endingCash < -1 && canSupplementFromIdeco) {
        const supplementalIdecoGross = getPlannedIdecoPensionGross(
          { idecoBalance: idecoBalanceAtStart, idecoPensionYearsTaken: state.idecoPensionYearsTaken },
          effectiveInputs
        );
        if (supplementalIdecoGross > 0) {
          idecoPensionGross = supplementalIdecoGross;
          continue;
        }
      }

      if (endingCash >= -1) {
        break;
      }
      break;
    }

    state.idecoBalance = Math.max(0, idecoBalanceAtStart - idecoPensionGross);
    if (idecoPensionGross > 0) {
      state.idecoPensionYearsTaken += 1;
    }
    state.taxable = finalTaxableState;
    state.cashBalance = endingCash;

    const {
      pensionMiscIncome,
      ordinaryIncome,
      basicDeduction,
      taxableIncome,
      incomeTax,
      residentTaxBase,
      residentTax,
      idecoContribution: yearIdecoContribution,
    } = yearBase;
    const normalIncomeTaxBreakdown = includeFormulas ? getIncomeTaxBreakdown(taxableIncome) : null;
    const idecoLumpIncomeTaxBreakdown = includeFormulas ? getIncomeTaxBreakdown(idecoLumpSumTaxable) : null;

    const idecoGrossReceipt = idecoPensionGross + idecoLumpSumGross;
    const incomeTotal = publicPensionGross + idecoGrossReceipt + taxableSaleGross;
    const expenseTotal =
      spending +
      nationalPensionPayment +
      yearIdecoContribution +
      (incomeTax + idecoLumpIncomeTax + capitalGainsIncomeTax) +
      (residentTax + idecoLumpResidentTax + capitalGainsResidentTax) +
      insurance;

    const totalEndAssets = state.cashBalance + state.idecoBalance + state.taxable.balance;

    totalIncomeTax += incomeTax + idecoLumpIncomeTax + capitalGainsIncomeTax;
    totalResidentTax += residentTax + idecoLumpResidentTax + capitalGainsResidentTax;
    totalInsurance += insurance;
    priorLongTermCareContext = buildLongTermCareContext({
      ordinaryIncome,
      pensionMiscIncome,
      publicPensionGross,
      idecoPensionGross,
      idecoLumpSumTaxable,
      realizedGain,
      residentTaxBase,
      includeCapitalGainsInInsurance,
    });
    const row = {
      age,
      spending,
      nationalPensionPayment,
      idecoContribution: yearIdecoContribution,
      publicPensionGross,
      idecoReceiptGross: idecoGrossReceipt,
      idecoPensionGross,
      idecoLumpSumGross,
      taxableSaleGross,
      incomeTotal,
      incomeTax: incomeTax + idecoLumpIncomeTax + capitalGainsIncomeTax,
      residentTax: residentTax + idecoLumpResidentTax + capitalGainsResidentTax,
      insurance,
      expenseTotal,
      cashEndAssets: endingCash,
      idecoGrowth,
      idecoEndAssets: state.idecoBalance,
      taxableGrowth,
      yearEndAssets: state.taxable.balance,
      totalEndAssets,
      isCashNegative: endingCash < 0,
      isTotalAssetsNegative: totalEndAssets < 0,
      fundingGap: Math.max(0, -endingCash),
      realizedGain,
    };

    if (includeFormulas) {
      row.incomeTaxFormula = [
        `通常分: 公的年金等収入 ${formatYen(publicPensionGross + idecoPensionGross)} -> 雑所得 ${formatYen(
          pensionMiscIncome
        )} -> 基礎控除 ${formatYen(basicDeduction)} - iDeCo拠出控除 ${formatYen(
          yearIdecoContribution
        )} = 控除後の課税所得 ${formatYen(taxableIncome)}`,
        `通常分の所得税: 課税所得を千円未満切捨て ${formatYen(normalIncomeTaxBreakdown.roundedIncome)}、税率 ${(normalIncomeTaxBreakdown.bracket.rate * 100).toFixed(
          0
        )}% - 控除額 ${formatYen(normalIncomeTaxBreakdown.bracket.deduction)} = ${formatYen(normalIncomeTaxBreakdown.baseTax)}、復興特別所得税 ${formatYen(
          normalIncomeTaxBreakdown.reconstructionTax
        )}、合計 ${formatYen(incomeTax)}`,
        ...(idecoLumpIncomeTax > 0
          ? [
              `iDeCo一時金分: 一時金 ${formatYen(idecoLumpSumGross)} - 退職所得控除 ${formatYen(idecoLumpSumAllowance)} = ${formatYen(
                Math.max(0, idecoLumpSumGross - idecoLumpSumAllowance)
              )}、1/2後の退職所得 ${formatYen(idecoLumpSumTaxable)}`,
              `iDeCo一時金分の所得税: 課税退職所得を千円未満切捨て ${formatYen(idecoLumpIncomeTaxBreakdown.roundedIncome)}、税率 ${(
                idecoLumpIncomeTaxBreakdown.bracket.rate * 100
              ).toFixed(0)}% - 控除額 ${formatYen(idecoLumpIncomeTaxBreakdown.bracket.deduction)} = ${formatYen(
                idecoLumpIncomeTaxBreakdown.baseTax
              )}、復興特別所得税 ${formatYen(idecoLumpIncomeTaxBreakdown.reconstructionTax)}、合計 ${formatYen(idecoLumpIncomeTax)}`,
            ]
          : []),
        ...(capitalGainsIncomeTax > 0
          ? [
              `譲渡益課税のうち所得税分: 実現益 ${formatYen(realizedGain)} x ${(getCapitalGainsIncomeTaxRate() * 100).toFixed(3)}% = ${formatYen(
                capitalGainsIncomeTax
              )}`,
            ]
          : []),
      ].join(" / ");
      row.residentTaxFormula = [
        `通常分: 雑所得 ${formatYen(ordinaryIncome)} - 住民税基礎控除 ${formatYen(
          residentBasicDeduction
        )} - iDeCo拠出控除 ${formatYen(yearIdecoContribution)} = 住民税課税所得 ${formatYen(residentTaxBase)}`,
        `通常分の住民税: ${formatYen(residentTaxBase)} x 10% = ${formatYen(residentTax)}`,
        ...(idecoLumpResidentTax > 0
          ? [
              `iDeCo一時金分: 一時金 ${formatYen(idecoLumpSumGross)} - 退職所得控除 ${formatYen(idecoLumpSumAllowance)} = ${formatYen(
                Math.max(0, idecoLumpSumGross - idecoLumpSumAllowance)
              )}、1/2後の退職所得 ${formatYen(idecoLumpSumTaxable)}`,
              `iDeCo一時金分の住民税: ${formatYen(idecoLumpSumTaxable)} x 10% = ${formatYen(idecoLumpResidentTax)}`,
            ]
          : []),
        ...(capitalGainsTax > 0
          ? [
              `譲渡益課税のうち住民税分: 実現益 ${formatYen(realizedGain)} x ${(getCapitalGainsResidentTaxRate() * 100).toFixed(0)}% = ${formatYen(
                capitalGainsResidentTax
              )}`,
            ]
          : []),
      ].join(" / ");
      row.insuranceFormula = [
        `算定所得 = ${formatYen(insuranceBase)} - 基礎控除 ${formatYen(inputs.insuranceDeduction)} = ${formatYen(insuranceBreakdown.assessmentBase)}`,
        ...insuranceBreakdown.entries.map((entry) =>
          entry.formula
            ? entry.formula
            : `${entry.label}: 固定額 ${formatYen(entry.fixed)} + ${formatYen(entry.base)} x ${(entry.rate * 100).toFixed(
                2
              )}% = ${formatYen(entry.amount)}`
        ),
        taxableSaleGross > 0
          ? `特定口座売却: 売却額 ${formatYen(taxableSaleGross)}、実現益 ${formatYen(realizedGain)}、取得原価按分後の税引後受取額 ${formatYen(taxableSaleNet)}`
          : "特定口座売却なし",
        includeCapitalGainsInInsurance
          ? `申告分離課税。譲渡益 ${formatYen(realizedGain)} を算定所得に算入。`
          : "特定口座源泉徴収。譲渡益は算定所得に不算入。",
        ...insuranceBreakdown.notes,
      ].join(" / ");
    }

    rows.push(row);
  }

  const finalAssets = rows.at(-1)?.totalEndAssets ?? 0;
  const totalBurden = totalIncomeTax + totalResidentTax + totalInsurance;
  const depletionAge = rows.find((row) => row.totalEndAssets <= 0)?.age ?? null;
  const firstFailureRow = rows.find((row) => row.isCashNegative || row.isTotalAssetsNegative) ?? null;
  const idecoSettlementStatus = assessIdecoSettlement(rows, idecoPlan);
  const totalIdecoGrowth = rows.reduce((sum, row) => sum + row.idecoGrowth, 0);
  const totalTaxableGrowth = rows.reduce((sum, row) => sum + row.taxableGrowth, 0);
  const idecoTotal = inputs.idecoBalance + totalIdecoGrowth;
  const taxableTotal = inputs.taxableBalance + totalTaxableGrowth;
  let failureReason = null;

  if (firstFailureRow) {
    if (firstFailureRow.isTotalAssetsNegative) {
      failureReason = "総資産不足で生活不成立";
    } else if (firstFailureRow.age < idecoPlan.startAge && firstFailureRow.idecoEndAssets > 0) {
      failureReason = "iDeCo受給前で現金不足";
    } else {
      failureReason = "流動資産不足で現金不足";
    }
  }

  return {
    strategy,
    idecoPlan,
    rows,
    finalAssets,
    idecoTotal,
    taxableTotal,
    totalBurden,
    depletionAge,
    firstFailureAge: firstFailureRow?.age ?? null,
    hasFailure: Boolean(firstFailureRow),
    failureReason,
    hasIrregularIdecoSettlement: idecoSettlementStatus.hasIrregularIdecoSettlement,
    irregularSettlementAge: idecoSettlementStatus.irregularSettlementAge,
    irregularSettlementGross: idecoSettlementStatus.irregularSettlementGross,
    yearsWithGap: rows.filter((row) => row.fundingGap > 1).length,
  };
}

async function optimizeIdecoPlan(inputs, strategy, onProgress = () => {}) {
  let bestResult = null;
  let evaluationCount = 0;
  const minStartAge = Math.max(idecoStartAgeRange.min, inputs.retirementAge);
  const maxStartAge = Math.min(idecoStartAgeRange.max, inputs.endAge);
  const lumpSumTotal = Math.max(0, maxStartAge - minStartAge + 1);
  const { coarseStartAges, coarsePensionYears } = buildStrategySearchProfile(inputs, strategy, minStartAge, maxStartAge);
  const estimatedAnnualGrossesPerPlan = 10;
  const coarseTotal = coarseStartAges.length * coarsePensionYears.length * estimatedAnnualGrossesPerPlan;
  const estimatedRefinedStartAges = 5;
  const estimatedRefinedPensionYears = 7;
  const estimatedRefinedAnnualGrosses = 5;
  const estimatedRefinedTotal = estimatedRefinedStartAges * estimatedRefinedPensionYears * estimatedRefinedAnnualGrosses;
  const totalEvaluations = strategy.key === "ideco-lump-sum" ? lumpSumTotal : coarseTotal + estimatedRefinedTotal;

  const publishProgress = () => {
    onProgress(Math.min(1, evaluationCount / Math.max(1, totalEvaluations)));
  };

  if (strategy.key === "ideco-lump-sum") {
    for (let startAge = minStartAge; startAge <= maxStartAge; startAge += 1) {
      const candidate = simulateStrategy(inputs, strategy, { startAge, pensionYears: 0, annualGross: null }, { includeFormulas: false });
      evaluationCount += 1;
      if (compareResults(candidate, bestResult, inputs, strategy) < 0) {
        bestResult = candidate;
      }
      publishProgress();
      await yieldDuringHeavyWork(evaluationCount);
    }
    return simulateStrategy(inputs, strategy, bestResult.idecoPlan, { includeFormulas: true });
  }

  for (const startAge of coarseStartAges) {
    for (const pensionYears of coarsePensionYears) {
      const annualGrossCandidates = getAnnualGrossCandidatesForPlan(inputs, strategy, startAge, pensionYears);
      for (const annualGross of annualGrossCandidates) {
        const candidate = simulateStrategy(inputs, strategy, { startAge, pensionYears, annualGross }, { includeFormulas: false });
        evaluationCount += 1;
        if (compareResults(candidate, bestResult, inputs, strategy) < 0) {
          bestResult = candidate;
        }
        publishProgress();
        await yieldDuringHeavyWork(evaluationCount);
      }
    }
  }

  const refinedStartAges = uniqueSortedNumbers([
    ...buildNumberRange(Math.max(minStartAge, bestResult.idecoPlan.startAge - 2), Math.min(maxStartAge, bestResult.idecoPlan.startAge + 2), 1),
    bestResult.idecoPlan.startAge,
  ]);
  const refinedPensionYears = uniqueSortedNumbers([
    ...buildNumberRange(
      Math.max(idecoPensionYearsRange.min, bestResult.idecoPlan.pensionYears - 3),
      Math.min(idecoPensionYearsRange.max, bestResult.idecoPlan.pensionYears + 3),
      1
    ),
    5,
    10,
    15,
    20,
  ].filter((years) => years >= idecoPensionYearsRange.min && years <= idecoPensionYearsRange.max));
  const refinedAnnualGrosses = uniqueSortedNumbers(
    getAnnualGrossCandidatesForPlan(
      inputs,
      strategy,
      bestResult.idecoPlan.startAge,
      bestResult.idecoPlan.pensionYears,
      bestResult.idecoPlan.annualGross
    ).filter(
      (value) =>
        bestResult.idecoPlan.annualGross === null ||
        Math.abs(value - bestResult.idecoPlan.annualGross) <= 1200000
    )
  );

  for (const startAge of refinedStartAges) {
    for (const pensionYears of refinedPensionYears) {
      for (const annualGross of refinedAnnualGrosses) {
        const candidate = simulateStrategy(inputs, strategy, { startAge, pensionYears, annualGross }, { includeFormulas: false });
        evaluationCount += 1;
        if (compareResults(candidate, bestResult, inputs, strategy) < 0) {
          bestResult = candidate;
        }
        publishProgress();
        await yieldDuringHeavyWork(evaluationCount);
      }
    }
  }

  onProgress(1);
  return simulateStrategy(inputs, strategy, bestResult.idecoPlan, { includeFormulas: true });
}

function getProgressiveResultsForMode(mode) {
  return (comparisonResults[mode] ?? []).filter(Boolean);
}

function getProgressiveResult(mode, strategyKey) {
  return getProgressiveResultsForMode(mode).find((result) => result.strategy.key === strategyKey) ?? null;
}

function renderTable(result) {
  resultTableBody.innerHTML = result.rows
    .map(
      (row) => `
        <tr class="${row.isCashNegative || row.isTotalAssetsNegative ? "warning-row" : ""}">
          <td>${row.age}</td>
          <td class="boundary-left">${formatThousands(row.publicPensionGross)}</td>
          <td>${formatThousands(row.idecoReceiptGross)}</td>
          <td>${formatThousands(row.taxableSaleGross)}</td>
          <td>${formatThousands(row.incomeTotal)}</td>
          <td class="boundary-left">${formatThousands(row.spending)}</td>
          <td>${formatThousands(row.nationalPensionPayment)}</td>
          <td>${formatThousands(row.idecoContribution)}</td>
          <td><span class="hint" data-tooltip="${escapeHtml(row.incomeTaxFormula)}">${formatThousands(row.incomeTax)}</span></td>
          <td><span class="hint" data-tooltip="${escapeHtml(row.residentTaxFormula)}">${formatThousands(row.residentTax)}</span></td>
          <td><span class="hint" data-tooltip="${escapeHtml(row.insuranceFormula)}">${formatThousands(row.insurance)}</span></td>
          <td>${formatThousands(row.expenseTotal)}</td>
          <td class="boundary-left">${formatThousands(row.cashEndAssets)}</td>
          <td>${formatThousands(row.idecoGrowth)}</td>
          <td>${formatThousands(row.idecoEndAssets)}</td>
          <td>${formatThousands(row.taxableGrowth)}</td>
          <td>${formatThousands(row.yearEndAssets)}</td>
          <td>${formatThousands(row.totalEndAssets)}</td>
        </tr>
      `
    )
    .join("");
}

function renderInsight(result) {
  const firstGap = result.rows.find((row) => row.fundingGap > 1);
  const peakTaxYear = result.rows.reduce((best, row) => {
    const bestTotal = best.incomeTax + best.residentTax;
    const currentTotal = row.incomeTax + row.residentTax;
    return currentTotal > bestTotal ? row : best;
  }, result.rows[0]);

  const insightRows = [
    ["戦略", result.strategy.label],
    ["税・社会保険料累計", formatThousandsLabel(result.totalBurden)],
    ["最終資産", formatThousandsLabel(result.finalAssets)],
    ["iDeCo総額", formatThousandsLabel(result.idecoTotal)],
    ["特定口座総額", formatThousandsLabel(result.taxableTotal)],
    ["税負担ピーク", `${formatAgeLabel(peakTaxYear.age)} / ${formatThousandsLabel(peakTaxYear.incomeTax + peakTaxYear.residentTax)}`],
    [
      "譲渡益",
      selectedTaxFilingMode === "separate"
        ? "申告分離課税 / 保険料算定に反映"
        : "源泉徴収 / 保険料算定に不反映",
    ],
    [
      "iDeCo受取",
      `${formatAgeLabel(result.idecoPlan.startAge)}開始 / ${
        result.idecoPlan.pensionYears > 0 ? `${result.idecoPlan.pensionYears}年` : "一時金"
      }`,
    ],
    ["iDeCo受取額", result.idecoPlan.annualGross ? `${formatThousandsLabel(result.idecoPlan.annualGross)} / 年` : "-"],
    ["資産ゼロ年齢", formatAgeLabel(result.depletionAge)],
    ["警告", result.hasFailure ? `${formatAgeLabel(result.firstFailureAge)} / ${result.failureReason}` : "-"],
    ["資金繰り", firstGap ? `${formatAgeLabel(firstGap.age)} / ${formatThousandsLabel(firstGap.fundingGap)}` : "期間内で成立"],
  ];

  if (resultStatusText) {
    resultStatusText.textContent = `${result.strategy.label} / ${
      selectedTaxFilingMode === "separate" ? "申告あり" : "申告なし"
    } / iDeCo ${
      result.idecoPlan.pensionYears > 0
        ? `${formatAgeLabel(result.idecoPlan.startAge)}開始 ${result.idecoPlan.pensionYears}年 ${formatThousandsLabel(result.idecoPlan.annualGross ?? 0)}`
        : `${formatAgeLabel(result.idecoPlan.startAge)} 一時金`
    }`;
  }
  insightBox.innerHTML = `
    <div class="insight-grid">
      ${insightRows
        .map(
          ([label, value]) => `
            <div class="insight-row">
              <span class="insight-label">${escapeHtml(label)}</span>
              <strong class="insight-value">${escapeHtml(value)}</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSummaryProgressive() {
  const currentModeResults = getProgressiveResultsForMode(selectedTaxFilingMode);
  const bestBurden = currentModeResults.length ? Math.min(...currentModeResults.map((result) => result.totalBurden)) : null;
  const bestFinalAssets = currentModeResults.length ? Math.max(...currentModeResults.map((result) => result.finalAssets)) : null;
  const idleState = !hasSimulationResults && currentModeResults.length === 0;

  summaryCards.innerHTML = strategies
    .map((strategy) => {
      const result = getProgressiveResult(selectedTaxFilingMode, strategy.key);
      const withholdingResult = getProgressiveResult("withholding", strategy.key);
      const separateResult = getProgressiveResult("separate", strategy.key);

      if (!result) {
        return `
          <article class="summary-card loading" aria-busy="true">
            <div class="card-badges"></div>
            <h3>${strategy.label}</h3>
            <p>${strategy.description}</p>
            <div class="strategy-traits">
              <div><span>メリット</span><strong>${strategy.merit}</strong></div>
              <div><span>デメリット</span><strong>${strategy.drawback}</strong></div>
            </div>
            <div class="summary-metric"><span>税・社会保険料累計</span><strong>${idleState ? "-" : "計算中..."}</strong></div>
            <div class="summary-metric"><span>最終資産</span><strong>${idleState ? "-" : "計算中..."}</strong></div>
            <div class="summary-meta">
              <span>${idleState ? "未実行" : "計算中"}</span>
            </div>
            <div class="filing-compare">
              <div class="filing-line"><span>申告しない</span><strong>${withholdingResult ? formatThousandsLabel(withholdingResult.totalBurden) : idleState ? "-" : "計算中..."}</strong></div>
              <div class="filing-line"><span>申告する</span><strong>${separateResult ? formatThousandsLabel(separateResult.totalBurden) : idleState ? "-" : "計算中..."}</strong></div>
            </div>
          </article>
        `;
      }

      const isSelected = result.strategy.key === selectedStrategy;
      const isBest = bestBurden !== null && result.totalBurden === bestBurden;
      const hasBestAssets = bestFinalAssets !== null && result.finalAssets === bestFinalAssets;
      return `
        <article class="summary-card ${isSelected ? "selected" : ""} ${isBest ? "best" : ""} ${hasBestAssets ? "richest" : ""}" data-strategy="${result.strategy.key}">
          <div class="card-badges">
            ${isBest ? '<div class="best-badge">税・保険料負担が最小</div>' : ""}
            ${hasBestAssets ? '<div class="asset-badge">最後の手元資産が最大</div>' : ""}
            ${result.hasFailure ? `<div class="warning-badge">${result.failureReason}</div>` : ""}
          </div>
          <h3>${result.strategy.label}</h3>
          <p>${result.strategy.description}</p>
          <div class="strategy-traits">
            <div><span>メリット</span><strong>${result.strategy.merit}</strong></div>
            <div><span>デメリット</span><strong>${result.strategy.drawback}</strong></div>
          </div>
          <div class="summary-metric"><span>税・社会保険料累計</span><strong>${formatThousandsLabel(result.totalBurden)}</strong></div>
          <div class="summary-metric"><span>最終資産</span><strong>${formatThousandsLabel(result.finalAssets)}</strong></div>
          <div class="filing-compare">
            <div class="filing-line"><span>申告しない</span><strong>${withholdingResult ? `${formatThousandsLabel(withholdingResult.totalBurden)} / ゼロ年齢 ${formatAgeLabel(withholdingResult.depletionAge)}` : "計算中..."}</strong></div>
            <div class="filing-line"><span>申告する</span><strong>${separateResult ? `${formatThousandsLabel(separateResult.totalBurden)} / ゼロ年齢 ${formatAgeLabel(separateResult.depletionAge)}` : "計算中..."}</strong></div>
          </div>
        </article>
      `;
    })
    .join("");

  summaryCards.querySelectorAll(".summary-card[data-strategy]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedStrategy = card.dataset.strategy;
      renderCurrentSelectionProgressive();
    });
  });
}

function renderStrategySelectorProgressive() {
  taxFilingSelect.value = selectedTaxFilingMode;
}

function renderTableProgressive(result) {
  if (!result) {
    resultTableBody.innerHTML = `<tr class="loading-row"><td colspan="18">年次キャッシュフローを計算中です...</td></tr>`;
    return;
  }
  renderTable(result);
}

function renderInsightProgressive(result) {
  if (!result) {
    if (resultStatusText) {
      resultStatusText.textContent = "年次計算中。完了分から表示。";
    }
    insightBox.textContent = "";
    return;
  }
  renderInsight(result);
}

function renderCurrentSelectionProgressive() {
  latestResults = getProgressiveResultsForMode(selectedTaxFilingMode);
  const bestBurden = latestResults.length ? Math.min(...latestResults.map((result) => result.totalBurden)) : null;
  const bestResult =
    bestBurden === null ? null : latestResults.find((result) => result.totalBurden === bestBurden) ?? latestResults[0];
  const currentResult =
    latestResults.find((result) => result.strategy.key === selectedStrategy) ?? bestResult;

  selectedStrategy = currentResult?.strategy.key ?? null;
  renderSummaryProgressive();
  renderStrategySelectorProgressive();
  renderTableProgressive(currentResult);
  renderInsightProgressive(currentResult);
}

function renderPendingStateProgressive() {
  comparisonResults = { withholding: [], separate: [] };
  latestResults = [];
  selectedStrategy = null;
  setProgress(0, "進捗 0%");
  renderSummaryProgressive();
  renderStrategySelectorProgressive();
  renderTableProgressive(null);
  renderInsightProgressive(null);
}

function renderIdleState() {
  activeRenderToken += 1;
  comparisonResults = { withholding: [], separate: [] };
  latestResults = [];
  selectedStrategy = null;
  hasSimulationResults = false;
  renderSummaryProgressive();
  renderStrategySelectorProgressive();
  resultTableBody.innerHTML = `<tr class="loading-row"><td colspan="17">入力を調整したら「シミュレーションする」を押してください。</td></tr>`;
  if (resultStatusText) {
    resultStatusText.textContent = "前提変更。シミュレーション待ち。";
  }
  setProgress(0, "進捗 0%");
  insightBox.textContent = "";
}

async function computeModeResultsProgressive(baseInputs, filingMode, renderToken) {
  comparisonResults[filingMode] = [];
  const modeIndex = filingMode === "withholding" ? 0 : 1;
  const totalSteps = strategies.length * 2;

  for (const [strategyIndex, strategy] of strategies.entries()) {
    if (renderToken !== activeRenderToken) {
      return;
    }

    const baseStep = modeIndex * strategies.length + strategyIndex;
    const result = await optimizeIdecoPlan(
      { ...baseInputs, taxFilingMode: filingMode },
      strategy,
      (strategyProgress) => {
        if (renderToken !== activeRenderToken) {
          return;
        }
        const overall = (baseStep + strategyProgress) / totalSteps;
        setProgress(
          overall,
          `進捗 ${Math.round(overall * 100)}%`
        );
        if (resultStatusText) {
          resultStatusText.textContent = `${strategy.label} 計算中。候補比較。`;
        }
      }
    );
    comparisonResults[filingMode].push(result);

    if (filingMode === selectedTaxFilingMode) {
      renderCurrentSelectionProgressive();
    } else {
      renderSummaryProgressive();
      renderStrategySelectorProgressive();
    }

    await waitForNextPaint();
  }
}

async function renderAll() {
  const renderToken = ++activeRenderToken;
  const baseInputs = readInputs();
  hasSimulationResults = false;

  renderPendingStateProgressive();
  await waitForNextPaint();

  const primaryMode = "withholding";
  const secondaryMode = "separate";

  await computeModeResultsProgressive(baseInputs, primaryMode, renderToken);
  if (renderToken !== activeRenderToken) {
    return;
  }

  await computeModeResultsProgressive(baseInputs, secondaryMode, renderToken);
  if (renderToken !== activeRenderToken) {
    return;
  }

  hasSimulationResults = true;
  setProgress(1, "進捗 100%");
  renderCurrentSelectionProgressive();
}

async function initializeApp() {
  try {
    const response = await fetch("./config.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const loadedConfig = await response.json();
    applyConfigData(loadedConfig, "config.json");
  } catch (error) {
    console.warn("config.json could not be loaded, using fallback config.", error);
    applyConfigData(cloneConfig(fallbackConfig), "内蔵デフォルト");
  }
  attachCurrencyFormatting();
}

taxFilingSelect.addEventListener("change", (event) => {
  selectedTaxFilingMode = event.target.value;
  selectedStrategy = null;
  if (hasSimulationResults) {
    renderCurrentSelectionProgressive();
  } else {
    renderIdleState();
  }
});

form.addEventListener("input", renderIdleState);
runSimulationButton.addEventListener("click", () => {
  renderAll();
});
configSelectButton.addEventListener("click", () => {
  configFileInput.click();
});
configFileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }

  try {
    const loadedConfig = JSON.parse(await file.text());
    applyConfigData(loadedConfig, file.name);
  } catch (error) {
    console.error("Failed to load selected config file.", error);
    insightBox.textContent = `設定ファイル読込失敗: ${file.name}`;
  } finally {
    configFileInput.value = "";
  }
});
sampleButton.addEventListener("click", () => {
  applyDefaults();
  renderIdleState();
});

initializeApp();
