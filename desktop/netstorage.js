/* Replaces the app's local storage layer with the shared hub store.
   All devices talking to this server see the same data. */
(function () {
  var mem = {}, rev = 0, lastTouch = Date.now();

  function j(url, opts) {
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error("hub error " + r.status);
      return r.json();
    });
  }

  var ready = j("api/all").then(function (s) {
    mem = s.data || {};
    rev = s.rev || 0;
  });

  ["keydown", "pointerdown", "touchstart"].forEach(function (ev) {
    window.addEventListener(ev, function () { lastTouch = Date.now(); }, true);
  });

  /* Pick up entries made on other devices: reload when the hub's data has
     changed and this device has been idle for a while (so we never
     interrupt someone mid-entry). */
  setInterval(function () {
    j("api/rev").then(function (s) {
      if (s.rev !== rev && Date.now() - lastTouch > 10000) location.reload();
    }).catch(function () { /* hub briefly unreachable; try again */ });
  }, 3000);

  function post(url, body) {
    return j(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  window.storage = {
    get: function (k) {
      return ready.then(function () {
        var v = mem[k];
        if (v === null || v === undefined) throw new Error("not found");
        return { key: k, value: v, shared: true };
      });
    },
    set: function (k, v) {
      return ready.then(function () {
        mem[k] = v;
        return post("api/set", { key: k, value: v }).then(function (s) {
          rev = s.rev;
          return { key: k, value: v, shared: true };
        });
      });
    },
    "delete": function (k) {
      return ready.then(function () {
        delete mem[k];
        return post("api/delete", { key: k }).then(function (s) {
          rev = s.rev;
          return { key: k, deleted: true };
        });
      });
    },
    list: function (p) {
      return ready.then(function () {
        return { keys: [], prefix: p, shared: true };
      });
    }
  };
})();
