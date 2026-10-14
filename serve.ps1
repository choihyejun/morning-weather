# Minimal static file server (no Python/Node required)
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
param([int]$Port = 8080)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Morning weather app: http://localhost:$Port/"

$types = @{ ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "application/javascript; charset=utf-8"; ".json" = "application/json"; ".png" = "image/png"; ".svg" = "image/svg+xml" }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
  if ($path -eq "") { $path = "index.html" }
  $file = [IO.Path]::GetFullPath((Join-Path $root $path))
  $res = $ctx.Response
  if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $ext = [IO.Path]::GetExtension($file)
    $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
  }
  $res.Close()
}
