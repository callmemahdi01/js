(function() {
    'use strict';
    
    if (typeof window === 'undefined') return;
    
    let progressBar, percentText, hideTimeout, isScrolling = false;
    let isInitialized = false;

    const createStyleElement = (content) => {
        const style = document.createElement('style');
        style.textContent = content;
        document.head.appendChild(style);
        return style;
    };

    const addStyles = () => {
        createStyleElement(`
            html, body {
                overflow-x: hidden;
                overflow-y: auto;
                scrollbar-width: none;
                -ms-overflow-style: none;
            }
            
            ::-webkit-scrollbar {
                display: none;
            }
            
            #custom-scroll-progress {
                position: fixed;
                bottom: 0;
                left: 0;
                height: 4px;
                background: linear-gradient(90deg, #4caf50, #45a049);
                width: 0%;
                z-index: 999999;
                transition: width 0.2s ease-out, background-color 0.3s ease;
                box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
                cursor: pointer;
            }
            
            #custom-scroll-percent {
                position: fixed;
                bottom: 5px;
                left: 10px;
                background: rgba(0, 0, 0, 0.85);
                color: white;
                padding: 2px 1px;
                border-radius: 16px;
                font-size: 12px;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 600;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                opacity: 0;
                transform: translateY(15px) scale(0.8);
                pointer-events: none;
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                min-width: 35px;
                text-align: center;
            }
            
            #custom-scroll-percent.visible {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        `);
    };

    const createElements = () => {
        if (progressBar || percentText) return;
        
        progressBar = document.createElement('div');
        progressBar.id = 'custom-scroll-progress';
        
        percentText = document.createElement('div');
        percentText.id = 'custom-scroll-percent';
        percentText.textContent = '0%';
        
        document.body.appendChild(progressBar);
        document.body.appendChild(percentText);
        
        console.log('Custom scrollbar elements created');
    };

    const getScrollMetrics = () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
        const scrollHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight
        );
        const clientHeight = window.innerHeight || document.documentElement.clientHeight;
        return { scrollTop, scrollHeight, clientHeight };
    };

    const getColorByPercent = (percent) => {
        if (percent >= 95) return 'linear-gradient(90deg, #b71c1c, #f44336)';      // قرمز تند
        if (percent >= 85) return 'linear-gradient(90deg, #e53935, #ef5350)';      // قرمز گرم
        if (percent >= 70) return 'linear-gradient(90deg, #fb8c00, #ffa726)';      // نارنجی
        if (percent >= 55) return 'linear-gradient(90deg, #fdd835, #fbc02d)';      // زرد
        if (percent >= 40) return 'linear-gradient(90deg, #4caf50, #388e3c)';      // سبز متوسط
        if (percent >= 25) return 'linear-gradient(90deg, #00acc1, #0097a7)';      // آبی فیروزه‌ای
        if (percent >= 10) return 'linear-gradient(90deg, #2196f3, #1976d2)';      // آبی
        return 'linear-gradient(90deg, #8e24aa, #6a1b9a)';                         // بنفش (شروع یا کم)
    };

    const updateScrollProgress = () => {
        if (!progressBar || !percentText) return;
        
        const { scrollTop, scrollHeight, clientHeight } = getScrollMetrics();
        const docHeight = scrollHeight - clientHeight;
        
        if (docHeight <= 0) {
            progressBar.style.width = '0%';
            percentText.textContent = '0%';
            return;
        }

        const scrollPercent = Math.round(Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)));
        
        progressBar.style.width = `${scrollPercent}%`;
        progressBar.style.background = getColorByPercent(scrollPercent);
        
        // محاسبه موقعیت درصد با در نظر گیری عرض واقعی متن
        const windowWidth = window.innerWidth;
        const progressWidth = (scrollPercent / 100) * windowWidth;
        
        // عرض المان درصد را محاسبه می‌کنیم
        const tempSpan = document.createElement('span');
        tempSpan.textContent = `${scrollPercent}%`;
        tempSpan.style.cssText = `
            position: absolute;
            visibility: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            font-weight: 600;
            padding: 3px 6px;
            white-space: nowrap;
        `;
        document.body.appendChild(tempSpan);
        const textWidth = tempSpan.offsetWidth;
        document.body.removeChild(tempSpan);
        
        // موقعیت مرکز متن نسبت به progress bar
        let centerPosition = progressWidth - (textWidth / 2);
        
        // محدود کردن موقعیت تا از حاشیه‌ها خارج نشود
        const minPosition = 10;
        const maxPosition = windowWidth - textWidth - 10;
        
        centerPosition = Math.max(minPosition, Math.min(maxPosition, centerPosition));
        
        percentText.textContent = `${scrollPercent}%`;
        percentText.style.left = `${centerPosition}px`;
        
        if (!isScrolling) {
            percentText.classList.add('visible');
            isScrolling = true;
        }
        
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            if (percentText) {
                percentText.classList.remove('visible');
            }
            isScrolling = false;
        }, 2000);
    };

    const handleProgressBarClick = (e) => {
        if (!progressBar) return;
        
        const rect = progressBar.getBoundingClientRect();
        const clickPercent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const { scrollHeight, clientHeight } = getScrollMetrics();
        const targetScroll = (clickPercent / 100) * (scrollHeight - clientHeight);
        
        window.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
        });
    };

    const throttle = (func, limit) => {
        let inThrottle;
        return function() {
            if (!inThrottle) {
                func.apply(this, arguments);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    };

    const init = () => {
        if (isInitialized) return;
        
        try {
            addStyles();
            createElements();
            
            const throttledUpdate = throttle(updateScrollProgress, 16);
            
            window.addEventListener('scroll', throttledUpdate, { passive: true });
            window.addEventListener('resize', throttledUpdate, { passive: true });
            
            if (progressBar) {
                progressBar.addEventListener('click', handleProgressBarClick);
            }
            
            setTimeout(updateScrollProgress, 100);
            
            isInitialized = true;
            console.log('Custom scrollbar initialized successfully');
            
        } catch (error) {
            console.error('Error initializing custom scrollbar:', error);
        }
    };

    const waitForDOM = () => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    };

    if (document.body) {
        waitForDOM();
    } else {
        setTimeout(waitForDOM, 50);
    }

    window.removeCustomScrollbar = () => {
        try {
            if (progressBar) {
                progressBar.remove();
                progressBar = null;
            }
            if (percentText) {
                percentText.remove();
                percentText = null;
            }
            
            createStyleElement(`
                html, body {
                    scrollbar-width: auto !important;
                    -ms-overflow-style: auto !important;
                }
                ::-webkit-scrollbar {
                    display: block !important;
                }
            `);
            
            isInitialized = false;
            console.log('Custom scrollbar removed');
            
        } catch (error) {
            console.error('Error removing custom scrollbar:', error);
        }
    };

    window.customScrollbarStatus = () => {
        return {
            initialized: isInitialized,
            elements: {
                progressBar: !!progressBar,
                percentText: !!percentText
            }
        };
    };

})();