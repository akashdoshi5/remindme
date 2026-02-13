Add-Type -AssemblyName System.Drawing

function Perfect-Assets {
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
    
    # Icon is square, we'll draw it to fit
    $iconGraph.DrawImage($img, 0, 0, 512, 512)
    $iconBmp.Save($IconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created App Icon at $IconPath (512x512)"
    
    # --- TASK 2: FEATURE GRAPHIC (1024x500) ---
    $featBmp = New-Object System.Drawing.Bitmap(1024, 500)
    $featGraph = [System.Drawing.Graphics]::FromImage($featBmp)
    $featGraph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $featGraph.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # Sample background color (average of edges)
    $sampleBmp = New-Object System.Drawing.Bitmap($img)
    $c = $sampleBmp.GetPixel(10, 10) # Sample top-left corner
    
    # Fill the whole canvas with this color
    $brush = New-Object System.Drawing.SolidBrush($c)
    $featGraph.FillRectangle($brush, 0, 0, 1024, 500)
    
    # Scale clock to fit height (500px)
    $scale = 500 / $img.Height
    $newWidth = [int]($img.Width * $scale)
    $posX = [int]((1024 - $newWidth) / 2)
    
    $featGraph.DrawImage($img, $posX, 0, $newWidth, 500)
    
    $featBmp.Save($FeaturePath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created Feature Graphic at $FeaturePath (1024x500)"
    
    # Cleanup
    $iconGraph.Dispose()
    $iconBmp.Dispose()
    $featGraph.Dispose()
    $featBmp.Dispose()
    $img.Dispose()
}

$source = "C:/Users/akash/.gemini/antigravity/brain/c9aa171a-8432-4b3b-89c2-caf5524a8f64/media__1770956483776.png"
$iconDest = "c:/Users/akash/.gemini/antigravity/scratch/remindmebuddy/docs/play_store_assets/app_icon_512.png"
$featDest = "c:/Users/akash/.gemini/antigravity/scratch/remindmebuddy/docs/play_store_assets/feature_graphic_1024x500.png"

Perfect-Assets -InputPath $source -IconPath $iconDest -FeaturePath $featDest
