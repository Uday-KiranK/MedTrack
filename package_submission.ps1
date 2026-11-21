# MedTrack Submission Zip Packaging Script
$ProgressPreference = 'SilentlyContinue'
$zipName = "MedTrack_Project_Submission_23BCS072_076_077_096.zip"
Write-Host "Creating $zipName for project submission..."

if (Test-Path $zipName) {
    Remove-Item $zipName -Force
}

# Create a temporary staging directory
$stageDir = "submission_staging"
if (Test-Path $stageDir) {
    Remove-Item -Recurse -Force $stageDir
}
New-Item -ItemType Directory -Path $stageDir | Out-Null

# Copy report and root documentation files
Copy-Item "MedTrack_Mini_Project_Report_Submission.pdf" -Destination $stageDir -ErrorAction SilentlyContinue
Copy-Item "PROCEDURE.md" -Destination $stageDir -ErrorAction SilentlyContinue
Copy-Item "Procedure.txt" -Destination $stageDir -ErrorAction SilentlyContinue
Copy-Item "README.md" -Destination $stageDir -ErrorAction SilentlyContinue

# Copy backend (excluding node_modules)
$backendStage = Join-Path $stageDir "backend"
New-Item -ItemType Directory -Path $backendStage | Out-Null
Copy-Item "backend/package.json" -Destination $backendStage
Copy-Item "backend/package-lock.json" -Destination $backendStage -ErrorAction SilentlyContinue
Copy-Item "backend/.env.example" -Destination $backendStage -ErrorAction SilentlyContinue
Copy-Item "backend/.env" -Destination $backendStage -ErrorAction SilentlyContinue
Copy-Item -Recurse "backend/src" -Destination $backendStage

# Copy frontend (excluding node_modules and .expo)
$frontendStage = Join-Path $stageDir "frontend"
New-Item -ItemType Directory -Path $frontendStage | Out-Null
Copy-Item "frontend/package.json" -Destination $frontendStage
Copy-Item "frontend/package-lock.json" -Destination $frontendStage -ErrorAction SilentlyContinue
Copy-Item "frontend/app.json" -Destination $frontendStage
Copy-Item "frontend/eas.json" -Destination $frontendStage
Copy-Item "frontend/metro.config.js" -Destination $frontendStage -ErrorAction SilentlyContinue
Copy-Item "frontend/App.js" -Destination $frontendStage -ErrorAction SilentlyContinue
Copy-Item "frontend/index.js" -Destination $frontendStage -ErrorAction SilentlyContinue
Copy-Item -Recurse "frontend/src" -Destination $frontendStage
Copy-Item -Recurse "frontend/assets" -Destination $frontendStage

# Zip the staging folder using .NET ZipFile (fast and reliable)
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stageDir, (Join-Path (Get-Location) $zipName), [System.IO.Compression.CompressionLevel]::Optimal, $false)

Remove-Item -Recurse -Force $stageDir

$file = Get-Item $zipName
$sizeMb = [math]::Round($file.Length / 1MB, 2)
Write-Host "Successfully packaged: $zipName ($sizeMb MB)"
