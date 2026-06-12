$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

$sizes = [ordered]@{
    "64 x 64 - tiny icon" = 64
    "96 x 96 - small avatar" = 96
    "128 x 128 - thumbnail" = 128
    "192 x 192 - compact portrait" = 192
    "256 x 256 - standard portrait" = 256
    "384 x 384 - large portrait" = 384
    "512 x 512 - original square" = 512
    "1024 x 1024 - high resolution" = 1024
}

function Select-ImageFiles {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "Select image files to convert"
    $dialog.Filter = "Image files|*.png;*.jpg;*.jpeg;*.bmp;*.tif;*.tiff;*.webp|All files|*.*"
    $dialog.Multiselect = $true
    $dialog.CheckFileExists = $true
    $dialog.RestoreDirectory = $true

    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        exit 0
    }

    return $dialog.FileNames
}

function Select-OutputFolder {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "Select output folder, then click Open"
    $dialog.Filter = "Folders|*.folder"
    $dialog.FileName = "Save converted images here"
    $dialog.CheckFileExists = $false
    $dialog.ValidateNames = $false
    $dialog.RestoreDirectory = $true

    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        exit 0
    }

    return [System.IO.Path]::GetDirectoryName($dialog.FileName)
}

function Select-Size {
    param([System.Collections.Specialized.OrderedDictionary]$SizeOptions)

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Choose output size"
    $form.Width = 390
    $form.Height = 170
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false

    $label = New-Object System.Windows.Forms.Label
    $label.Text = "Select target square size:"
    $label.Left = 12
    $label.Top = 15
    $label.Width = 340

    $combo = New-Object System.Windows.Forms.ComboBox
    $combo.Left = 12
    $combo.Top = 40
    $combo.Width = 350
    $combo.DropDownStyle = "DropDownList"
    [void]$combo.Items.AddRange([string[]]$SizeOptions.Keys)
    $combo.SelectedItem = "256 x 256 - standard portrait"

    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = "Convert"
    $ok.Left = 207
    $ok.Top = 82
    $ok.Width = 75
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK

    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = "Cancel"
    $cancel.Left = 287
    $cancel.Top = 82
    $cancel.Width = 75
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

    $form.Controls.AddRange(@($label, $combo, $ok, $cancel))
    $form.AcceptButton = $ok
    $form.CancelButton = $cancel

    if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        exit 0
    }

    return $SizeOptions[[string]$combo.SelectedItem]
}

function Get-PythonCommand {
    $candidates = @(
        (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"),
        "py",
        "python"
    )

    foreach ($candidate in $candidates) {
        try {
            if ($candidate -like "*.exe" -and -not (Test-Path -LiteralPath $candidate)) {
                continue
            }

            & $candidate -c "import sys; print(sys.executable)" 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        }
        catch {
        }
    }

    return $null
}

$files = Select-ImageFiles
$output = Select-OutputFolder
$size = Select-Size $sizes
$python = Get-PythonCommand

if (-not $python) {
    [System.Windows.Forms.MessageBox]::Show(
        "Python was not found. Install Python, or edit this script to point at python.exe.",
        "Converter setup needed",
        "OK",
        "Error"
    ) | Out-Null
    exit 1
}

& $python -c "from PIL import Image" 2>$null
if ($LASTEXITCODE -ne 0) {
    [System.Windows.Forms.MessageBox]::Show(
        "The selected Python does not have Pillow installed. Run: pip install Pillow",
        "Converter setup needed",
        "OK",
        "Error"
    ) | Out-Null
    exit 1
}

$fileList = Join-Path $env:TEMP ("convert_images_to_webp_files_" + [guid]::NewGuid().ToString("N") + ".txt")
$converter = Join-Path $env:TEMP ("convert_images_to_webp_" + [guid]::NewGuid().ToString("N") + ".py")

$files | Set-Content -LiteralPath $fileList -Encoding UTF8

$pythonCode = @'
from pathlib import Path
from PIL import Image, ImageOps
import os
import sys
import time

file_list = Path(sys.argv[1])
output = Path(sys.argv[2])
size = int(sys.argv[3])
quality = 80

output.mkdir(parents=True, exist_ok=True)
files = [Path(line.strip()) for line in file_list.read_text(encoding='utf-8').splitlines() if line.strip()]
start = time.time()
converted = 0
failed = []

print(f'Output: {output}')
print(f'Target: {size}x{size} WebP, quality {quality}')
print(f'Found {len(files)} image(s).')
print()

for i, src in enumerate(files, 1):
    dst = output / (src.stem + '.webp')
    tmp = dst.with_suffix(dst.suffix + '.tmp')

    try:
        if tmp.exists():
            tmp.unlink()

        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            has_alpha = im.mode in ('RGBA', 'LA') or ('transparency' in im.info)
            im = im.convert('RGBA' if has_alpha else 'RGB')
            im = im.resize((size, size), Image.Resampling.BICUBIC)
            im.save(tmp, 'WEBP', quality=quality)

        os.replace(tmp, dst)
        converted += 1
    except Exception as exc:
        failed.append((str(src), repr(exc)))
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass

    if i % 100 == 0 or i == len(files):
        elapsed = time.time() - start
        print(f'Processed {i}/{len(files)} | converted={converted} failed={len(failed)} | {elapsed:.1f}s', flush=True)

print()
print(f'DONE converted={converted} failed={len(failed)} elapsed={time.time() - start:.1f}s')

if failed:
    print()
    print('Failures:')
    for path, err in failed[:50]:
        print(f'{path}: {err}')
    sys.exit(1)
'@

Set-Content -LiteralPath $converter -Value $pythonCode -Encoding UTF8

try {
    $arguments = @(
        "/k",
        "`"$python`" `"$converter`" `"$fileList`" `"$output`" `"$size`""
    )
    Start-Process -FilePath "cmd.exe" -ArgumentList $arguments -Wait
}
finally {
    Remove-Item -LiteralPath $converter -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $fileList -Force -ErrorAction SilentlyContinue
}
