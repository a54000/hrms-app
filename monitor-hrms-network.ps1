param(
  [int]$IntervalSeconds = 60,
  [int]$Iterations = 0,
  [string]$OutputPath = "$PSScriptRoot\logs\hrms-network-monitor.csv"
)

$ErrorActionPreference = "Continue"

function Get-WifiSignal {
  $info = [ordered]@{
    ssid = ""
    wifi_signal_percent = ""
    wifi_radio = ""
    rx_mbps = ""
    tx_mbps = ""
  }

  try {
    $lines = netsh wlan show interfaces 2>$null
    foreach ($line in $lines) {
      if ($line -match "^\s*SSID\s*:\s*(.+)$" -and $line -notmatch "BSSID") {
        $info.ssid = $matches[1].Trim()
      }
      if ($line -match "^\s*Signal\s*:\s*(\d+)%") {
        $info.wifi_signal_percent = $matches[1]
      }
      if ($line -match "^\s*Radio type\s*:\s*(.+)$") {
        $info.wifi_radio = $matches[1].Trim()
      }
      if ($line -match "^\s*Receive rate \(Mbps\)\s*:\s*(.+)$") {
        $info.rx_mbps = $matches[1].Trim()
      }
      if ($line -match "^\s*Transmit rate \(Mbps\)\s*:\s*(.+)$") {
        $info.tx_mbps = $matches[1].Trim()
      }
    }
  } catch {
    $info.ssid = "wifi-not-detected"
  }

  [pscustomobject]$info
}

function Measure-Ping {
  param(
    [string]$Target,
    [int]$Count = 4
  )

  $times = @()
  try {
    $results = Test-Connection -ComputerName $Target -Count $Count -ErrorAction SilentlyContinue
    foreach ($result in @($results)) {
      if ($null -ne $result.ResponseTime) {
        $times += [double]$result.ResponseTime
      } elseif ($null -ne $result.Latency) {
        $times += [double]$result.Latency
      }
    }
  } catch {
    $times = @()
  }

  $received = $times.Count
  $loss = [math]::Round((($Count - $received) / $Count) * 100, 2)
  $avg = ""
  if ($received -gt 0) {
    $avg = [math]::Round(($times | Measure-Object -Average).Average, 2)
  }

  [pscustomobject]@{
    avg_ms = $avg
    loss_percent = $loss
  }
}

function Measure-Http {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 10
  )

  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
    $watch.Stop()
    [pscustomobject]@{
      status = [int]$response.StatusCode
      ms = [math]::Round($watch.Elapsed.TotalMilliseconds, 0)
      error = ""
    }
  } catch {
    $watch.Stop()
    $message = $_.Exception.Message
    [pscustomobject]@{
      status = ""
      ms = [math]::Round($watch.Elapsed.TotalMilliseconds, 0)
      error = $message
    }
  }
}

function Add-Note {
  param(
    [System.Collections.Generic.List[string]]$Notes,
    [string]$Text
  )
  if (-not [string]::IsNullOrWhiteSpace($Text)) {
    $Notes.Add($Text) | Out-Null
  }
}

$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$count = 0
while ($true) {
  $wifi = Get-WifiSignal
  $pingGoogle = Measure-Ping -Target "8.8.8.8"
  $pingHrms = Measure-Ping -Target "hrms.hrgp.in"
  $pingApi = Measure-Ping -Target "hrms-api.hrgp.in"
  $localApi = Measure-Http -Url "http://127.0.0.1:4000/health"
  $publicApi = Measure-Http -Url "https://hrms-api.hrgp.in/health"
  $localFrontend = Measure-Http -Url "http://127.0.0.1:5173/"
  $publicFrontend = Measure-Http -Url "https://hrms.hrgp.in/"

  $notes = [System.Collections.Generic.List[string]]::new()
  if ($pingGoogle.loss_percent -gt 0 -or $pingHrms.loss_percent -gt 0 -or $pingApi.loss_percent -gt 0) {
    Add-Note $notes "Packet loss detected"
  }
  if ($localApi.ms -ne "" -and $localApi.ms -gt 1000) {
    Add-Note $notes "Local backend is slow"
  }
  if ($publicApi.ms -ne "" -and $publicApi.ms -gt 2000 -and $localApi.ms -ne "" -and $localApi.ms -lt 500) {
    Add-Note $notes "Public API slow while local API is fast; likely tunnel, Wi-Fi, or Internet path"
  }
  if ($publicFrontend.ms -ne "" -and $publicFrontend.ms -gt 3000 -and $localFrontend.ms -ne "" -and $localFrontend.ms -lt 800) {
    Add-Note $notes "Public frontend slow while local frontend is fast; likely tunnel, Wi-Fi, or Internet path"
  }
  if ($wifi.wifi_signal_percent -ne "" -and [int]$wifi.wifi_signal_percent -lt 60) {
    Add-Note $notes "Weak Wi-Fi signal"
  }

  $row = [pscustomobject]@{
    timestamp_ist = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    ssid = $wifi.ssid
    wifi_signal_percent = $wifi.wifi_signal_percent
    wifi_radio = $wifi.wifi_radio
    rx_mbps = $wifi.rx_mbps
    tx_mbps = $wifi.tx_mbps
    ping_google_avg_ms = $pingGoogle.avg_ms
    ping_google_loss_percent = $pingGoogle.loss_percent
    ping_hrms_avg_ms = $pingHrms.avg_ms
    ping_hrms_loss_percent = $pingHrms.loss_percent
    ping_api_host_avg_ms = $pingApi.avg_ms
    ping_api_host_loss_percent = $pingApi.loss_percent
    local_api_status = $localApi.status
    local_api_ms = $localApi.ms
    public_api_status = $publicApi.status
    public_api_ms = $publicApi.ms
    local_frontend_status = $localFrontend.status
    local_frontend_ms = $localFrontend.ms
    public_frontend_status = $publicFrontend.status
    public_frontend_ms = $publicFrontend.ms
    notes = ($notes -join "; ")
  }

  if (Test-Path -LiteralPath $OutputPath) {
    $row | ConvertTo-Csv -NoTypeInformation | Select-Object -Skip 1 | Add-Content -Path $OutputPath
  } else {
    $row | ConvertTo-Csv -NoTypeInformation | Set-Content -Path $OutputPath
  }

  Write-Host ("{0} | Wi-Fi {1}% | local API {2}ms | public API {3}ms | public app {4}ms | {5}" -f $row.timestamp_ist, $row.wifi_signal_percent, $row.local_api_ms, $row.public_api_ms, $row.public_frontend_ms, $row.notes)

  $count += 1
  if ($Iterations -gt 0 -and $count -ge $Iterations) {
    break
  }

  Start-Sleep -Seconds $IntervalSeconds
}
