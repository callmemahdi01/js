class Quadtree {
    constructor(bounds, maxObjects = 10, maxLevels = 4, level = 0) {
        this.bounds = bounds;
        this.maxObjects = maxObjects;
        this.maxLevels = maxLevels;
        this.level = level;
        this.objects = [];
        this.nodes = [];
    }

    split() {
        const nextLevel = this.level + 1;
        const subWidth = this.bounds.width / 2;
        const subHeight = this.bounds.height / 2;
        const x = this.bounds.x;
        const y = this.bounds.y;

        this.nodes[0] = new Quadtree({ x: x + subWidth, y: y, width: subWidth, height: subHeight }, this.maxObjects, this.maxLevels, nextLevel);
        this.nodes[1] = new Quadtree({ x: x, y: y, width: subWidth, height: subHeight }, this.maxObjects, this.maxLevels, nextLevel);
        this.nodes[2] = new Quadtree({ x: x, y: y + subHeight, width: subWidth, height: subHeight }, this.maxObjects, this.maxLevels, nextLevel);
        this.nodes[3] = new Quadtree({ x: x + subWidth, y: y + subHeight, width: subWidth, height: subHeight }, this.maxObjects, this.maxLevels, nextLevel);
    }

    _getQuadrantIndex(objectBounds) {
        let index = -1;
        const verticalMidpoint = this.bounds.x + (this.bounds.width / 2);
        const horizontalMidpoint = this.bounds.y + (this.bounds.height / 2);

        const isTopQuadrant = (objectBounds.y < horizontalMidpoint && objectBounds.y + objectBounds.height < horizontalMidpoint);
        const isBottomQuadrant = (objectBounds.y > horizontalMidpoint);

        if (objectBounds.x < verticalMidpoint && objectBounds.x + objectBounds.width < verticalMidpoint) {
            if (isTopQuadrant) {
                index = 1;
            } else if (isBottomQuadrant) {
                index = 2;
            }
        } else if (objectBounds.x > verticalMidpoint) {
            if (isTopQuadrant) {
                index = 0;
            } else if (isBottomQuadrant) {
                index = 3;
            }
        }
        return index;
    }

    insert(object) {
        if (this.nodes.length) {
            const index = this._getQuadrantIndex(object.bounds);
            if (index !== -1) {
                this.nodes[index].insert(object);
                return;
            }
        }

        this.objects.push(object);

        if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
            if (!this.nodes.length) {
                this.split();
            }

            let i = 0;
            while (i < this.objects.length) {
                const index = this._getQuadrantIndex(this.objects[i].bounds);
                if (index !== -1) {
                    this.nodes[index].insert(this.objects.splice(i, 1)[0]);
                } else {
                    i++;
                }
            }
        }
    }

    query(range, foundObjects) {
        const index = this._getQuadrantIndex(range);
        if (index !== -1 && this.nodes.length) {
            this.nodes[index].query(range, foundObjects);
        }
        
        foundObjects.push(...this.objects);

        return foundObjects;
    }
    
    clear() {
        this.objects = [];
        for (let i = 0; i < this.nodes.length; i++) {
            this.nodes[i].clear();
        }
        this.nodes = [];
    }
}


class AnnotationApp {
    static TOOL_PEN = "pen";
    static TOOL_HIGHLIGHTER = "highlighter";
    static TOOL_ERASER = "eraser";

    static INTERACTION_IDLE = "idle";
    static INTERACTION_DRAWING = "drawing";
    static INTERACTION_PANNING = "panning";
    static INTERACTION_MULTI_TOUCH = "multi_touch_start";

    constructor(targetContainerSelector) {
        this.targetContainer = document.querySelector(targetContainerSelector);
        if (!this.targetContainer) return;

        this._initializeStateAndConfig();
        this._initializeUI();
        this._addEventListeners();
        this._loadPersistedDrawings();
    }
    
    _initializeStateAndConfig() {
        this.PAN_MOVE_THRESHOLD = 15;
        this.HIGHLIGHTER_OPACITY = 0.4;
        this.TWO_FINGER_TAP_TIMEOUT = 300;
        this.SIMPLIFY_TOLERANCE = 1.0;

        this.canvas = null; this.ctx = null;
        this.committedCanvas = null; this.committedCtx = null;
        this.virtualCanvasContainer = null;
        this.spatialIndex = null;

        this.viewportWidth = 0; this.viewportHeight = 0;
        this.scrollOffsetX = 0; this.scrollOffsetY = 0;
        this.totalContentWidth = 0; this.totalContentHeight = 0;

        this.isAnnotationModeActive = false;
        this.currentTool = AnnotationApp.TOOL_PEN;
        this.currentPath = null;
        this.drawings = [];
        this.activePointers = new Map();

        this.penColor = "#000000";
        this.penLineWidth = 2;
        this.highlighterColor = "#00ff00";
        this.highlighterLineWidth = 20;
        this.eraserWidth = 15;

        this.animationFrameId = null;
        this._boundUpdateViewport = this._updateViewport.bind(this);

        this.interactionState = AnnotationApp.INTERACTION_IDLE;
        this.multiTouchStartTimestamp = 0;
        this.lastPanMidPoint = null;
        this.initialTouchMidPoint = null;
        this.twoFingerTapProcessed = false;
        
        const pageIdentifier = window.location.pathname.replace(/[^a-zA-Z0-9_-]/g, "_");
        this.storageKey = `pageAnnotations_${pageIdentifier}`;
    }

    _initializeUI() {
        if (getComputedStyle(this.targetContainer).position === "static") {
            this.targetContainer.style.position = "relative";
        }
        
        this._createVirtualCanvasContainer();
        this._createCanvases();
        this._createToolbar();
        this.selectTool(AnnotationApp.TOOL_PEN);
    }
    
    _createVirtualCanvasContainer() {
        this.virtualCanvasContainer = document.createElement("div");
        Object.assign(this.virtualCanvasContainer.style, {
            position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
            pointerEvents: "none", zIndex: "1000", overflow: "hidden"
        });
        document.body.appendChild(this.virtualCanvasContainer);
    }

    _createCanvases() {
        this.canvas = document.createElement("canvas");
        this.canvas.id = "annotationCanvas";
        Object.assign(this.canvas.style, {
            position: "absolute", top: "0", left: "0", zIndex: "1000",
            pointerEvents: "none", mixBlendMode: "multiply", touchAction: 'none'
        });
        this.virtualCanvasContainer.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d");

        this.committedCanvas = document.createElement("canvas");
        this.committedCtx = this.committedCanvas.getContext("2d");
    }

    _createToolbar() {
        const icons = {
            [AnnotationApp.TOOL_PEN]: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#e3e3e3"><path d="m499-287 335-335-52-52-335 335zm-261 87q-100-5-149-42T40-349q0-65 53.5-105.5T242-503q39-3 58.5-12.5T320-542q0-26-29.5-39T193-600l7-80q103 8 151.5 41.5T400-542q0 53-38.5 83T248-423q-64 5-96 23.5T120-349q0 35 28 50.5t94 18.5zm280 7L353-358l382-382q20-20 47.5-20t47.5 20l70 70q20 20 20 47.5T900-575zm-159 33q-17 4-30-9t-9-30l33-159 165 165z"/></svg>`,
            [AnnotationApp.TOOL_HIGHLIGHTER]: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#e3e3e3"><path d="M80 0v-160h800V0zm504-480L480-584 320-424l103 104zm-47-160 103 103 160-159-104-104zm-84-29 216 216-189 190q-24 24-56.5 24T367-263l-27 23H140l126-125q-24-24-25-57.5t23-57.5zm0 0 187-187q24-24 56.5-24t56.5 24l104 103q24 24 24 56.5T857-640L669-453z"/></svg>`,
            [AnnotationApp.TOOL_ERASER]: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#e3e3e3"><path d="M690-240h190v80H610zm-500 80-85-85q-23-23-23.5-57t22.5-58l440-456q23-24 56.5-24t56.5 23l199 199q23 23 23 57t-23 57L520-160zm296-80 314-322-198-198-442 456 64 64zm-6-240"/></svg>`,
        };

        this.masterAnnotationToggleBtn = this._createToolbarButton("masterAnnotationToggleBtn", "NOTE - فعال/غیرفعال کردن یادداشت‌برداری", "NOTE ✏️", "");
        Object.assign(this.masterAnnotationToggleBtn.style, { top: "5px", right: "5px" });
        this.targetContainer.appendChild(this.masterAnnotationToggleBtn);
        
        this.toolsPanel = document.createElement("div");
        this.toolsPanel.id = "annotationToolsPanel";
        Object.assign(this.toolsPanel.style, {
            display: "none", flexDirection: "column", top: "45px", right: "5px"
        });
        
        const toolsGroup = document.createElement("div");
        toolsGroup.className = "toolbar-group";
        this.penBtn = this._createToolbarButton("penBtn", "قلم", icons[AnnotationApp.TOOL_PEN]);
        this.highlighterBtn = this._createToolbarButton("highlighterBtn", "هایلایتر", icons[AnnotationApp.TOOL_HIGHLIGHTER]);
        this.eraserBtn = this._createToolbarButton("eraserBtn", "پاک‌کن", icons[AnnotationApp.TOOL_ERASER]);
        toolsGroup.append(this.penBtn, this.highlighterBtn, this.eraserBtn);
        this.toolsPanel.appendChild(toolsGroup);

        this._createToolSettingsPanel(AnnotationApp.TOOL_PEN, "penColor", "penLineWidth", 1, 20, "قلم");
        this._createToolSettingsPanel(AnnotationApp.TOOL_HIGHLIGHTER, "highlighterColor", "highlighterLineWidth", 5, 50, "هایلایتر");

        this.clearBtn = this._createToolbarButton("clearAnnotationsBtn", "پاک کردن تمام یادداشت‌ها", "پاک کردن همه", "");
        this.toolsPanel.appendChild(this.clearBtn);
        
        this.targetContainer.appendChild(this.toolsPanel);
        this._updateToolSettingsVisibility();
    }
    
    _createToolbarButton(id, title, innerHTML, className = "tool-button") {
        const button = document.createElement("button");
        button.id = id;
        button.title = title;
        button.className = className;
        if (innerHTML) button.innerHTML = innerHTML;
        return button;
    }

    _createToolSettingsPanel(toolKey, colorProp, widthProp, minWidth, maxWidth, titleSuffix) {
        const settingsGroup = document.createElement("div");
        settingsGroup.className = "toolbar-group setting-group";
        settingsGroup.id = `${toolKey}SettingsGroup`;

        const colorPicker = document.createElement("input");
        colorPicker.type = "color";
        colorPicker.value = this[colorProp];
        colorPicker.title = `انتخاب رنگ ${titleSuffix}`;
        colorPicker.addEventListener("input", (e) => { this[colorProp] = e.target.value; });

        const lineWidthContainer = document.createElement('div');
        lineWidthContainer.className = 'line-width-slider-container';
        lineWidthContainer.title = `برای تغییر ضخامت ${titleSuffix}، بکشید`;
        Object.assign(lineWidthContainer.style, {
            display: 'flex', alignItems: 'center', cursor: 'ew-resize',
            padding: '2px 5px', border: '1px solid #ccc', borderRadius: '4px', userSelect: 'none'
        });

        const lineWidthDisplay = document.createElement('span');
        lineWidthDisplay.className = 'line-width-value-display';
        lineWidthDisplay.textContent = this[widthProp];
        Object.assign(lineWidthDisplay.style, { textAlign: 'center', fontWeight: 'bold' });
        
        const lessThanSpan = document.createElement('span'); lessThanSpan.textContent = '<';
        const greaterThanSpan = document.createElement('span'); greaterThanSpan.textContent = '>';

        lineWidthContainer.append(lessThanSpan, lineWidthDisplay, greaterThanSpan);
        this._initializeDragToAdjustValue(lineWidthContainer, (newValue) => {
            this[widthProp] = Math.max(minWidth, Math.min(maxWidth, newValue));
            lineWidthDisplay.textContent = this[widthProp];
        }, () => this[widthProp]);

        settingsGroup.append(colorPicker, lineWidthContainer);
        this.toolsPanel.appendChild(settingsGroup);
    }

    _initializeDragToAdjustValue(element, setter, getter, sensitivityFactor = 10) {
        let isDragging = false; let startX; let startValue; let pointerId;
        
        const onDragMove = (clientX) => { if (!isDragging) return; const deltaX = clientX - startX; const newValue = Math.round(startValue + (deltaX / sensitivityFactor)); setter(newValue); };
        const onDragEnd = () => { if (!isDragging) return; isDragging = false; element.classList.remove('dragging'); document.body.style.cursor = 'default'; element.releasePointerCapture(pointerId); pointerId = null; };
        const onDragStart = (e) => { if(e.button !== 0) return; e.preventDefault(); isDragging = true; startX = e.clientX; startValue = getter(); pointerId = e.pointerId; element.setPointerCapture(e.pointerId); element.classList.add('dragging'); document.body.style.cursor = 'ew-resize'; };

        element.addEventListener('pointerdown', onDragStart);
        element.addEventListener('pointermove', (e) => onDragMove(e.clientX));
        element.addEventListener('pointerup', onDragEnd);
        element.addEventListener('pointercancel', onDragEnd);
    }
    
    _addEventListeners() {
        window.addEventListener("resize", this._boundUpdateViewport);
        window.addEventListener("scroll", this._boundUpdateViewport);
        
        this.canvas.addEventListener("pointerdown", this._handlePointerDown.bind(this));
        this.canvas.addEventListener("pointermove", this._handlePointerMove.bind(this));
        this.canvas.addEventListener("pointerup", this._handlePointerUp.bind(this));
        this.canvas.addEventListener("pointercancel", this._handlePointerUp.bind(this));
        this.canvas.addEventListener("pointerleave", this._handlePointerUp.bind(this));
        
        this.masterAnnotationToggleBtn.addEventListener("click", () => this.toggleAnnotationMode());
        this.penBtn.addEventListener("click", () => this.selectTool(AnnotationApp.TOOL_PEN));
        this.highlighterBtn.addEventListener("click", () => this.selectTool(AnnotationApp.TOOL_HIGHLIGHTER));
        this.eraserBtn.addEventListener("click", () => this.selectTool(AnnotationApp.TOOL_ERASER));
        this.clearBtn.addEventListener("click", () => this.clearAllDrawings());
    }

    _updateViewport() {
        const dimensionsChanged = this._updateDimensionCache();
        if (dimensionsChanged) this._resizeAndRedrawCanvases();
        this._renderVisibleCanvasRegion();
    }

    _updateDimensionCache() {
        const oldDims = { w: this.viewportWidth, h: this.viewportHeight, sx: this.scrollOffsetX, sy: this.scrollOffsetY, tw: this.totalContentWidth, th: this.totalContentHeight };
        
        this.viewportWidth = window.innerWidth;
        this.viewportHeight = window.innerHeight;
        this.scrollOffsetX = window.scrollX;
        this.scrollOffsetY = window.scrollY;
        this.totalContentWidth = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, this.targetContainer.scrollWidth);
        this.totalContentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, this.targetContainer.scrollHeight);
        
        return oldDims.w !== this.viewportWidth || oldDims.h !== this.viewportHeight || oldDims.sx !== this.scrollOffsetX || oldDims.sy !== this.scrollOffsetY || oldDims.tw !== this.totalContentWidth || oldDims.th !== this.totalContentHeight;
    }

    _resizeAndRedrawCanvases() {
        this.canvas.width = this.viewportWidth;
        this.canvas.height = this.viewportHeight;
        Object.assign(this.canvas.style, { width: `${this.viewportWidth}px`, height: `${this.viewportHeight}px` });

        if (this.committedCanvas.width !== this.totalContentWidth || this.committedCanvas.height !== this.totalContentHeight) {
            this.committedCanvas.width = this.totalContentWidth;
            this.committedCanvas.height = this.totalContentHeight;
            this._rebuildSpatialIndex();
            this._redrawCommittedDrawings();
        }
    }
    
    _rebuildSpatialIndex() {
        if (!this.spatialIndex || this.spatialIndex.bounds.width !== this.totalContentWidth || this.spatialIndex.bounds.height !== this.totalContentHeight) {
            this.spatialIndex = new Quadtree({ x: 0, y: 0, width: this.totalContentWidth, height: this.totalContentHeight });
        } else {
            this.spatialIndex.clear();
        }
        this.drawings.forEach(drawing => {
            if (!drawing.bounds) drawing.bounds = this._getPathBoundingBox(drawing.points);
            this.spatialIndex.insert(drawing);
        });
    }
    
    _handlePointerDown(event) {
        if (!this.isAnnotationModeActive || event.button > 1) return;
        this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (this.activePointers.size === 1) {
            this.interactionState = AnnotationApp.INTERACTION_DRAWING;
            const { x, y } = this._getCanvasCoordinatesFromEvent(event);
            this.currentPath = this._createDrawingPath(x, y);
            this.twoFingerTapProcessed = false;
        } else if (this.activePointers.size === 2) {
            this._resetDrawingState();
            this.interactionState = AnnotationApp.INTERACTION_MULTI_TOUCH;
            this.multiTouchStartTimestamp = Date.now();
            
            const pointers = Array.from(this.activePointers.values());
            const midPoint = this._getMidPoint(pointers[0], pointers[1]);
            this.lastPanMidPoint = midPoint;
            this.initialTouchMidPoint = midPoint;
        }
    }

    _handlePointerMove(event) {
        if (!this.activePointers.has(event.pointerId)) return;
        this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (this.interactionState === AnnotationApp.INTERACTION_DRAWING && this.activePointers.size === 1) {
            const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
            events.forEach(e => {
                const { x, y } = this._getCanvasCoordinatesFromEvent(e);
                 if (this.currentPath) this._addPointToCurrentPath(x, y);
            });
            this._requestRenderFrame();
        } else if (this.activePointers.size === 2) {
            const pointers = Array.from(this.activePointers.values());
            const midPoint = this._getMidPoint(pointers[0], pointers[1]);

            if (this.interactionState === AnnotationApp.INTERACTION_MULTI_TOUCH) {
                const deltaX = midPoint.x - this.initialTouchMidPoint.x;
                const deltaY = midPoint.y - this.initialTouchMidPoint.y;
                if (Math.hypot(deltaX, deltaY) > this.PAN_MOVE_THRESHOLD) {
                    this.interactionState = AnnotationApp.INTERACTION_PANNING;
                }
            }
            
            if (this.interactionState === AnnotationApp.INTERACTION_PANNING) {
                const deltaX = midPoint.x - this.lastPanMidPoint.x;
                const deltaY = midPoint.y - this.lastPanMidPoint.y;
                window.scrollBy(-deltaX, -deltaY);
                this.lastPanMidPoint = midPoint;
            }
        }
    }
    
    _handlePointerUp(event) {
        if (!this.activePointers.has(event.pointerId)) return;
        
        const wasDrawing = this.interactionState === AnnotationApp.INTERACTION_DRAWING;
        
        if (this.interactionState === AnnotationApp.INTERACTION_MULTI_TOUCH && this.activePointers.size === 2) {
            const timeElapsed = Date.now() - this.multiTouchStartTimestamp;
            if (timeElapsed < this.TWO_FINGER_TAP_TIMEOUT && !this.twoFingerTapProcessed) {
                this.undoLastDrawing();
                this.twoFingerTapProcessed = true;
            }
        }
        
        this.activePointers.delete(event.pointerId);

        if (wasDrawing && this.activePointers.size === 0) {
            this._finalizeCurrentPath();
        }
        
        if (this.activePointers.size < 2) {
            this.interactionState = this.activePointers.size === 1 ? AnnotationApp.INTERACTION_DRAWING : AnnotationApp.INTERACTION_IDLE;
            this._resetPanState();
        }

        if (this.activePointers.size === 0) {
            this.interactionState = AnnotationApp.INTERACTION_IDLE;
            if (!wasDrawing) this._resetDrawingState();
        }
    }
    
    _getMidPoint(p1, p2) {
        return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }

    _resetPanState() {
        this.lastPanMidPoint = null;
        this.initialTouchMidPoint = null;
    }

    toggleAnnotationMode() {
        this.isAnnotationModeActive = !this.isAnnotationModeActive;
        if (this.isAnnotationModeActive) {
            this.canvas.style.pointerEvents = "auto";
            this.masterAnnotationToggleBtn.classList.add("active");
            this.masterAnnotationToggleBtn.textContent = "NOTE ✏️ (فعال)";
            this.toolsPanel.style.display = "flex";
        } else {
            this.canvas.style.pointerEvents = "none";
            this.masterAnnotationToggleBtn.classList.remove("active");
            this.masterAnnotationToggleBtn.textContent = "NOTE ✏️ (غیرفعال)";
            this.toolsPanel.style.display = "none";
            this._resetDrawingState();
            this.interactionState = AnnotationApp.INTERACTION_IDLE;
        }
        this._updateToolSettingsVisibility();
    }
    
    selectTool(toolName) {
        this.currentTool = toolName;
        const buttons = {
            [AnnotationApp.TOOL_PEN]: this.penBtn,
            [AnnotationApp.TOOL_HIGHLIGHTER]: this.highlighterBtn,
            [AnnotationApp.TOOL_ERASER]: this.eraserBtn
        };
        for (const tool in buttons) {
            buttons[tool].classList.toggle("active", this.currentTool === tool);
        }
        this._updateToolSettingsVisibility();
    }
    
    _updateToolSettingsVisibility() {
        const penSettings = document.getElementById(`${AnnotationApp.TOOL_PEN}SettingsGroup`);
        const highlighterSettings = document.getElementById(`${AnnotationApp.TOOL_HIGHLIGHTER}SettingsGroup`);
        if (penSettings) penSettings.style.display = (this.currentTool === AnnotationApp.TOOL_PEN && this.isAnnotationModeActive) ? "flex" : "none";
        if (highlighterSettings) highlighterSettings.style.display = (this.currentTool === AnnotationApp.TOOL_HIGHLIGHTER && this.isAnnotationModeActive) ? "flex" : "none";
        this.clearBtn.style.display = (this.currentTool === AnnotationApp.TOOL_ERASER && this.isAnnotationModeActive) ? "block" : "none";
    }

    _getCanvasCoordinatesFromEvent(event) {
        return { x: event.clientX + this.scrollOffsetX, y: event.clientY + this.scrollOffsetY };
    }
    
    _createDrawingPath(x, y) {
        const path = { id: Date.now() + Math.random(), tool: this.currentTool, points: [{ x, y }] };
        switch (this.currentTool) {
            case AnnotationApp.TOOL_PEN: Object.assign(path, { color: this.penColor, lineWidth: this.penLineWidth, opacity: 1.0 }); break;
            case AnnotationApp.TOOL_HIGHLIGHTER: Object.assign(path, { color: this.highlighterColor, lineWidth: this.highlighterLineWidth, opacity: this.HIGHLIGHTER_OPACITY }); break;
            case AnnotationApp.TOOL_ERASER: path.lineWidth = this.eraserWidth; break;
        }
        return path;
    }

    _addPointToCurrentPath(x, y) {
        if (!this.currentPath) return;
        if (this.currentTool === AnnotationApp.TOOL_HIGHLIGHTER) {
            if (this.currentPath.points.length <= 1) this.currentPath.points.push({ x, y });
            else this.currentPath.points[1] = { x, y };
        } else {
            this.currentPath.points.push({ x, y });
        }
    }
    
    _resetDrawingState() {
        this.currentPath = null;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this._renderVisibleCanvasRegion();
    }

    _finalizeCurrentPath() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (!this.currentPath || this.currentPath.points.length === 0) {
            this._resetDrawingState();
            return;
        }

        if (this.currentTool === AnnotationApp.TOOL_HIGHLIGHTER) {
            const startPoint = this.currentPath.points[0];
            const endPoint = this.currentPath.points.length > 1 ? this.currentPath.points[this.currentPath.points.length - 1] : startPoint;
            this.currentPath.points = [startPoint, endPoint];
        } else {
            this.currentPath.points = this._simplifyPath(this.currentPath.points, this.SIMPLIFY_TOLERANCE);
        }

        if (this.currentTool === AnnotationApp.TOOL_ERASER) {
            this._performErasure();
        } else {
            if (this.currentPath.points.length > 1) {
                this.currentPath.bounds = this._getPathBoundingBox(this.currentPath.points);
                this.drawings.push(this.currentPath);
                this.spatialIndex.insert(this.currentPath);
            }
        }
        
        this._redrawCommittedDrawings();
        this._persistDrawings();
        this._resetDrawingState();
    }

    _simplifyPath(points, tolerance) {
        if (points.length < 3) return points;
        const getSqDist = (p1, p2) => Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
        const getSqSegDist = (p, p1, p2) => {
            const l2 = getSqDist(p1, p2);
            if (l2 === 0) return getSqDist(p, p1);
            let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            return getSqDist(p, { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) });
        };
        const simplifyRecursive = (start, end) => {
            let maxSqDist = 0;
            let index = 0;
            for (let i = start + 1; i < end; i++) {
                const sqDist = getSqSegDist(points[i], points[start], points[end]);
                if (sqDist > maxSqDist) {
                    maxSqDist = sqDist;
                    index = i;
                }
            }
            if (maxSqDist > tolerance * tolerance) {
                const res1 = simplifyRecursive(start, index);
                const res2 = simplifyRecursive(index, end);
                return res1.slice(0, -1).concat(res2);
            } else {
                return [points[start], points[end]];
            }
        };
        return simplifyRecursive(0, points.length - 1);
    }
    
    _getPathBoundingBox(points) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    
    _getSquaredDistanceToSegment(p, v, w) {
        const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
        if (l2 === 0) return Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2);
    }

    _performErasure() {
        if (!this.currentPath || this.currentPath.points.length === 0) return;

        const eraserPoints = this.currentPath.points;
        const candidateDrawings = new Set();
        
        const halfEraserWidth = this.eraserWidth / 2;
        for (const eraserPt of eraserPoints) {
            const queryBounds = { x: eraserPt.x - halfEraserWidth, y: eraserPt.y - halfEraserWidth, width: this.eraserWidth, height: this.eraserWidth };
            this.spatialIndex.query(queryBounds, []).forEach(item => candidateDrawings.add(item));
        }

        const drawingsToDelete = new Set();
        for (const drawing of candidateDrawings) {
            if (drawing.tool === AnnotationApp.TOOL_ERASER) continue;

            const collisionThresholdSq = Math.pow(halfEraserWidth + (drawing.lineWidth / 2), 2);
            let collided = false;
            for (const eraserPt of eraserPoints) {
                const points = drawing.points;
                if (points.length === 1) {
                    if (this._getSquaredDistanceToSegment(eraserPt, points[0], points[0]) < collisionThresholdSq) {
                        collided = true; break;
                    }
                } else {
                    for (let i = 0; i < points.length - 1; i++) {
                        if (this._getSquaredDistanceToSegment(eraserPt, points[i], points[i + 1]) < collisionThresholdSq) {
                            collided = true; break;
                        }
                    }
                }
                if (collided) break;
            }

            if (collided) drawingsToDelete.add(drawing);
        }

        if (drawingsToDelete.size > 0) {
            const deleteIds = new Set(Array.from(drawingsToDelete).map(d => d.id));
            this.drawings = this.drawings.filter(drawing => !deleteIds.has(drawing.id));
            this._rebuildSpatialIndex();
        }
    }

    _requestRenderFrame() {
        if (this.animationFrameId === null) {
            this.animationFrameId = requestAnimationFrame(() => {
                this._renderVisibleCanvasRegion();
                this.animationFrameId = null;
            });
        }
    }

    _redrawCommittedDrawings() {
        this.committedCtx.clearRect(0, 0, this.committedCanvas.width, this.committedCanvas.height);
        this.drawings.forEach(path => this._drawPath(path, this.committedCtx, false));
    }

    _renderVisibleCanvasRegion() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.committedCanvas.width > 0 && this.committedCanvas.height > 0) {
            this.ctx.drawImage(this.committedCanvas,
                this.scrollOffsetX, this.scrollOffsetY, this.viewportWidth, this.viewportHeight,
                0, 0, this.viewportWidth, this.viewportHeight);
        }
        if (this.currentPath && this.interactionState === AnnotationApp.INTERACTION_DRAWING) {
            this._drawPath(this.currentPath, this.ctx, true);
        }
    }

    _drawPath(path, context, isLive) {
        if (!path || path.points.length === 0) return;
        const originalGCO = context.globalCompositeOperation;
        const originalGA = context.globalAlpha;
        
        context.beginPath();
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = path.lineWidth;
        context.globalAlpha = path.opacity !== undefined ? path.opacity : 1.0;

        if (path.tool === AnnotationApp.TOOL_ERASER && isLive) {
            context.strokeStyle = "rgba(200, 0, 0, 0.6)";
        } else if (path.tool === AnnotationApp.TOOL_HIGHLIGHTER) {
            context.globalCompositeOperation = 'darken';
            context.strokeStyle = path.color;
        } else {
            context.globalCompositeOperation = 'source-over';
            context.strokeStyle = path.color || '#000000';
        }

        if (path.tool === AnnotationApp.TOOL_ERASER && !isLive) {
             context.globalCompositeOperation = originalGCO; context.globalAlpha = originalGA; return;
        }

        const transform = (p) => isLive ? { x: p.x - this.scrollOffsetX, y: p.y - this.scrollOffsetY } : p;
        const firstPoint = transform(path.points[0]);
        context.moveTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < path.points.length; i++) {
            context.lineTo(transform(path.points[i]).x, transform(path.points[i]).y);
        }
        context.stroke();
        
        context.globalCompositeOperation = originalGCO;
        context.globalAlpha = originalGA;
    }
    
    undoLastDrawing() {
        if (this.drawings.length > 0) {
            this.drawings.pop();
            this._rebuildSpatialIndex();
            this._redrawCommittedDrawings();
            this._renderVisibleCanvasRegion();
            this._persistDrawings();
        }
    }
    
    clearAllDrawings() {
        if (window.confirm("آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها را پاک کنید؟")) {
            this.drawings = [];
            localStorage.removeItem(this.storageKey);
            this._rebuildSpatialIndex();
            this._redrawCommittedDrawings();
            this._renderVisibleCanvasRegion();
        }
    }

    _persistDrawings() {
        try {
            const drawingsToSave = this.drawings.map(({ bounds, ...rest }) => rest);
            localStorage.setItem(this.storageKey, JSON.stringify(drawingsToSave));
        } catch (error) {
            console.error("Failed to save drawings to localStorage", error);
        }
    }

    _loadPersistedDrawings() {
        const savedData = localStorage.getItem(this.storageKey);
        if (savedData) {
            try {
                this.drawings = JSON.parse(savedData);
                this._hydrateDrawings();
            } catch (error) {
                this.drawings = [];
                localStorage.removeItem(this.storageKey);
            }
        }
        this._updateViewport();
    }

    _hydrateDrawings() {
        this.drawings.forEach((path, index) => {
            if(!path.id) path.id = Date.now() + Math.random() + index;
            if (path.opacity === undefined) {
                path.opacity = path.tool === AnnotationApp.TOOL_HIGHLIGHTER ? this.HIGHLIGHTER_OPACITY : 1.0;
            }
            if (path.lineWidth === undefined) {
                switch (path.tool) {
                    case AnnotationApp.TOOL_PEN: path.lineWidth = this.penLineWidth; break;
                    case AnnotationApp.TOOL_HIGHLIGHTER: path.lineWidth = this.highlighterLineWidth; break;
                    default: path.lineWidth = 1; break;
                }
            }
        });
    }

    destroy() {
        window.removeEventListener("resize", this._boundUpdateViewport);
        window.removeEventListener("scroll", this._boundUpdateViewport);
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        if (this.virtualCanvasContainer) this.virtualCanvasContainer.remove();
        if (this.toolsPanel) this.toolsPanel.remove();
        if (this.masterAnnotationToggleBtn) this.masterAnnotationToggleBtn.remove();
        if (this.spatialIndex) this.spatialIndex.clear();
        Object.keys(this).forEach(key => this[key] = null);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new AnnotationApp("body");
});