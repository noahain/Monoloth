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
    let encoded = base64_encode(&bytes);
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
        return Ok(0.0);
    }

    Ok(total as f64 / weight_sum as f64 / 255.0)
}

fn base64_encode(bytes: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}
