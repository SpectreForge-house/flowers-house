param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectDir
)

$ErrorActionPreference = 'SilentlyContinue'

$resolved = [System.IO.Path]::GetFullPath($ProjectDir).TrimEnd('\')

$processes = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and
    $_.CommandLine.IndexOf($resolved, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    (
        $_.Name -eq 'electron.exe' -or
        $_.Name -eq 'node.exe' -or
        ($_.ExecutablePath -and $_.ExecutablePath.IndexOf($resolved, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
    )
}

foreach ($process in $processes) {
    Write-Output $process.ProcessId
    & "$env:SystemRoot\System32\taskkill.exe" /PID $process.ProcessId /F /T 2>$null | Out-Null
}

$pidFile = Join-Path $resolved '.server.pid'
if (Test-Path -LiteralPath $pidFile) {
    Remove-Item -LiteralPath $pidFile -Force
}
