// Pipeline financiero: cruza las citas del Calendario (Firestore) con
// los registros facturados de Llenado SAI (Supabase). No escribe en ninguna
// fuente; solamente muestra lo pendiente de registrar.
(function () {
  "use strict";

  const FIRESTORE_PROJECT = "calendario-innvida";
  const FIRESTORE_KEY = "AIzaSyAZ6_tjZZo0PSagzhEemYaOMgP6GxY1OQ0";
  const SEDES = ["toluca", "morelia", "narvarte", "tijuana", "santafe"];
  const NOMBRES_SEDE = { santafe: "Santa Fe", toluca: "Toluca", morelia: "Morelia", narvarte: "Narvarte", tijuana: "Tijuana" };

  const byId = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value) || 0);
  const clean = value => String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const safe = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  const monthKey = value => String(value || "").slice(0, 7);
  const monthLabel = key => key ? new Date(`${key}-01T12:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" }) : "agenda";

  function firestoreValue(value) {
    if (!value) return null;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, firestoreValue(v)]));
    if (value.arrayValue) return (value.arrayValue.values || []).map(firestoreValue);
    return null;
  }

  function mapFirestoreDocument(doc, sede) {
    const fields = Object.fromEntries(Object.entries(doc.fields || {}).map(([key, value]) => [key, firestoreValue(value)]));
    return { ...fields, branch: fields.branch || sede };
  }

  async function getAppointments(sede) {
    const all = [];
    let token = "";
    do {
      const query = new URLSearchParams({ key: FIRESTORE_KEY, pageSize: "300" });
      if (token) query.set("pageToken", token);
      const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/sedes/${sede}/appointments?${query}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Calendario respondió ${response.status}`);
      const page = await response.json();
      all.push(...(page.documents || []).map(doc => mapFirestoreDocument(doc, sede)));
      token = page.nextPageToken || "";
    } while (token);
    return all;
  }

  async function getAllAppointments() {
    const results = await Promise.all(SEDES.map(getAppointments));
    return results.flat();
  }

  function paymentLabel(item) {
    const type = String(item.paymentType || "").trim();
    if (!type) return "Sin especificar";
    if (type.toLowerCase() === "bolsillo") return "Bolsillo";
    if (type.toLowerCase() === "aseguradora") return item.insuranceName ? `Aseguradora: ${item.insuranceName}` : "Aseguradora";
    return type;
  }

  function doctorFromAppointment(appointment) {
    if (appointment.doctor) return appointment.doctor;
    const notes = String(appointment.notes || "");
    const found = notes.match(/(?:medic[oa]\s*tratante|doctor|dra?\.?)[\s:.-]*([^,;\n]+)/i);
    return found && found[1].trim() ? found[1].trim() : "Sin médico indicado";
  }

  // La llave incluye paciente + sede: evita que una coincidencia homónima en
  // otra clínica elimine una cita que realmente sigue pendiente.
  function saiKey(row) { return `${clean(row.paciente)}|${clean(row.sede)}`; }
  function appointmentKey(appointment) { return `${clean(appointment.patientName)}|${clean(NOMBRES_SEDE[appointment.branch] || appointment.branch)}`; }

  function setText(id, text) { const node = byId(id); if (node) node.textContent = text; }

  let latestAppointments = [];
  let monthInitialized = false;
  const currentMonth = () => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return `${parts.find(part => part.type === "year").value}-${parts.find(part => part.type === "month").value}`;
  };

  function populateMonths(appointments, saiRows) {
    const select = byId("pipelineMes");
    if (!select) return;
    const previous = monthInitialized ? select.value : currentMonth();
    monthInitialized = true;
    const months = new Set([
      ...appointments.map(item => monthKey(item.date)),
      ...saiRows.map(row => monthKey(row.fechaInfusion))
    ].filter(Boolean));
    months.add(currentMonth());
    select.innerHTML = `<option value="">Todos los meses</option>` + Array.from(months).sort().reverse().map(key => `<option value="${key}">${safe(monthLabel(key))}</option>`).join("");
    select.value = months.has(previous) ? previous : "";
  }

  function paint(appointments) {
    const saiRows = typeof allRows !== "undefined" && Array.isArray(allRows) ? allRows : [];
    populateMonths(appointments, saiRows);
    const selectedMonth = byId("pipelineMes")?.value || "";
    const billedRows = saiRows.filter(row => row.montoServicio !== null && row.montoServicio !== undefined && row.montoServicio !== "").filter(row => !selectedMonth || monthKey(row.fechaInfusion) === selectedMonth);
    const billedTotal = billedRows.reduce((sum, row) => sum + (Number(row.montoServicio) || 0), 0);
    const registered = new Set(saiRows.filter(row => clean(row.paciente) && clean(row.sede)).map(saiKey));
    const pipeline = appointments
      .filter(item => clean(item.patientName) && Number(item.subtotal) > 0)
      .map(item => ({ ...item, facturado: registered.has(appointmentKey(item)) }))
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.patientName).localeCompare(String(b.patientName)));
    const pending = pipeline.filter(item => !item.facturado);
    const pendingTotal = pending.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
    const pendingMonths = Array.from(new Set(pending.map(item => monthKey(item.date)).filter(Boolean))).sort();
    const pendingMonthText = pendingMonths.length === 1
      ? monthLabel(pendingMonths[0])
      : pendingMonths.length > 1 ? "varios meses" : "sin mes";

    setText("pipelineTituloFacturado", `Monto total de servicio · ${selectedMonth ? monthLabel(selectedMonth) : "Todos los meses"}`);
    setText("pipelineMontoFacturado", money(billedTotal));
    setText("pipelineRegistrosFacturados", `${billedRows.length} registro(s) facturado(s)`);
    setText("pipelineMontoPendiente", money(pendingTotal));
    setText("pipelineCitasPendientes", `${pending.length} cita(s) sin registro en SAI`);
    // El pipeline siempre es consolidado: el selector mensual solo modifica
    // el monto facturado. El encabezado identifica el mes de lo pendiente.
    setText("pipelineTituloPendiente", `Por recibir · agenda · ${pendingMonthText}`);

    const body = byId("pipelineBody");
    if (body) {
      body.innerHTML = pipeline.length ? pipeline.map(item => {
        const date = item.date ? new Date(item.date).toLocaleDateString("es-MX") : "Sin fecha";
        const status = item.facturado ? `<span class="pipeline-status-badge billed">Facturado</span>` : `<span class="pipeline-status-badge pending">Por recibir</span>`;
        return `<tr><td>${safe(item.patientName)}</td><td>${status}</td><td>${safe(NOMBRES_SEDE[item.branch] || item.branch || "Sin sede")}</td><td>${safe(date)}</td><td>${safe(paymentLabel(item))}</td><td class="pipeline-money">${safe(money(item.subtotal))}</td></tr>`;
      }).join("") : `<tr><td colspan="6" class="pipeline-empty">No hay citas con subtotal registrado en el Calendario.</td></tr>`;
    }
  }

  let loading = false;
  window.actualizarPipelineAgenda = async function actualizarPipelineAgenda() {
    if (loading || typeof allRows === "undefined" || !Array.isArray(allRows)) return;
    loading = true;
    const button = byId("btnActualizarPipeline");
    if (button) button.disabled = true;
    setText("pipelineEstado", "Actualizando citas del Calendario…");
    try {
      latestAppointments = await getAllAppointments();
      paint(latestAppointments);
      setText("pipelineEstado", `Actualizado ${new Date().toLocaleString("es-MX")} · Las coincidencias paciente + sede ya registradas en SAI se marcan como Facturado.`);
    } catch (error) {
      console.error("No se pudo leer el Calendario", error);
      setText("pipelineEstado", "No se pudo consultar el Calendario. Verifica la conexión y los permisos de lectura de Firestore.");
    } finally {
      loading = false;
      if (button) button.disabled = false;
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    byId("btnActualizarPipeline")?.addEventListener("click", window.actualizarPipelineAgenda);
    byId("pipelineMes")?.addEventListener("change", () => paint(latestAppointments));
  });
})();
