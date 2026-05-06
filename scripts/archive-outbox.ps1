$requiredFields = @('schema_version','task_id','idempotency_key','from','to','type','priority','subject','body','timestamp','requires_action','payload','execution','lease','retry','evidence','heartbeat','signature','key_id')
$validTo = @('archivist','library','swarmmind','kernel','broadcast','all')
$validType = @('task','response','heartbeat','escalation','handoff','ack','alert','notification','status')
$signaturePattern = '^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
$keyIdPattern = '^[a-f0-9]{16}$'

$lanes = @(
    @{Name='Archivist'; Path='S:/Archivist-Agent/lanes/archivist/outbox'},
    @{Name='Kernel'; Path='S:/kernel-lane/lanes/kernel/outbox'},
    @{Name='Library'; Path='S:/self-organizing-library/lanes/library/outbox'}
)

foreach ($lane in $lanes) {
    Write-Host "`n=== Processing $($lane.Name) ==="
    $outbox = $lane.Path
    $archive = Join-Path $outbox 'archive'

    # Create archive directory if needed
    if (-not (Test-Path $archive)) {
        New-Item -ItemType Directory -Path $archive | Out-Null
        Write-Host "Created archive directory: $archive"
    }

    # Get all JSON files in outbox root (not recursive)
    $files = Get-ChildItem -Path $outbox -Filter *.json -File
    Write-Host "Found $($files.Count) JSON files"

    $moved = 0
    $kept = 0
    $errors = 0

    foreach ($file in $files) {
        $filePath = $file.FullName
        $fileName = $file.Name

        # Skip files already in archive/
        if ($file.DirectoryName -like "*\archive") {
            continue
        }

        $compliant = $true
        $reason = ""

        try {
            $content = Get-Content $filePath -Raw -ErrorAction Stop
            $json = $content | ConvertFrom-Json -ErrorAction Stop

            # Check all required fields exist
            foreach ($field in $requiredFields) {
                if ($null -eq $json.$field) {
                    $compliant = $false
                    $reason = "Missing field: $field"
                    break
                }
            }

            if ($compliant) {
                # Check schema_version is "1.3"
                if ($json.schema_version -ne '1.3') {
                    $compliant = $false
                    $reason = "schema_version is '$($json.schema_version)', not '1.3'"
                }
                # Check to field is valid
                elseif (-not $validTo.Contains($json.to)) {
                    $compliant = $false
                    $reason = "Invalid 'to' value: $($json.to)"
                }
                # Check type field is valid
                elseif (-not $validType.Contains($json.type)) {
                    $compliant = $false
                    $reason = "Invalid 'type' value: $($json.type)"
                }
                # Check signature format
                elseif ($json.signature -notmatch $signaturePattern) {
                    $compliant = $false
                    $reason = "Invalid signature format"
                }
                # Check key_id format
                elseif ($json.key_id -notmatch $keyIdPattern) {
                    $compliant = $false
                    $reason = "Invalid key_id format (expected 16 hex chars)"
                }
            }
        }
        catch {
            $compliant = $false
            $reason = "JSON parse error: $_"
            $errors++
        }

        if ($compliant) {
            Write-Verbose "COMPLIANT: $fileName"
            $kept++
        }
        else {
            $dest = Join-Path $archive $fileName
            Move-Item -Path $filePath -Destination $dest -Force
            Write-Host "MOVED: $fileName -> archive/ ($reason)"
            $moved++
        }
    }

    Write-Host "Results: Kept=$kept, Moved to archive=$moved, Errors=$errors"
}
