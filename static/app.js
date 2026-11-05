// ReelGrab by Tej Tech
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var form = $("form"), urlInput = $("url"), fetchBtn = $("fetch"), pasteBtn = $("paste");
  var errorEl = $("error"), resultEl = $("result");
  var thumb = $("thumb"), thumbFallback = $("thumb-fallback");
  var titleEl = $("title"), metaEl = $("meta");
  var pickerWrap = $("picker-wrap"), picker = $("picker");
  var qualitySel = $("quality"), dlBtn = $("download");
  var statusEl = $("status"), warnEl = $("warn");

  var state = { url: "", items: [], item: 1 };

  $("year").textContent = new Date().getFullYear();

  function setBusy(btn, busy, busyText) {
    var label = btn.querySelector(".label");
    if (!btn.dataset.text) btn.dataset.text = label.textContent;
    btn.disabled = busy;
    label.textContent = busy ? busyText : btn.dataset.text;
  }

  function showError(msg) {
    errorEl.textContent = msg || "";
    errorEl.hidden = !msg;
  }

  function formatDuration(sec) {
    if (!sec) return "";
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function showThumb(url) {
    if (!url) {
      thumb.hidden = true;
      thumbFallback.hidden = false;
      return;
    }
    thumb.hidden = false;
    thumbFallback.hidden = true;
    thumb.src = url;
    thumb.onerror = function () { thumb.hidden = true; thumbFallback.hidden = false; };
  }

  function renderItem() {
    var cur = state.items[state.item - 1] || state.items[0];
    titleEl.textContent = cur.title;
    var bits = [];
    if (cur.uploader) bits.push("@" + cur.uploader);
    if (cur.duration) bits.push(formatDuration(cur.duration));
    metaEl.textContent = bits.join(" · ");
    showThumb(cur.thumbnail);

    Array.prototype.forEach.call(picker.children, function (b, i) {
      b.setAttribute("aria-pressed", String(i + 1 === state.item));
    });
  }

  function renderResult(data) {
    state.items = data.items;
    state.item = 1;

    qualitySel.innerHTML = "";
    data.options.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.label;
      qualitySel.appendChild(opt);
    });

    picker.innerHTML = "";
    pickerWrap.hidden = data.items.length < 2;
    if (data.items.length > 1) {
      data.items.forEach(function (it) {
        var b = document.createElement("button");
        b.type = "button";
        b.title = "Video " + it.index;
        b.setAttribute("aria-label", "Video " + it.index);
        if (it.thumbnail) {
          var img = document.createElement("img");
          img.src = it.thumbnail;
          img.alt = "";
          img.referrerPolicy = "no-referrer";
          b.appendChild(img);
        } else {
          b.textContent = it.index;
        }
        b.addEventListener("click", function () { state.item = it.index; renderItem(); });
        picker.appendChild(b);
      });
    }

    warnEl.hidden = data.ffmpeg !== false;
    if (data.ffmpeg === false) {
      warnEl.textContent = "This server can't merge audio and video, so some posts may fail. The site owner needs to install ffmpeg.";
    }

    statusEl.hidden = true;
    renderItem();
    resultEl.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    showError("");
    resultEl.hidden = true;
    var url = urlInput.value.trim();
    if (!url) { showError("Paste an Instagram link first."); return; }

    state.url = url;
    setBusy(fetchBtn, true, "Looking…");
    fetch("/api/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || "Something went wrong. Please try again.");
        renderResult(res.d);
      })
      .catch(function (err) { showError(err.message); })
      .then(function () { setBusy(fetchBtn, false); });
  });

  dlBtn.addEventListener("click", function () {
    showError("");
    setBusy(dlBtn, true, "Preparing…");
    statusEl.hidden = false;
    statusEl.textContent = "Getting your file ready. This can take a few seconds.";

    var qs = new URLSearchParams({ url: state.url, quality: qualitySel.value, item: state.item });
    fetch("/api/download?" + qs.toString())
      .then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            throw new Error(d.error || "The download failed. Please try again.");
          });
        }
        var cd = r.headers.get("Content-Disposition") || "";
        var m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
        var name = m ? decodeURIComponent(m[1]) : "instagram_video.mp4";
        return r.blob().then(function (blob) { return { blob: blob, name: name }; });
      })
      .then(function (f) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(f.blob);
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
        statusEl.textContent = "Saved as " + f.name;
      })
      .catch(function (err) {
        statusEl.hidden = true;
        showError(err.message);
      })
      .then(function () { setBusy(dlBtn, false); });
  });

  pasteBtn.addEventListener("click", function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      urlInput.focus();
      return;
    }
    navigator.clipboard.readText()
      .then(function (t) { urlInput.value = t.trim(); urlInput.focus(); })
      .catch(function () { urlInput.focus(); });
  });
})();
