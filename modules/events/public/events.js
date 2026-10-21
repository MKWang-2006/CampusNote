// EV-2: the shared countdown announces release; reload to get the authoritative booking state.
(function () {
  'use strict';
  document.addEventListener(
    'countdown:done',
    function () {
      window.location.reload();
    },
    { once: true },
  );
})();
