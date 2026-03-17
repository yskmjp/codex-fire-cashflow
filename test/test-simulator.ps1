$ErrorActionPreference = "Stop"

$incomeTaxBrackets = @(
  @{ limit = 1949000; rate = 0.05; deduction = 0 }
  @{ limit = 3299000; rate = 0.10; deduction = 97500 }
  @{ limit = 6949000; rate = 0.20; deduction = 427500 }
  @{ limit = 8999000; rate = 0.23; deduction = 636000 }
  @{ limit = 17999000; rate = 0.33; deduction = 1536000 }
  @{ limit = 39999000; rate = 0.40; deduction = 2796000 }
  @{ limit = [double]::PositiveInfinity; rate = 0.45; deduction = 4796000 }
)

$defaultValues = @{
  cashBalance = 10000000
  retirementAge = 50
  endAge = 95
  annualSpending = 2700000
  nationalPensionAnnual = 210120
  nationalPensionEndAge = 59
  otherIncome = 0
  growthRate = 0.04
  publicPensionStartAge = 65
  publicPensionAnnual = 900000
  publicPensionGrowthRate = 0
  otherDeductions = 0
  idecoBalance = 5000000
  idecoStartAge = 60
  idecoPensionYears = 15
  idecoServiceYears = 25
  pensionTargetGross = 1100000
  taxableBalance = 45000000
  taxableCostBasis = 33000000
  insuranceDeduction = 430000
}

$strategies = @("taxable-first", "ideco-pension-first", "deduction-aware", "ideco-lump-sum")
$filingModes = @("withholding", "separate")

function Get-BasicDeduction([double]$totalIncome) {
  if ($totalIncome -le 1320000) { return 950000 }
  if ($totalIncome -le 3360000) { return 880000 }
  if ($totalIncome -le 4890000) { return 680000 }
  if ($totalIncome -le 6550000) { return 630000 }
  if ($totalIncome -le 23500000) { return 580000 }
  if ($totalIncome -le 24000000) { return 480000 }
  if ($totalIncome -le 24500000) { return 320000 }
  if ($totalIncome -le 25000000) { return 160000 }
  return 0
}

function Get-PublicPensionIncome([double]$gross, [int]$age, [double]$otherIncome) {
  $thresholdGroup = if ($otherIncome -le 10000000) { 0 } elseif ($otherIncome -le 20000000) { 1 } else { 2 }
  $isSenior = $age -ge 65
  if ($isSenior) {
    $rules = @(
      @(
        @{ max = 3299999; fn = { param($x) [Math]::Max(0, $x - 1100000) } }
        @{ max = 4099999; fn = { param($x) $x * 0.75 - 275000 } }
        @{ max = 7699999; fn = { param($x) $x * 0.85 - 685000 } }
        @{ max = 9999999; fn = { param($x) $x * 0.95 - 1455000 } }
        @{ max = [double]::PositiveInfinity; fn = { param($x) $x - 1955000 } }
      )
      @(
        @{ max = 3299999; fn = { param($x) [Math]::Max(0, $x - 1000000) } }
        @{ max = 4099999; fn = { param($x) $x * 0.75 - 175000 } }
        @{ max = 7699999; fn = { param($x) $x * 0.85 - 585000 } }
        @{ max = 9999999; fn = { param($x) $x * 0.95 - 1355000 } }
        @{ max = [double]::PositiveInfinity; fn = { param($x) $x - 1855000 } }
      )
      @(
        @{ max = 3299999; fn = { param($x) [Math]::Max(0, $x - 900000) } }
        @{ max = 4099999; fn = { param($x) $x * 0.75 - 75000 } }
        @{ max = 7699999; fn = { param($x) $x * 0.85 - 485000 } }
        @{ max = 9999999; fn = { param($x) $x * 0.95 - 1255000 } }
        @{ max = [double]::PositiveInfinity; fn = { param($x) $x - 1755000 } }
      )
    )
  } else {
    $rules = @(
      @(
        @{ max = 1299999; fn = { param($x) [Math]::Max(0, $x - 600000) } }
        @{ max = 4099999; fn = { param($x) $x * 0.75 - 275000 } }
        @{ max = 7699999; fn = { param($x) $x * 0.85 - 685000 } }
        @{ max = 9999999; fn = { param($x) $x * 0.95 - 1455000 } }
        @{ max = [double]::PositiveInfinity; fn = { param($x) $x - 1955000 } }
      )
      @(
        @{ max = 1299999; fn = { param($x) [Math]::Max(0, $x - 500000) } }
        @{ max = 4099999; fn = { param($x) $x * 0.75 - 175000 } }
        @{ max = 7699999; fn = { param($x) $x * 0.85 - 585000 } }
        @{ max = 9999999; fn = { param($x) $x * 0.95 - 1355000 } }
        @{ max = [double]::PositiveInfinity; fn = { param($x) $x - 1855000 } }
      )
      @(
        @{ max = 1299999; fn = { param($x) [Math]::Max(0, $x - 400000) } }
        @{ max = 4099999; fn = { param($x) $x * 0.75 - 75000 } }
        @{ max = 7699999; fn = { param($x) $x * 0.85 - 485000 } }
        @{ max = 9999999; fn = { param($x) $x * 0.95 - 1255000 } }
        @{ max = [double]::PositiveInfinity; fn = { param($x) $x - 1755000 } }
      )
    )
  }

  foreach ($rule in $rules[$thresholdGroup]) {
    if ($gross -le $rule.max) {
      return [Math]::Max(0, [Math]::Floor((& $rule.fn $gross)))
    }
  }
}

function Get-IncomeTax([double]$taxableIncome) {
  if ($taxableIncome -le 0) { return 0 }
  $roundedIncome = [Math]::Floor($taxableIncome / 1000) * 1000
  foreach ($bracket in $incomeTaxBrackets) {
    if ($roundedIncome -le $bracket.limit) {
      $baseTax = $roundedIncome * $bracket.rate - $bracket.deduction
      return [Math]::Max(0, [Math]::Round($baseTax * 1.021))
    }
  }
  return 0
}

function Get-ResidentTax([double]$taxableIncome) {
  return [Math]::Max(0, [Math]::Round($taxableIncome * 0.1))
}

function Get-InsuranceBreakdown([int]$age, [double]$baseIncome, $inputs) {
  $assessmentBase = [Math]::Max(0, $baseIncome - $inputs.insuranceDeduction)
  $entries = @()

  if ($age -lt 75) {
    $entries += @{ label = "Medical"; rate = 0.0771; fixed = 47300 }
    $entries += @{ label = "Support"; rate = 0.0269; fixed = 16800 }
    if ($age -ge 40 -and $age -lt 65) {
      $entries += @{ label = "Care"; rate = 0.0225; fixed = 16600 }
    }
  } else {
    $entries += @{ label = "LateElderly"; rate = 0.0967; fixed = 47300 }
  }

  $total = 0
  foreach ($entry in $entries) {
    $total += [Math]::Round($entry.fixed + $assessmentBase * $entry.rate)
  }

  return @{
    amount = $total
    assessmentBase = $assessmentBase
  }
}

function Get-RetirementIncomeTaxable([double]$lumpSum, [int]$serviceYears) {
  if ($lumpSum -le 0) {
    return 0
  }
  $allowance = if ($serviceYears -le 20) {
    [Math]::Max(800000, $serviceYears * 400000)
  } else {
    8000000 + ($serviceYears - 20) * 700000
  }
  return [Math]::Max(0, ($lumpSum - $allowance) / 2)
}

function Withdraw-Taxable([hashtable]$state, [double]$netNeeded) {
  if ($netNeeded -le 0 -or $state.balance -le 0) {
    return @{ grossWithdrawal = 0; netCash = 0; realizedGain = 0; tax = 0 }
  }

  $taxRate = 0.20315
  $grossEstimate = [Math]::Min($state.balance, $netNeeded / [Math]::Max(0.0001, 1 - $taxRate))
  for ($count = 0; $count -lt 8; $count++) {
    $gainRatio = if ($state.balance -gt 0) { [Math]::Max(0, ($state.balance - $state.costBasis) / $state.balance) } else { 0 }
    $realizedGain = $grossEstimate * $gainRatio
    $tax = $realizedGain * $taxRate
    $netCash = $grossEstimate - $tax
    $delta = $netNeeded - $netCash
    if ([Math]::Abs($delta) -lt 1) { break }
    $grossEstimate = [Math]::Min($state.balance, $grossEstimate + $delta)
  }

  $gainRatio = if ($state.balance -gt 0) { [Math]::Max(0, ($state.balance - $state.costBasis) / $state.balance) } else { 0 }
  $grossWithdrawal = [Math]::Min($state.balance, $grossEstimate)
  $realizedGain = $grossWithdrawal * $gainRatio
  $tax = $realizedGain * $taxRate
  $netCash = $grossWithdrawal - $tax
  $previousBalance = $state.balance
  $previousCostBasis = $state.costBasis
  $costBasisReduction = if ($previousBalance -gt 0) { $previousCostBasis * ($grossWithdrawal / $previousBalance) } else { 0 }
  $state.balance = [Math]::Max(0, $previousBalance - $grossWithdrawal)
  $state.costBasis = [Math]::Max(0, $previousCostBasis - $costBasisReduction)

  return @{
    grossWithdrawal = $grossWithdrawal
    netCash = $netCash
    realizedGain = $realizedGain
    tax = $tax
  }
}

function Get-IdecoPension([int]$age, [hashtable]$state, $inputs, [string]$strategy, [double]$publicPensionGross) {
  if ($age -lt $inputs.idecoStartAge -or $state.idecoBalance -le 0) { return 0 }
  if ($strategy -eq "ideco-lump-sum") { return 0 }
  if ($strategy -eq "taxable-first") {
    if ($state.taxable.balance -gt 0) { return 0 }
    $remainingYears = [Math]::Max(1, $inputs.idecoPensionYears - $state.idecoPensionYearsTaken)
    return [Math]::Min($state.idecoBalance, $state.idecoBalance / $remainingYears)
  }
  if ($strategy -eq "ideco-pension-first") {
    $remainingYears = [Math]::Max(1, $inputs.idecoPensionYears - $state.idecoPensionYearsTaken)
    return [Math]::Min($state.idecoBalance, $state.idecoBalance / $remainingYears)
  }
  $targetGross = if ($age -ge 65) { $inputs.pensionTargetGross } else { [Math]::Min($inputs.pensionTargetGross, 600000) }
  $room = [Math]::Max(0, $targetGross - $publicPensionGross)
  return [Math]::Min($state.idecoBalance, $room)
}

function Simulate-Strategy($baseInputs, [string]$strategy, [string]$filingMode) {
  $inputs = @{}
  foreach ($key in $baseInputs.Keys) { $inputs[$key] = $baseInputs[$key] }
  $inputs.taxFilingMode = $filingMode

  $state = @{
    cashBalance = $inputs.cashBalance
    idecoBalance = $inputs.idecoBalance
    taxable = @{
      balance = $inputs.taxableBalance
      costBasis = [Math]::Min($inputs.taxableCostBasis, $inputs.taxableBalance)
    }
    idecoPensionYearsTaken = 0
    idecoLumpSumUsed = $false
  }

  $rows = @()

  for ($age = $inputs.retirementAge; $age -le $inputs.endAge; $age++) {
    $state.idecoBalance *= (1 + $inputs.growthRate)
    $state.taxable.balance *= (1 + $inputs.growthRate)

    $spending = $inputs.annualSpending
    $nationalPensionPayment = if ($age -le $inputs.nationalPensionEndAge) { $inputs.nationalPensionAnnual } else { 0 }
    $publicPensionGross = if ($age -ge $inputs.publicPensionStartAge) {
      [Math]::Round($inputs.publicPensionAnnual * [Math]::Pow(1 + $inputs.publicPensionGrowthRate, $age - $inputs.publicPensionStartAge))
    } else { 0 }

    $idecoLumpSumGross = 0
    $idecoLumpIncomeTax = 0
    $idecoLumpResidentTax = 0
    if (-not $state.idecoLumpSumUsed -and $strategy -eq "ideco-lump-sum" -and $age -ge $inputs.idecoStartAge -and $state.idecoBalance -gt 0) {
      $idecoLumpSumGross = $state.idecoBalance
      $lumpTaxable = Get-RetirementIncomeTaxable $idecoLumpSumGross $inputs.idecoServiceYears
      $idecoLumpIncomeTax = Get-IncomeTax $lumpTaxable
      $idecoLumpResidentTax = Get-ResidentTax $lumpTaxable
      $state.idecoBalance = 0
      $state.idecoLumpSumUsed = $true
    }

    $idecoBalanceAtStart = $state.idecoBalance
    $idecoPensionGross = Get-IdecoPension $age @{
      idecoBalance = $idecoBalanceAtStart
      taxable = $state.taxable
      idecoPensionYearsTaken = $state.idecoPensionYearsTaken
    } $inputs $strategy $publicPensionGross

    for ($iteration = 0; $iteration -lt 8; $iteration++) {
      $pensionGrossTotal = $publicPensionGross + $idecoPensionGross
      $pensionMiscIncome = Get-PublicPensionIncome $pensionGrossTotal $age $inputs.otherIncome
      $ordinaryIncome = $pensionMiscIncome + $inputs.otherIncome
      $taxableIncome = [Math]::Max(0, $ordinaryIncome - (Get-BasicDeduction $ordinaryIncome) - $inputs.otherDeductions)
      $incomeTax = Get-IncomeTax $taxableIncome
      $residentTaxBase = [Math]::Max(0, $ordinaryIncome - 430000)
      $residentTax = Get-ResidentTax $residentTaxBase
      $cashInflowsBeforeSale = $inputs.otherIncome + $publicPensionGross + $idecoPensionGross + $idecoLumpSumGross
      $cashOutflowsExcludingSale = $spending + $nationalPensionPayment + $incomeTax + $residentTax + $idecoLumpIncomeTax + $idecoLumpResidentTax

      $workingTaxable = @{
        balance = $state.taxable.balance
        costBasis = $state.taxable.costBasis
      }
      $taxableSaleNet = 0
      $realizedGain = 0
      $insurance = 0

      for ($count = 0; $count -lt 8; $count++) {
        $insuranceBase = $ordinaryIncome + $(if ($filingMode -eq "separate") { $realizedGain } else { 0 })
        $insurance = (Get-InsuranceBreakdown $age $insuranceBase $inputs).amount
        $availableCash = $state.cashBalance + $cashInflowsBeforeSale + $taxableSaleNet - $cashOutflowsExcludingSale - $insurance
        $needed = [Math]::Max(0, -$availableCash)
        if ($needed -le 1 -or $workingTaxable.balance -le 0) { break }
        $sale = Withdraw-Taxable $workingTaxable $needed
        $taxableSaleNet += $sale.netCash
        $realizedGain += $sale.realizedGain
      }

      $insuranceBase = $ordinaryIncome + $(if ($filingMode -eq "separate") { $realizedGain } else { 0 })
      $insurance = (Get-InsuranceBreakdown $age $insuranceBase $inputs).amount
      $endingCash = $state.cashBalance + $cashInflowsBeforeSale + $taxableSaleNet - $cashOutflowsExcludingSale - $insurance
      if ([Math]::Abs($endingCash) -le 10) { $endingCash = 0 }
      $remainingIdeco = [Math]::Max(0, $idecoBalanceAtStart - $idecoPensionGross)

      if ($endingCash -ge -1 -or $remainingIdeco -le 0 -or $age -lt $inputs.idecoStartAge -or $strategy -eq "ideco-lump-sum") {
        $state.taxable = $workingTaxable
        $state.cashBalance = $endingCash
        break
      }

      $idecoPensionGross += [Math]::Min($remainingIdeco, [Math]::Ceiling((-$endingCash) / 0.8))
    }

    $state.idecoBalance = [Math]::Max(0, $idecoBalanceAtStart - $idecoPensionGross)
    if ($idecoPensionGross -gt 0) { $state.idecoPensionYearsTaken += 1 }

    $totalEndAssets = $state.cashBalance + $state.idecoBalance + $state.taxable.balance
    $rows += [pscustomobject]@{
      age = $age
      cash = $state.cashBalance
      total = $totalEndAssets
    }
  }

  return $rows
}

$testCases = @(
  @{ name = "base"; values = @{} }
  @{ name = "low-cash"; values = @{ cashBalance = 2000000 } }
  @{ name = "high-spend"; values = @{ annualSpending = 4200000 } }
  @{ name = "late-pension"; values = @{ publicPensionStartAge = 68 } }
  @{ name = "high-growth"; values = @{ growthRate = 0.07 } }
  @{ name = "low-growth"; values = @{ growthRate = 0.01 } }
  @{ name = "small-taxable"; values = @{ taxableBalance = 8000000; taxableCostBasis = 6000000 } }
  @{ name = "large-ideco"; values = @{ idecoBalance = 20000000 } }
  @{ name = "high-pension"; values = @{ publicPensionAnnual = 2400000 } }
  @{ name = "long-longevity"; values = @{ endAge = 100 } }
)

$results = @()
foreach ($case in $testCases) {
  $inputs = @{}
  foreach ($key in $defaultValues.Keys) { $inputs[$key] = $defaultValues[$key] }
  foreach ($key in $case.values.Keys) { $inputs[$key] = $case.values[$key] }

  foreach ($strategy in $strategies) {
    foreach ($filingMode in $filingModes) {
      $rows = Simulate-Strategy $inputs $strategy $filingMode
      $badRow = $rows | Where-Object { $_.total -gt 0 -and $_.cash -lt 0 } | Select-Object -First 1
      $results += [pscustomobject]@{
        case = $case.name
        strategy = $strategy
        filing = $filingMode
        status = if ($badRow) { "FAIL" } else { "PASS" }
        age = if ($badRow) { $badRow.age } else { $null }
        cash = if ($badRow) { [math]::Round($badRow.cash) } else { $null }
        total = if ($badRow) { [math]::Round($badRow.total) } else { $null }
      }
    }
  }
}

$results | Format-Table -AutoSize
$failures = $results | Where-Object { $_.status -eq "FAIL" }
if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Failures detected: $($failures.Count)"
  exit 1
}

Write-Host ""
Write-Host "All test patterns passed."
