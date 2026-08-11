/* Replaces the app's local storage layer with the shared hub store.
   All devices talking to this server see the same data. */
(function () {
  window.__hubStorage = true;
  var mem = {}, rev = 0;

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

  /* No automatic reloads: every device pushes with Save and pulls the
     others' work only when it refreshes itself. */

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
