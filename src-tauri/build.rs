fn main() {
  tauri_build::build();

  let msvc_windows = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
    && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
  if msvc_windows {
    println!("cargo::rustc-link-arg=/DELAYLOAD:comctl32.dll");
    println!("cargo::rustc-link-arg=/DEFAULTLIB:delayimp.lib");
  }
}
