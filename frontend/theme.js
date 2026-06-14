(function () {
    'use strict';

    // --- Theme & CTA Style Management ---
    var _themeMode = 'dark';
    var _ctaButtonStyle = 'blur';
    var _wallpaperBrightness = null;

    function hexToLuminance(hex) {
        if (!hex) return 0;
        hex = String(hex).replace('#', '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) return 0;
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    function extractColorsFromGradient(gradient) {
        return gradient.match(/#[0-9a-fA-F]{3,8}/g) || [];
    }

    function computeAverageBrightnessFromGradient(gradient) {
        var colors = extractColorsFromGradient(gradient);
        if (colors.length === 0) return null;
        var total = 0;
        for (var i = 0; i < colors.length; i++) {
            total += hexToLuminance(colors[i]);
        }
        return total / colors.length;
    }

    function applyTheme(mode) {
        _themeMode = mode;
        document.body.classList.add('theme-transitioning');
        document.body.classList.remove('light-mode', 'adaptive-light');
        if (mode === 'light') {
            document.body.classList.add('light-mode');
        } else if (mode === 'auto' && _wallpaperBrightness !== null) {
            if (_wallpaperBrightness > 0.5) {
                document.body.classList.add('adaptive-light');
            }
        }
        syncOutlineOnLightClass();
        setTimeout(function () {
            document.body.classList.remove('theme-transitioning');
        }, 350);
    }

    function applyCtaStyle(style) {
        _ctaButtonStyle = style;
        document.body.classList.add('theme-transitioning');
        document.body.classList.remove('cta-blur', 'cta-glass', 'cta-solid', 'cta-outline');
        document.body.classList.add('cta-' + style);
        syncOutlineOnLightClass();
        setTimeout(function () {
            document.body.classList.remove('theme-transitioning');
        }, 350);
    }

    function syncOutlineOnLightClass() {
        var isOutline = _ctaButtonStyle === 'outline';
        var isLight = document.body.classList.contains('light-mode') ||
                      document.body.classList.contains('adaptive-light');
        document.body.classList.toggle('outline-on-light', isOutline && isLight);
    }

    function analyzeWallpaperBrightness(imagePath) {
        if (!imagePath) return;
        if (!window.monolithApi) return;
        if (typeof window.monolithApi.analyze_image_brightness !== 'function') return;
        window.monolithApi.analyze_image_brightness(imagePath)
            .then(function (result) {
                _wallpaperBrightness = result && result.success && typeof result.brightness === 'number'
                    ? result.brightness
                    : 0;
                if (_themeMode === 'auto') {
                    applyTheme('auto');
                }
            })
            .catch(function () {
                _wallpaperBrightness = 0;
            });
    }

    function getTerminalLightTheme() {
        return {
            foreground: '#2d2d2d',
            cursor: '#333333',
            selectionBackground: '#c0c0c0',
            black: '#000000',
            red: '#6e3030',
            green: '#306030',
            yellow: '#6e6e30',
            blue: '#30306e',
            magenta: '#6e306e',
            cyan: '#306e6e',
            white: '#808080',
            brightBlack: '#505050',
            brightRed: '#904040',
            brightGreen: '#408040',
            brightYellow: '#909040',
            brightBlue: '#404090',
            brightMagenta: '#904090',
            brightCyan: '#409090',
            brightWhite: '#b0b0b0'
        };
    }

    function getTerminalDarkTheme() {
        return {
            foreground: '#b8b8b8',
            cursor: '#c0c0c0',
            selectionBackground: '#4a4a4a',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#ffffff'
        };
    }

    // Shared-state setters/getters (loadBackgroundConfig/saveBackground in app.js
    // read/write these vars; expose accessors since the vars now live here).
    function setThemeMode(m) { _themeMode = m; }
    function setCtaStyle(s) { _ctaButtonStyle = s; }
    function setWallpaperBrightness(b) { _wallpaperBrightness = b; }
    function getThemeMode() { return _themeMode; }
    function getCtaStyle() { return _ctaButtonStyle; }
    function getWallpaperBrightness() { return _wallpaperBrightness; }

    window.MonolithTheme = {
        applyTheme: applyTheme,
        applyCtaStyle: applyCtaStyle,
        syncOutlineOnLightClass: syncOutlineOnLightClass,
        analyzeWallpaperBrightness: analyzeWallpaperBrightness,
        hexToLuminance: hexToLuminance,
        getTerminalLightTheme: getTerminalLightTheme,
        getTerminalDarkTheme: getTerminalDarkTheme,
        extractColorsFromGradient: extractColorsFromGradient,
        computeAverageBrightnessFromGradient: computeAverageBrightnessFromGradient,
        setThemeMode: setThemeMode,
        setCtaStyle: setCtaStyle,
        setWallpaperBrightness: setWallpaperBrightness,
        getThemeMode: getThemeMode,
        getCtaStyle: getCtaStyle,
        getWallpaperBrightness: getWallpaperBrightness
    };
})();
