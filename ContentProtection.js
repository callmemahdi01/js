/**
 * Content Protection Module
 * ماژول محافظت از محتوا در برابر کپی و اسکرین‌شات
 * نسخه: 1.0.0
 */

class ContentProtection {
    constructor(options = {}) {
        this.options = {
            disableRightClick: true,
            disableTextSelection: true,
            disableKeyboardShortcuts: true,
            disableDevTools: true,
            blurOnFocus: true,
            showWarnings: true,
            warningMessage: 'این محتوا محافظت شده است!',
            redirectUrl: null,
            ...options
        };
        
        this.devToolsOpen = false;
        this.init();
    }

    init() {
        this.disableTextSelection();
        this.disableRightClick();
        this.disableKeyboardShortcuts();
        this.preventMobileGestures();
        this.detectDevTools();
        this.handleFocusBlur();
        this.preventPrintScreen();
        this.clearConsole();
        this.addProtectionStyles();
    }

    // غیرفعال کردن انتخاب متن
    disableTextSelection() {
        if (!this.options.disableTextSelection) return;

        const style = document.createElement('style');
        style.textContent = `
            * {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
                -webkit-tap-highlight-color: transparent !important;
            }
            
            input, textarea {
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                user-select: text !important;
            }
        `;
        document.head.appendChild(style);
    }

    // غیرفعال کردن کلیک راست
    disableRightClick() {
        if (!this.options.disableRightClick) return;

        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showWarning('کلیک راست غیرفعال است!');
            return false;
        });
    }

    // غیرفعال کردن کلیدهای میانبر
    disableKeyboardShortcuts() {
        if (!this.options.disableKeyboardShortcuts) return;

        document.addEventListener('keydown', (e) => {
            // Ctrl+A (انتخاب همه)
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                this.showWarning('انتخاب همه غیرفعال است!');
                return false;
            }

            // Ctrl+C (کپی)
            if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                this.showWarning('کپی غیرفعال است!');
                return false;
            }

            // Ctrl+V (پیست)
            if (e.ctrlKey && e.key === 'v') {
                e.preventDefault();
                return false;
            }

            // Ctrl+S (ذخیره)
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.showWarning('ذخیره غیرفعال است!');
                return false;
            }

            // Ctrl+P (پرینت)
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                this.showWarning('چاپ غیرفعال است!');
                return false;
            }

            // F12 (Developer Tools)
            if (e.key === 'F12') {
                e.preventDefault();
                this.handleDevToolsAttempt();
                return false;
            }

            // Ctrl+Shift+I (Developer Tools)
            if (e.ctrlKey && e.shiftKey && e.key === 'I') {
                e.preventDefault();
                this.handleDevToolsAttempt();
                return false;
            }

            // Ctrl+Shift+J (Console)
            if (e.ctrlKey && e.shiftKey && e.key === 'J') {
                e.preventDefault();
                this.handleDevToolsAttempt();
                return false;
            }

            // Ctrl+U (View Source)
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                this.showWarning('مشاهده سورس غیرفعال است!');
                return false;
            }

            // Print Screen
            if (e.key === 'PrintScreen') {
                e.preventDefault();
                this.showWarning('اسکرین‌شات غیرفعال است!');
                return false;
            }
        });
    }

    // جلوگیری از حرکات لمسی در موبایل
    preventMobileGestures() {
        // جلوگیری از زوم با پینچ
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });

        // جلوگیری از تاچ و هولد
        document.addEventListener('touchstart', (e) => {
            const timeout = setTimeout(() => {
                e.preventDefault();
                this.showWarning('تاچ و هولد غیرفعال است!');
            }, 500);

            document.addEventListener('touchend', () => {
                clearTimeout(timeout);
            }, { once: true });
        });

        // جلوگیری از درگ
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });
    }

    // تشخیص باز شدن Developer Tools
    detectDevTools() {
        if (!this.options.disableDevTools) return;

        let threshold = 160;

        const detectDevTools = () => {
            if (window.outerHeight - window.innerHeight > threshold || 
                window.outerWidth - window.innerWidth > threshold) {
                if (!this.devToolsOpen) {
                    this.devToolsOpen = true;
                    this.handleDevToolsOpen();
                }
            } else {
                this.devToolsOpen = false;
            }
        };

        // بررسی هر 500 میلی‌ثانیه
        setInterval(detectDevTools, 500);

        // تشخیص از طریق console
        let devtools = { open: false, orientation: null };
        const threshold2 = 160;

        setInterval(() => {
            if (window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) {
                this.handleDevToolsOpen();
            }

            let heightThreshold = window.outerHeight - window.innerHeight > threshold2;
            let widthThreshold = window.outerWidth - window.innerWidth > threshold2;

            if (!(heightThreshold && widthThreshold) &&
                ((window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) || heightThreshold || widthThreshold)) {
                if (!devtools.open || devtools.orientation !== (heightThreshold ? 'vertical' : 'horizontal')) {
                    devtools.open = true;
                    devtools.orientation = heightThreshold ? 'vertical' : 'horizontal';
                    this.handleDevToolsOpen();
                }
            } else {
                devtools.open = false;
                devtools.orientation = null;
            }
        }, 500);
    }

    // مدیریت باز شدن Developer Tools
    handleDevToolsOpen() {
        if (this.options.redirectUrl) {
            window.location.href = this.options.redirectUrl;
        } else {
            document.body.innerHTML = `
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: #ff0000;
                    color: white;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-size: 24px;
                    z-index: 999999;
                ">
                    ${this.options.warningMessage}
                </div>
            `;
        }
    }

    // مدیریت تلاش برای باز کردن Developer Tools
    handleDevToolsAttempt() {
        this.showWarning('Developer Tools غیرفعال است!');
        if (this.options.redirectUrl) {
            setTimeout(() => {
                window.location.href = this.options.redirectUrl;
            }, 1000);
        }
    }

    // مدیریت فوکوس و blur
    handleFocusBlur() {
        if (!this.options.blurOnFocus) return;

        window.addEventListener('blur', () => {
            document.body.style.filter = 'blur(5px)';
            document.body.style.opacity = '0.3';
        });

        window.addEventListener('focus', () => {
            document.body.style.filter = 'none';
            document.body.style.opacity = '1';
        });

        // تشخیص تغییر tab
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                document.body.style.filter = 'blur(5px)';
                document.body.style.opacity = '0.3';
            } else {
                document.body.style.filter = 'none';
                document.body.style.opacity = '1';
            }
        });
    }

    // جلوگیری از Print Screen
    preventPrintScreen() {
        // هنگامی که کاربر Print Screen می‌زند، محتوا را مخفی کن
        document.addEventListener('keyup', (e) => {
            if (e.key === 'PrintScreen') {
                navigator.clipboard.writeText('محتوا محافظت شده است!');
                this.showWarning('اسکرین‌شات مسدود شد!');
            }
        });

        // مخفی کردن محتوا در زمان Print Screen
        let printScreenPressed = false;
        document.addEventListener('keydown', (e) => {
            if (e.key === 'PrintScreen') {
                printScreenPressed = true;
                document.body.style.visibility = 'hidden';
                setTimeout(() => {
                    document.body.style.visibility = 'visible';
                    printScreenPressed = false;
                }, 1000);
            }
        });
    }

    // پاک کردن console
    clearConsole() {
        const clearConsole = () => {
            console.clear();
            console.log('%cSTOP!', 'color: red; font-size: 50px; font-weight: bold;');
            console.log('%cThis content is protected!', 'color: red; font-size: 16px;');
            console.log('%cاین محتوا محافظت شده است!', 'color: red; font-size: 16px;');
        };

        // پاک کردن console هر ثانیه
        setInterval(clearConsole, 1000);

        // Override console methods
        const noop = () => {};
        console.log = noop;
        console.info = noop;
        console.warn = noop;
        console.error = noop;
        console.debug = noop;
        console.table = noop;
    }

    // اضافه کردن استایل‌های محافظت
    addProtectionStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* جلوگیری از highlighting */
            ::selection {
                background: transparent !important;
            }
            
            ::-moz-selection {
                background: transparent !important;
            }
            
            /* جلوگیری از drag */
            * {
                -webkit-user-drag: none !important;
                -khtml-user-drag: none !important;
                -moz-user-drag: none !important;
                -o-user-drag: none !important;
                user-drag: none !important;
            }
            
            /* جلوگیری از zoom در موبایل */
            meta[name="viewport"] {
                content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" !important;
            }
            
            /* مخفی کردن scrollbar */
            ::-webkit-scrollbar {
                display: none !important;
            }
            
            /* جلوگیری از انتخاب تصاویر */
            img {
                pointer-events: none !important;
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                user-select: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    // نمایش پیام هشدار
    showWarning(message) {
        if (!this.options.showWarnings) return;

        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 999999;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
        `;
        
        const keyframes = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        
        if (!document.querySelector('#protection-keyframes')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'protection-keyframes';
            styleSheet.textContent = keyframes;
            document.head.appendChild(styleSheet);
        }
        
        warning.textContent = message;
        document.body.appendChild(warning);

        setTimeout(() => {
            if (warning.parentNode) {
                warning.parentNode.removeChild(warning);
            }
        }, 3000);
    }

    // غیرفعال کردن محافظت
    disable() {
        // این متد برای غیرفعال کردن محافظت استفاده می‌شود
        // در صورت نیاز می‌توانید پیاده‌سازی کنید
        console.log('Content protection disabled');
    }

    // دریافت وضعیت محافظت
    getStatus() {
        return {
            textSelection: this.options.disableTextSelection,
            rightClick: this.options.disableRightClick,
            keyboardShortcuts: this.options.disableKeyboardShortcuts,
            devTools: this.options.disableDevTools,
            devToolsOpen: this.devToolsOpen
        };
    }
}

// Export برای استفاده به عنوان ماژول
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentProtection;
}

// Export برای ES6 modules
if (typeof window !== 'undefined') {
    window.ContentProtection = ContentProtection;
}

// استفاده خودکار اگر DOM آماده باشد
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // فقط در صورتی که به صورت خودکار نخواهید استفاده کنید، این خط را کامنت کنید
            // new ContentProtection();
        });
    }
}

/* 
نحوه استفاده:

// 1. استفاده ساده:
const protection = new ContentProtection();

// 2. استفاده با تنظیمات سفارشی:
const protection = new ContentProtection({
    disableRightClick: true,
    disableTextSelection: true,
    disableKeyboardShortcuts: true,
    disableDevTools: true,
    blurOnFocus: false,
    showWarnings: true,
    warningMessage: 'محتوا محافظت شده است!',
    redirectUrl: null // یا 'https://example.com'
});

// 3. بررسی وضعیت:
console.log(protection.getStatus());

// 4. غیرفعال کردن:
protection.disable();
*/