Add-Type -AssemblyName System.Drawing

function Resize-With-Padding {
    param (
        [string]$InputPath,
        [string]$OutputPath,
        [int]$TargetWidth,
        [int]$TargetHeight,
        [string]$BgHexColor = "#E0F2FE" # The light blue from our design
    )
    
    $fullPath = Resolve-Path $InputPath
    $img = [System.Drawing.Image]::FromFile($fullPath)
    
    # Calculate aspect ratio
    $ratioX = $TargetWidth / $img.Width
    $ratioY = $TargetHeight / $img.Height
    $ratio = if ($ratioX -lt $ratioY) { $ratioX } else { $ratioY }
    
    $newWidth = [int]($img.Width * $ratio)
    $newHeight = [int]($img.Height * $ratio)
    
    $posX = [int](($TargetWidth - $newWidth) / 2)
    $posY = [int](($TargetHeight - $newHeight) / 2)
    
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $TargetWidth, $TargetHeight
    $graph = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Fill background
    $color = [System.Drawing.ColorTranslator]::FromHtml($BgHexColor)
    $brush = New-Object System.Drawing.SolidBrush($color)
    $graph.FillRectangle($brush, 0, 0, $TargetWidth, $TargetHeight)
    
    $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graph.DrawImage($img, $posX, $posY, $newWidth, $newHeight)
    
    # Save to temp file
    $tempFile = [System.IO.Path]::GetTempFileName() + ".png"
    $bmp.Save($tempFile, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graph.Dispose()
    $bmp.Dispose()
    $img.Dispose()

    # Move to destination
    Move-Item -Path $tempFile -Destination $OutputPath -Force
    Write-Host "SUCCESS: Resized $InputPath to $($TargetWidth)x$($TargetHeight) (Aspect Fit)"
}

$assetsDir = "docs/play_store_assets"

# Icon is square (1024x1024 -> 512x512), no stretching anyway but we'll use same func
Resize-With-Padding -InputPath "C:/Users/akash/.gemini/antigravity/brain/c9aa171a-8432-4b3b-89c2-caf5524a8f64/uploaded_media_1770926265370.png" -OutputPath "$assetsDir/app_icon_512.png" -TargetWidth 512 -TargetHeight 512

# Feature Graphic (640x640 -> 1024x500 padded)
Resize-With-Padding -InputPath "C:/Users/akash/.gemini/antigravity/brain/c9aa171a-8432-4b3b-89c2-caf5524a8f64/media__1770924928702.png" -OutputPath "$assetsDir/feature_graphic_1024x500.png" -TargetWidth 1024 -TargetHeight 500
