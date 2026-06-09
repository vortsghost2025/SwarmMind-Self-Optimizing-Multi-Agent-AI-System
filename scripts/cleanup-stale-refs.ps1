[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = "Continue"
$RepoRoot = "S:/SwarmMind"
$LogFile = Join-Path $RepoRoot "logs/cleanup-stale-refs-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$Summary = @{
    BranchesDeleted  = 0
    BranchesFailed   = 0
    BranchesSkipped  = 0
    PruneOk          = $false
    LooseRefsRemoved = 0
    ReportsArchived  = 0
    TmpRemoved       = $false
    Errors           = [System.Collections.Generic.List[string]]::new()
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
    $line = "[$ts] [$Level] $Message"
    Write-Host $line
    try {
        $logDir = Split-Path $LogFile -Parent
        if (-not (Test-Path $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        }
        Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
    } catch {}
}

Write-Log "=== cleanup-stale-refs.ps1 START ==="

# --- Step 1: Delete stale remote branches ---
$StaleBranches = @(
    "session/agent_96d099d7-d793-459e-9e38-4b6c3fcb643d"
    "session/agent_9fddc379-33f3-4133-b6b3-0ff5b25bae5b"
    "session/agent_e1df3c43-9929-437e-b67e-cd1440dd7189"
    "copilot/audit-self-optimizing-ai-system"
    "master"
)

Write-Log "Step 1: Deleting stale remote branches ($($StaleBranches.Count) branches)"

foreach ($Branch in $StaleBranches) {
    if ($PSCmdlet.ShouldProcess("origin/$Branch", "Delete remote branch")) {
        Write-Log "  Deleting remote branch: origin/$Branch"
        try {
            $output = git -C $RepoRoot push origin --delete $Branch 2>&1
            $exitCode = $LASTEXITCODE
            if ($exitCode -eq 0) {
                Write-Log "    OK: origin/$Branch deleted"
                $Summary.BranchesDeleted++
            } else {
                $outStr = ($output | Out-String).Trim()
                if ($outStr -match "remote ref does not exist" -or $outStr -match "not found" -or $outStr -match "could not delete") {
                    Write-Log "    SKIP: origin/$Branch does not exist on remote ($outStr)"
                    $Summary.BranchesSkipped++
                } else {
                    Write-Log "    FAIL: origin/$Branch - $outStr" -Level "WARN"
                    $Summary.BranchesFailed++
                    $Summary.Errors.Add("Branch delete origin/$Branch : $outStr")
                }
            }
        } catch {
            Write-Log "    ERROR: origin/$Branch - $($_.Exception.Message)" -Level "ERROR"
            $Summary.BranchesFailed++
            $Summary.Errors.Add("Branch delete origin/$Branch : $($_.Exception.Message)")
        }
    } else {
        Write-Log "  WHATIF: Would delete remote branch origin/$Branch"
        $Summary.BranchesSkipped++
    }
}

# --- Step 2: Prune stale remote-tracking refs ---
Write-Log "Step 2: Pruning stale remote-tracking refs"

if ($PSCmdlet.ShouldProcess("origin", "git remote prune")) {
    try {
        $output = git -C $RepoRoot remote prune origin 2>&1
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) {
            Write-Log "  OK: remote prune origin completed"
            $outStr = ($output | Out-String).Trim()
            if ($outStr) { Write-Log "  Output: $outStr" }
            $Summary.PruneOk = $true
        } else {
            $outStr = ($output | Out-String).Trim()
            Write-Log "  FAIL: remote prune origin - $outStr" -Level "WARN"
            $Summary.Errors.Add("remote prune origin: $outStr")
        }
    } catch {
        Write-Log "  ERROR: remote prune origin - $($_.Exception.Message)" -Level "ERROR"
        $Summary.Errors.Add("remote prune origin: $($_.Exception.Message)")
    }
} else {
    Write-Log "  WHATIF: Would run 'git remote prune origin'"
}

# --- Step 3: Manually clean up loose ref files ---
Write-Log "Step 3: Removing loose ref files"

$LooseRefPaths = @(
    @{ Path = "$RepoRoot/.git/refs/remotes/origin/session"; Type = "Directory" }
    @{ Path = "$RepoRoot/.git/refs/remotes/origin/copilot"; Type = "Directory" }
    @{ Path = "$RepoRoot/.git/refs/remotes/origin/master"; Type = "File" }
)

foreach ($Ref in $LooseRefPaths) {
    $refPath = $Ref.Path
    $refType = $Ref.Type
    if (Test-Path $refPath) {
        if ($PSCmdlet.ShouldProcess($refPath, "Remove $refType")) {
            try {
                if ($refType -eq "Directory") {
                    Remove-Item -Recurse -Force $refPath -ErrorAction Stop
                } else {
                    Remove-Item -Force $refPath -ErrorAction Stop
                }
                Write-Log "  OK: Removed $refType $refPath"
                $Summary.LooseRefsRemoved++
            } catch {
                Write-Log "  ERROR: Failed to remove $refPath - $($_.Exception.Message)" -Level "ERROR"
                $Summary.Errors.Add("Loose ref remove $refPath : $($_.Exception.Message)")
            }
        } else {
            Write-Log "  WHATIF: Would remove $refType $refPath"
        }
    } else {
        Write-Log "  SKIP: $refPath does not exist (already clean)"
    }
}

# --- Step 4: Verify remote branches ---
Write-Log "Step 4: Verifying remote branches"

try {
    $remoteBranches = git -C $RepoRoot branch -r 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
        $branchList = ($remoteBranches | Out-String).Trim()
        Write-Log "  Current remote branches:"
        $branchList -split "`n" | ForEach-Object {
            $trimmed = $_.Trim()
            if ($trimmed) { Write-Log "    $trimmed" }
        }
        $expectedOnly = (($branchList -split "`n").Trim() | Where-Object {
            $_ -and $_ -ne "origin/main" -and $_ -ne "origin/HEAD -> origin/main"
        }).Count
        if ($expectedOnly -eq 0) {
            Write-Log "  OK: Only origin/main and origin/HEAD remain"
        } else {
            Write-Log "  WARN: Additional remote branches detected beyond origin/main" -Level "WARN"
        }
    } else {
        Write-Log "  ERROR: git branch -r failed - ($remoteBranches | Out-String)" -Level "ERROR"
    }
} catch {
    Write-Log "  ERROR: git branch -r - $($_.Exception.Message)" -Level "ERROR"
}

# --- Step 5: Archive unsigned outbox productivity reports ---
Write-Log "Step 5: Archiving unsigned productivity reports"

$OutboxPath = Join-Path $RepoRoot "lanes/swarmmind/outbox"
$ArchivePath = Join-Path $OutboxPath "archive"
$ReportPattern = "productivity-report-*"

$reports = Get-ChildItem -Path $OutboxPath -Filter $ReportPattern -File -ErrorAction SilentlyContinue

if ($reports) {
    Write-Log "  Found $($reports.Count) productivity reports to archive"
    if (-not (Test-Path $ArchivePath)) {
        if ($PSCmdlet.ShouldProcess($ArchivePath, "Create archive directory")) {
            try {
                New-Item -ItemType Directory -Path $ArchivePath -Force | Out-Null
                Write-Log "  OK: Created archive directory $ArchivePath"
            } catch {
                Write-Log "  ERROR: Failed to create archive dir - $($_.Exception.Message)" -Level "ERROR"
                $Summary.Errors.Add("Create archive dir: $($_.Exception.Message)")
            }
        } else {
            Write-Log "  WHATIF: Would create archive directory $ArchivePath"
        }
    }

    foreach ($report in $reports) {
        $destPath = Join-Path $ArchivePath $report.Name
        if (Test-Path $destPath) {
            Write-Log "  SKIP: $($report.Name) already in archive"
            continue
        }
        if ($PSCmdlet.ShouldProcess($report.FullName, "Move to archive")) {
            try {
                Move-Item -Path $report.FullName -Destination $destPath -Force -ErrorAction Stop
                Write-Log "  OK: Archived $($report.Name)"
                $Summary.ReportsArchived++
            } catch {
                Write-Log "  ERROR: Failed to archive $($report.Name) - $($_.Exception.Message)" -Level "ERROR"
                $Summary.Errors.Add("Archive $($report.Name): $($_.Exception.Message)")
            }
        } else {
            Write-Log "  WHATIF: Would move $($report.Name) to archive/"
        }
    }
} else {
    Write-Log "  SKIP: No productivity reports found in outbox (already archived or none exist)"
}

# --- Step 6: Delete temp script directory ---
Write-Log "Step 6: Removing tmp/ directory"

$TmpPath = Join-Path $RepoRoot "tmp"

if (Test-Path $TmpPath) {
    if ($PSCmdlet.ShouldProcess($TmpPath, "Remove directory tree")) {
        try {
            Remove-Item -Recurse -Force $TmpPath -ErrorAction Stop
            Write-Log "  OK: Removed $TmpPath"
            $Summary.TmpRemoved = $true
        } catch {
            Write-Log "  ERROR: Failed to remove $TmpPath - $($_.Exception.Message)" -Level "ERROR"
            $Summary.Errors.Add("Remove tmp/: $($_.Exception.Message)")
        }
    } else {
        Write-Log "  WHATIF: Would remove $TmpPath directory tree"
    }
} else {
    Write-Log "  SKIP: $TmpPath does not exist (already clean)"
}

# --- Summary ---
Write-Log ""
Write-Log "=== SUMMARY ==="
Write-Log "  Remote branches deleted:  $($Summary.BranchesDeleted)"
Write-Log "  Remote branches skipped:  $($Summary.BranchesSkipped)"
Write-Log "  Remote branches failed:   $($Summary.BranchesFailed)"
Write-Log "  Remote prune OK:          $($Summary.PruneOk)"
Write-Log "  Loose refs removed:       $($Summary.LooseRefsRemoved)"
Write-Log "  Productivity reports archived: $($Summary.ReportsArchived)"
Write-Log "  tmp/ directory removed:   $($Summary.TmpRemoved)"
Write-Log "  Errors:                   $($Summary.Errors.Count)"

if ($Summary.Errors.Count -gt 0) {
    Write-Log "  Error details:" -Level "WARN"
    foreach ($err in $Summary.Errors) {
        Write-Log "    - $err" -Level "WARN"
    }
}

Write-Log "=== cleanup-stale-refs.ps1 END ==="
Write-Log "Log file: $LogFile"
