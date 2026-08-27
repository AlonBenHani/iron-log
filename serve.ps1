param([int]$Port = 8080)

$root = $PSScriptRoot
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8';
  '.json' = 'application/json; charset=utf-8'; '.png' = 'image/png'; '.woff2' = 'font/woff2';
  '.ico'  = 'image/x-icon';
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
$listener.Start()
Write-Output "Serving $root on http://0.0.0.0:$Port/ (no admin required)"

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $requestLine = $reader.ReadLine()
    # drain headers
    while (($line = $reader.ReadLine()) -and $line.Trim() -ne '') {}

    $path = '/index.html'
    if ($requestLine -match '^\w+\s+(\S+)\s+HTTP') {
      $reqPath = $matches[1] -replace '\?.*$',''
      if ($reqPath -ne '/') { $path = $reqPath } else { $path = '/index.html' }
    }
    $file = Join-Path $root ($path.TrimStart('/'))

    if (Test-Path $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file)
      $ct = $mime[$ext]
      if (-not $ct) { $ct = 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $header = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-cache, no-store, must-revalidate`r`nPragma: no-cache`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($bytes, 0, $bytes.Length)
    } else {
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
      $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
    }
    $stream.Flush()
  } catch {
  } finally {
    $client.Close()
  }
}
