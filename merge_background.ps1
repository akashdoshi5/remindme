Add-Type -AssemblyName System.Drawing

function Merge-Background {
    param (
        [string]$InputPath,
        [string]$OutputPath,
        [int]$TargetWidth = 1024,
        [int]$TargetHeight = 500
    )
    
    $fullPath = Resolve-Path $InputPath
    $img = [System.Drawing.Image]::FromFile($fullPath)
    
    # Sample the background color from the corner of the input image
    $sampleBmp = New-Object System.Drawing.Bitmap($img)
    $cornerColor = $sampleBmp.GetPixel(5, 5) # Sample slightly inside the corner
    
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $TargetWidth, $TargetHeight
    $graph = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Fill the entire new canvas with the sampled background color
    $brush = New-Object System.Drawing.SolidBrush($cornerColor)
    $graph.FillRectangle($brush, 0, 0, $TargetWidth, $TargetHeight)
    
    # Calculate dimensions to center the original image
    # We want to maintain aspect ratio and fit the height
    $newHeight = $TargetHeight
    $newWidth = [int]($img.Width * ($newHeight / $img.Height))
    
    $posX = [int](($TargetWidth - $newWidth) / 2)
    $posY = 0
    
    # Draw centered
    $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graph.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graph.DrawImage($img, $posX, $posY, $newWidth, $newHeight)
    
    # Save to temp file
    $tempFile = [System.IO.Path]::GetTempFileName() + ".png"
    $bmp.Save($tempFile, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graph.Dispose()
    $brush.Dispose()
    $sampleBmp.Dispose()
    $bmp.Dispose()
    $img.Dispose()

    # Move to destination
    Move-Item -Path $tempFile -Destination $OutputPath -Force
    Write-Host "SUCCESS: Seamlessly merged background for 1024x500 Feature Graphic."
}

$assetsDir = "docs/play_store_assets"
$sourceImg = "C:/Users/akash/.gemini/antigravity/brain/c9aa171a-8432-4b3b-89c2-caf5524a8f64/media__1770956483776.png"

Merge-Background -InputPath $sourceImg -OutputPath "$assetsDir/feature_graphic_1024x500.png"
