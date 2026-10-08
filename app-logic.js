// BGA-Auswertung – reine Logik, ohne DOM. Einheiten intern: mmHg, mmol/l.
// Hilfsmittel zur Orientierung, ersetzt nicht die klinische Beurteilung.

const KPA_TO_MMHG = 7.50062;

function r(x, d = 1) {
  const f = Math.pow(10, d);
  return Math.round(x * f) / f;
}

function auswerten(inp) {
  const out = { befunde: [], hinweise: [], werte: {} };
  const { pH, pCO2, HCO3 } = inp;

  const hatSB = [pH, pCO2, HCO3].every((v) => typeof v === "number" && isFinite(v));
  if (hatSB) {
    out.befunde.push(...saeureBasen(pH, pCO2, HCO3, out));
  } else if ([pH, pCO2, HCO3].some((v) => typeof v === "number" && isFinite(v))) {
    out.hinweise.push("Für die Säure-Basen-Auswertung werden pH, pCO₂ und HCO₃⁻ benötigt.");
  }

  // Anionenlücke
  const { Na, Cl, Albumin, Laktat } = inp;
  const hatAL = [Na, Cl, HCO3].every((v) => typeof v === "number" && isFinite(v));
  if (hatAL) {
    let al = Na - Cl - HCO3;
    out.werte.anionenluecke = r(al);
    let alKorr = al;
    if (typeof Albumin === "number" && isFinite(Albumin)) {
      alKorr = al + 0.25 * (44 - Albumin); // Albumin in g/l
      out.werte.anionenlueckeKorrigiert = r(alKorr);
    }
    const ref = alKorr;
    if (ref > 12) {
      out.befunde.push(
        `Anionenlücke${alKorr !== al ? " (albuminkorrigiert)" : ""} erhöht (${r(ref)} mmol/l, Referenz ca. 8–12): Hinweis auf Anionen-Azidose, z. B. Laktat, Ketone, Urämie, Toxine.`
      );
    } else if (ref < 6) {
      out.befunde.push(`Anionenlücke niedrig (${r(ref)} mmol/l): Messfehler, Hypalbuminämie (unkorrigiert) oder Paraproteine erwägen.`);
    } else {
      out.befunde.push(`Anionenlücke${alKorr !== al ? " (albuminkorrigiert)" : ""} unauffällig (${r(ref)} mmol/l).`);
    }
    // Delta-Delta nur bei metabolischer Azidose mit erhöhter AL
    if (ref > 12 && HCO3 < 22) {
      const dAL = ref - 12;
      const dHCO3 = 24 - HCO3;
      const q = dAL / dHCO3;
      out.werte.deltaQuotient = r(q, 2);
      let txt;
      if (q < 0.4) txt = "spricht für eine zusätzliche hyperchlorämische (Non-AG-)Azidose";
      else if (q < 0.8) txt = "spricht für eine Mischung aus Anionenlücken- und hyperchlorämischer Azidose";
      else if (q <= 2) txt = "passt zu einer reinen Anionenlücken-Azidose";
      else txt = "spricht für eine zusätzliche metabolische Alkalose (oder vorbestehend hohes HCO₃⁻)";
      out.befunde.push(`Delta-Quotient (ΔAL/ΔHCO₃⁻) = ${r(q, 2)}: ${txt}.`);
    }
  }

  if (typeof Laktat === "number" && isFinite(Laktat)) {
    out.werte.laktat = Laktat;
    if (Laktat >= 4) out.befunde.push(`Laktat deutlich erhöht (${Laktat} mmol/l): Gewebehypoperfusion/Schock ausschließen.`);
    else if (Laktat > 2) out.befunde.push(`Laktat erhöht (${Laktat} mmol/l).`);
    else out.befunde.push(`Laktat unauffällig (${Laktat} mmol/l).`);
  }

  // Oxygenierung
  const { pO2, FiO2 } = inp;
  if (typeof pO2 === "number" && isFinite(pO2)) {
    let fi = typeof FiO2 === "number" && isFinite(FiO2) ? FiO2 : null;
    if (fi !== null && fi > 1) fi = fi / 100; // Prozent erlaubt
    if (fi !== null && fi >= 0.21) {
      const hq = pO2 / fi;
      out.werte.horovitz = Math.round(hq);
      let s;
      if (hq >= 400) s = "unauffällig";
      else if (hq >= 300) s = "leicht eingeschränkt";
      else if (hq >= 200) s = "mäßig eingeschränkt (Gasaustauschstörung)";
      else if (hq >= 100) s = "schwer eingeschränkt";
      else s = "sehr schwer eingeschränkt";
      out.befunde.push(`Oxygenierungsindex (Horovitz) pO₂/FiO₂ = ${Math.round(hq)} mmHg: ${s}.`);
    }
    if (pO2 < 60) out.befunde.push(`Hypoxämie (pO₂ ${r(pO2)} mmHg < 60). Bei Raumluft: respiratorische Partialinsuffizienz${inp.pCO2 > 45 ? " bzw. Globalinsuffizienz (pCO₂ erhöht)" : ""}.`);
    else if (pO2 < 80) out.befunde.push(`pO₂ leicht erniedrigt (${r(pO2)} mmHg); altersabhängige Norm beachten.`);
    else out.befunde.push(`pO₂ im Normbereich (${r(pO2)} mmHg).`);
    if (fi === null) out.hinweise.push("Für den Horovitz-Quotienten FiO₂ angeben (Raumluft = 21 %).");
  }

  return out;
}

function saeureBasen(pH, pCO2, HCO3, out) {
  const b = [];
  const phAz = pH < 7.35;
  const phAl = pH > 7.45;
  const co2Hoch = pCO2 > 45;
  const co2Niedrig = pCO2 < 35;
  const hcoHoch = HCO3 > 26;
  const hcoNiedrig = HCO3 < 22;

  if (pH < 6.8 || pH > 7.8) out.hinweise.push("pH außerhalb des plausiblen Bereichs: Eingabe/Messung prüfen.");

  // Plausibilität nach Henderson: [H+] = 24 * pCO2 / HCO3
  const hErwartet = (24 * pCO2) / HCO3; // nmol/l
  const hGemessen = Math.pow(10, 9 - pH);
  if (Math.abs(hErwartet - hGemessen) / hGemessen > 0.15) {
    out.hinweise.push(
      `Die Werte sind intern nicht stimmig (Henderson-Gleichung: erwartet pH ≈ ${r(9 - Math.log10(hErwartet), 2)}). Eingabe prüfen, ggf. Mischblut oder Messfehler.`
    );
  }

  let haupt = null;

  if (phAz) {
    if (co2Hoch && hcoNiedrig) haupt = "gemischt-az";
    else if (co2Hoch) haupt = "resp-az";
    else if (hcoNiedrig) haupt = "met-az";
    else haupt = "unklar";
  } else if (phAl) {
    if (co2Niedrig && hcoHoch) haupt = "gemischt-al";
    else if (co2Niedrig) haupt = "resp-al";
    else if (hcoHoch) haupt = "met-al";
    else haupt = "unklar";
  } else {
    haupt = "ph-normal";
  }

  const pHtxt = `pH ${pH}`;

  if (haupt === "met-az") {
    b.push(`Metabolische Azidose (${pHtxt}, HCO₃⁻ ${HCO3} mmol/l).`);
    const erw = 1.5 * HCO3 + 8; // Winter-Formel
    out.werte.erwarteterPCO2 = `${r(erw - 2)}–${r(erw + 2)} mmHg`;
    if (pCO2 > erw + 2) b.push(`Respiratorische Kompensation unzureichend: pCO₂ ${r(pCO2)} liegt über dem Erwartungswert nach Winter (${r(erw - 2)}–${r(erw + 2)} mmHg) → zusätzliche respiratorische Azidose.`);
    else if (pCO2 < erw - 2) b.push(`pCO₂ ${r(pCO2)} liegt unter dem Erwartungswert nach Winter (${r(erw - 2)}–${r(erw + 2)} mmHg) → zusätzliche respiratorische Alkalose.`);
    else b.push(`Respiratorisch adäquat kompensiert (Winter: erwartet ${r(erw - 2)}–${r(erw + 2)} mmHg).`);
  } else if (haupt === "met-al") {
    b.push(`Metabolische Alkalose (${pHtxt}, HCO₃⁻ ${HCO3} mmol/l).`);
    const erw = 40 + 0.7 * (HCO3 - 24);
    out.werte.erwarteterPCO2 = `${r(erw - 5)}–${r(erw + 5)} mmHg`;
    if (pCO2 > erw + 5) b.push(`pCO₂ ${r(pCO2)} über dem Erwartungswert (${r(erw - 5)}–${r(erw + 5)} mmHg) → zusätzliche respiratorische Azidose.`);
    else if (pCO2 < erw - 5) b.push(`pCO₂ ${r(pCO2)} unter dem Erwartungswert (${r(erw - 5)}–${r(erw + 5)} mmHg) → zusätzliche respiratorische Alkalose.`);
    else b.push(`Respiratorisch adäquat kompensiert (erwartet ${r(erw - 5)}–${r(erw + 5)} mmHg).`);
  } else if (haupt === "resp-az") {
    b.push(`Respiratorische Azidose (${pHtxt}, pCO₂ ${r(pCO2)} mmHg).`);
    const akut = 24 + 0.1 * (pCO2 - 40);
    const chron = 24 + 0.35 * (pCO2 - 40);
    out.werte.erwartetesHCO3 = `akut ≈ ${r(akut)}, chronisch ≈ ${r(chron)} mmol/l`;
    if (HCO3 < akut - 2) b.push(`HCO₃⁻ ${HCO3} liegt unter dem Erwartungswert bei akuter Hyperkapnie (≈ ${r(akut)}) → zusätzliche metabolische Azidose.`);
    else if (HCO3 > chron + 2) b.push(`HCO₃⁻ ${HCO3} liegt über dem Erwartungswert bei chronischer Hyperkapnie (≈ ${r(chron)}) → zusätzliche metabolische Alkalose.`);
    else if (HCO3 <= akut + 2) b.push(`Metabolische Kompensation passt zu einer akuten Störung (erwartet HCO₃⁻ ≈ ${r(akut)}).`);
    else if (HCO3 >= chron - 2) b.push(`Metabolische Kompensation passt zu einer chronischen Störung (erwartet HCO₃⁻ ≈ ${r(chron)}); bei zusätzlich niedrigem pH akute Dekompensation („acute on chronic") erwägen.`);
    else b.push(`HCO₃⁻ zwischen akuter und chronischer Erwartung (${r(akut)}–${r(chron)}): teilkompensiert bzw. „acute on chronic".`);
  } else if (haupt === "resp-al") {
    b.push(`Respiratorische Alkalose (${pHtxt}, pCO₂ ${r(pCO2)} mmHg).`);
    const akut = 24 - 0.2 * (40 - pCO2);
    const chron = 24 - 0.4 * (40 - pCO2);
    out.werte.erwartetesHCO3 = `akut ≈ ${r(akut)}, chronisch ≈ ${r(chron)} mmol/l`;
    if (HCO3 > akut + 2) b.push(`HCO₃⁻ ${HCO3} über dem Erwartungswert (≈ ${r(akut)}) → zusätzliche metabolische Alkalose.`);
    else if (HCO3 < chron - 2) b.push(`HCO₃⁻ ${HCO3} unter dem Erwartungswert bei chronischer Störung (≈ ${r(chron)}) → zusätzliche metabolische Azidose.`);
    else if (HCO3 >= akut - 2) b.push(`Kompensation passt zu einer akuten Störung (erwartet HCO₃⁻ ≈ ${r(akut)}).`);
    else b.push(`Kompensation passt zu einer chronischen Störung (erwartet HCO₃⁻ ≈ ${r(chron)}).`);
  } else if (haupt === "gemischt-az") {
    b.push(`Gemischte (kombinierte) Azidose: pCO₂ erhöht (${r(pCO2)} mmHg) und HCO₃⁻ erniedrigt (${HCO3} mmol/l), ${pHtxt}.`);
  } else if (haupt === "gemischt-al") {
    b.push(`Gemischte (kombinierte) Alkalose: pCO₂ erniedrigt (${r(pCO2)} mmHg) und HCO₃⁻ erhöht (${HCO3} mmol/l), ${pHtxt}.`);
  } else if (haupt === "unklar") {
    b.push(`${pHtxt} ${phAz ? "erniedrigt" : "erhöht"}, aber pCO₂ und HCO₃⁻ ohne eindeutige Ursache: Eingabe prüfen.`);
  } else {
    // pH normal
    if (!co2Hoch && !co2Niedrig && !hcoHoch && !hcoNiedrig) {
      b.push(`Säure-Basen-Haushalt unauffällig (${pHtxt}, pCO₂ ${r(pCO2)} mmHg, HCO₃⁻ ${HCO3} mmol/l).`);
    } else if ((co2Hoch && hcoHoch) || (co2Niedrig && hcoNiedrig)) {
      const art = co2Hoch ? "kompensierte respiratorische Azidose bzw. metabolische Alkalose" : "kompensierte respiratorische Alkalose bzw. metabolische Azidose";
      b.push(`pH im Normbereich (${pH}) bei gleichsinnig veränderten pCO₂/HCO₃⁻: ${art}. Die Primärstörung lässt sich nur mit Klinik einordnen; bei pH 7,35–7,40 spricht eine Azidose-, bei 7,40–7,45 eine Alkalose-Tendenz für die Primärstörung.`);
    } else if ((co2Hoch && hcoNiedrig) || (co2Niedrig && hcoHoch)) {
      b.push(`pH normal bei gegensinnigen Störungen (pCO₂ ${r(pCO2)} mmHg, HCO₃⁻ ${HCO3} mmol/l): gemischte Störung, die sich im pH aufhebt.`);
    } else {
      b.push(`pH normal; einzelner Parameter außerhalb der Norm (pCO₂ ${r(pCO2)} mmHg, HCO₃⁻ ${HCO3} mmol/l): grenzwertig bzw. Messungenauigkeit.`);
    }
  }

  return b;
}

if (typeof module !== "undefined") module.exports = { auswerten, KPA_TO_MMHG };
