Option Explicit

' Magic Imger Windows launcher (no console window).
' Runs GUI via PowerShell in hidden mode.

Dim shell, root, ps1, cmd
Set shell = CreateObject("WScript.Shell")

root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
ps1 = """" & root & "\scripts\run.ps1" & """"

cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & ps1 & " gui"

' 0 = hidden window, False = don't wait
shell.Run cmd, 0, False

