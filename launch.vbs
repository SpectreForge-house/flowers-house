' Flower's House CRM - Desktop Launcher
' Starts Electron which manages the server lifecycle

Dim WshShell, fso
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim projectDir
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Check if project directory exists
If Not fso.FolderExists(projectDir) Then
    MsgBox "Project directory not found:" & vbCrLf & projectDir, vbCritical, "Flower's House CRM"
    WScript.Quit
End If

' Check if Electron is installed
Dim electronCmd
electronCmd = projectDir & "\node_modules\.bin\electron.cmd"
If Not fso.FileExists(electronCmd) Then
    MsgBox "Electron not found. Please run: npm install" & vbCrLf & "in the project directory.", vbCritical, "Flower's House CRM"
    WScript.Quit
End If

' Launch Electron from the project directory (it starts the server and opens the window)
WshShell.CurrentDirectory = projectDir
WshShell.Run "cmd /c """ & electronCmd & """ .", 0, False
