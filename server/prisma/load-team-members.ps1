param(
  [Parameter(Mandatory = $true)]
  [string] $RootDir
)

$ErrorActionPreference = "Stop"

function Normalize-Name($value) {
  if ($null -eq $value) { return "" }
  return [regex]::Replace($value.ToString().ToLowerInvariant(), "[^a-z0-9]", "")
}

function Clean-Cell($value) {
  if ($null -eq $value) { return "" }
  $text = $value.ToString().Trim()
  if ($text -eq "" -or $text -match "^#+$") { return "" }
  if ($text -match "^[0-9]+(\.[0-9]+)?E\+[0-9]+$") {
    return ([decimal]::Parse($text, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture)).ToString("0")
  }
  return $text
}

$csvPath = Join-Path $RootDir "team_members_usernames_emails_2026-05-28.csv"
$salaryPath = Join-Path $RootDir "HRGURU_Salary_Calculator.xlsx"
$teamPath = Join-Path $RootDir "HRGuru - Team.xlsx"

$aliases = @{
  (Normalize-Name "Akansh Pal") = (Normalize-Name "Akansh")
  (Normalize-Name "Ankita") = (Normalize-Name "Ankita Burman")
  (Normalize-Name "Harshita Pruthi") = (Normalize-Name "Harshita")
  (Normalize-Name "Pooja Chouhan") = (Normalize-Name "Pooja Chauhan")
  (Normalize-Name "Priya") = (Normalize-Name "Priya Sonkar")
  (Normalize-Name "Radhika") = (Normalize-Name "Radhika Kela")
  (Normalize-Name "Sandhiya") = (Normalize-Name "Sandhiya S")
  (Normalize-Name "Tadreesa Khatoon") = (Normalize-Name "Tadreesa")
  (Normalize-Name "Vaishnavi Sinha") = (Normalize-Name "Vaishnavi")
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $salaryWorkbook = $excel.Workbooks.Open($salaryPath, $null, $true)
  $salaryRows = @{}
  foreach ($sheetName in @("May-2026", "May-HRGP")) {
    $sheet = $salaryWorkbook.Worksheets.Item($sheetName)
    $used = $sheet.UsedRange
    for ($row = 2; $row -le $used.Rows.Count; $row++) {
      $name = $used.Cells.Item($row, 2).Text
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      $key = Normalize-Name $name
      if (-not $salaryRows.ContainsKey($key)) {
        $salaryRows[$key] = [ordered]@{
          sourceName = Clean-Cell $name
          employeeCode = Clean-Cell $used.Cells.Item($row, 1).Text
          joinDate = Clean-Cell $used.Cells.Item($row, 4).Text
          bankName = Clean-Cell $used.Cells.Item($row, 7).Text
          designation = Clean-Cell $used.Cells.Item($row, 8).Text
          bankAccount = Clean-Cell $used.Cells.Item($row, 9).Text
          pan = Clean-Cell $used.Cells.Item($row, 10).Text
          ifsc = Clean-Cell $used.Cells.Item($row, 11).Text
          ctc = Clean-Cell $used.Cells.Item($row, 17).Text
          monthlySalary = Clean-Cell $used.Cells.Item($row, 30).Text
        }
      }
    }
  }
  $salaryWorkbook.Close($false)

  $teamWorkbook = $excel.Workbooks.Open($teamPath, $null, $true)
  $teamSheet = $teamWorkbook.Worksheets.Item("Team - Email-id_Phone")
  $usedTeam = $teamSheet.UsedRange
  $teamRows = @{}
  for ($row = 2; $row -le $usedTeam.Rows.Count; $row++) {
    $name = $teamSheet.Cells.Item($row, 1).Text
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $teamRows[(Normalize-Name $name)] = [ordered]@{
      sourceName = Clean-Cell $name
      joinDate = Clean-Cell $teamSheet.Cells.Item($row, 2).Text
      phone = Clean-Cell $teamSheet.Cells.Item($row, 5).Text
      location = Clean-Cell $teamSheet.Cells.Item($row, 9).Text
    }
  }
  $teamWorkbook.Close($false)

  $index = 1
  $members = foreach ($member in Import-Csv $csvPath) {
    $key = Normalize-Name $member.username
    $salaryKey = if ($aliases.ContainsKey($key)) { $aliases[$key] } else { $key }
    $teamKey = if ($teamRows.ContainsKey($key)) { $key } elseif ($aliases.ContainsKey($key)) { $aliases[$key] } else { $key }
    $salary = $salaryRows[$salaryKey]
    $team = $teamRows[$teamKey]
    [ordered]@{
      username = Clean-Cell $member.username
      email = Clean-Cell $member.email
      employeeCode = if ($salary.employeeCode) { $salary.employeeCode } else { "HRGPX{0:00}" -f $index }
      fullName = Clean-Cell $member.username
      phone = $team.phone
      designation = if ($salary.designation) { $salary.designation } else { "Recruitment Consultant" }
      department = "Recruitment"
      workLocation = if ($team.location) { $team.location } else { "Gurugram, Haryana" }
      joinDate = if ($team.joinDate) { $team.joinDate } elseif ($salary.joinDate) { $salary.joinDate } else { "2026-05-01" }
      ctc = $salary.ctc
      monthlySalary = $salary.monthlySalary
      pan = $salary.pan
      bankName = $salary.bankName
      bankAccount = $salary.bankAccount
      ifsc = $salary.ifsc
      role = if ($member.username -eq "Surinder Singh") { "admin" } else { "employee" }
    }
    $index++
  }

  $members | ConvertTo-Json -Depth 4
} finally {
  $excel.Quit()
}
