$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

# Stop any process currently listening on port 8080 to avoid stale API versions.
$listenerLines = netstat -ano | Select-String ":8080" | Select-String "LISTENING"
foreach ($line in $listenerLines) {
    $parts = ($line -split "\s+") | Where-Object { $_ -ne "" }
    if ($parts.Length -ge 5) {
        $processId = [int]$parts[4]
        if ($processId -gt 0) {
            try {
                Stop-Process -Id $processId -Force -ErrorAction Stop
                Write-Host "Stopped process on port 8080 (PID=$processId)."
            } catch {
                Write-Host "Could not stop PID=$processId (already stopped or access denied)."
            }
        }
    }
}

$javaHome = "c:\DEV\HTKY\oracleJdk-26\bin"
$javac = Join-Path $javaHome "javac.exe"
$java = Join-Path $javaHome "java.exe"

$env:TASK_DB_URL = if ($env:TASK_DB_URL) { $env:TASK_DB_URL } else { "jdbc:postgresql://localhost:5432/postgres" }
$env:TASK_DB_USER = if ($env:TASK_DB_USER) { $env:TASK_DB_USER } else { "postgres" }

if (-not $env:TASK_DB_PASSWORD -or $env:TASK_DB_PASSWORD.Trim() -eq "") {
    $env:TASK_DB_PASSWORD = Read-Host "Enter PostgreSQL password for user '$($env:TASK_DB_USER)'"
}

& $javac -cp ".;lib/postgresql-42.7.5.jar" Main.java controller\TaskController.java service\TaskManager.java repository\DatabaseManager.java model\Task.java model\TaskHistory.java
Write-Host "Compilation OK."

Write-Host "Starting backend..."
& $java -cp ".;lib/postgresql-42.7.5.jar" Main
