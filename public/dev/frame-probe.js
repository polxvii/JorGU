'use strict';
(function () {
  var name = new URLSearchParams(location.search).get('name') || 'unknown';
  document.getElementById('info').textContent = 'iframe "' + name + '" loaded at ' + new Date().toLocaleTimeString();
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'jorgu-frame-load', name: name }, location.origin);
  }
})();
