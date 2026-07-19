/* Peer Rank SPA. Vanilla JS, hash-routed, talks to the FastAPI backend on the
   same origin (so no CORS). One file: session, API client, router, and views. */
(function () {
  "use strict";

  var app = document.getElementById("app");

  // Inline SVG icons (stroke inherits currentColor).
  var ICON_PENCIL =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var ICON_CHECK =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var ICON_ALERT =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
  var ICON_QUESTION =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';
  var ICON_LOCK =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var ICON_TRASH =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  // Background intervals that must be torn down on navigation to avoid leaks
  // (e.g. a participation poll hitting a round that no longer exists).
  var pollTimers = [];
  function clearPolls() { pollTimers.forEach(clearInterval); pollTimers = []; }
  var currentAdminProjectId = null; // set while the admin project view is open
  var autoShowResultsRound = null;  // round id whose results should auto-open after refresh

  /* ------------------------------------------------------------------ *
   * Session (persisted in localStorage)
   * ------------------------------------------------------------------ */
  var session = {
    get token() { return localStorage.getItem("pr_token"); },
    get role() { return localStorage.getItem("pr_role"); },
    get email() { return localStorage.getItem("pr_email"); },
    set: function (t, role, email) {
      localStorage.setItem("pr_token", t);
      localStorage.setItem("pr_role", role);
      localStorage.setItem("pr_email", email);
    },
    clear: function () {
      localStorage.removeItem("pr_token");
      localStorage.removeItem("pr_role");
      localStorage.removeItem("pr_email");
    },
    get isAuthed() { return !!this.token; },
  };

  var returnTo = null; // where to go after a login prompt

  /* ------------------------------------------------------------------ *
   * Google Sign-In (Google Identity Services). The button is only shown when
   * the backend reports a configured client id (GET /api/auth/config).
   * ------------------------------------------------------------------ */
  var googleClientId = null; // null = unknown, "" = disabled, "…" = enabled

  function onGoogleCredential(resp) {
    api("/auth/google", { method: "POST", body: { credential: resp.credential } })
      .then(function (r) {
        session.set(r.token, r.role, r.email);
        toast("Welcome, " + r.email, "ok");
        var dest = returnTo || (r.role === "admin" ? "#/admin" : "#/home");
        returnTo = null;
        go(dest);
      })
      .catch(function (err) { toast(err.message, "err"); });
  }

  function mountGoogleButton(container) {
    function render() {
      var g = window.google;
      if (!container.isConnected || !googleClientId || !(g && g.accounts && g.accounts.id)) return;
      g.accounts.id.initialize({ client_id: googleClientId, callback: onGoogleCredential });
      g.accounts.id.renderButton(container, {
        theme: "outline", size: "large", text: "signin_with", shape: "pill", width: 300,
      });
    }
    function afterConfig() {
      if (!googleClientId) {
        // disabled -> hide the "or" divider and the empty placeholder (no gap)
        var prev = container.previousElementSibling;
        if (prev && prev.classList.contains("or-sep")) prev.style.display = "none";
        container.style.display = "none";
        return;
      }
      if (window.google && window.google.accounts && window.google.accounts.id) return render();
      var s = document.getElementById("gis-script");
      if (!s) {
        s = document.createElement("script");
        s.id = "gis-script";
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", render);
    }
    if (googleClientId === null) {
      api("/auth/config")
        .then(function (c) { googleClientId = c.google_client_id || ""; afterConfig(); })
        .catch(function () { googleClientId = ""; });
    } else {
      afterConfig();
    }
  }

  /* ------------------------------------------------------------------ *
   * API client
   * ------------------------------------------------------------------ */
  function api(path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (session.token) headers["Authorization"] = "Bearer " + session.token;
    return fetch("/api" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      // A 401 means "session expired" ONLY when we actually sent a token on a
      // non-auth request. On the auth endpoints (login/verify) a 401 is just
      // bad credentials — let the caller show the real message.
      var isAuthEndpoint = path.indexOf("/auth/") === 0;
      if (res.status === 401 && session.token && !isAuthEndpoint) {
        session.clear();
        toast("Your session has ended. Please sign in again to continue.", "err");
        go("#/login");
        throw new Error("unauthorized");
      }
      // 204 No Content (e.g. DELETE): nothing to parse.
      if (res.status === 204) return null;
      var isJson = (res.headers.get("content-type") || "").indexOf("json") !== -1;
      return (isJson ? res.json() : res.text()).then(function (data) {
        if (!res.ok) {
          var err = new Error(extractError(data, res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  // Turn any backend error shape into a readable sentence. FastAPI validation
  // errors (422) arrive as a list of {loc, msg}; a plain HTTPException uses
  // a string `detail`.
  function extractError(data, status) {
    if (data && typeof data.detail === "string") return data.detail;
    if (data && Array.isArray(data.detail)) {
      return data.detail.map(function (d) {
        var field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "";
        var msg = (d.msg || "invalid value").replace(/^value is /, "");
        return field ? field + ": " + msg : msg;
      }).join("; ");
    }
    return "Request failed (" + status + ")";
  }

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg, kind) {
    var t = el('<div class="toast ' + (kind || "") + '">' + esc(msg) + "</div>");
    document.getElementById("toasts").appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .3s, transform .3s";
      t.style.opacity = "0";
      t.style.transform = "translateX(18px)";
      setTimeout(function () { t.remove(); }, 300);
    }, 3200);
  }

  /* On-brand replacement for window.confirm(). Returns a Promise<boolean>.
     opts: { title, message, confirmText, cancelText, danger } */
  function confirmDialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var done = false;
      var overlay = el(
        '<div class="modal-overlay">' +
          '<div class="modal" role="dialog" aria-modal="true">' +
            '<div class="modal-icon ' + (opts.danger ? "danger" : "accent") + '">' +
              (opts.danger ? ICON_ALERT : ICON_QUESTION) + "</div>" +
            '<h3 class="modal-title">' + esc(opts.title || "Are you sure?") + "</h3>" +
            '<p class="modal-msg">' + esc(opts.message || "") + "</p>" +
            '<div class="modal-actions">' +
              '<button class="btn" data-cancel>' + esc(opts.cancelText || "Cancel") + "</button>" +
              '<button class="btn ' + (opts.danger ? "dngr" : "primary") + '" data-ok>' +
                esc(opts.confirmText || "Confirm") + "</button>" +
            "</div>" +
          "</div>" +
        "</div>"
      );
      function close(val) {
        if (done) return; done = true;
        document.removeEventListener("keydown", onKey);
        overlay.classList.remove("show");
        setTimeout(function () { overlay.remove(); }, 170);
        resolve(val);
      }
      function onKey(e) {
        if (e.key === "Escape") close(false);
        else if (e.key === "Enter") close(true);
      }
      overlay.querySelector("[data-ok]").onclick = function () { close(true); };
      overlay.querySelector("[data-cancel]").onclick = function () { close(false); };
      overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(false); });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add("show"); });
      setTimeout(function () { var b = overlay.querySelector("[data-ok]"); if (b) b.focus(); }, 30);
    });
  }
  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  // Backend sends naive-UTC ISO strings (no tz). Treat them as UTC.
  function parseUTC(s) {
    if (!s) return null;
    if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s = s + "Z";
    return new Date(s);
  }
  function fmtDateTime(s) {
    var d = parseUTC(s);
    return d ? d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  }
  function countdownText(endStr) {
    var end = parseUTC(endStr);
    if (!end) return "";
    var s = Math.floor((end.getTime() - Date.now()) / 1000);
    if (s <= 0) return "closed";
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return d + "d " + h + "h " + m + "m";
    if (h > 0) return h + "h " + m + "m";
    if (m > 0) return m + "m " + sec + "s";
    return sec + "s"; // final minute ticks second-by-second
  }
  // Full "closes in …" / "closing…" phrase for a round window.
  function cdPhrase(endStr) {
    var t = countdownText(endStr);
    return t === "closed" ? "closing…" : "closes in " + t;
  }
  // A live phrase span the global ticker keeps current (includes its own label).
  function cdLive(endStr) {
    return '<b class="cd-live" data-end="' + esc(endStr) + '">' + cdPhrase(endStr) + "</b>";
  }
  function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
  function voteLink(token) { return location.origin + "/app/#/vote/" + token; }
  function busy(btn, on) {
    if (!btn) return;
    if (on) { btn._t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    else { btn.disabled = false; if (btn._t) btn.innerHTML = btn._t; }
  }
  function loading() { app.innerHTML = '<div class="center-state"><div class="spinner"></div></div>'; }

  /* Email adder. Type an address and press Enter (or comma) to add it; each one
     appears as its own numbered row below, one by one. Validates format, blocks
     duplicates, and accepts pasted lists. getEmails() returns the committed
     addresses (or null if there is invalid pending text, so the caller can
     block submit). */
  function makeEmailChips(placeholder) {
    var wrap = el(
      '<div class="email-adder">' +
        '<input class="ci-input" type="text" autocomplete="off" placeholder="' + esc(placeholder || "Enter an email address") + '" />' +
        '<div class="ci-list"></div>' +
      "</div>"
    );
    var input = wrap.querySelector(".ci-input");
    var list = wrap.querySelector(".ci-list");
    var emails = [];

    function render() {
      list.innerHTML = "";
      emails.forEach(function (email, idx) {
        var row = el(
          '<div class="ci-row">' +
            '<span class="ci-num">' + (idx + 1) + "</span>" +
            '<span class="ci-em">' + esc(email) + "</span>" +
            '<button type="button" class="ci-x" aria-label="Remove">&times;</button>' +
          "</div>"
        );
        row.querySelector("button").onclick = function () {
          emails.splice(idx, 1); render(); input.focus();
        };
        list.appendChild(row);
      });
    }

    // Returns false only when there was non-empty, invalid text.
    function commit(raw) {
      var v = (raw || "").trim().replace(/[,;]+$/, "").toLowerCase();
      if (!v) return true;
      if (!isEmail(v)) { toast('"' + v + '" is not a valid email — use name@company.com', "err"); return false; }
      if (emails.indexOf(v) !== -1) { toast(v + " is already added", "err"); input.value = ""; return true; }
      emails.push(v); input.value = ""; render(); return true;
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(input.value); }
      else if (e.key === "Backspace" && !input.value && emails.length) { emails.pop(); render(); }
    });
    input.addEventListener("blur", function () { commit(input.value); });
    input.addEventListener("paste", function (e) {
      var text = (e.clipboardData || window.clipboardData).getData("text");
      if (text && /[\n,;\s]/.test(text)) {
        e.preventDefault();
        text.split(/[\n,;\s]+/).forEach(function (p) { if (p.trim()) commit(p); });
      }
    });

    return {
      el: wrap,
      focus: function () { input.focus(); },
      getEmails: function () {
        if (input.value.trim() && !commit(input.value)) return null; // invalid pending text
        return emails.slice();
      },
    };
  }

  /* Pointer-based drag reordering for the ballot. The grabbed row follows the
     pointer 1:1 while the others slide to open a gap; on release the row drops
     into its new slot and `order` is committed, then repaint() renders it. */
  function enableDrag(listEl, order, repaint) {
    var dragging = null, dragIndex = -1, target = -1, startY = 0, step = 0, rows = [];

    function onMove(e) {
      if (!dragging) return;
      var delta = e.clientY - startY;
      dragging.style.transform = "translateY(" + delta + "px)";
      target = Math.max(0, Math.min(order.length - 1, dragIndex + Math.round(delta / step)));
      rows.forEach(function (r, i) {
        if (r === dragging) return;
        var shift = 0;
        if (dragIndex < target && i > dragIndex && i <= target) shift = -step;
        else if (dragIndex > target && i < dragIndex && i >= target) shift = step;
        r.style.transform = shift ? "translateY(" + shift + "px)" : "";
      });
    }

    function onUp() {
      if (!dragging) return;
      rows.forEach(function (r) { r.style.transform = ""; });
      dragging.classList.remove("dragging");
      document.body.style.userSelect = "";
      var d = dragging; dragging = null;
      d.releasePointerCapture && d._pid != null && d.releasePointerCapture(d._pid);
      if (target !== dragIndex && target !== -1) {
        var moved = order.splice(dragIndex, 1)[0];
        order.splice(target, 0, moved);
        repaint(target); // re-render in committed order, highlight the moved row
      } else {
        repaint(-1);
      }
    }

    Array.prototype.forEach.call(listEl.children, function (row, idx) {
      row.addEventListener("pointerdown", function (e) {
        if (e.target.closest(".move-btns")) return; // let the arrow buttons work
        e.preventDefault();
        rows = Array.prototype.slice.call(listEl.children);
        dragging = row; dragIndex = idx; target = idx;
        startY = e.clientY;
        step = row.offsetHeight + 8; // row height + margin-bottom
        row._pid = e.pointerId;
        row.setPointerCapture(e.pointerId);
        row.classList.add("dragging");
        document.body.style.userSelect = "none";
      });
      row.addEventListener("pointermove", onMove);
      row.addEventListener("pointerup", onUp);
      row.addEventListener("pointercancel", onUp);
    });
  }

  function header() {
    var right = session.isAuthed
      ? '<div class="header-right">' +
          '<span class="who"><span class="dot"></span>' +
            '<span class="who-lines">' +
              '<span class="who-role">' + esc(session.role) + "</span>" +
              '<span class="who-email">' + esc(session.email) + "</span>" +
            "</span>" +
          "</span>" +
          '<button class="btn sm signout" id="logout">Sign out</button>' +
        "</div>"
      : "";
    var h = el(
      '<div class="app-header">' +
        '<div class="brand"><div class="logo">P</div><div class="name">Peer<span>Rank</span></div></div>' +
        right +
      "</div>"
    );
    h.querySelector(".brand").onclick = function () {
      go(session.role === "admin" ? "#/admin" : (session.isAuthed ? "#/home" : "#/login"));
    };
    var lo = h.querySelector("#logout");
    if (lo) lo.onclick = function () { session.clear(); toast("Signed out"); go("#/login"); };
    return h;
  }

  function shell(inner, opts) {
    opts = opts || {};
    app.innerHTML = "";
    if (!opts.bare) app.appendChild(header());
    var c = el('<div class="container view ' + (opts.narrow ? "narrow" : "") + '"></div>');
    if (typeof inner === "string") c.innerHTML = inner;
    else c.appendChild(inner);
    app.appendChild(c);
    return c;
  }

  /* ------------------------------------------------------------------ *
   * LOGIN
   * ------------------------------------------------------------------ */
  function viewLogin() {
    app.innerHTML = "";
    var wrap = el(
      '<div class="auth-wrap"><div class="auth-card">' +
        '<div class="auth-brand"><div class="logo">P</div>' +
          '<div><p class="auth-title">Peer Rank</p><p class="auth-sub">Sign in to continue</p></div></div>' +
        '<form id="login-form">' +
          '<label class="field"><span class="lbl">Email</span>' +
            '<input id="u" type="email" autocomplete="email" placeholder="Enter your email" /></label>' +
          '<label class="field" style="margin-bottom:6px;"><span class="lbl">Password</span>' +
            '<input id="p" type="password" autocomplete="current-password" placeholder="Enter your password" /></label>' +
          '<p style="text-align:right;margin:0 0 14px;"><a id="to-forgot" class="link-sm">Forgot password?</a></p>' +
          '<button class="btn primary block" type="submit" id="signin">Sign in</button>' +
        '</form>' +
        '<div class="or-sep"><span>or</span></div>' +
        '<div id="google-btn" class="google-btn"></div>' +
        '<p class="auth-switch">New to Peer Rank? <a id="to-signup">Create an account</a></p>' +
      "</div></div>"
    );
    wrap.querySelector("#to-signup").onclick = function () { go("#/signup"); };
    wrap.querySelector("#to-forgot").onclick = function () { go("#/forgot"); };
    mountGoogleButton(wrap.querySelector("#google-btn"));
    wrap.querySelector("#login-form").onsubmit = function (e) {
      e.preventDefault();
      var btn = wrap.querySelector("#signin");
      var email = wrap.querySelector("#u").value.trim().toLowerCase();
      var password = wrap.querySelector("#p").value;
      if (!isEmail(email)) return toast("Enter a valid email address", "err");
      if (!password) return toast("Enter your password", "err");
      busy(btn, true);
      api("/auth/login", { method: "POST", body: { username: email, password: password } })
        .then(function (r) {
          session.set(r.token, r.role, r.email);
          toast("Welcome, " + r.email, "ok");
          var dest = returnTo || (r.role === "admin" ? "#/admin" : "#/home");
          returnTo = null;
          go(dest);
        })
        .catch(function (err) { busy(btn, false); if (err.message !== "unauthorized") toast(err.message, "err"); });
    };
    app.appendChild(wrap);
  }

  /* ------------------------------------------------------------------ *
   * SIGN UP  (email + password -> email OTP -> verified account)
   * ------------------------------------------------------------------ */
  var pendingSignup = null; // { email } carried from signup to verify

  function authShell(inner) {
    app.innerHTML = "";
    var wrap = el('<div class="auth-wrap"><div class="auth-card"></div></div>');
    var card = wrap.querySelector(".auth-card");
    card.appendChild(el(
      '<div class="auth-brand"><div class="logo">P</div>' +
        '<div><p class="auth-title">Peer Rank</p><p class="auth-sub" id="auth-sub"></p></div></div>'
    ));
    if (typeof inner === "string") card.insertAdjacentHTML("beforeend", inner);
    else card.appendChild(inner);
    app.appendChild(wrap);
    return card;
  }

  function viewSignup() {
    var card = authShell(
      '<form id="su-form">' +
        '<div class="field"><span class="lbl">I\'m signing up as</span>' +
          '<div class="seg" id="su-role" data-active="member">' +
            '<button type="button" data-role="member" class="active">Team member</button>' +
            '<button type="button" data-role="admin">Admin</button>' +
          "</div></div>" +
        '<label class="field"><span class="lbl">Full name</span>' +
          '<input id="su-name" autocomplete="name" placeholder="Enter your name" /></label>' +
        '<label class="field"><span class="lbl">Email</span>' +
          '<input id="su-email" type="email" autocomplete="email" placeholder="Enter your email" /></label>' +
        '<label class="field"><span class="lbl">Password</span>' +
          '<input id="su-pw" type="password" autocomplete="new-password" placeholder="Create a password (min 8 characters)" /></label>' +
        '<label class="field"><span class="lbl">Confirm password</span>' +
          '<input id="su-pw2" type="password" autocomplete="new-password" placeholder="Re-enter your password" /></label>' +
        '<button class="btn primary block" type="submit" id="su-btn">Create account</button>' +
      "</form>" +
      '<div class="or-sep"><span>or</span></div>' +
      '<div id="google-btn" class="google-btn"></div>' +
      '<p class="auth-switch">Already have an account? <a id="to-login">Sign in</a></p>'
    );
    card.querySelector("#auth-sub").textContent = "Create your account";
    card.querySelector("#to-login").onclick = function () { go("#/login"); };
    mountGoogleButton(card.querySelector("#google-btn"));

    var role = "member";
    var seg = card.querySelector("#su-role");
    seg.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () {
        role = b.getAttribute("data-role");
        seg.setAttribute("data-active", role);   // slides the highlight
        seg.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
      };
    });

    card.querySelector("#su-form").onsubmit = function (e) {
      e.preventDefault();
      var name = card.querySelector("#su-name").value.trim();
      var email = card.querySelector("#su-email").value.trim().toLowerCase();
      var pw = card.querySelector("#su-pw").value;
      var pw2 = card.querySelector("#su-pw2").value;
      if (!isEmail(email)) return toast("Enter a valid email address", "err");
      if (pw.length < 8) return toast("Password must be at least 8 characters", "err");
      if (pw !== pw2) return toast("Passwords don't match", "err");
      var btn = card.querySelector("#su-btn"); busy(btn, true);
      api("/auth/signup", { method: "POST", body: { email: email, password: pw, display_name: name, role: role } })
        .then(function (r) {
          pendingSignup = { email: email };
          toast(r.message, "ok");
          go("#/verify");
        })
        .catch(function (err) { busy(btn, false); toast(err.message, "err"); });
    };
  }

  /* Six auto-advancing OTP boxes. Returns { el, value(), focus() }. */
  function otpBoxes(onComplete) {
    var wrap = el('<div class="otp-boxes"></div>');
    var boxes = [];
    for (var i = 0; i < 6; i++) {
      wrap.appendChild(el('<input class="otp-box" inputmode="numeric" maxlength="1" aria-label="Digit" />'));
    }
    boxes = Array.prototype.slice.call(wrap.querySelectorAll(".otp-box"));
    function value() { return boxes.map(function (b) { return b.value; }).join(""); }
    boxes.forEach(function (box, i) {
      box.addEventListener("input", function () {
        box.value = box.value.replace(/\D/g, "").slice(-1);
        if (box.value && i < 5) boxes[i + 1].focus();
        if (value().length === 6 && onComplete) onComplete(value());
      });
      box.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus();
      });
      box.addEventListener("paste", function (e) {
        var digits = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
        if (!digits) return;
        e.preventDefault();
        digits.split("").forEach(function (d, j) { if (boxes[j]) boxes[j].value = d; });
        boxes[Math.min(digits.length, 5)].focus();
        if (digits.length === 6 && onComplete) onComplete(digits);
      });
    });
    return { el: wrap, value: value, focus: function () { boxes[0].focus(); } };
  }

  function viewVerify() {
    if (!pendingSignup) return go("#/signup");
    var email = pendingSignup.email;
    var card = authShell(
      '<p class="verify-note">Enter the 6-digit code we sent to <b>' + esc(email) + "</b></p>" +
      '<div id="otp-host"></div>' +
      '<button class="btn primary block" id="vf-btn" style="margin-top:18px;">Verify &amp; continue</button>' +
      '<p class="auth-switch"><a id="vf-resend">Resend code</a> &middot; <a id="vf-back">Use a different email</a></p>'
    );
    card.querySelector("#auth-sub").textContent = "Verify your email";

    var submit = function () {
      var code = otp.value();
      if (code.length !== 6) return toast("Enter the 6-digit code", "err");
      var btn = card.querySelector("#vf-btn"); busy(btn, true);
      api("/auth/verify", { method: "POST", body: { email: email, code: code } })
        .then(function (r) {
          session.set(r.token, r.role, r.email);
          pendingSignup = null;
          toast("Welcome to Peer Rank!", "ok");
          var dest = returnTo || (r.role === "admin" ? "#/admin" : "#/home");
          returnTo = null;
          go(dest);
        })
        .catch(function (err) { busy(btn, false); toast(err.message, "err"); });
    };

    var otp = otpBoxes(function () { submit(); });
    card.querySelector("#otp-host").appendChild(otp.el);
    setTimeout(function () { otp.focus(); }, 30);
    card.querySelector("#vf-btn").onclick = submit;
    card.querySelector("#vf-back").onclick = function () { pendingSignup = null; go("#/signup"); };
    card.querySelector("#vf-resend").onclick = function () {
      api("/auth/resend", { method: "POST", body: { email: email } })
        .then(function (r) { toast(r.message, "ok"); })
        .catch(function (err) { toast(err.message, "err"); });
    };
  }

  /* ------------------------------------------------------------------ *
   * FORGOT / RESET PASSWORD
   * ------------------------------------------------------------------ */
  var pendingReset = null; // { email } carried from forgot -> reset

  function viewForgot() {
    var card = authShell(
      '<p class="verify-note" style="margin-bottom:18px;">Enter your account email and we\'ll send a 6-digit code to reset your password.</p>' +
      '<form id="fg-form">' +
        '<label class="field"><span class="lbl">Email</span>' +
          '<input id="fg-email" type="email" autocomplete="email" placeholder="Enter your email" /></label>' +
        '<button class="btn primary block" type="submit" id="fg-btn">Send reset code</button>' +
      "</form>" +
      '<p class="auth-switch"><a id="fg-back">Back to sign in</a></p>'
    );
    card.querySelector("#auth-sub").textContent = "Reset your password";
    card.querySelector("#fg-back").onclick = function () { go("#/login"); };
    card.querySelector("#fg-form").onsubmit = function (e) {
      e.preventDefault();
      var email = card.querySelector("#fg-email").value.trim().toLowerCase();
      if (!isEmail(email)) return toast("Enter a valid email address", "err");
      var btn = card.querySelector("#fg-btn"); busy(btn, true);
      api("/auth/forgot", { method: "POST", body: { email: email } })
        .then(function (r) {
          pendingReset = { email: email };
          toast(r.message, "ok");
          go("#/reset");
        })
        .catch(function (err) { busy(btn, false); toast(err.message, "err"); });
    };
  }

  function viewReset() {
    if (!pendingReset) return go("#/forgot");
    var email = pendingReset.email;
    resetStepCode(email);
  }

  // Step 1 — enter and verify the 6-digit code.
  function resetStepCode(email) {
    var card = authShell(
      '<p class="verify-note">Enter the 6-digit code sent to <b>' + esc(email) + "</b></p>" +
      '<div id="rs-otp"></div>' +
      '<button class="btn primary block" id="rs-continue" style="margin-top:18px;">Continue</button>' +
      '<p class="auth-switch"><a id="rs-resend">Resend code</a> &middot; <a id="rs-back">Use a different email</a></p>'
    );
    card.querySelector("#auth-sub").textContent = "Reset your password";

    var verifying = false;
    function checkCode() {
      var code = otp.value();
      if (code.length !== 6 || verifying) return;
      verifying = true;
      var btn = card.querySelector("#rs-continue"); busy(btn, true);
      api("/auth/reset/check", { method: "POST", body: { email: email, code: code } })
        .then(function () { resetStepPassword(email, code); })   // code good -> ask for password
        .catch(function (err) { verifying = false; busy(btn, false); toast(err.message, "err"); });
    }

    var otp = otpBoxes(function () { checkCode(); });  // auto-check when 6 digits entered
    card.querySelector("#rs-otp").appendChild(otp.el);
    setTimeout(function () { otp.focus(); }, 30);
    card.querySelector("#rs-continue").onclick = checkCode;
    card.querySelector("#rs-back").onclick = function () { pendingReset = null; go("#/forgot"); };
    card.querySelector("#rs-resend").onclick = function () {
      api("/auth/forgot", { method: "POST", body: { email: email } })
        .then(function (r) { toast(r.message, "ok"); })
        .catch(function (err) { toast(err.message, "err"); });
    };
  }

  // Step 2 — code is verified; choose the new password.
  function resetStepPassword(email, code) {
    var card = authShell(
      '<p class="verify-note">Code verified ✓ — choose a new password for <b>' + esc(email) + "</b></p>" +
      '<label class="field"><span class="lbl">New password</span>' +
        '<input id="rs-pw" type="password" autocomplete="new-password" placeholder="New password (min 8 characters)" /></label>' +
      '<label class="field"><span class="lbl">Confirm new password</span>' +
        '<input id="rs-pw2" type="password" autocomplete="new-password" placeholder="Re-enter new password" /></label>' +
      '<button class="btn primary block" id="rs-btn">Reset password</button>' +
      '<p class="auth-switch"><a id="rs-recode">Re-enter code</a></p>'
    );
    card.querySelector("#auth-sub").textContent = "Reset your password";
    setTimeout(function () { card.querySelector("#rs-pw").focus(); }, 30);

    card.querySelector("#rs-btn").onclick = function () {
      var pw = card.querySelector("#rs-pw").value;
      var pw2 = card.querySelector("#rs-pw2").value;
      if (pw.length < 8) return toast("Password must be at least 8 characters", "err");
      if (pw !== pw2) return toast("Passwords don't match", "err");
      var btn = card.querySelector("#rs-btn"); busy(btn, true);
      api("/auth/reset", { method: "POST", body: { email: email, code: code, new_password: pw } })
        .then(function (r) {
          session.set(r.token, r.role, r.email);
          pendingReset = null;
          toast("Password updated — you're signed in", "ok");
          go(r.role === "admin" ? "#/admin" : "#/home");
        })
        .catch(function (err) {
          busy(btn, false);
          toast(err.message, "err");
          if (err.status === 400) resetStepCode(email);  // code expired/invalid -> back to step 1
        });
    };
    card.querySelector("#rs-recode").onclick = function () { resetStepCode(email); };
  }

  /* ------------------------------------------------------------------ *
   * VOTER HOME (signed-in member without a specific link)
   * ------------------------------------------------------------------ */
  function viewHome() {
    var c = shell(
      '<h1 class="page">Cast your vote</h1>' +
      '<p class="sub">Open the voting link your admin shared with you, or paste its code below.</p>' +
      '<div class="card"><label class="field"><span class="lbl">Voting code</span>' +
        '<input id="code" placeholder="Enter your voting code" /></label>' +
        '<button class="btn primary block" id="open">Open voting</button></div>'
    );
    c.querySelector("#open").onclick = function () {
      var code = c.querySelector("#code").value.trim();
      if (code) go("#/vote/" + code);
    };
  }

  /* ------------------------------------------------------------------ *
   * ADMIN — projects list
   * ------------------------------------------------------------------ */
  function viewAdminProjects() {
    editingTeamId = null; // leave any open edit state behind
    currentAdminProjectId = null;
    clearPolls();
    loading();
    api("/projects").then(function (projects) {
      var c = shell(
        '<h1 class="page">Projects</h1>' +
        '<p class="sub">Each project holds its teams and voting rounds.</p>' +
        '<div id="plist" class="stack"></div>' +
        '<button class="btn block" id="newp" style="margin-top:12px;">+ Create project</button>' +
        '<div id="newp-form"></div>'
      );
      var list = c.querySelector("#plist");
      if (!projects.length) {
        list.appendChild(el('<div class="empty">No projects yet. Create your first one below.</div>'));
      }
      projects.forEach(function (p) {
        var card = el(
          '<div class="card clickable"><div class="row">' +
            '<div><div style="font-weight:600;font-size:15px;">' + esc(p.name) + '</div>' +
            '<div class="muted">Created ' + fmtDateTime(p.created_at) + '</div></div>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<button class="icon-btn danger" title="Delete project" data-del>' + ICON_TRASH + "</button>" +
              '<span class="muted">&rarr;</span></div>' +
          "</div></div>"
        );
        card.onclick = function () { go("#/admin/project/" + p.id); };
        card.querySelector("[data-del]").onclick = function (e) {
          e.stopPropagation(); // don't open the project
          confirmDialog({
            title: "Delete this project?",
            message: 'This permanently deletes "' + p.name + '" and all its teams, rounds, and results. This cannot be undone.',
            confirmText: "Delete",
            danger: true,
          }).then(function (ok) {
            if (!ok) return;
            api("/projects/" + p.id, { method: "DELETE" })
              .then(function () { toast("Project deleted", "ok"); viewAdminProjects(); })
              .catch(function (err) { toast(err.message, "err"); });
          });
        };
        list.appendChild(card);
      });
      c.querySelector("#newp").onclick = function () { showNewProject(c); };
    }).catch(apiErr);
  }

  function showNewProject(c) {
    var host = c.querySelector("#newp-form");
    if (host.firstChild) { host.innerHTML = ""; return; }
    var form = el(
      '<div class="card" style="margin-top:10px;">' +
        '<label class="field"><span class="lbl">Project name</span>' +
        '<input id="pn" placeholder="Enter a project name" /></label>' +
        '<div style="display:flex;gap:8px;"><button class="btn" id="pc" style="flex:1;">Cancel</button>' +
        '<button class="btn primary" id="ps" style="flex:1;">Save</button></div></div>'
    );
    host.appendChild(form);
    form.querySelector("#pn").focus();
    form.querySelector("#pc").onclick = function () { host.innerHTML = ""; };
    form.querySelector("#ps").onclick = function () {
      var name = form.querySelector("#pn").value.trim();
      if (!name) return toast("Enter a project name", "err");
      var btn = form.querySelector("#ps"); busy(btn, true);
      api("/projects", { method: "POST", body: { name: name } })
        .then(function () { toast("Project created", "ok"); viewAdminProjects(); })
        .catch(function (e) { busy(btn, false); toast(e.message, "err"); });
    };
  }

  /* ------------------------------------------------------------------ *
   * ADMIN — project detail (Teams / Rounds tabs)
   * ------------------------------------------------------------------ */
  var adminTab = "teams";
  var editingTeamId = null; // which team is in edit-members mode
  function viewAdminProject(id) {
    clearPolls();
    currentAdminProjectId = id;
    loading();
    Promise.all([
      api("/projects/" + id),
      api("/projects/" + id + "/teams"),
      api("/projects/" + id + "/rounds"),
    ]).then(function (r) {
      var project = r[0], teams = r[1], rounds = r[2];
      var c = shell("");
      c.appendChild(el('<button class="back" id="back">&larr; Projects</button>'));
      c.appendChild(el('<h1 class="page">' + esc(project.name) + "</h1>"));
      c.appendChild(el('<p class="sub">' + teams.length + " team" + (teams.length === 1 ? "" : "s") +
        " &middot; " + rounds.length + " round" + (rounds.length === 1 ? "" : "s") + "</p>"));
      var tabs = el(
        '<div class="tabs">' +
          '<button data-t="teams">Teams</button>' +
          '<button data-t="rounds">Rounds &amp; results</button>' +
        "</div>"
      );
      c.appendChild(tabs);
      var panel = el('<div id="panel"></div>');
      c.appendChild(panel);

      function paint() {
        tabs.querySelectorAll("button").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-t") === adminTab);
        });
        panel.innerHTML = "";
        if (adminTab === "teams") renderTeamsPanel(panel, project, teams);
        else renderRoundsPanel(panel, project, teams, rounds);
      }
      tabs.querySelectorAll("button").forEach(function (b) {
        b.onclick = function () { adminTab = b.getAttribute("data-t"); paint(); };
      });
      c.querySelector("#back").onclick = function () { go("#/admin"); };
      paint();
    }).catch(apiErr);
  }

  function teamCard(project, t) {
    var editing = editingTeamId === t.id;
    var card = el('<div class="card"></div>');
    var head = el(
      '<div class="row" style="margin-bottom:10px;">' +
        '<div style="font-weight:600;">' + esc(t.name) +
          ' <span class="muted">(' + t.members.length + ')</span></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="icon-btn' + (editing ? " active" : "") + '" data-edit title="' +
            (editing ? "Done editing" : "Edit teammates") + '">' +
            (editing ? ICON_CHECK : ICON_PENCIL) + "</button>" +
          '<button class="icon-btn danger" data-del title="Delete team">' + ICON_TRASH + "</button>" +
        "</div>" +
      "</div>"
    );
    head.querySelector("[data-edit]").onclick = function () {
      editingTeamId = editing ? null : t.id;
      viewAdminProject(project.id);
    };
    head.querySelector("[data-del]").onclick = function () {
      confirmDialog({
        title: "Delete this team?",
        message: 'This permanently deletes "' + t.name + '", its members, and any rounds that used it. This cannot be undone.',
        confirmText: "Delete",
        danger: true,
      }).then(function (ok) {
        if (!ok) return;
        api("/teams/" + t.id, { method: "DELETE" })
          .then(function () { toast("Team deleted", "ok"); editingTeamId = null; viewAdminProject(project.id); })
          .catch(function (err) { toast(err.message, "err"); });
      });
    };
    card.appendChild(head);

    // ---- view mode: chips ----
    if (!editing) {
      if (!t.members.length) {
        card.appendChild(el('<p class="muted" style="margin:0;">No members yet — click Edit teammates to add some.</p>'));
      } else {
        var chips = t.members.map(function (m) { return '<span class="chip">' + esc(m.email) + "</span>"; }).join("");
        card.appendChild(el('<div class="chips">' + chips + "</div>"));
      }
      return card;
    }

    // ---- edit mode: removable rows + add form ----
    if (!t.members.length) card.appendChild(el('<p class="muted" style="margin:0 0 6px;">No members yet.</p>'));
    t.members.forEach(function (m) {
      var row = el(
        '<div class="member-row">' +
          '<div><div class="mname">' + esc(m.display_name) + "</div>" +
          '<div class="email">' + esc(m.email) + "</div></div>" +
          '<button class="member-x" title="Remove teammate">&times;</button>' +
        "</div>"
      );
      row.querySelector("button").onclick = function () {
        confirmDialog({
          title: "Remove teammate?",
          message: "Remove " + m.email + " from " + t.name + "?",
          confirmText: "Remove",
          danger: true,
        }).then(function (ok) {
          if (!ok) return;
          api("/teams/" + t.id + "/members/" + m.id, { method: "DELETE" })
            .then(function () { toast("Teammate removed", "ok"); viewAdminProject(project.id); })
            .catch(function (e) { toast(e.message, "err"); });
        });
      };
      card.appendChild(row);
    });

    var addForm = el(
      '<div class="add-member">' +
        '<input placeholder="Enter an email address" />' +
        '<button class="btn sm">+ Add</button>' +
      "</div>"
    );
    var input = addForm.querySelector("input");
    var addBtn = addForm.querySelector("button");
    function doAdd() {
      var email = input.value.trim();
      if (!email) return toast("Enter an email", "err");
      if (!isEmail(email)) return toast('"' + email + '" is not a valid email — use name@company.com', "err");
      busy(addBtn, true);
      api("/teams/" + t.id + "/members", { method: "POST", body: { email: email } })
        .then(function () { toast("Teammate added", "ok"); viewAdminProject(project.id); })
        .catch(function (e) { busy(addBtn, false); toast(e.message, "err"); });
    }
    addBtn.onclick = doAdd;
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") doAdd(); });
    card.appendChild(addForm);
    return card;
  }

  function renderTeamsPanel(panel, project, teams) {
    if (!teams.length) panel.appendChild(el('<div class="empty">No teams yet. Create one to add voters.</div>'));
    teams.forEach(function (t) { panel.appendChild(teamCard(project, t)); });
    var add = el('<button class="btn block" style="margin-top:12px;">+ Create team</button>');
    var host = el("<div></div>");
    panel.appendChild(add); panel.appendChild(host);
    add.onclick = function () {
      if (host.firstChild) { host.innerHTML = ""; return; }
      var form = el(
        '<div class="card" style="margin-top:10px;">' +
          '<label class="field"><span class="lbl">Team name</span><input id="tn" placeholder="Enter a team name" /></label>' +
          '<label class="field"><span class="lbl">Member emails</span>' +
            '<div id="te-host"></div>' +
            '<span class="hint">Add teammates one by one — type an email and hit Enter.</span>' +
          "</label>" +
          '<div style="display:flex;gap:8px;"><button class="btn" id="tc" style="flex:1;">Cancel</button>' +
          '<button class="btn primary" id="ts" style="flex:1;">Save team</button></div></div>'
      );
      host.appendChild(form);
      var chips = makeEmailChips("Enter an email address");
      form.querySelector("#te-host").appendChild(chips.el);
      form.querySelector("#tn").focus();
      form.querySelector("#tc").onclick = function () { host.innerHTML = ""; };
      form.querySelector("#ts").onclick = function () {
        var name = form.querySelector("#tn").value.trim();
        if (!name) return toast("Enter a team name", "err");
        var emails = chips.getEmails();
        if (emails === null) return;                 // invalid pending text (toast already shown)
        if (!emails.length) return toast("Add at least one member email", "err");
        var btn = form.querySelector("#ts"); busy(btn, true);
        api("/projects/" + project.id + "/teams", { method: "POST", body: { name: name, emails: emails } })
          .then(function () { toast("Team created", "ok"); viewAdminProject(project.id); })
          .catch(function (e) { busy(btn, false); toast(e.message, "err"); });
      };
    };
  }

  function renderRoundsPanel(panel, project, teams, rounds) {
    var add = el('<button class="btn block" id="nr">+ Open a voting round</button>');
    var formHost = el('<div></div>');
    panel.appendChild(add); panel.appendChild(formHost);

    if (!rounds.length) panel.appendChild(el('<div class="empty" style="margin-top:12px;">No rounds yet. Open one to start collecting votes.</div>'));
    rounds.forEach(function (rnd) { panel.appendChild(roundCard(project, rnd)); });

    add.onclick = function () {
      if (formHost.firstChild) { formHost.innerHTML = ""; return; }
      if (!teams.length) return toast("Create a team first", "err");
      var now = new Date();
      var end = new Date(now.getTime() + 10 * 60 * 1000); // default: closes in 10 minutes
      var opts = teams.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + "</option>"; }).join("");
      var form = el(
        '<div class="card" style="margin-top:10px;">' +
          '<label class="field"><span class="lbl">Round name</span><input id="rn" placeholder="Enter a round name" /></label>' +
          '<label class="field"><span class="lbl">Team</span><select id="rt">' + opts + "</select></label>" +
          '<div style="display:flex;gap:10px;"><label class="field" style="flex:1;"><span class="lbl">Opens</span>' +
            '<input id="rs" type="datetime-local" value="' + localInput(now) + '" /></label>' +
          '<label class="field" style="flex:1;"><span class="lbl">Closes</span>' +
            '<input id="re" type="datetime-local" value="' + localInput(end) + '" /></label></div>' +
          '<div style="display:flex;gap:8px;"><button class="btn" id="rc" style="flex:1;">Cancel</button>' +
          '<button class="btn primary" id="rsv" style="flex:1;">Open round</button></div></div>'
      );
      formHost.appendChild(form);
      form.querySelector("#rc").onclick = function () { formHost.innerHTML = ""; };
      form.querySelector("#rsv").onclick = function () {
        var name = form.querySelector("#rn").value.trim();
        var teamId = parseInt(form.querySelector("#rt").value, 10);
        var s = form.querySelector("#rs").value, e = form.querySelector("#re").value;
        if (!name || !s || !e) return toast("Fill in all fields", "err");
        var btn = form.querySelector("#rsv"); busy(btn, true);
        api("/projects/" + project.id + "/rounds", {
          method: "POST",
          body: { name: name, team_id: teamId, start_at: new Date(s).toISOString(), end_at: new Date(e).toISOString() },
        }).then(function () { toast("Round opened", "ok"); viewAdminProject(project.id); })
          .catch(function (err) { busy(btn, false); toast(err.message, "err"); });
      };
    };
  }

  function localInput(d) {
    // Format a Date for a <input type=datetime-local> in local time.
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function roundCard(project, rnd) {
    var open = rnd.status === "open";
    var card = el(
      '<div class="card round-card" data-open="' + (open ? "1" : "0") + '" data-round-id="' + rnd.id + '">' +
        '<div class="row" style="margin-bottom:6px;">' +
          '<div><div style="font-weight:600;font-size:15px;">' + esc(rnd.name) + "</div>" +
          '<div class="muted">' + fmtDateTime(rnd.start_at) + " &rarr; " + fmtDateTime(rnd.end_at) +
          (open ? " &middot; " + cdLive(rnd.end_at) : "") + "</div></div>" +
          '<span class="badge ' + rnd.status + '">' + (open ? "Open" : "Closed") + "</span>" +
        "</div>" +
        '<div class="link-row" style="margin:10px 0;"><span class="url">' + esc(voteLink(rnd.vote_token)) + "</span>" +
          '<button class="btn sm" data-copy>Copy link</button></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn sm" data-part>View participation</button>' +
          (open ? '<button class="btn sm danger" data-close>Close now</button>'
                : '<button class="btn sm" data-results>View results</button>') +
        "</div>" +
        '<div data-panel style="margin-top:12px;"></div>' +
      "</div>"
    );
    card.querySelector("[data-copy]").onclick = function () {
      navigator.clipboard.writeText(voteLink(rnd.vote_token)).then(function () { toast("Link copied", "ok"); });
    };
    var pnl = card.querySelector("[data-panel]");
    card.querySelector("[data-part]").onclick = function () { toggleParticipation(pnl, rnd); };
    var closeBtn = card.querySelector("[data-close]");
    if (closeBtn) closeBtn.onclick = function () {
      confirmDialog({
        title: "Close this round?",
        message: "Voting stops immediately and the leaderboard is computed and frozen. This can’t be undone.",
        confirmText: "Close round",
        danger: true,
      }).then(function (ok) {
        if (!ok) return;
        busy(closeBtn, true);
        api("/rounds/" + rnd.id + "/close", { method: "POST" })
          .then(function () { toast("Round closed", "ok"); viewAdminProject(project.id); })
          .catch(function (e) { busy(closeBtn, false); toast(e.message, "err"); });
      });
    };
    var resBtn = card.querySelector("[data-results]");
    if (resBtn) resBtn.onclick = function () { toggleResults(pnl, rnd.id); };
    // Auto-open results for a round that just closed because everyone voted.
    if (!open && autoShowResultsRound === rnd.id) {
      autoShowResultsRound = null;
      toggleResults(pnl, rnd.id);
    }
    return card;
  }

  function toggleParticipation(pnl, rnd) {
    if (pnl._mode === "part") { pnl.innerHTML = ""; pnl._mode = null; stopPoll(pnl); return; }
    pnl._mode = "part"; pnl.innerHTML = '<div class="spinner"></div>';
    var els = null;  // built once, then updated in place so the bar doesn't reset

    function build() {
      pnl.innerHTML = "";
      pnl.appendChild(el('<div class="divider"></div>'));
      var grid = el(
        '<div class="metric-grid">' +
          metric("Members", "0") + metric("Submitted", "0") +
          metric("Pending", "0") + metric("Completion", "0%") +
        "</div>"
      );
      var track = el('<div class="bar-track"><div class="bar-fill"></div></div>');
      var table = el('<table class="part"></table>');
      pnl.appendChild(grid);
      pnl.appendChild(track);
      pnl.appendChild(el('<p class="muted" style="margin:12px 0 4px;">Who voted — never what they voted</p>'));
      pnl.appendChild(table);
      els = { vals: grid.querySelectorAll(".metric .v"), bar: track.querySelector(".bar-fill"), table: table };
    }

    var closing = false;
    var draw = function () {
      api("/rounds/" + rnd.id + "/participation").then(function (p) {
        if (pnl._mode !== "part") return;

        // Everyone voted -> no reason to keep the window open: close it now and
        // surface the results right here (only fires once).
        if (!closing && p.total > 0 && p.submitted === p.total && rnd.status === "open") {
          closing = true;
          stopPoll(pnl);
          api("/rounds/" + rnd.id + "/close", { method: "POST" })
            .then(function () {
              toast("Everyone voted — round closed, results are ready", "ok");
              autoShowResultsRound = rnd.id;      // roundCard auto-opens results
              viewAdminProject(currentAdminProjectId);
            })
            .catch(function (e) { closing = false; toast(e.message, "err"); });
          return;
        }

        if (!els) build();
        els.vals[0].textContent = p.total;
        els.vals[1].textContent = p.submitted;
        els.vals[2].textContent = p.pending;
        els.vals[3].textContent = p.completion_pct + "%";
        // Setting width on the persistent element animates only when it changes.
        els.bar.style.width = p.completion_pct + "%";
        els.table.innerHTML = p.rows.map(function (r) {
          var b = r.voted
            ? '<span class="badge open">Submitted</span>'
            : '<span class="badge" style="background:var(--amber-bg);color:var(--amber-text);">Pending</span>';
          return '<tr><td class="mono">' + esc(r.email) + '</td><td style="text-align:right;">' + b + "</td></tr>";
        }).join("");
      }).catch(function () {});
    };
    draw();
    // Live refresh while an open round's panel is showing. Registered globally
    // so a view change / route change can tear it down (no leaked polling).
    if (rnd.status === "open") { pnl._poll = setInterval(draw, 5000); pollTimers.push(pnl._poll); }
  }
  function stopPoll(pnl) {
    if (pnl._poll) {
      clearInterval(pnl._poll);
      var i = pollTimers.indexOf(pnl._poll);
      if (i !== -1) pollTimers.splice(i, 1);
      pnl._poll = null;
    }
  }

  function toggleResults(pnl, roundId) {
    if (pnl._mode === "res") { pnl.innerHTML = ""; pnl._mode = null; return; }
    pnl._mode = "res"; pnl.innerHTML = '<div class="spinner"></div>';
    api("/rounds/" + roundId + "/results").then(function (r) {
      if (pnl._mode !== "res") return;
      pnl.innerHTML = '<div class="divider"></div>' + resultsHTML(r);
    }).catch(function (e) {
      if (pnl._mode !== "res") return;
      pnl.innerHTML = '<div class="divider"></div>' + noticeHTML(e.message);
    });
  }

  // Friendly "hidden for now" panel — used when results are withheld below the
  // anonymity floor (fewer than the minimum number of voters).
  function noticeHTML(msg) {
    return '<div class="notice"><div class="notice-ic">' + ICON_LOCK + "</div>" +
      '<p>' + esc(msg) + "</p></div>";
  }

  function metric(k, v) { return '<div class="metric"><p class="k">' + k + '</p><p class="v">' + v + "</p></div>"; }

  function resultsHTML(r) {
    return '<h2 class="section">Final leaderboard</h2>' +
      r.ranking.map(function (row) {
        var g = row.rank <= 3 ? " g" + row.rank : "";
        return '<div class="result-row"><div class="result-rank' + g + '">' + row.rank + "</div>" +
          '<div><div style="font-weight:600;">' + esc(row.display_name) + "</div></div>" +
          '<div class="result-pts">' + row.points + " <small>pts</small></div></div>";
      }).join("") +
      '<p class="muted" style="margin-top:12px;">Frozen at ' + fmtDateTime(r.computed_at) + " &middot; individual ballots are never stored.</p>";
  }

  /* ------------------------------------------------------------------ *
   * VOTER — ballot
   * ------------------------------------------------------------------ */
  // Centered message card with an icon and optional action buttons.
  function centerNotice(iconHtml, title, messageHtml, buttons) {
    var c = shell("");
    var wrap = el('<div class="center-state"></div>');
    wrap.appendChild(el('<div class="notice-badge">' + iconHtml + "</div>"));
    wrap.appendChild(el("<h3>" + esc(title) + "</h3>"));
    wrap.appendChild(el('<p class="muted" style="max-width:360px;margin:8px auto 0;">' + messageHtml + "</p>"));
    if (buttons && buttons.length) {
      var row = el('<div style="margin-top:20px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;"></div>');
      buttons.forEach(function (b) {
        var btn = el('<button class="btn' + (b.primary ? " primary" : "") + '">' + esc(b.label) + "</button>");
        btn.onclick = b.onClick;
        row.appendChild(btn);
      });
      wrap.appendChild(row);
    }
    c.appendChild(wrap);
  }

  function _switchAccount(token) {
    // Sign out, remember the vote link, and return to it after re-login.
    session.clear();
    returnTo = "#/vote/" + token;
    go("#/login");
  }

  function viewVote(token) {
    // Not signed in -> remember this link, send to sign-in, come straight back.
    if (!session.isAuthed) { returnTo = "#/vote/" + token; return go("#/login"); }

    if (session.role === "admin") {
      return centerNotice(
        ICON_ALERT,
        "Admins don't vote here",
        "You're signed in as an admin, and admins can't vote in their own rounds. " +
          "To vote, sign in with a teammate account that's on this team.",
        [
          { label: "Go to admin", primary: true, onClick: function () { go("#/admin"); } },
          { label: "Sign out & vote as a member", onClick: function () { _switchAccount(token); } },
        ]
      );
    }

    loading();
    api("/vote/" + token).then(function (page) {
      if (page.status === "closed") return showVoteClosed(token, page);
      if (page.already_voted) return showLocked(page, null);
      renderBallot(token, page);
    }).catch(function (e) {
      if (e.status === 403) {
        // Signed in, but this email isn't on the team for this round.
        centerNotice(
          ICON_ALERT,
          "You're not on this team",
          "You're signed in as <b>" + esc(session.email) + "</b>, but that email isn't on " +
            "the team for this vote. Ask your admin to add you, or sign in with the email you were invited on.",
          [{ label: "Sign out & use another account", onClick: function () { _switchAccount(token); } }]
        );
      } else if (e.status === 404) {
        centerNotice(
          ICON_ALERT,
          "Voting link not found",
          "This voting link is invalid, or the round was removed by the admin.",
          [{ label: "Go to sign in", onClick: function () { go("#/login"); } }]
        );
      } else {
        apiErr(e);
      }
    });
  }

  function renderBallot(token, page) {
    var order = page.candidates.slice(); // mutable working copy
    var c = shell("");
    c.appendChild(el(
      '<div class="row" style="margin-bottom:2px;"><span class="muted">Signed in as</span>' +
      '<span class="badge accent">' + esc(page.signed_in_as) + "</span></div>"
    ));
    c.appendChild(el('<h1 class="page">' + esc(page.round_name) + "</h1>"));
    c.appendChild(el('<p class="sub">' + esc(page.team_name) + " &middot; " + cdLive(page.end_at) + "</p>"));
    c.appendChild(el('<p class="muted" style="margin:-8px 0 14px;">Rank your teammates, best performer first — <b>drag a row</b> to reposition it, or use the arrows. You can’t rank yourself.</p>'));
    var listEl = el('<div id="ranklist"></div>');
    c.appendChild(listEl);
    var submit = el('<button class="btn primary block" style="margin-top:14px;">&#10003; Submit ranking</button>');
    c.appendChild(submit);

    function paint(movedIdx) {
      listEl.innerHTML = "";
      order.forEach(function (m, i) {
        var row = el(
          '<div class="rank-item' + (i === movedIdx ? " moving" : "") + '">' +
            '<div class="grip" title="Drag to reorder">&#8942;&#8942;</div>' +
            '<div class="rank-circle' + (i === 0 ? " top" : "") + '">' + (i + 1) + "</div>" +
            '<div style="flex:1;min-width:0;"><div class="name">' + esc(m.display_name) + '</div>' +
            '<div class="email">' + esc(m.email) + "</div></div>" +
            '<div class="move-btns">' +
              '<button data-dir="up" ' + (i === 0 ? "disabled" : "") + ">&#9650;</button>" +
              '<button data-dir="down" ' + (i === order.length - 1 ? "disabled" : "") + ">&#9660;</button>" +
            "</div></div>"
        );
        row.querySelectorAll("button").forEach(function (b) {
          b.onclick = function () {
            var j = b.getAttribute("data-dir") === "up" ? i - 1 : i + 1;
            var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
            paint(j);
          };
        });
        listEl.appendChild(row);
      });
      enableDrag(listEl, order, paint);
    }
    paint(-1);

    submit.onclick = function () {
      confirmDialog({
        title: "Submit your ranking?",
        message: "Once you submit, your ranking is final and can’t be changed.",
        confirmText: "Submit ranking",
      }).then(function (ok) {
        if (!ok) return;
        busy(submit, true);
        api("/vote/" + token, { method: "POST", body: { ranked_member_ids: order.map(function (m) { return m.id; }) } })
          .then(function () { showLocked(page, new Date()); })
          .catch(function (e) { busy(submit, false); toast(e.message, "err"); if (e.status === 409) viewVote(token); });
      });
    };
  }

  function showLocked(page, when) {
    var t = when ? (when.toLocaleDateString() + " at " + when.toLocaleTimeString()) : "earlier";
    shell(
      '<div class="locked-view">' +
        '<div class="locked-badge">' +
          '<span class="locked-halo"></span>' +
          '<div class="locked-core">' + ICON_LOCK + "</div>" +
          '<span class="locked-check">' + ICON_CHECK + "</span>" +
        "</div>" +
        '<h1 class="locked-title">Your vote is locked in</h1>' +
        '<p class="locked-sub">Thanks for ranking your team. Your ballot is sealed — ' +
          "no one, not even the admin, can see who you ranked where.</p>" +
        '<div class="locked-panel">' +
          '<div class="locked-item"><span class="k">Round</span>' +
            '<span class="v">' + esc(page.round_name) + "</span></div>" +
          '<div class="locked-sep"></div>' +
          '<div class="locked-item"><span class="k">Submitted</span>' +
            '<span class="v">' + esc(t) + "</span></div>" +
        "</div>" +
        '<div class="locked-foot">' + ICON_LOCK + " Anonymous &amp; final</div>" +
      "</div>"
    );
  }

  function showVoteClosed(token, page) {
    loading();
    api("/vote/" + token + "/results").then(function (r) {
      var c = shell("");
      c.appendChild(el('<h1 class="page">' + esc(page.round_name) + "</h1>"));
      c.appendChild(el('<p class="sub">' + esc(page.team_name) + " &middot; this round has closed</p>"));
      c.appendChild(el('<div class="card">' + resultsHTML(r) + "</div>"));
    }).catch(function (e) {
      var c = shell("");
      c.appendChild(el('<h1 class="page">' + esc(page.round_name) + "</h1>"));
      c.appendChild(el('<p class="sub">' + esc(page.team_name) + " &middot; this round has closed</p>"));
      c.appendChild(el('<div class="card">' + noticeHTML(e.message || "Results aren’t available yet.") + "</div>"));
    });
  }

  /* ------------------------------------------------------------------ *
   * Router
   * ------------------------------------------------------------------ */
  function apiErr(e) {
    if (e && e.message === "unauthorized") return;
    shell('<div class="empty">' + esc((e && e.message) || "Something went wrong") + "</div>");
  }

  function render() {
    clearPolls();                 // tear down any background polling from the old view
    currentAdminProjectId = null; // reset; viewAdminProject sets it again if needed
    var h = location.hash || "#/";
    var parts = h.replace(/^#\//, "").split("/"); // ["admin","project","1"]

    // Public routes: voting link (handles its own auth gate) + auth screens.
    if (parts[0] === "vote" && parts[1]) return viewVote(parts[1]);
    if (parts[0] === "login") return viewLogin();
    if (parts[0] === "signup") return viewSignup();
    if (parts[0] === "verify") return viewVerify();
    if (parts[0] === "forgot") return viewForgot();
    if (parts[0] === "reset") return viewReset();

    if (!session.isAuthed) { returnTo = h !== "#/login" ? h : null; return viewLogin(); }

    if (parts[0] === "admin") {
      if (session.role !== "admin") return go("#/home");
      if (parts[1] === "project" && parts[2]) return viewAdminProject(parseInt(parts[2], 10));
      return viewAdminProjects();
    }
    if (parts[0] === "home") return viewHome();

    // Default landing by role.
    return go(session.role === "admin" ? "#/admin" : "#/home");
  }

  // Global 1-second ticker: keeps every live countdown phrase current, and the
  // moment an open round's window elapses it closes that round on the server
  // (idempotent) and refreshes the admin view — so the card flips to Closed
  // immediately instead of waiting up to a minute for the auto-close sweep.
  var closingRounds = {}; // round id -> true while a close request is in flight
  setInterval(function () {
    document.querySelectorAll(".cd-live").forEach(function (n) {
      var phrase = cdPhrase(n.getAttribute("data-end"));
      if (phrase !== n.textContent) n.textContent = phrase;
    });
    if (session.role !== "admin" || currentAdminProjectId == null || adminFormOpen()) return;
    document.querySelectorAll('.round-card[data-open="1"]').forEach(function (card) {
      var cd = card.querySelector(".cd-live");
      if (!cd || countdownText(cd.getAttribute("data-end")) !== "closed") return;
      var rid = card.getAttribute("data-round-id");
      if (!rid || closingRounds[rid]) return;
      closingRounds[rid] = true;
      api("/rounds/" + rid + "/close", { method: "POST" })
        .then(function () { if (currentAdminProjectId != null) viewAdminProject(currentAdminProjectId); })
        .catch(function () { delete closingRounds[rid]; });
    });
  }, 1000);

  // Don't yank the view out from under an admin who's mid-edit.
  function adminFormOpen() {
    if (editingTeamId !== null) return true;
    if (document.querySelector("#pn, #tn, #te, #rn")) return true;
    var a = document.activeElement;
    return !!a && ["INPUT", "TEXTAREA", "SELECT"].indexOf(a.tagName) !== -1;
  }

  window.addEventListener("hashchange", render);
  render();
})();
