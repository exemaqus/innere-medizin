(function () {
  const ids = ["pH", "pCO2", "HCO3", "Na", "Cl", "Albumin", "Laktat", "pO2", "FiO2"];
  const el = (id) => document.getElementById(id);

  function num(id) {
    const s = el(id).value.trim().replace(",", ".");
    if (s === "") return undefined;
    const v = parseFloat(s);
    return isFinite(v) ? v : undefined;
  }

  function unit() {
    return document.querySelector('input[name="unit"]:checked').value;
  }

  function lesen() {
    const f = unit() === "kPa" ? KPA_TO_MMHG : 1;
    const o = {};
    ids.forEach((id) => (o[id] = num(id)));
    if (o.pCO2 !== undefined) o.pCO2 *= f;
    if (o.pO2 !== undefined) o.pO2 *= f;
    return o;
  }

  function render() {
    const inp = lesen();
    const any = ids.some((id) => inp[id] !== undefined);
    const box = el("result");
    if (!any) { box.hidden = true; return; }
    const res = auswerten(inp);
    box.hidden = false;

    const ul = el("befunde");
    ul.textContent = "";
    res.befunde.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });

    const h = el("hinweise");
    if (res.hinweise.length) {
      h.hidden = false;
      h.textContent = res.hinweise.join(" ");
    } else {
      h.hidden = true;
    }

    const names = {
      anionenluecke: "Anionenlücke (mmol/l)",
      anionenlueckeKorrigiert: "Anionenlücke albuminkorrigiert (mmol/l)",
      deltaQuotient: "Delta-Quotient ΔAL/ΔHCO₃⁻",
      erwarteterPCO2: "Erwarteter pCO₂",
      erwartetesHCO3: "Erwartetes HCO₃⁻",
      horovitz: "Horovitz pO₂/FiO₂ (mmHg)",
      laktat: "Laktat (mmol/l)",
    };
    const dl = el("werte");
    dl.textContent = "";
    const keys = Object.keys(res.werte);
    keys.forEach((k) => {
      const dt = document.createElement("dt");
      dt.textContent = names[k] || k;
      const dd = document.createElement("dd");
      dd.textContent = String(res.werte[k]).replace(".", ",");
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    el("werte-box").hidden = keys.length === 0;
  }

  function einheit() {
    const u = unit();
    el("u-pco2").textContent = u;
    el("u-po2").textContent = u;
    el("pCO2").placeholder = u === "kPa" ? "5,3" : "40";
    el("pO2").placeholder = u === "kPa" ? "12" : "90";
  }

  document.querySelectorAll("input").forEach((i) => i.addEventListener("input", render));
  document.querySelectorAll('input[name="unit"]').forEach((i) =>
    i.addEventListener("change", () => { einheit(); render(); })
  );
  el("reset").addEventListener("click", () => {
    ids.forEach((id) => (el(id).value = ""));
    render();
    el("pH").focus();
  });
  el("form").addEventListener("submit", (e) => e.preventDefault());
  einheit();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
