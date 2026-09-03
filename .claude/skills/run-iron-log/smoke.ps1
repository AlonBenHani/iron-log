# Iron Log - launch the real PWA and drive it end to end.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/run-iron-log/smoke.ps1
#
# Starts a static server + headless Chrome, logs a workout through the UI,
# checks the Today / Progress screens update, screenshots each step to
# .claude/skills/run-iron-log/shots/, then tears everything down.
# -Keep leaves the server + Chrome running on :8080 / :9222 for iterative
# CDP poking (dot-source cdp-lib.ps1, Connect-CDP, Eval ...).
param(
  [int]$Port = 8080,
  [int]$CdpPort = 9222,
  [switch]$Keep
)
$ErrorActionPreference = "Stop"
$skillDir = $PSScriptRoot
$repo     = (Resolve-Path "$skillDir\..\..\..").Path
$shots    = Join-Path $skillDir "shots"
$profile  = Join-Path $env:TEMP "iron-log-smoke-profile"
Remove-Item $shots -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $shots | Out-Null

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "No Chrome or Edge found." }
Write-Host "browser: $chrome"

function Test-Port($p) { (Test-NetConnection localhost -Port $p -WarningAction SilentlyContinue).TcpTestSucceeded }

$startedServer = $false
if (-not (Test-Port $Port)) {
  Write-Host "starting static server on :$Port"
  Start-Process powershell -WindowStyle Hidden -ArgumentList `
    "-NoProfile","-ExecutionPolicy","Bypass","-File","$skillDir\serve.ps1","-Port","$Port"
  $startedServer = $true
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while (-not (Test-Port $Port) -and $sw.ElapsedMilliseconds -lt 10000) { Start-Sleep -Milliseconds 200 }
  if (-not (Test-Port $Port)) { throw "server did not come up on :$Port" }
}

$startedChrome = $false
if (-not (Test-Port $CdpPort)) {
  Write-Host "launching headless browser (CDP :$CdpPort)"
  Start-Process $chrome -ArgumentList `
    "--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check",`
    "--remote-debugging-port=$CdpPort","--user-data-dir=$profile",`
    "--window-size=430,932","--hide-scrollbars","about:blank"
  $startedChrome = $true
}

. "$skillDir\cdp-lib.ps1"
Connect-CDP -Port $CdpPort

$fail = @()
function Check($label, $cond) {
  if ($cond) { Write-Host "  OK  $label" }
  else { Write-Host "  FAIL $label"; $script:fail += $label }
}

try {
  Write-Host "`n== 1. Load app, reset store =="
  Send-CDP "Page.navigate" @{ url = "http://localhost:$Port/" } | Out-Null
  Check "app mounts" (Wait-For "!!document.querySelector('#app') && document.querySelector('#app').children.length>0")
  Eval "localStorage.clear(); location.reload(); true" | Out-Null
  Wait-For "!!document.querySelector('.exercise-card, .tile, .day-strip')" | Out-Null
  Start-Sleep -Milliseconds 500
  Shot "$shots\01-today.png"
  Check "greeting present" ((Eval "/Good (morning|afternoon|evening)/.test(document.body.innerText)") -eq $true)
  Check "nav has Home/Log/Progress" ((Eval "['Home','Log','Progress'].every(function(t){return document.body.innerText.indexOf(t)>-1})") -eq $true)

  Write-Host "`n== 2. Log a Bench Press workout =="
  Eval "location.hash='#/log'; true" | Out-Null
  Check "picker lists exercises" (Wait-For "!!document.querySelector('.exercise-card')")
  Eval "(function(){var c=Array.from(document.querySelectorAll('.exercise-card')).find(function(e){return /Bench Press/.test(e.innerText)});c&&c.click();return !!c})()" | Out-Null
  Check "log-entry screen opens" (Wait-For "!!document.querySelector('.w-input') && /Bench Press/.test(document.body.innerText)")
  Start-Sleep -Milliseconds 300
  Shot "$shots\02-log-entry.png"
  Eval @"
(function(){
  function set(inp,v){var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(inp,v);inp.dispatchEvent(new Event('input',{bubbles:true}));}
  var r=document.querySelectorAll('.set-row');
  set(r[0].querySelector('.w-input'),'80'); set(r[0].querySelector('.r-input'),'5');
  document.querySelector('.add-set-btn').click();
  var r2=document.querySelectorAll('.set-row');
  set(r2[1].querySelector('.w-input'),'82.5'); set(r2[1].querySelector('.r-input'),'5');
  var f=document.querySelector('.feeling-btn:last-child'); f&&f.click();
  return true;
})()
"@ | Out-Null
  Start-Sleep -Milliseconds 200
  Shot "$shots\03-log-filled.png"
  Eval "document.querySelector('.primary-btn').click(); true" | Out-Null
  Check "returns to Today after save" (Wait-For "location.hash==='#/today' || location.hash===''")
  Start-Sleep -Milliseconds 500
  Shot "$shots\04-today-after-save.png"
  Check "Today shows 1 session this week" ((Eval "/1\s*\/?\s*3|1 exercise logged/.test(document.body.innerText)") -eq $true)

  Write-Host "`n== 3. Progress detail =="
  Eval "location.hash='#/progress'; true" | Out-Null
  Wait-For "!!document.querySelector('.exercise-card')" | Out-Null
  Start-Sleep -Milliseconds 200
  Eval "(function(){var c=Array.from(document.querySelectorAll('.exercise-card')).find(function(e){return /Bench Press/.test(e.innerText)});c&&c.click();return !!c})()" | Out-Null
  Check "detail renders chart + best set" (Wait-For "!!document.querySelector('canvas') && /best top set/i.test(document.body.innerText)")
  Start-Sleep -Milliseconds 500
  Shot "$shots\05-progress-detail.png"
  Check "history row shows the session" ((Eval "/82\.5kg.5/.test(document.body.innerText.replace(/\s+/g,''))") -eq $true)

  Write-Host "`n== 4. Rest timer =="
  Eval "location.hash='#/today'; true" | Out-Null
  Wait-For "/Rest Timer/.test(document.body.innerText)" | Out-Null
  Eval "(function(){var t=Array.from(document.querySelectorAll('*')).find(function(e){return e.children.length===0 && /Tap to set/.test(e.innerText)});t&&t.click();return !!t})()" | Out-Null
  Start-Sleep -Milliseconds 400
  Shot "$shots\06-rest-timer.png"
  Check "timer picker opens" ((Eval "/Start/.test(document.body.innerText)") -eq $true)

  $exc = Get-CDPExceptions
  Check "no uncaught JS exceptions" ($exc.Count -eq 0)
  if ($exc.Count) { $exc | ForEach-Object { Write-Host "    $_" } }
}
finally {
  Disconnect-CDP
  if (-not $Keep) {
    if ($startedChrome) {
      Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" |
        Where-Object { $_.CommandLine -like "*--user-data-dir=$profile*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }
    if ($startedServer) {
      Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
        Where-Object { $_.CommandLine -like "*serve.ps1*-Port*$Port*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }
    Write-Host "`ntore down server + browser"
  } else {
    Write-Host "`n-Keep: server on :$Port and CDP on :$CdpPort still running"
  }
}

Write-Host "`nscreenshots: $shots"
if ($fail.Count) { Write-Host "`nSMOKE FAILED ($($fail.Count)): $($fail -join '; ')"; exit 1 }
Write-Host "`nSMOKE PASSED"
