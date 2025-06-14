/**
 * Content Protection Module v2.3 - iFrame Fix & AnnotationApp Compatible
 * Final version with iFrame false-positive detection fixed.
 */

(function(global) {
    'use strict';

    class ContentProtection {
        constructor(options = {}) {
            this.config = {
                disableRightClick: true,
                disableTextSelection: true,
                disableKeyboardShortcuts: true,
                disableDevTools: true,
                blurOnFocus: true,
                warningMessage: 'این محتوا محافظت شده است!',
                redirectUrl: null,
                autoInit: true,
                ...options
            };

            this.isDevToolsOpen = false;

            if (this.config.autoInit) {
                this.init();
            }
        }

        init() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.activate());
            } else {
                this.activate();
            }
            return this;
        }

        activate() {
            this.addStyles();
            this.bindEvents();
            this.setupDevToolsDetection();
            this.overrideConsole();
            return this;
        }

        isAnnotationEvent(e) {
            if (!e || !e.target) return false;
            return !!e.target.closest('#annotationCanvas, #annotationToolsPanel, #masterAnnotationToggleBtn');
        }

        addStyles() {
            const css = `
                body:not(.annotation-active) * {
                    -webkit-user-select: none !important;
                    -moz-user-select: none !important;
                    -ms-user-select: none !important;
                    user-select: none !important;
                    -webkit-touch-callout: none !important;
                    -webkit-tap-highlight-color: transparent !important;
                    -webkit-user-drag: none !important;
                    -khtml-user-drag: none !important;
                    -moz-user-drag: none !important;
                    -o-user-drag: none !important;
                    user-drag: none !important;
                }
                
                input, textarea, [contenteditable] {
                    -webkit-user-select: text !important;
                    -moz-user-select: text !important;
                    user-select: text !important;
                }
                
                ::selection { background: transparent !important; }
                ::-moz-selection { background: transparent !important; }
                ::-webkit-scrollbar { display: none !important; }
                
                img, video, canvas:not(#annotationCanvas) {
                    pointer-events: none !important;
                }

                #annotationToolsPanel, #annotationToolsPanel *, #masterAnnotationToggleBtn {
                    -webkit-user-select: auto !important;
                    -moz-user-select: auto !important;
                    -ms-user-select: auto !important;
                    user-select: auto !important;
                }
            `;

            const style = document.createElement('style');
            style.id = "contentProtectionStyles";
            style.textContent = css;
            document.head.appendChild(style);
        }

        bindEvents() {
            if (this.config.disableRightClick) {
                document.addEventListener('contextmenu', e => {
                    if (this.isAnnotationEvent(e)) return;
                    e.preventDefault();
                    return false;
                });
            }

            if (this.config.disableKeyboardShortcuts) {
                document.addEventListener('keydown', e => this.handleKeydown(e));
            }

            this.preventMobileGestures();

            if (this.config.blurOnFocus) {
                this.handleFocusEvents();
            }

            document.addEventListener('dragstart', e => {
                if (this.isAnnotationEvent(e)) return;
                e.preventDefault();
                return false;
            });
        }

        handleKeydown(e) {
            const targetTagName = e.target.tagName.toLowerCase();
            if (document.body.classList.contains('annotation-active') || targetTagName === 'input' || targetTagName === 'textarea' || e.target.isContentEditable) {
                return;
            }

            const blocked = [
                { key: 'a', ctrl: true }, { key: 'c', ctrl: true },
                { key: 's', ctrl: true }, { key: 'p', ctrl: true },
                { key: 'u', ctrl: true }, { key: 'F12' },
                { key: 'I', ctrl: true, shift: true },
                { key: 'J', ctrl: true, shift: true },
                { key: 'PrintScreen' }
            ];

            for (let block of blocked) {
                if (e.key === block.key &&
                    (!block.ctrl || e.ctrlKey) &&
                    (!block.shift || e.shiftKey)) {
                    e.preventDefault();
                    if (block.key === 'PrintScreen') {
                        this.handlePrintScreen();
                    }
                    return false;
                }
            }
        }

        preventMobileGestures() {
            document.addEventListener('touchstart', e => {
                if (this.isAnnotationEvent(e)) return;
                if (e.touches.length > 1) e.preventDefault();
            }, { passive: false });

            document.addEventListener('touchmove', e => {
                if (this.isAnnotationEvent(e)) return;
                if (e.touches.length > 1) e.preventDefault();
            }, { passive: false });

            let longPressTimer;
            document.addEventListener('touchstart', e => {
                if (this.isAnnotationEvent(e)) return;
                longPressTimer = setTimeout(() => {
                    e.preventDefault();
                }, 500);
            });

            document.addEventListener('touchend', () => {
                clearTimeout(longPressTimer);
            });
        }

        handleFocusEvents() {
            const blurContent = () => {
                document.body.style.filter = 'blur(5px)';
                document.body.style.opacity = '0.3';
            };

            const unblurContent = () => {
                document.body.style.filter = 'none';
                document.body.style.opacity = '1';
            };

            window.addEventListener('blur', blurContent);
            window.addEventListener('focus', unblurContent);
            document.addEventListener('visibilitychange', () => {
                document.hidden ? blurContent() : unblurContent();
            });
        }

        handlePrintScreen() {
            document.body.style.visibility = 'hidden';
            setTimeout(() => {
                document.body.style.visibility = 'visible';
            }, 1000);

            if (navigator.clipboard) {
                navigator.clipboard.writeText('محتوا محافظت شده است!').catch(() => {});
            }
        }

        setupDevToolsDetection() {
            // FIX: If inside an iframe, do not run DevTools detection at all.
            if (window.self !== window.top) {
                return; 
            }

            if (!this.config.disableDevTools) return;
            
            const threshold = 160;
            const detect = () => {
                const heightDiff = window.outerHeight - window.innerHeight;
                const widthDiff = window.outerWidth - window.innerWidth;
                if (heightDiff > threshold || widthDiff > threshold) {
                    if (!this.isDevToolsOpen) {
                        this.isDevToolsOpen = true;
                        this.handleDevToolsOpen();
                    }
                } else {
                    this.isDevToolsOpen = false;
                }
            };
            setInterval(detect, 500);
        }

        handleDevToolsOpen() {
            if (this.config.redirectUrl) {
                window.location.href = this.config.redirectUrl;
                return;
            }
            document.body.innerHTML = `
                <div style="
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: #ff0000; color: white; display: flex;
                    justify-content: center; align-items: center;
                    font-size: 24px; z-index: 999999; font-family: Arial, sans-serif;
                ">
                    ${this.config.warningMessage}
                </div>
            `;
        }

        overrideConsole() {
            const methods = ['log', 'info', 'warn', 'error', 'debug', 'table', 'trace'];
            const originalConsole = {};
            methods.forEach(method => {
                originalConsole[method] = console[method];
                console[method] = () => {};
            });

            const clearAndWarn = () => {
                if (document.body.classList.contains('annotation-active')) {
                     return;
                }
                console.clear();
                originalConsole.log('%cSTOP!', 'color: red; font-size: 50px; font-weight: bold;');
                originalConsole.log('%cThis content is protected!', 'color: red; font-size: 16px;');
            };
            setInterval(clearAndWarn, 2000);
        }
        
        getStatus() {
            return {
                textSelection: this.config.disableTextSelection,
                rightClick: this.config.disableRightClick,
                keyboardShortcuts: this.config.disableKeyboardShortcuts,
                devTools: this.config.disableDevTools,
                devToolsDetected: this.isDevToolsOpen
            };
        }

        destroy() {
            document.removeEventListener('contextmenu');
            document.removeEventListener('keydown');
            const styleElement = document.getElementById('contentProtectionStyles');
            if(styleElement) styleElement.remove();
            this.isDevToolsOpen = false;
            return this;
        }
    }

    if (typeof document !== 'undefined') {
        const autoProtection = new ContentProtection();
        global.ContentProtection = ContentProtection;
        global.contentProtection = autoProtection;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ContentProtection;
    }

    if (typeof define === 'function' && define.amd) {
        define([], () => ContentProtection);
    }

})(typeof window !== 'undefined' ? window : this);