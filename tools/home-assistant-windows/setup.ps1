# Keeps a Windows laptop running a Home Assistant VM 24/7 with the lid closed.
# Run in an ADMIN PowerShell AFTER you have created the VirtualBox VM (see README.md).
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -VmName HomeAssistant [-CoolMode]
param(
  [string]$VmName = "HomeAssistant",
  [string]$VBox = "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe",
  # Cooler and quieter: cap the CPU at 85% and turn off turbo boost (Home Assistant needs very little).
  [switch]$CoolMode
)

$ErrorActionPreference = "Stop"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this from an Administrator PowerShell."
}
if (-not (Test-Path $VBox)) { throw "VirtualBox not found at $VBox. Install VirtualBox first." }
if (-not (& $VBox list vms | Select-String -SimpleMatch "`"$VmName`"")) { throw "No VirtualBox VM named '$VmName'. Create/import it first." }

Write-Host "This will change this PC's power settings (never sleep, lid close = do nothing) and add a startup task for the '$VmName' VM."
if ((Read-Host "Continue? (y/n)") -ne "y") { exit }

# --- power: never sleep or hibernate, closing the lid does nothing ---------------------------
powercfg /hibernate off
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
# lid close action (0 = do nothing) on battery and on power
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
# USB selective suspend off (keeps a USB Ethernet adapter alive)
powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0
if ($CoolMode) {
  powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 85
  powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 85
  powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PERFBOOSTMODE 0
  powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PERFBOOSTMODE 0
  Write-Host "Cool mode on: CPU capped at 85%, turbo boost off."
}
powercfg /setactive SCHEME_CURRENT
Write-Host "Power settings applied."

# --- start the VM at boot, whether or not anyone is signed in --------------------------------
$cred = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" -Message "Windows password for this account (needed so the task can run while signed out)"
$action  = New-ScheduledTaskAction -Execute $VBox -Argument "startvm `"$VmName`" --type headless"
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT45S"   # let networking come up first
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "Start $VmName VM" -Action $action -Trigger $trigger -Settings $settings `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Highest -Force | Out-Null
Write-Host "Startup task created: 'Start $VmName VM'."

Write-Host ""
Write-Host "Still to do by hand:"
Write-Host " 1. BIOS: set 'AC Recovery' / 'After power loss' to Power On."
Write-Host " 2. Ethernet adapter > Properties > Power Management: untick 'Allow the computer to turn off this device'."
Write-Host " 3. Keep the exhaust vents (usually back/side) clear. On a Dell, Dell Power Manager > Battery > Primarily AC Use lowers battery heat and wear."
Write-Host " 4. Settings > Windows Update > pause updates, or set active hours, so it does not reboot unattended."
