window.FIGHT_DOM_CLOBBERING = (function(){
    const node = document.documentElement;
    return function main(config) {
        let {
            enabled,
            allowlist,
            reportOnly,
            reportTo,
        } = Object.assign({enabled: true}, config);

        if (reportOnly && !reportTo) {
            throw new Error(`when reportOnly is turned on, reportTo must be provided. until fixed, dom clobbering protection is off`);
        }

        const blocked = [];

        return observe(node);

        function block(value) {
            blocked.push(value);
            Object.defineProperty(window, value, {get: function() {
                    if (enabled) {
                        const msg = `window["${value}"] access attempt was intercepted:`;
                        if (!reportOnly) {
                            throw new Error(msg);
                        }
                        fetch(reportTo, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                'csp-report': {
                                    "blocked-property": value,
                                    "disposition": "report",
                                    "document-uri": document.documentURI,
                                    "effective-directive": "dom-clobbering",
                                    "original-policy": "???",
                                    "referrer": document.referrer,
                                    "violated-directive": "dom-clobbering",
                                },
                            }),
                        });
                    }
                }
            });
        }

        function hook(node) {
            const {name, value} = node;
            if (allowlist?.includes(value) || blocked.includes(value)) {
                return;
            }
            if (name !== 'id' && name !== 'name') {
                return;
            }
            if (!window[value]) {
                return;
            }
            if (window[value] instanceof Element) {
                return block(value);
            }
            if (window[value] instanceof HTMLCollection) {
                return block(value);
            }
            if (window[value] === window[value]?.window && name === 'name') {
                return block(value);
            }
        }

        function address(node) {
            switch (node.nodeType) {
                case Node.ELEMENT_NODE:
                    const nodes = Array.from(node.querySelectorAll('*[id],*[name]')).concat(node);
                    nodes.forEach(node => Array.from(node.attributes).forEach(address));
                    break;
                case Node.ATTRIBUTE_NODE:
                    hook(node);
                    break;
                default:
                    break;
            }
        }

        function observe(target) {
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    switch (mutation.type) {
                        case 'childList':
                            mutation.addedNodes.forEach(node => {
                                address(node);
                            });
                            break;
                        case 'attributes':
                            address(mutation.target);
                            break;
                    }
                });
            });

            observer.observe(target, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeFilter: ['id'],
            });

            return () => {
                enabled = false;
                observer.disconnect();
            };
        }
    }
}());