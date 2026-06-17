use std::fs;
use std::path::PathBuf;

use super::{expand_env_vars, parse_path};

const MAX_IMAGE_SIZE: u64 = 20 * 1024 * 1024; // 20 MB

#[tauri::command]
pub fn read_image_as_data_url(image_path: String) -> Result<String, String> {
    let expanded = expand_env_vars(&image_path);
    let path = PathBuf::from(&expanded);
    if !path.exists() {
        return Err("Image file not found".into());
    }
    let metadata = fs::metadata(&path).map_err(|e| format!("Cannot read file metadata: {}", e))?;
    if metadata.len() > MAX_IMAGE_SIZE {
        return Err("Image file too large (max 20MB)".into());
    }
    let bytes = fs::read(&path).map_err(|e| format!("Cannot read file: {}", e))?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mime_type = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    };
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime_type, encoded))
}

#[tauri::command]
pub fn analyze_image_brightness(image_path: String) -> Result<f64, String> {
    let path = parse_path(&image_path);
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if ext == "svg" {
        return Err("SVG files are not supported for brightness analysis".into());
    }
    let img = image::open(&path).map_err(|e| format!("Cannot open image: {}", e))?;
    let thumb = img.thumbnail(64, 64);
    let rgba = thumb.to_rgba8();

    let mut total: u64 = 0;
    let mut weight_sum: u64 = 0;

    for pixel in rgba.pixels() {
        let r = pixel[0] as u64;
        let g = pixel[1] as u64;
        let b = pixel[2] as u64;
        let a = pixel[3] as u64;
        let luminance = (299 * r + 587 * g + 114 * b) / 1000;
        total += luminance * a;
        weight_sum += a;
    }

    if weight_sum == 0 {
        return Err("Image is fully transparent — no brightness signal".into());
    }

    Ok(total as f64 / weight_sum as f64 / 255.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fully_transparent_image_is_a_no_signal_error() {
        // Write a 2x2 RGBA PNG where every alpha is 0.
        let dir = std::env::temp_dir().join(format!("monoloth_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("transparent.png");
        // Use the `image` crate to produce a fully transparent RGBA buffer, then save as PNG.
        let mut buf = image::RgbaImage::new(2, 2);
        for px in buf.pixels_mut() {
            *px = image::Rgba([0, 0, 0, 0]);
        }
        buf.save(&path).expect("write png");
        let result = analyze_image_brightness(path.to_string_lossy().to_string());
        let _ = std::fs::remove_dir_all(&dir);
        assert!(result.is_err(), "fully-transparent image must not return 0.0 (would force dark auto theme)");
    }
}


