Add-Type -AssemblyName System.Drawing

function Create-Feature-Graphic {
    param (
        [string]$InputPath,
        [string]$OutputPath,
        [int]$TargetWidth = 1024,
        [int]$TargetHeight = 500,
        [string]$BgHexStart = "#E0F2FE", # Original light blue
        [string]$BgHexEnd = "#F0F9FF"   # Slightly lighter for a soft gradient
    )
    
    $fullPath = Resolve-Path $InputPath
    $img = [System.Drawing.Image]::FromFile($fullPath)
    
    # Calculate best fit for the clock (keeping it large but not stretched)
    # The clock design is square. We'll fit it to the height (500px) and center it
    $newHeight = $TargetHeight
    $newWidth = [int]($img.Width * ($newHeight / $img.Height))
    
    $posX = [int](($TargetWidth - $newWidth) / 2)
    $posY = 0
    
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $TargetWidth, $TargetHeight
    $graph = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Create a soft gradient background
    $rect = New-Object System.Drawing.Rectangle(0, 0, $TargetWidth, $TargetHeight)
    $c1 = [System.Drawing.ColorTranslator]::FromHtml($BgHexStart)
    $c2 = [System.Drawing.ColorTranslator]::FromHtml($BgHexEnd)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45.0) # 45 degree angle
    $graph.FillRectangle($brush, $rect)
    
    # Draw original image centered
    $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graph.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graph.DrawImage($img, $posX, $posY, $newWidth, $newHeight)
    
    # Save to temp file
    $tempFile = [System.IO.Path]::GetTempFileName() + ".png"
    $bmp.Save($tempFile, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graph.Dispose()
    $brush.Dispose()
    $bmp.Dispose()
    $img.Dispose()

    # Move to destination
    Move-Item -Path $tempFile -Destination $OutputPath -Force
    Write-Host "SUCCESS: Created Feature Graphic at 1024x500 without stretching."
}

$assetsDir = "docs/play_store_assets"
# Using the original 'cute clock' high-res source
Create-Feature-Graphic -InputPath "C:/Users/akash/.gemini/antigravity/brain/c9aa171a-8432-4b3b-89c2-caf5524a8f64/media__1770956483776.png" -OutputPath "$assetsDir/feature_graphic_1024x500.png"
