import { Observable, ComputedObservable, ObservableArray, DerivedObservableCollection } from "@alumis/observables";
import { transitionAsync, DOMAnimator, elementIsVisible, easeIn, easeOut } from "@alumis/transitionasync";
import { CancellationToken } from "@alumis/cancellationtoken";

export var globalAttrHandlers = new Map<string, (node: Node, attr, attrs: { [attr: string]: any }) => any>();

globalAttrHandlers.set("class", (element: HTMLElement, expression) => {

    if (typeof expression === "string")
        element.classList.add(...expression.split(" ").filter(s => s));

    else if (expression) {

        if (expression instanceof Observable) {

            let value = (<Observable<string>>expression).value;

            if (value)
                element.classList.add(...value.split(" ").filter(s => s));

            appendDispose(element, expression.subscribe((n, o) => {

                let oldClasses = new Set((<string>o).split(" "));
                let newClasses = new Set((<string>n).split(" "));

                for (var cls of oldClasses) {

                    if (!newClasses.has(cls))
                        element.classList.remove(cls);
                }

                element.classList.add(...newClasses);

            }).dispose);
        }

        else if (typeof expression === "function") {

            let computedObservable = ComputedObservable.createComputed<string>(expression);

            element.classList.add(...computedObservable.value.split(" ").filter(s => s));

            computedObservable.subscribeInvoke((n, o) => {

                let oldClasses = new Set((<string>o).split(" "));
                let newClasses = new Set((<string>n).split(" "));

                for (var cls of oldClasses) {

                    if (!newClasses.has(cls))
                        element.classList.remove(cls);
                }

                element.classList.add(...newClasses);
            });

            appendDispose(element, computedObservable.dispose);
        }
    }
});

globalAttrHandlers.set("style", (element: HTMLElement, attr) => { Object.assign(element.style, attr); });
globalAttrHandlers.set("pressed", (element: HTMLElement, attr) => { bindAttribute(element, "aria-pressed", attr) });

export function createNode(element: string | (() => any), attrs: { [attr: string]: any }, ...children) {

    if (typeof element === "string")
        return createHTMLElementFromTagName(element, attrs, children);

    if (typeof element === "function")
        return createNodeFromFunction(element, attrs, children);

    console.error(`Unable to create element ${typeof element}`);
}

function createHTMLElementFromTagName(tagName: string, attrs: { [attr: string]: any }, children: any[]) {

    const result = document.createElement(tagName);

    if (children.length)
        appendChildren(result, children, result);

    if (attrs)
        applyAttributes(result, attrs);

    return result;
}

export function applyAttributes(node: Element, attrs: { [attr: string]: any }) {

    for (var a in attrs) {

        let attr = attrs[a];

        if (a.startsWith("on") && 2 < a.length) {

            node[a] = attr;
            continue;
        }

        else {

            let globalAttrHandler = globalAttrHandlers.get(a);

            if (globalAttrHandler)
                globalAttrHandler(node, attr, attrs);

            else bindAttribute(node, a, attr);
        }
    }
}

function createNodeFromFunction(fn, attrs: { [attr: string]: any }, children: any[]) {

    if (fn.prototype instanceof Component)
        return <Component<Node>>new fn(attrs, children);

    else {

        let result = fn(attrs);

        if (<any>result === "__fragment")
            appendChildren(result = document.createDocumentFragment(), children, null);

        return result;
    }
}

function appendChildren(parentNode: Node, children: any[], parentElement: HTMLElement) {

    function processChild(child) {

        if (child instanceof HTMLElement ||
            child instanceof SVGElement ||
            child instanceof Comment ||
            child instanceof DocumentFragment)

            parentNode.appendChild(child);

        else if (child instanceof Component)
            parentNode.appendChild(child.node);

        else if (typeof child === "string" || typeof child === "number")
            parentNode.appendChild(document.createTextNode(<any>child));

        else if (child instanceof Observable)
            appendObservableChild(parentNode, child, false);

        else if (typeof child === "function")
            appendObservableChild(parentNode, ComputedObservable.createComputed(child), true);
        
        else if (child instanceof ObservableArray)
            appendDispose(parentNode, createFragmentForObservableArrayChild(parentNode, child, parentElement));

        else if (child instanceof Array)
            child.forEach(processChild);

        else parentNode.appendChild(document.createTextNode(child !== null && child !== undefined ? String(child) : ""));
    }

    children.forEach(processChild);
}

function appendObservableChild(parentNode: Node, childObservable: Observable<any>, ownsObservable: boolean) {

    let childValue = <any>childObservable.value;
    let childNode: Node;

    if (childValue instanceof HTMLElement ||
        childValue instanceof SVGElement)

        childNode = childValue;

    else if (childValue instanceof Component)
        childNode = childValue.node;

    else childNode = document.createTextNode(childValue !== null && childValue !== undefined ? String(childValue) : "");

    parentNode.appendChild(childNode);

    let dispose: () => any, subscription = childObservable.subscribe(n => {

        let newChildNode: Node;

        if (n instanceof HTMLElement ||
            n instanceof SVGElement)

            newChildNode = n;

        else if (n instanceof Component)
            newChildNode = n.node;

        else if (childNode instanceof Text) {

            childNode.textContent = n !== null && n !== undefined ? String(n) : "";
            return;
        }

        else newChildNode = document.createTextNode(n !== null && n !== undefined ? String(n) : "");

        if (newChildNode !== childNode) {
            
            parentNode.replaceChild(newChildNode, childNode);

            removeDispose(childNode, dispose);
            appendDispose(childNode = newChildNode, dispose);
        }
    });

    appendDispose(childNode, dispose = ownsObservable ? childObservable.dispose : subscription.dispose);
}

class VerticalListEaseOutDOMAnimator implements DOMAnimator {

    async insertBeforeAsync(parentElement: HTMLElement, newChild: HTMLElement, referenceNode: Node, cancellationToken?: CancellationToken) {

        newChild.style.opacity = "0";
        newChild.style.position = "absolute";
        newChild.style.width = "100%";

        parentElement.insertBefore(newChild, referenceNode);

        if (newChild.offsetParent !== parentElement)
            parentElement.style.position = "relative";

        let heightToBe = newChild.clientHeight;

        if (heightToBe && elementIsVisible(newChild)) {

            newChild.style.height = "0";
            newChild.style.width = "";
            newChild.style.position = "";

            let height = 0;
            let remaining = heightToBe - height;

            if (remaining) {

                let scrollBottom = document.body.scrollHeight - window.innerHeight - window.scrollY;

                if (scrollBottom < scrollY) {

                    await transitionAsync(150, t => {

                        newChild.style.height = (height + remaining * easeIn(t)) + "px";

                        scrollBy(0, document.body.scrollHeight - window.innerHeight - window.scrollY - scrollBottom);
                    }, cancellationToken);
                }

                else await transitionAsync(150, t => { newChild.style.height = (height + remaining * easeIn(t)) + "px"; }, cancellationToken);
            }

            newChild.style.height = "";

            let opacity = 0;

            remaining = 1 - opacity;

            if (remaining)
                await transitionAsync(200, t => { newChild.style.opacity = String(opacity + remaining * easeOut(t)); }, cancellationToken);

            newChild.style.opacity = "";
        }

        else {

            newChild.style.opacity = "";
            newChild.style.width = "";
            newChild.style.position = "";
        }
    }

    async removeAsync(element: HTMLElement, cancellationToken?: CancellationToken) {

        if (elementIsVisible(element)) {

            let opacity = parseFloat(getComputedStyle(element).opacity);

            if (opacity)
                await transitionAsync(200, t => { element.style.opacity = String(opacity - opacity * easeIn(t)); }, cancellationToken);

            let height = element.clientHeight;

            if (height)
                await transitionAsync(150, t => { element.style.height = height - height * easeOut(t) + "px"; }, cancellationToken);

            element.remove();

            element.style.opacity = "";
            element.style.height = "";
        }

        else element.remove();
    }
}

function getScrollParent(element: HTMLElement, includeHidden?: boolean) {

    let style = getComputedStyle(element);
    let excludeStaticParent = style.position === "absolute";
    let overflowRegex = includeHidden ? /(auto|scroll|hidden)/ : /(auto|scroll)/;

    if (style.position === "fixed")
        return document.scrollingElement || document.documentElement;

    for (let parent = element.parentElement; parent; parent = parent.parentElement) {

        style = getComputedStyle(parent);

        if (excludeStaticParent && style.position === "static")
            continue;

        if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX))
            return parent;
    }

    return document.scrollingElement || document.documentElement;
}

export var verticalListEaseOutDOMAnimator = new VerticalListEaseOutDOMAnimator();

function createFragmentForObservableArrayChild(node: Node, child: ObservableArray<any>, parentElement: HTMLElement) {

    let elements: HTMLElement[] = [];

    for (let c of child.wrappedCollection)
        elements.push(node.appendChild(c));

    let subscription = child.subscribe((addedItems, removedItems, index, move) => {

        if (addedItems) {

            let referenceNode = index < elements.length ? elements[index] : null; // MDN: referenceNode is not an optional parameter -- you must explicitly pass a Node or null. Failing to provide it or passing invalid values may behave differently in different browser versions.

            for (let j = addedItems.length; 0 < j;) {

                let element = addedItems[--j];

                if (move)
                    parentElement.insertBefore(element, referenceNode);

                else verticalListEaseOutDOMAnimator.insertBeforeAsync(parentElement, element, referenceNode);

                referenceNode = element;
            }

            elements.splice(index, 0, ...addedItems);
        }

        else { // Removed items

            for (let e of elements.splice(index, removedItems.length)) {

                if (move)
                    parentElement.removeChild(e);

                else {

                    verticalListEaseOutDOMAnimator.removeAsync(e);
                    disposeNode(e);
                }
            }
        }
    });

    if ((<DerivedObservableCollection<any, any>><unknown>child).disposeSourceCollection)
        return child.dispose;

    else return subscription.dispose;
}

export abstract class Component<TNode extends Node> {

    node: TNode;
}

export const Fragment = () => "__fragment";

export function disposeNode(node: Node) {

    if (node.childNodes.length) { // It is important to dispose of the child nodes first

        for (let n of node.childNodes)
            disposeNode(n);
    }

    let dispose: (() => any)[] = node["__dispose"];

    if (dispose) {

        delete node["__dispose"];

        for (let fn of dispose.reverse())
            fn();
    }
}

export function appendDispose(node: Node, fn: () => any) {

    let dispose: (() => any)[] = node["__dispose"];

    if (dispose)
        dispose.push(fn);

    else node["__dispose"] = [fn];
}

export function removeDispose(node: Node, fn: () => any) {

    let dispose: (() => any)[] = node["__dispose"];

    if (dispose) {

        let i = dispose.indexOf(fn);

        if (i !== -1) {

            if (dispose.length === 1)
                delete node["__dispose"];

            else dispose.splice(i, 1);
        }
    }
}

export function bindTextContent(node: Node, expression: any | Observable<any> | (() => any)) {

    if (expression instanceof Observable)
        appendDispose(node, expression.subscribeInvoke(n => { node.textContent = n !== null && n !== undefined ? String(n) : ""; }).dispose);

    else if (typeof expression === "function") {

        let computedObservable = ComputedObservable.createComputed(expression);

        computedObservable.subscribeInvoke(n => { node.textContent = n !== null && n !== undefined ? String(n) : ""; });
        appendDispose(node, computedObservable.dispose);
    }

    else node.textContent = expression !== null && expression !== undefined ? String(expression) : "";
}

export function bindAttribute(element: Element, name: string, expression: any | Observable<any> | (() => any)) {

    if (typeof expression === "string")
        element.setAttribute(name, expression);

    else if (expression) {

        if (expression === true)
            element.setAttribute(name, "true");

        else if (expression instanceof Observable) {

            appendDispose(element, expression.subscribeInvoke(n => {

                if (typeof n === "string")
                    element.setAttribute(name, n);

                else if (n) {

                    if (n === true)
                        element.setAttribute(name, "true");

                    else element.setAttribute(name, String(n));
                }

                else element.removeAttribute(name);

            }).dispose);
        }

        else if (typeof expression === "function") {

            let computedObservable = ComputedObservable.createComputed(expression);

            computedObservable.subscribeInvoke(n => {

                if (typeof n === "string")
                    element.setAttribute(name, n);

                else if (n) {

                    if (n === true)
                        element.setAttribute(name, "true");

                    else element.setAttribute(name, String(n));
                }

                else element.removeAttribute(name);

            });

            appendDispose(element, computedObservable.dispose);
        }
    }

    else element.removeAttribute(name);
}

export function bindClass(element: Element, name: string, expression: boolean | Observable<boolean> | (() => boolean)) {

    if (expression) {

        if (expression === true)
            element.classList.add(name);

        else if (expression instanceof Observable) {

            appendDispose(element, expression.subscribeInvoke(n => {

                if (n)
                    element.classList.add(name);

                else element.classList.remove(name);

            }).dispose);
        }

        else if (typeof expression === "function") {

            let computedObservable = ComputedObservable.createComputed(expression);

            computedObservable.subscribeInvoke(n => {

                if (n)
                    element.classList.add(name);

                else element.classList.remove(name);

            });

            appendDispose(element, computedObservable.dispose);
        }
    }

    else element.classList.remove(name);
}

var htmlElementIds = 0;

export function generateHTMLElementId() {

    return "_" + htmlElementIds++;
}

export interface IAttributes {

    class?: string | Observable<string> | (() => string);
    style?: CSSStyleDeclaration;

    onabort?: (ev: UIEvent) => any;
    onanimationcancel?: (ev: AnimationEvent) => any;
    onanimationend?: (ev: AnimationEvent) => any;
    onanimationiteration?: (ev: AnimationEvent) => any;
    onanimationstart?: (ev: AnimationEvent) => any;
    onauxclick?: (ev: Event) => any;
    /**
     * Fires when the object loses the input focus.
     * @param ev The focus event.
     */
    onblur?: (ev: FocusEvent) => any;
    oncancel?: (ev: Event) => any;
    /**
     * Occurs when playback is possible, but would require further buffering.
     * @param ev The event.
     */
    oncanplay?: (ev: Event) => any;
    oncanplaythrough?: (ev: Event) => any;
    /**
     * Fires when the contents of the object or selection have changed.
     * @param ev The event.
     */
    onchange?: (ev: Event) => any;
    /**
     * Fires when the user clicks the left mouse button on the object
     * @param ev The mouse event.
     */
    onclick?: (ev: MouseEvent) => any;
    onclose?: (ev: Event) => any;
    /**
     * Fires when the user clicks the right mouse button in the client area, opening the context menu.
     * @param ev The mouse event.
     */
    oncontextmenu?: (ev: MouseEvent) => any;
    oncuechange?: (ev: Event) => any;
    /**
     * Fires when the user double-clicks the object.
     * @param ev The mouse event.
     */
    ondblclick?: (ev: MouseEvent) => any;
    /**
     * Fires on the source object continuously during a drag operation.
     * @param ev The event.
     */
    ondrag?: (ev: DragEvent) => any;
    /**
     * Fires on the source object when the user releases the mouse at the close of a drag operation.
     * @param ev The event.
     */
    ondragend?: (ev: DragEvent) => any;
    /**
     * Fires on the target element when the user drags the object to a valid drop target.
     * @param ev The drag event.
     */
    ondragenter?: (ev: DragEvent) => any;
    ondragexit?: (ev: Event) => any;
    /**
     * Fires on the target object when the user moves the mouse out of a valid drop target during a drag operation.
     * @param ev The drag event.
     */
    ondragleave?: (ev: DragEvent) => any;
    /**
     * Fires on the target element continuously while the user drags the object over a valid drop target.
     * @param ev The event.
     */
    ondragover?: (ev: DragEvent) => any;
    /**
     * Fires on the source object when the user starts to drag a text selection or selected object.
     * @param ev The event.
     */
    ondragstart?: (ev: DragEvent) => any;
    ondrop?: (ev: DragEvent) => any;
    /**
     * Occurs when the duration attribute is updated.
     * @param ev The event.
     */
    ondurationchange?: (ev: Event) => any;
    /**
     * Occurs when the media element is reset to its initial state.
     * @param ev The event.
     */
    onemptied?: (ev: Event) => any;
    /**
     * Occurs when the end of playback is reached.
     * @param ev The event
     */
    onended?: (ev: Event) => any;
    /**
     * Fires when an error occurs during object loading.
     * @param ev The event.
     */
    onerror?: OnErrorEventHandlerNonNull;
    /**
     * Fires when the object receives focus.
     * @param ev The event.
     */
    onfocus?: (ev: FocusEvent) => any;
    ongotpointercapture?: (ev: PointerEvent) => any;
    oninput?: (ev: Event) => any;
    oninvalid?: (ev: Event) => any;
    /**
     * Fires when the user presses a key.
     * @param ev The keyboard event
     */
    onkeydown?: (ev: KeyboardEvent) => any;
    /**
     * Fires when the user presses an alphanumeric key.
     * @param ev The event.
     */
    onkeypress?: (ev: KeyboardEvent) => any;
    /**
     * Fires when the user releases a key.
     * @param ev The keyboard event
     */
    onkeyup?: (ev: KeyboardEvent) => any;
    /**
     * Fires immediately after the browser loads the object.
     * @param ev The event.
     */
    onload?: (ev: Event) => any;
    /**
     * Occurs when media data is loaded at the current playback position.
     * @param ev The event.
     */
    onloadeddata?: (ev: Event) => any;
    /**
     * Occurs when the duration and dimensions of the media have been determined.
     * @param ev The event.
     */
    onloadedmetadata?: (ev: Event) => any;
    onloadend?: (ev: ProgressEvent) => any;
    /**
     * Occurs when Internet Explorer begins looking for media data.
     * @param ev The event.
     */
    onloadstart?: (ev: Event) => any;
    onlostpointercapture?: (ev: PointerEvent) => any;
    /**
     * Fires when the user clicks the object with either mouse button.
     * @param ev The mouse event.
     */
    onmousedown?: (ev: MouseEvent) => any;
    onmouseenter?: (ev: MouseEvent) => any;
    onmouseleave?: (ev: MouseEvent) => any;
    /**
     * Fires when the user moves the mouse over the object.
     * @param ev The mouse event.
     */
    onmousemove?: (ev: MouseEvent) => any;
    /**
     * Fires when the user moves the mouse pointer outside the boundaries of the object.
     * @param ev The mouse event.
     */
    onmouseout?: (ev: MouseEvent) => any;
    /**
     * Fires when the user moves the mouse pointer into the object.
     * @param ev The mouse event.
     */
    onmouseover?: (ev: MouseEvent) => any;
    /**
     * Fires when the user releases a mouse button while the mouse is over the object.
     * @param ev The mouse event.
     */
    onmouseup?: (ev: MouseEvent) => any;
    /**
     * Occurs when playback is paused.
     * @param ev The event.
     */
    onpause?: (ev: Event) => any;
    /**
     * Occurs when the play method is requested.
     * @param ev The event.
     */
    onplay?: (ev: Event) => any;
    /**
     * Occurs when the audio or video has started playing.
     * @param ev The event.
     */
    onplaying?: (ev: Event) => any;
    onpointercancel?: (ev: PointerEvent) => any;
    onpointerdown?: (ev: PointerEvent) => any;
    onpointerenter?: (ev: PointerEvent) => any;
    onpointerleave?: (ev: PointerEvent) => any;
    onpointermove?: (ev: PointerEvent) => any;
    onpointerout?: (ev: PointerEvent) => any;
    onpointerover?: (ev: PointerEvent) => any;
    onpointerup?: (ev: PointerEvent) => any;
    /**
     * Occurs to indicate progress while downloading media data.
     * @param ev The event.
     */
    onprogress?: (ev: ProgressEvent) => any;
    /**
     * Occurs when the playback rate is increased or decreased.
     * @param ev The event.
     */
    onratechange?: (ev: Event) => any;
    /**
     * Fires when the user resets a form.
     * @param ev The event.
     */
    onreset?: (ev: Event) => any;
    onresize?: (ev: UIEvent) => any;
    /**
     * Fires when the user repositions the scroll box in the scroll bar on the object.
     * @param ev The event.
     */
    onscroll?: (ev: Event) => any;
    onsecuritypolicyviolation?: (ev: SecurityPolicyViolationEvent) => any;
    /**
     * Occurs when the seek operation ends.
     * @param ev The event.
     */
    onseeked?: (ev: Event) => any;
    /**
     * Occurs when the current playback position is moved.
     * @param ev The event.
     */
    onseeking?: (ev: Event) => any;
    /**
     * Fires when the current selection changes.
     * @param ev The event.
     */
    onselect?: (ev: Event) => any;
    onselectionchange?: (ev: Event) => any;
    onselectstart?: (ev: Event) => any;
    /**
     * Occurs when the download has stopped.
     * @param ev The event.
     */
    onstalled?: (ev: Event) => any;
    onsubmit?: (ev: Event) => any;
    /**
     * Occurs if the load operation has been intentionally halted.
     * @param ev The event.
     */
    onsuspend?: (ev: Event) => any;
    /**
     * Occurs to indicate the current playback position.
     * @param ev The event.
     */
    ontimeupdate?: (ev: Event) => any;
    ontoggle?: (ev: Event) => any;
    ontouchcancel?: (ev: TouchEvent) => any;
    ontouchend?: (ev: TouchEvent) => any;
    ontouchmove?: (ev: TouchEvent) => any;
    ontouchstart?: (ev: TouchEvent) => any;
    ontransitioncancel?: (ev: TransitionEvent) => any;
    ontransitionend?: (ev: TransitionEvent) => any;
    ontransitionrun?: (ev: TransitionEvent) => any;
    ontransitionstart?: (ev: TransitionEvent) => any;
    /**
     * Occurs when the volume is changed, or playback is muted or unmuted.
     * @param ev The event.
     */
    onvolumechange?: (ev: Event) => any;
    /**
     * Occurs when playback stops because the next frame of a video resource is not available.
     * @param ev The event.
     */
    onwaiting?: (ev: Event) => any;
    onwheel?: (ev: WheelEvent) => any;
}