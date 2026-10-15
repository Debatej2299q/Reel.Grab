(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("form"), urlInput = $("url"), fetchBtn = $("fetch");
  const errorEl = $("error"), resultEl = $("result"), itemsEl = $("items");
  const titleEl = $("title"), metaEl = $("meta"), optionsEl = $("options");
  const dlBtn = $("download"), statusEl = $("status"), toastEl = $("toast");

  let state = { url: "", items: [], options: [], item: 1, quality: "best" };

  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2200);
  };
  const setBusy = (btn, busy) => {
    btn.disabled = busy;
    btn.querySelector(".spinner").hidden = !busy;
    const svg = btn.querySelector("svg");
    if (svg) svg.hidden = busy;
  };
  const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = !msg; };
  const fmtDuration = (s) => {
    if (!s) return "";
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  function render() {
    const cur = state.items[state.item - 1] || state.items[0];
    titleEl.textContent = cur.title;
    metaEl.textContent = [cur.uploader && `@${cur.uploader}`, fmtDuration(cur.duration)]
      .filter(Boolean).join(" · ");

    itemsEl.innerHTML = "";
    state.items.forEach((it) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "item" + (it.index === state.item ? " active" : "");
      if (it.thumbnail) {
        const img = document.createElement("img");
        img.src = it.thumbnail; img.alt = ""; img.referrerPolicy = "no-referrer"; img.loading = "lazy";
        img.onerror = () => { img.replaceWith(Object.assign(document.createElement("div"), { className: "noimg", textContent: "No preview" })); };
        b.appendChild(img);
      } else {
        b.innerHTML = '<div class="noimg">No preview</div>';
      }
      if (state.items.length > 1) {
        const badge = document.createElement("span");
        badge.className = "badge"; badge.textContent = `${it.index} / ${state.items.length}`;
        b.appendChild(badge);
      }
      b.onclick = () => { state.item = it.index; render(); };
      itemsEl.appendChild(b);
    });

    optionsEl.innerHTML = "";
    state.options.forEach((o) => {
      const c = document.createElement("button");
      c.type = "button"; c.className = "chip"; c.textContent = o.label;
      c.setAttribute("role", "radio");
      c.setAttribute("aria-checked", String(o.id === state.quality));
      c.onclick = () => { state.quality = o.id; render(); };
      optionsEl.appendChild(c);
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    resultEl.hidden = true;
    statusEl.hidden = true;
    const url = urlInput.value.trim();
    if (!url) return;
    setBusy(fetchBtn, true);
    try {
      const r = await fetch("/api/info", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Something went wrong.");
      state = { url, items: data.items, options: data.options, item: 1, quality: "best" };
      render();
      resultEl.hidden = false;
      resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(fetchBtn, false);
    }
  });

  dlBtn.addEventListener("click", async () => {
    showError("");
    setBusy(dlBtn, true);
    statusEl.hidden = false;
    statusEl.textContent = "Preparing your file — this can take a few seconds…";
    try {
      const qs = new URLSearchParams({ url: state.url, quality: state.quality, item: state.item });
      const r = await fetch(`/api/download?${qs}`);
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Download failed.");
      }
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition") || "";
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      const name = m ? decodeURIComponent(m[1]) : "instagram_video.mp4";
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      statusEl.textContent = `Saved ${name}`;
      toast("Download started ✓");
    } catch (err) {
      statusEl.hidden = true;
      showError(err.message);
    } finally {
      setBusy(dlBtn, false);
    }
  });

  $("paste").addEventListener("click", async () => {
    try {
      urlInput.value = (await navigator.clipboard.readText()).trim();
      urlInput.focus();
    } catch {
      toast("Clipboard blocked — paste manually");
    }
  });
})();
