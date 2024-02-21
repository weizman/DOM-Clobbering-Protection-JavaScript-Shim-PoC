window.FIGHT_DOM_CLOBBERING = (function(){
    return main.bind(null, document.documentElement);

    function main(node, config) {
        let {
            enabled,
            allowlist,
            reportOnly,
            reportTo,
        } = Object.assign({enabled: true}, config);

        if (reportOnly && !reportTo) {
            throw new Error(`when reportOnly is turned on, reportTo must be provided. until fixed, dom clobbering protection is off`);
        }

        return observe(node);

        function hook(node) {
            const {name, value} = node;
            if (name !== 'id') {
                return;
            }
            if (!(window[value] instanceof HTMLElement)) {
                return;
            }
            if (allowlist?.includes(value)) {
                return;
            }
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

        function address(node) {
            switch (node.nodeType) {
                case Node.ELEMENT_NODE:
                    Array.from(node.attributes).forEach(address);
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
                            if (document.readyState === 'loading') {
                                mutation.addedNodes.forEach(node => {
                                    address(node);
                                });
                            }
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