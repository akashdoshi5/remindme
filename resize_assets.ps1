Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param (
        [string]$InputPath,
        [string]$OutputPath,
        [int]$Width,
        [int]$Height
    )
    
    $fullPath = Resolve-Path $InputPath
    $img = [System.Drawing.Image]::FromFile($fullPath)
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $Width, $Height
    $graph = [System.Drawing.Graphics]::FromImage($bmp)
    
    $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graph.DrawImage($img, 0, 0, $Width, $Height)
    
    # Save to temp file first to avoid GDI+ lock errors
    $tempFile = [System.IO.Path]::GetTempFileName() + ".png"
    $bmp.Save($tempFile, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graph.Dispose()
    $bmp.Dispose()
    $img.Dispose()

    # Overwrite the original
    Move-Item -Path $tempFile -Destination $OutputPath -Force
    
    Write-Host "SUCCESS: Resized $InputPath to $($Width)x$($Height)"
}

$assetsDir = "docs/play_store_assets"
Resize-Image -InputPath "$assetsDir/app_icon_512.png" -OutputPath "$assetsDir/app_icon_512.png" -Width 512 -Height 512
Resize-Image -InputPath "$assetsDir/feature_graphic_1024x500.png" -OutputPath "$assetsDir/feature_graphic_1024x500.png" -Width 1024 -Height 500
