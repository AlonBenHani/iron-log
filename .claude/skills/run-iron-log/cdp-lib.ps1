# Minimal Chrome DevTools Protocol client for Windows PowerShell 5.1.
# No node / python / chromium-cli needed - just a headless Chrome started with
#   --remote-debugging-port=9222
# Dot-source this file, then: Connect-CDP; Eval "1+1"; Shot "x.png"; Disconnect-CDP
$ErrorActionPreference = "Stop"

function Connect-CDP {
  param([int]$Port = 9222, [int]$TimeoutMs = 15000)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $page = $null
  while ($sw.ElapsedMilliseconds -lt $TimeoutMs) {
    try {
      $page = (Invoke-RestMethod "http://localhost:$Port/json" -TimeoutSec 3) |
        Where-Object { $_.type -eq "page" } | Select-Object -First 1
      if ($page) { break }
    } catch { }
    Start-Sleep -Milliseconds 300
  }
  if (-not $page) { throw "CDP: no page target on port $Port" }
  $script:CDP_ws = New-Object System.Net.WebSockets.ClientWebSocket
  $script:CDP_ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  $script:CDP_id = 0
  $script:CDP_exceptions = @()
  Send-CDP "Page.enable"    $null | Out-Null
  Send-CDP "Runtime.enable" $null | Out-Null
  Write-Host "CDP: attached to $($page.url)"
}

function Send-CDP {
  param([string]$Method, $Params)
  $script:CDP_id++; $id = $script:CDP_id
  $payload = @{ id = $id; method = $Method }
  if ($Params) { $payload.params = $Params }
  $buf = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 20 -Compress))
  $script:CDP_ws.SendAsync(
    (New-Object System.ArraySegment[byte] (,$buf)),
    [Net.WebSockets.WebSocketMessageType]::Text, $true,
    [Threading.CancellationToken]::None).Wait()
  while ($true) {
    $sb = New-Object Text.StringBuilder
    do {
      $rbuf = New-Object byte[] 131072
      $res = $script:CDP_ws.ReceiveAsync(
        (New-Object System.ArraySegment[byte] (,$rbuf)),
        [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      [void]$sb.Append([Text.Encoding]::UTF8.GetString($rbuf, 0, $res.Count))
    } while (-not $res.EndOfMessage)
    $obj = $sb.ToString() | ConvertFrom-Json
    if ($obj.id -eq $id) { return $obj }
    if ($obj.method -eq "Runtime.exceptionThrown") {
      $script:CDP_exceptions += ,($obj.params.exceptionDetails.exception.description)
    }
  }
}

# Evaluate JS in the page. Returns the value, or "JS-ERROR: ..." on throw.
function Eval {
  param([string]$Expr)
  $r = Send-CDP "Runtime.evaluate" @{ expression = $Expr; returnByValue = $true; awaitPromise = $true }
  if ($r.result.exceptionDetails) { return "JS-ERROR: " + $r.result.exceptionDetails.exception.description }
  return $r.result.result.value
}

# Poll a JS boolean expression until true or timeout.
function Wait-For {
  param([string]$Expr, [int]$TimeoutMs = 8000)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.ElapsedMilliseconds -lt $TimeoutMs) {
    if ((Eval $Expr) -eq $true) { return $true }
    Start-Sleep -Milliseconds 150
  }
  return $false
}

# Save a full-page PNG screenshot.
function Shot {
  param([string]$Path)
  $r = Send-CDP "Page.captureScreenshot" @{ format = "png" }
  $dir = Split-Path $Path -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [IO.File]::WriteAllBytes($Path, [Convert]::FromBase64String($r.result.data))
  Write-Host "  shot -> $Path"
}

function Get-CDPExceptions { return $script:CDP_exceptions }

function Disconnect-CDP {
  if ($script:CDP_ws) {
    try {
      $script:CDP_ws.CloseAsync([Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done",
        [Threading.CancellationToken]::None).Wait()
    } catch { }
  }
}
