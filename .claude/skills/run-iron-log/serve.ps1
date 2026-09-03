# Static file server for Iron Log. Windows PowerShell 5.1, no dependencies.
# Blocks until the process is killed. Run in the background:
#   Start-Process powershell -Args '-NoProfile','-File','.claude/skills/run-iron-log/serve.ps1' -WindowStyle Hidden
param(
  [string]$Root = (Resolve-Path "$PSScriptRoot\..\..\..").Path,
  [int]$Port = 8080
)
$ErrorActionPreference = "Stop"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "iron-log: serving $Root on http://localhost:$Port/  (Ctrl-C to stop)"

$mime = @{
  ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"
  ".css"="text/css; charset=utf-8";   ".json"="application/json; charset=utf-8"
  ".woff2"="font/woff2"; ".png"="image/png"; ".svg"="image/svg+xml"
  ".ico"="image/x-icon"; ".webmanifest"="application/manifest+json"
}
while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if (!$rel) { $rel = "index.html" }
  $path = Join-Path $Root $rel
  try {
    if (Test-Path $path -PathType Leaf) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      # let sw.js control any scope
      $ctx.Response.Headers.Add("Service-Worker-Allowed", "/")
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $buf = [Text.Encoding]::UTF8.GetBytes("404: $rel")
      $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
    }
  } catch {
    $ctx.Response.StatusCode = 500
  } finally {
    $ctx.Response.OutputStream.Close()
  }
}
