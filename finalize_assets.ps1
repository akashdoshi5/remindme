Add-Type -AssemblyName System.Drawing

function Finalize-Play-Store-Assets {
    param (
        [string]$InputPath,
        [string]$IconPath,
        [string]$FeaturePath
    )
    
    $fullPath = Resolve-Path $InputPath
    $img = [System.Drawing.Image]::FromFile($fullPath)
    
    # --- TASK 1: APP ICON (512x512) ---
    $iconBmp = New-Object System.Drawing.Bitmap(512, 512)
    $iconGraph = [System.Drawing.Graphics]::FromImage($iconBmp)
    $iconGraph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $iconGraph.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # Fill with background color from corner
    $sampleBmp = New-Object System.Drawing.Bitmap($img)
    $bgColor = $sampleBmp.GetPixel(5, 5)
    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $iconGraph.FillRectangle($brush, 0, 0, 512, 512)
    
    # Scale to fit nicely in the 512x512 (with padding)
    $iconPadding = 40
    $iconSize = 512 - ($iconPadding * 2)
    $scale = $iconSize / [Math]::Max($img.Width, $img.Height)
    $newW = [int]($img.Width * $scale)
    $newH = [int]($img.Height * $scale)
    $posX = [int]((512 - $newW) / 2)
    $posY = [int]((512 - $newH) / 2)
    
    $iconGraph.DrawImage($img, $posX, $posY, $newW, $newH)
    $iconBmp.Save($IconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "SUCCESS: Created Final App Icon (512x512)"
    
    # --- TASK 2: FEATURE GRAPHIC (1024x500) ---
    $featBmp = New-Object System.Drawing.Bitmap(1024, 500)
    $featGraph = [System.Drawing.Graphics]::FromImage($featBmp)
    $featGraph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $featGraph.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # Fill background
    $featGraph.FillRectangle($brush, 0, 0, 1024, 500)
    
    # Scale design to fit height (with some breathing room)
    $featH = 400
    $scaleF = $featH / $img.Height
    $newWF = [int]($img.Width * $scaleF)
    $posXF = [int]((1024 - $newWF) / 2)
    $posYF = [int]((500 - $featH) / 2)
    
    $featGraph.DrawImage($img, $posXF, $posYF, $newWF, $featH)
    $featBmp.Save($FeaturePath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "SUCCESS: Created Final Feature Graphic (1024x500)"
    
    # Cleanup
    $iconGraph.Dispose()
    $iconBmp.Dispose()
    $featGraph.Dispose()
    $featBmp.Dispose()
    $brush.Dispose()
    $sampleBmp.Dispose()
    $img.Dispose()
}

$prepDir = "docs/play_store_assets"
if (!(Test-Path $prepDir)) { New-Item -ItemType Directory -Path $prepDir }

$srcDesign = "C:/Users/akash/.gemini/antigravity/brain/c9aa171a-8432-4b3b-89c2-caf5524a8f64/media__1770959517328.png"
Finalize-Play-Store-Assets -InputPath $srcDesign -IconPath "$prepDir/app_icon_512.png" -FeaturePath "$prepDir/feature_graphic_1024x500.png"
