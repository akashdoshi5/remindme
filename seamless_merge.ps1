Add-Type -AssemblyName System.Drawing

function Create-Seamless-Graphic {
    param (
        [string]$InputPath,
        [string]$OutputPath,
        [int]$TargetWidth = 1024,
        [int]$TargetHeight = 500
    )
    
    $fullPath = Resolve-Path $InputPath
    $img = [System.Drawing.Image]::FromFile($fullPath)
    
    # Scale to fit height
    $scale = $TargetHeight / $img.Height
    $newWidth = [int]($img.Width * $scale)
    $newHeight = $TargetHeight
    
    $posX = [int](($TargetWidth - $newWidth) / 2)
    
    # Sample background color from edges
    $sampleBmp = New-Object System.Drawing.Bitmap($img)
    $leftColor = $sampleBmp.GetPixel(0, [int]($img.Height / 2))
    $rightColor = $sampleBmp.GetPixel($img.Width - 1, [int]($img.Height / 2))
    
    $bmp = New-Object System.Drawing.Bitmap($TargetWidth, $TargetHeight)
    $graph = [System.Drawing.Graphics]::FromImage($bmp)
    $graph.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    # Fill background with a gradient
    $rect = New-Object System.Drawing.Rectangle(0, 0, $TargetWidth, $TargetHeight)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $leftColor, $rightColor, 0.0)
    $graph.FillRectangle($brush, 0, 0, $TargetWidth, $TargetHeight)
    
    # Draw image
    $graph.DrawImage($img, $posX, 0, $newWidth, $newHeight)
    
    # Feather edges using Pen from System.Drawing
    $fadeWidth = 40
    for ($i = 0; $i -lt $fadeWidth; $i++) {
        $alpha = [int](255 * (1 - ($i / $fadeWidth)))
        
        # Left side feathering
        $cLeft = [System.Drawing.Color]::FromArgb($alpha, $leftColor)
        $pLeft = New-Object System.Drawing.Pen($cLeft, 2) # Use System.Drawing.Pen
        $graph.DrawLine($pLeft, $posX + $i, 0, $posX + $i, $TargetHeight)
        
        # Right side feathering
        $cRight = [System.Drawing.Color]::FromArgb($alpha, $rightColor)
        $pRight = New-Object System.Drawing.Pen($cRight, 2)
        $graph.DrawLine($pRight, ($posX + $newWidth) - $i, 0, ($posX + $newWidth) - $i, $TargetHeight)
        
        $pLeft.Dispose()
        $pRight.Dispose()
    }
    
    $tempFile = [System.IO.Path]::GetTempFileName() + ".png"
    $bmp.Save($tempFile, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graph.Dispose()
    $brush.Dispose()
    $sampleBmp.Dispose()
    $bmp.Dispose()
    $img.Dispose()

    Move-Item -Path $tempFile -Destination $OutputPath -Force
    Write-Host "SUCCESS: Seamless 1024x500 Feature Graphic created."
}

$assetsDir = "docs/play_store_assets"
$sourceImg = "C:/Users/akash/.gemini/antigravity/brain/c9aa171a-8432-4b3b-89c2-caf5524a8f64/media__1770956483776.png"

Create-Seamless-Graphic -InputPath $sourceImg -OutputPath "$assetsDir/feature_graphic_1024x500.png"
