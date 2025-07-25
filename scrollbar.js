(function() {
    'use strict';

    if (typeof window === 'undefined') {
        return;
    }

    class ElegantScrollbar {
        constructor() {
            this.elements = {
                progress: null,
                indicator: null,
                style: null,
            };
            this.state = {
                isIndicatorVisible: false,
                isUpdateScheduled: false,
                visibilityTimeout: null,
            };
            this.colorStops = [
                { p: 0,   color: [76, 175, 80] },   // Green
                { p: 50,  color: [255, 235, 59] },  // Yellow
                { p: 85,  color: [255, 152, 0] },   // Orange
                { p: 100, color: [244, 67, 54] },   // Red
            ];

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.init());
            } else {
                this.init();
            }
        }

        init() {
            if (this.elements.progress) return;

            this._injectStyles();
            this._createElements();
            this._addEventListeners();
            this._disableDevTools();
            this._update(); 
        }

        _injectStyles() {
            const css = `
                :root {
                    --scrollbar-height: 4px;
                    --indicator-size: 28px;
                    --indicator-font-size: 12px;
                }
                html {
                    scrollbar-width: none; 
                    -ms-overflow-style: none;
                }
                ::-webkit-scrollbar {
                    display: none;
                }
                #elegant-scroll-progress {
                    position: fixed;
                    left: 0;
                    bottom: 0;
                    height: var(--scrollbar-height);
                    width: 0%;
                    z-index: 9999;
                    transition: background 0.3s ease;
                    cursor: pointer;
                }
                #elegant-scroll-indicator {
                    position: fixed;
                    bottom: calc(var(--scrollbar-height) + 5px);
                    left: 0;
                    height: var(--indicator-size);
                    min-width: var(--indicator-size);
                    padding: 0 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(20, 20, 20, 0.8);
                    color: #fff;
                    border-radius: 14px;
                    font-size: var(--indicator-font-size);
                    font-weight: 600;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    z-index: 9999;
                    pointer-events: none;
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    opacity: 0;
                    transform: translateY(10px) scale(0.9);
                    transition: opacity 0.3s ease, transform 0.3s ease;
                }
                #elegant-scroll-indicator.visible {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            `;
            this.elements.style = document.createElement('style');
            this.elements.style.textContent = css;
            document.head.appendChild(this.elements.style);
        }

        _createElements() {
            this.elements.progress = document.createElement('div');
            this.elements.progress.id = 'elegant-scroll-progress';

            this.elements.indicator = document.createElement('div');
            this.elements.indicator.id = 'elegant-scroll-indicator';

            document.body.appendChild(this.elements.progress);
            document.body.appendChild(this.elements.indicator);
        }

        _addEventListeners() {
            this._boundUpdate = this._scheduleUpdate.bind(this);
            this._boundClickHandler = this._handleProgressClick.bind(this);

            window.addEventListener('scroll', this._boundUpdate, { passive: true });
            window.addEventListener('resize', this._boundUpdate, { passive: true });
            this.elements.progress.addEventListener('click', this._boundClickHandler);
        }

        _scheduleUpdate() {
            if (!this.state.isUpdateScheduled) {
                this.state.isUpdateScheduled = true;
                requestAnimationFrame(() => this._update());
            }
        }

        _update() {
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = document.documentElement.clientHeight;
            const scrollTop = document.documentElement.scrollTop;

            const totalScrollableHeight = scrollHeight - clientHeight;
            if (totalScrollableHeight <= 0) {
                this.elements.progress.style.width = '0%';
                this.elements.indicator.textContent = '0%';
                return;
            }

            const scrollPercent = (scrollTop / totalScrollableHeight) * 100;
            const roundedPercent = Math.round(scrollPercent);
            
            const color = this._getInterpolatedColor(scrollPercent);
            const gradient = `linear-gradient(90deg, ${color} 0%, rgba(${this.colorStops[0].color.join(',')}, 0.5) 100%)`;

            this.elements.progress.style.width = `${scrollPercent}%`;
            this.elements.progress.style.background = gradient;
            this.elements.progress.style.boxShadow = `0 0 10px ${color}`;
            
            this.elements.indicator.textContent = `${roundedPercent}%`;
            this._updateIndicatorPosition(scrollPercent);
            
            this._showIndicator();
            this.state.isUpdateScheduled = false;
        }

        _updateIndicatorPosition(percent) {
            const progressPx = (percent / 100) * window.innerWidth;
            const indicatorWidth = this.elements.indicator.offsetWidth;
            const margin = 10;
            
            let targetLeft = progressPx - (indicatorWidth / 2);
            targetLeft = Math.max(margin, Math.min(targetLeft, window.innerWidth - indicatorWidth - margin));
            
            this.elements.indicator.style.transform = `translateX(${targetLeft}px) translateY(0) scale(1)`;
        }
        
        _getInterpolatedColor(percent) {
            let start, end;
            for (let i = 0; i < this.colorStops.length - 1; i++) {
                if (percent >= this.colorStops[i].p && percent <= this.colorStops[i + 1].p) {
                    start = this.colorStops[i];
                    end = this.colorStops[i + 1];
                    break;
                }
            }
            if (!start) start = end = this.colorStops[this.colorStops.length - 1];

            const range = end.p - start.p;
            const progress = (percent - start.p) / (range === 0 ? 1 : range);

            const r = Math.round(start.color[0] + (end.color[0] - start.color[0]) * progress);
            const g = Math.round(start.color[1] + (end.color[1] - start.color[1]) * progress);
            const b = Math.round(start.color[2] + (end.color[2] - start.color[2]) * progress);

            return `rgb(${r},${g},${b})`;
        }
        
        _showIndicator() {
            clearTimeout(this.state.visibilityTimeout);
            if (!this.state.isIndicatorVisible) {
                this.elements.indicator.classList.add('visible');
                this.state.isIndicatorVisible = true;
            }
            this.state.visibilityTimeout = setTimeout(() => {
                this.elements.indicator.classList.remove('visible');
                this.state.isIndicatorVisible = false;
            }, 1000);
        }

        _handleProgressClick(event) {
            const clickPercent = (event.clientX / window.innerWidth) * 100;
            const targetScrollTop = (clickPercent / 100) * (document.documentElement.scrollHeight - document.documentElement.clientHeight);
            
            window.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth',
            });
        }
        
        _disableDevTools() {
            const preventDefault = e => e.preventDefault();
            
            document.addEventListener('contextmenu', preventDefault);
            
            document.addEventListener('keydown', e => {
                if (e.key === "F12" || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) || (e.ctrlKey && ['U', 'S'].includes(e.key.toUpperCase()))) {
                    preventDefault(e);
                }
            });
        }
    }

    new ElegantScrollbar();

})();