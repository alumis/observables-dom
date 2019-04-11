import { Observable, ComputedObservable } from "@alumis/observables/dist/esm/Observable";

var attributes: { [name: string]: (element: HTMLElement, context, a: Attr) => () => void; } = {};

export function applyBindings(element: HTMLElement, context, includeSelf = true) {

    var disposeFunctions: { (): void; }[] = [];

    function parseElement(element: HTMLElement, includeSelf: boolean) {

        var child = <HTMLElement>element.firstElementChild;

        if (includeSelf) {

            for (var a of element.attributes) {

                var f = attributes[a.name];

                try {

                    if (f)
                        disposeFunctions.push(f(element, context, a));

                    else if (a.name.startsWith("data-bind-")) {

                        if (a.name.startsWith("data-bind-class-")) {

                            let computedObservable: ComputedObservable<boolean> = (new Function("$element", "$context", `with($context){return ComputedObservable.createComputed(function(){return ${a.value}})}`))(element, context);

                            bindClass(element, computedObservable, a.name.substr("data-bind-class-".length));
                            disposeFunctions.push(computedObservable.dispose);
                        }

                        else if (a.name.startsWith("data-bind-event-")) {

                            disposeFunctions.push(((element) => {

                                let fun = new Function("$event", "$context", `with($context){${a.value}}`);

                                let listener = (e: Event) => {
                        
                                    if (element.getAttribute("aria-disabled") != "true")
                                        fun(e, context);
                                };

                                let eventName = a.name.substr("data-bind-event-".length);
                        
                                element.addEventListener(eventName, listener);
                        
                                return () => { element.removeEventListener(eventName, listener); };

                            })(element));
                        }

                        else if (a.name.startsWith("data-bind-attribute-")) {

                            let computedObservable: ComputedObservable<string> = (new Function("$element", "$context", `with($context){return ComputedObservable.createComputed(function(){return ${a.value}})}`))(element, context);

                            bindAttribute(element, a.name.substr("data-bind-attribute-".length), computedObservable);
                            disposeFunctions.push(computedObservable.dispose);
                        }

                        else if (a.name.startsWith("data-bind-style-")) {

                            let computedObservable: ComputedObservable<string> = (new Function("$element", "$context", `with($context){return ComputedObservable.createComputed(function(){return ${a.value}})}`))(element, context);

                            bindStyle(element, camelCase(a.name.substr("data-bind-style-".length)), computedObservable);
                            disposeFunctions.push(computedObservable.dispose);
                        }
                        
                        else if (a.name.startsWith("data-bind-has-attribute-")) {

                            let computedObservable: ComputedObservable<string> = (new Function("$element", "$context", `with($context){return ComputedObservable.createComputed(function(){return ${a.value}})}`))(element, context);

                            bindAttribute(element, a.name.substr("data-bind-attribute-".length), computedObservable);
                            disposeFunctions.push(computedObservable.dispose);
                        }
                    }
                }

                catch (error) {

                    console.error(`Unable to apply binding attribute ${a.name} to element ${element.outerHTML}: ${error}`);
                }
            }
        }

        while (child) {

            var current = child;

            child = <HTMLElement>child.nextElementSibling;
            parseElement(current, true);
        }
    }

    parseElement(element, includeSelf);

    element["__context"] = context;

    return () => { for (var f of disposeFunctions) f(); };
}

export function bindClass(element: HTMLElement, observable: Observable<boolean>, cssClass: string) {

    return observable.subscribeInvoke(n => {

        if (n)
            element.classList.add(cssClass);

        else element.classList.remove(cssClass);
    });
}

export function bindAttribute(element: HTMLElement, qualifiedName: string, observable: Observable<string>) {

    return observable.subscribeInvoke(n => {

        element.setAttribute(qualifiedName, n);
    });
}

export function bindHasAttribute(element: HTMLElement, qualifiedName: string, observable: Observable<boolean>) {

    return observable.subscribeInvoke(n => {

        if (n)
            element.setAttribute(qualifiedName, String(n));

        else element.removeAttribute(qualifiedName);
    });
}

export function bindStyle(element: HTMLElement, style: string, observable: Observable<string>) {

    return observable.subscribeInvoke(n => {

        element.style[style] = n;
    });
}

function camelCase(str: string) {

    for (var startIndex = 0, i: number; (i = str.indexOf("-", startIndex)) !== -1;) {

        if (i + 1 < str.length) {

            str = str.substr(0, i) + str.charAt(i + 1).toUpperCase() + str.substr(i + 2);
            startIndex = i + 1;
        }

        else return str.substr(0, i);
    }

    return str;
}

export function context(element: HTMLElement) {

    do {

        var context = element["__context"];

        if (context)
            return context;

    } while (element = element.parentElement);
}