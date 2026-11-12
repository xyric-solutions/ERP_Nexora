<#
  Registers (or updates) a per-user Windows scheduled task that runs
  scripts/start-local.ps1 at logon, so the local Nexora stack is available
  after every restart. Run again after moving the repository.

  Remove with:  Unregister-ScheduledTask -TaskName 'Nexora Local Stack' -Confirm:$false
#>
param([int]$WebPort = 3005)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root 'scripts\start-local.ps1'
$user = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -WebPort $WebPort" `
  -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$trigger.Delay = 'PT20S'
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName 'Nexora Local Stack' -Description 'Starts Nexora ERP (Docker backend + web on 127.0.0.1) at logon.' `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Registered scheduled task 'Nexora Local Stack' for $user (web port $WebPort)."
