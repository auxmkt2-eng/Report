// ============================================================
// Dashboard ejecutivo (SOLO ADMIN)
// ============================================================
let execUltimaData = null;

function obtenerColoresTema() {
  const estilos = getComputedStyle(document.documentElement);
  const esClaro = document.documentElement.getAttribute("data-theme") === "light";
  return {
    esClaro,
    muted: (estilos.getPropertyValue("--muted") || "#9fb0c8").trim(),
    grid: esClaro ? "rgba(15,23,42,0.08)" : "rgba(148,163,184,0.14)",
    fondoPunto: esClaro ? "#ffffff" : "#0b1524",
    paleta: ["#4ea3ff", "#7c5cff", "#22d3ee", "#37d39a", "#ffb020", "#ff6b81", "#c084fc", "#5eead4"]
  };
}

function agruparSumaPorClave(rows, obtenerClave) {
  const mapa = new Map();
  rows.forEach(r => {
    const clave = obtenerClave(r);
    if (clave === null || clave === undefined || clave === "") return;
    const monto = Number(r.montoServicio) || 0;
    mapa.set(clave, (mapa.get(clave) || 0) + monto);
  });
  return mapa;
}

function claveMes(fechaISO) {
  if (!fechaISO) return null;
  return fechaISO.slice(0, 7); // YYYY-MM
}

function nombreMes(claveYYYYMM) {
  const [y, m] = claveYYYYMM.split("-");
  const fecha = new Date(Number(y), Number(m) - 1, 1);
  const texto = fecha.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ¿El campo "aseguradora y/o pago de bolsillo" indica pago de bolsillo?
function esPagoDeBolsillo(texto) {
  const t = normalizarEncabezado(texto);
  return !t || t.includes("bolsillo");
}

// ¿El campo "1º vez" indica paciente nuevo (vs subsecuente/recurrente)?
function esPacienteNuevo(texto) {
  const t = normalizarEncabezado(texto);
  return /1.*vez|^nuevo/.test(t);
}

// ============================================================
// TABS del dashboard ejecutivo (Resumen ejecutivo / Tabla dinámica)
// ============================================================
function initExecTabs() {
  const botones = document.querySelectorAll(".exec-tab-btn");
  if (!botones.length) return;
  botones.forEach(btn => {
    btn.addEventListener("click", () => {
      botones.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.execTab;
      $("execTabResumen").classList.toggle("hidden", tab !== "resumen");
      $("execTabPivot").classList.toggle("hidden", tab !== "pivot");
      if (tab === "pivot") { renderGridApartados($("apartadoBuscarCampo") ? $("apartadoBuscarCampo").value : ""); renderDetalleApartado(); }
    });
  });
}

function renderExecutiveDashboard(rows) {
  const panel = document.getElementById("panelDashboardAdmin");
  if (!panel) return;

  execUltimaData = rows || []; // todas las sedes (sin aplicar el filtro de sede)
  if (panel.classList.contains("hidden")) return; // solo se pinta si el perfil es admin

  // Filtro de sede seleccionado en la barra de filtros superior.
  // Afecta al ticket promedio/monto total, EXCEPTO: Sede líder y
  // Sede con mejor ticket promedio, que siempre comparan todas las sedes.
  const sedeFiltro = $("filtroSede") ? $("filtroSede").value : "";
  const rowsSedeFiltrada = sedeFiltro
    ? execUltimaData.filter(r => normalizarTexto(r.sede) === normalizarTexto(sedeFiltro))
    : execUltimaData;

  const rowsConMontoTodas = execUltimaData.filter(
    r => r.montoServicio !== null && r.montoServicio !== undefined && r.montoServicio !== ""
  );
  const rowsConMonto = rowsSedeFiltrada.filter(
    r => r.montoServicio !== null && r.montoServicio !== undefined && r.montoServicio !== ""
  );

  if ($("execActualizado")) {
    $("execActualizado").textContent = `Actualizado: ${new Date().toLocaleString("es-MX")}`;
  }

  // ---- KPI: monto total y ticket promedio (respeta el filtro de sede) ----
  const montoTotal = rowsConMonto.reduce((a, r) => a + (Number(r.montoServicio) || 0), 0);
  $("execMontoTotal").textContent = formatearMoneda(montoTotal);
  $("execMontoRegistros").textContent = `${rowsConMonto.length} registro(s) facturado(s)`;
  $("execTicketPromedio").textContent = formatearMoneda(rowsConMonto.length ? montoTotal / rowsConMonto.length : 0);

  // ---- Agrupado por sede (siempre con TODAS las sedes, para poder comparar) ----
  const porSede = agruparSumaPorClave(rowsConMontoTodas, r => r.sede);
  const sedesOrdenadas = Array.from(porSede.entries()).sort((a, b) => b[1] - a[1]);
  if (sedesOrdenadas.length) {
    $("execSedeLider").textContent = sedesOrdenadas[0][0];
    $("execSedeLiderMonto").textContent = formatearMoneda(sedesOrdenadas[0][1]);
  } else {
    $("execSedeLider").textContent = "—";
    $("execSedeLiderMonto").textContent = "$0";
  }

  // ---- Tendencia mensual (mes actual vs anterior) ----
  const porMes = agruparSumaPorClave(rowsConMonto, r => claveMes(r.fechaInfusion));
  const mesesOrdenados = Array.from(porMes.keys()).sort();
  const valoresMes = mesesOrdenados.map(m => porMes.get(m));

  const cardCrecimiento = $("execCrecimiento");
  const detalleCrecimiento = $("execCrecimientoDetalle");
  if (mesesOrdenados.length >= 2) {
    const actual = valoresMes[valoresMes.length - 1];
    const anterior = valoresMes[valoresMes.length - 2];
    const cambio = anterior > 0 ? ((actual - anterior) / anterior) * 100 : (actual > 0 ? 100 : 0);
    const signo = cambio >= 0 ? "+" : "";
    cardCrecimiento.textContent = `${signo}${cambio.toFixed(1)}%`;
    cardCrecimiento.style.color = cambio >= 0 ? "#37d39a" : "#ff6b81";
    detalleCrecimiento.textContent = `${nombreMes(mesesOrdenados[mesesOrdenados.length - 1])} vs ${nombreMes(mesesOrdenados[mesesOrdenados.length - 2])}`;
  } else {
    cardCrecimiento.textContent = "—";
    cardCrecimiento.style.color = "";
    detalleCrecimiento.textContent = "Sin datos suficientes";
  }

  // ---- Origen del pago: aseguradora vs pago de bolsillo ----
  const montoBolsillo = rowsConMonto
    .filter(r => esPagoDeBolsillo(r.aseguradora))
    .reduce((a, r) => a + (Number(r.montoServicio) || 0), 0);
  const montoAseguradora = montoTotal - montoBolsillo;
  const pctAseguradora = montoTotal > 0 ? (montoAseguradora / montoTotal) * 100 : 0;
  const pctBolsillo = montoTotal > 0 ? (montoBolsillo / montoTotal) * 100 : 0;
  if ($("execOrigenPagoPct")) {
    if (montoTotal > 0) {
      const mayorEsAseguradora = montoAseguradora >= montoBolsillo;
      const pctMayor = mayorEsAseguradora ? pctAseguradora : pctBolsillo;
      const pctMenor = mayorEsAseguradora ? pctBolsillo : pctAseguradora;
      const montoMenor = mayorEsAseguradora ? montoBolsillo : montoAseguradora;
      const etiquetaMayor = mayorEsAseguradora ? "aseguradora" : "pago de bolsillo";
      const etiquetaMenor = mayorEsAseguradora ? "pago de bolsillo" : "aseguradora";

      $("execOrigenPagoPct").textContent = `${pctMayor.toFixed(0)}% ${etiquetaMayor}`;
      $("execOrigenPagoDetalle").textContent = `${pctMenor.toFixed(0)}% ${etiquetaMenor} (${formatearMoneda(montoMenor)})`;
    } else {
      $("execOrigenPagoPct").textContent = "—";
      $("execOrigenPagoDetalle").textContent = "Sin datos suficientes";
    }
  }

  // ---- Retención: pacientes nuevos vs recurrentes ----
  const nuevos = rowsConMonto.filter(r => esPacienteNuevo(r.primeraVez));
  const recurrentes = rowsConMonto.filter(r => !esPacienteNuevo(r.primeraVez));
  const pctRecurrentes = rowsConMonto.length ? (recurrentes.length / rowsConMonto.length) * 100 : 0;
  if ($("execRetencionPct")) {
    if (rowsConMonto.length) {
      const mayorEsRecurrente = recurrentes.length >= nuevos.length;
      const pctMayor = mayorEsRecurrente ? pctRecurrentes : (100 - pctRecurrentes);
      const pctMenor = mayorEsRecurrente ? (100 - pctRecurrentes) : pctRecurrentes;
      const etiquetaMayor = mayorEsRecurrente ? "recurrentes" : "de primera vez";
      const etiquetaMenor = mayorEsRecurrente ? "de primera vez" : "recurrentes";

      $("execRetencionPct").textContent = `${pctMayor.toFixed(0)}% ${etiquetaMayor}`;
      $("execRetencionDetalle").textContent = `${pctMenor.toFixed(0)}% ${etiquetaMenor}`;
    } else {
      $("execRetencionPct").textContent = "—";
      $("execRetencionDetalle").textContent = "Sin datos suficientes";
    }
  }

  // ---- Ticket promedio por sede (siempre todas las sedes, para comparar) ----
  const conteoPorSede = new Map();
  rowsConMontoTodas.forEach(r => {
    if (!r.sede) return;
    conteoPorSede.set(r.sede, (conteoPorSede.get(r.sede) || 0) + 1);
  });
  const ticketPromedioPorSede = sedesOrdenadas.map(([sede, monto]) => [sede, conteoPorSede.get(sede) ? monto / conteoPorSede.get(sede) : 0]);
  const sedeMejorTicket = ticketPromedioPorSede.slice().sort((a, b) => b[1] - a[1])[0];
  if ($("execSedeMejorTicket")) {
    $("execSedeMejorTicket").textContent = sedeMejorTicket ? sedeMejorTicket[0] : "—";
    $("execSedeMejorTicketMonto").textContent = sedeMejorTicket ? `${formatearMoneda(sedeMejorTicket[1])} por registro` : "$0 por registro";
  }

  // Si la pestaña de dashboard interactivo está activa, la refrescamos también
  const tabPivot = $("execTabPivot");
  if (tabPivot && !tabPivot.classList.contains("hidden")) {
    renderGridApartados($("apartadoBuscarCampo") ? $("apartadoBuscarCampo").value : "");
    renderDetalleApartado();
  }
}

// ============================================================
// DASHBOARD INTERACTIVO — datos del concentrado
// (excluye Fecha Infusión, Semana, Subtotal, Iva, Monto del
// servicio y Notas, tal como se pidió)
//
// Cómo funciona: se genera una tarjeta por cada apartado de
// llenado. Al seleccionar una, se desglosa automáticamente en
// la visualización que mejor le queda (gráfica de barras,
// histograma o tabla clasificada si hay demasiados valores
// distintos), siempre con su tabla de datos y exportación a Excel.
// ============================================================
const APARTADOS = [
  { key: "folio", label: "Folio", icon: "🧾", tipo: "categorica" },
  { key: "marca", label: "Marca", icon: "🏷️", tipo: "categorica" },
  { key: "sede", label: "Sede", icon: "🏥", tipo: "categorica" },
  { key: "servicio", label: "Servicio", icon: "💉", tipo: "categorica" },
  { key: "horaCita", label: "Hora de Cita", icon: "🕐", tipo: "categorica" },
  { key: "horaIngreso", label: "Hora de Ingreso", icon: "🕑", tipo: "categorica" },
  { key: "horaSalida", label: "Hora de Salida", icon: "🕒", tipo: "categorica" },
  { key: "viaAcceso", label: "Vía de Acceso", icon: "🩸", tipo: "categorica" },
  { key: "tiempoInfusion", label: "Tiempo de Infusión", icon: "⏱️", tipo: "categorica" },
  { key: "ciclo", label: "Ciclo", icon: "🔄", tipo: "categorica" },
  { key: "numeroCiclos", label: "No. de Ciclos", icon: "🔢", tipo: "numerica" },
  { key: "delegacion", label: "Delegación de Origen", icon: "📍", tipo: "categorica" },
  { key: "edad", label: "Edad", icon: "🎂", tipo: "numerica", unidad: "años" },
  { key: "sexo", label: "Sexo", icon: "⚧", tipo: "categorica" },
  { key: "estatusPaciente", label: "Estatus de Paciente", icon: "✅", tipo: "categorica" },
  { key: "medicos", label: "Médicos", icon: "👨‍⚕️", tipo: "categorica" },
  { key: "tipoTratamiento", label: "Tipo de tratamiento", icon: "🧬", tipo: "categorica" },
  { key: "aseguradora", label: "Aseguradora y/o pago de bolsillo", icon: "💳", tipo: "categorica" },
  { key: "honorarioMedico", label: "Honorario médico", icon: "💰", tipo: "categorica" },
  { key: "primeraVez", label: "1º vez", icon: "🆕", tipo: "categorica" },
  { key: "tratamiento", label: "Tratamiento", icon: "🩺", tipo: "categorica" },
  { key: "diagnostico", label: "Diagnóstico", icon: "📋", tipo: "categorica" }
];

const UMBRAL_GRAFICA_BARRAS = 12; // hasta este número de valores distintos, se dibuja gráfica; más allá, tabla clasificada

let apartadoActivo = null;
let apartadoDetBuscarTexto = "";

function apartadoValorCelda(valor) {
  if (valor === null || valor === undefined || valor === "") return "SIN DATO";
  return String(valor).trim().toUpperCase() || "SIN DATO";
}

function apartadoFormatoNumero(valor, campo) {
  if (valor === null || valor === undefined || isNaN(valor)) return "—";
  if (campo.moneda) return formatearMoneda(valor);
  const redondeado = Math.round(valor * 10) / 10;
  const texto = redondeado.toLocaleString("es-MX");
  return campo.unidad ? `${texto} ${campo.unidad}` : texto;
}

function distribucionCategorica(rows, key) {
  const mapa = new Map();
  rows.forEach(r => {
    const val = apartadoValorCelda(r[key]);
    mapa.set(val, (mapa.get(val) || 0) + 1);
  });
  return Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]);
}

function estadisticasNumericas(rows, key) {
  const valores = rows
    .map(r => r[key])
    .filter(v => v !== null && v !== undefined && v !== "")
    .map(Number)
    .filter(v => !isNaN(v));
  if (!valores.length) return null;
  const suma = valores.reduce((a, b) => a + b, 0);
  const ordenados = valores.slice().sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  const mediana = ordenados.length % 2 ? ordenados[medio] : (ordenados[medio - 1] + ordenados[medio]) / 2;
  return { valores, n: valores.length, suma, promedio: suma / valores.length, min: ordenados[0], max: ordenados[ordenados.length - 1], mediana };
}

function construirHistograma(valores, bins) {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  if (min === max) return [{ etiqueta: String(min), count: valores.length }];
  const ancho = (max - min) / bins;
  const cubetas = Array.from({ length: bins }, (_, i) => ({ desde: min + i * ancho, hasta: min + (i + 1) * ancho, count: 0 }));
  valores.forEach(v => {
    let idx = Math.floor((v - min) / ancho);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    cubetas[idx].count++;
  });
  return cubetas.map(c => ({
    etiqueta: `${Math.round(c.desde).toLocaleString("es-MX")}–${Math.round(c.hasta).toLocaleString("es-MX")}`,
    count: c.count
  }));
}

function renderGridApartados(filtroTexto) {
  const cont = $("apartadosGrid");
  if (!cont) return;

  const rows = (execUltimaData || []).filter(r => r.paciente);
  const q = normalizarTexto(filtroTexto || "");
  const colores = obtenerColoresTema();

  const campos = APARTADOS.filter(a => !q || normalizarTexto(a.label).includes(q));

  cont.innerHTML = campos.length
    ? campos.map(a => {
        let topLinea = "Sin datos", subLinea = "", mini = "";

        if (a.tipo === "numerica") {
          const stats = estadisticasNumericas(rows, a.key);
          if (stats) {
            topLinea = `Prom. ${apartadoFormatoNumero(stats.promedio, a)}`;
            subLinea = `Rango ${apartadoFormatoNumero(stats.min, a)} – ${apartadoFormatoNumero(stats.max, a)}`;
            const hist = construirHistograma(stats.valores, 6);
            const maxCount = Math.max(1, ...hist.map(h => h.count));
            mini = hist.map((h, i) => `<span style="height:${Math.max(10, (h.count / maxCount) * 100)}%; background:${colores.paleta[i % colores.paleta.length]}"></span>`).join("");
          }
        } else {
          const dist = distribucionCategorica(rows, a.key);
          if (dist.length) {
            const total = dist.reduce((s, [, c]) => s + c, 0);
            const [topVal, topCount] = dist[0];
            const pct = total ? Math.round((topCount / total) * 100) : 0;
            topLinea = topVal.length > 24 ? topVal.slice(0, 22) + "…" : topVal;
            subLinea = `${pct}% · ${dist.length} valor${dist.length === 1 ? "" : "es"} distinto${dist.length === 1 ? "" : "s"}`;
            const top4 = dist.slice(0, 4);
            const maxC = top4[0][1];
            mini = top4.map(([, c], i) => `<span style="height:${Math.max(10, (c / maxC) * 100)}%; background:${colores.paleta[i % colores.paleta.length]}"></span>`).join("");
          }
        }

        const activo = a.key === apartadoActivo ? " active" : "";
        return `
          <button type="button" class="apartado-card${activo}" data-campo="${a.key}">
            <div class="apartado-card-head">
              <span class="apartado-card-icon">${a.icon}</span>
              <span class="apartado-card-label">${escapeHtml(a.label)}</span>
            </div>
            <strong class="apartado-card-top">${escapeHtml(topLinea)}</strong>
            <small class="apartado-card-sub">${escapeHtml(subLinea)}</small>
            <div class="apartado-card-mini">${mini}</div>
          </button>`;
      }).join("")
    : `<p class="muted">No hay apartados que coincidan con la búsqueda.</p>`;

  cont.querySelectorAll(".apartado-card").forEach(btn => {
    btn.addEventListener("click", () => activarApartado(btn.dataset.campo));
  });
}

function activarApartado(key) {
  apartadoActivo = key;
  apartadoDetBuscarTexto = "";
  renderGridApartados($("apartadoBuscarCampo") ? $("apartadoBuscarCampo").value : "");
  renderDetalleApartado();
  const det = $("apartadoDetalle");
  if (det) det.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderDetalleApartado() {
  const cont = $("apartadoDetalle");
  if (!cont) return;

  if (!apartadoActivo) {
    cont.innerHTML = `<p class="muted apartado-vacio">Selecciona un apartado arriba para desglosarlo.</p>`;
    return;
  }

  const campo = APARTADOS.find(a => a.key === apartadoActivo);
  if (!campo) return;

  const rows = (execUltimaData || []).filter(r => r.paciente);
  const colores = obtenerColoresTema();

  let subtitulo = "";
  let bodyHtml = "";
  let tablaHeadHtml = "";
  let tablaFilasHtml = "";
  let mostrarBuscador = false;

  if (campo.tipo === "numerica") {
    const stats = estadisticasNumericas(rows, campo.key);
    if (!stats) {
      bodyHtml = `<p class="muted">No hay datos numéricos para este apartado.</p>`;
      subtitulo = "0 registros con dato";
    } else {
      subtitulo = `${stats.n} registro(s) con dato · Promedio ${apartadoFormatoNumero(stats.promedio, campo)} · Mediana ${apartadoFormatoNumero(stats.mediana, campo)}`;
      const hist = construirHistograma(stats.valores, 8);
      const maxCount = Math.max(1, ...hist.map(h => h.count));

      bodyHtml = `
        <div class="apartado-stats-row">
          <div class="apartado-stat"><span>Mínimo</span><strong>${apartadoFormatoNumero(stats.min, campo)}</strong></div>
          <div class="apartado-stat"><span>Máximo</span><strong>${apartadoFormatoNumero(stats.max, campo)}</strong></div>
          <div class="apartado-stat"><span>Promedio</span><strong>${apartadoFormatoNumero(stats.promedio, campo)}</strong></div>
          <div class="apartado-stat"><span>Mediana</span><strong>${apartadoFormatoNumero(stats.mediana, campo)}</strong></div>
          <div class="apartado-stat"><span>Suma</span><strong>${apartadoFormatoNumero(stats.suma, campo)}</strong></div>
        </div>
        <div class="apartado-bars">
          ${hist.map((h, i) => `
            <div class="apartado-bar-row">
              <span class="apartado-bar-label" title="${escapeHtml(h.etiqueta)}">${escapeHtml(h.etiqueta)}</span>
              <div class="apartado-bar-track"><div class="apartado-bar-fill" style="width:${Math.max(3, (h.count / maxCount) * 100)}%; background:${colores.paleta[i % colores.paleta.length]}"></div></div>
              <span class="apartado-bar-valor">${h.count}</span>
            </div>`).join("")}
        </div>`;

      tablaHeadHtml = `<thead><tr><th>Rango</th><th>Registros</th><th>%</th></tr></thead>`;
      tablaFilasHtml = hist.map(h => `<tr><td>${escapeHtml(h.etiqueta)}</td><td>${h.count}</td><td>${stats.n ? Math.round((h.count / stats.n) * 100) : 0}%</td></tr>`).join("");
    }
  } else {
    let dist = distribucionCategorica(rows, campo.key);
    const totalReg = dist.reduce((s, [, c]) => s + c, 0);
    mostrarBuscador = dist.length > UMBRAL_GRAFICA_BARRAS;

    if (apartadoDetBuscarTexto) {
      const q = normalizarTexto(apartadoDetBuscarTexto);
      dist = dist.filter(([v]) => normalizarTexto(v).includes(q));
    }

    subtitulo = `${totalReg} registro(s) analizado(s) · ${dist.length} valor(es) distinto(s)${apartadoDetBuscarTexto ? " (filtrado)" : ""}`;

    if (!dist.length) {
      bodyHtml = `<p class="muted">Sin resultados para ese filtro.</p>`;
    } else if (dist.length <= UMBRAL_GRAFICA_BARRAS) {
      const maxC = dist[0][1];
      bodyHtml = `
        <div class="apartado-bars">
          ${dist.map(([val, count], i) => `
            <div class="apartado-bar-row">
              <span class="apartado-bar-label" title="${escapeHtml(val)}">${escapeHtml(val)}</span>
              <div class="apartado-bar-track"><div class="apartado-bar-fill" style="width:${Math.max(3, (count / maxC) * 100)}%; background:${colores.paleta[i % colores.paleta.length]}"></div></div>
              <span class="apartado-bar-valor">${count} · ${totalReg ? Math.round((count / totalReg) * 100) : 0}%</span>
            </div>`).join("")}
        </div>`;
    } else {
      bodyHtml = `<p class="muted apartado-tabla-nota">Este apartado tiene muchos valores distintos: se muestra como tabla clasificada por frecuencia (usa el buscador para filtrar).</p>`;
    }

    tablaHeadHtml = `<thead><tr><th>${escapeHtml(campo.label)}</th><th>Registros</th><th>%</th></tr></thead>`;
    tablaFilasHtml = dist.map(([val, count]) => `<tr><td>${escapeHtml(val)}</td><td>${count}</td><td>${totalReg ? Math.round((count / totalReg) * 100) : 0}%</td></tr>`).join("");
  }

  cont.innerHTML = `
    <div class="apartado-detalle-head">
      <div>
        <span class="eyebrow">Desglose</span>
        <h3>${campo.icon} ${escapeHtml(campo.label)}</h3>
        <p class="muted">${subtitulo}</p>
      </div>
      <div class="apartado-detalle-actions">
        ${campo.tipo !== "numerica" ? `<input type="text" id="apartadoDetBuscar" placeholder="Filtrar valores..." value="${escapeHtml(apartadoDetBuscarTexto)}" />` : ""}
        <button type="button" id="btnApartadoExportar" class="btn btn-ghost">Exportar a Excel</button>
      </div>
    </div>
    <div class="apartado-detalle-body">
      ${bodyHtml}
      <div class="pivot-table-wrap apartado-table-wrap">
        <table class="pivot-table" id="apartadoTabla">${tablaHeadHtml}<tbody>${tablaFilasHtml}</tbody></table>
      </div>
    </div>`;

  const inputDet = $("apartadoDetBuscar");
  if (inputDet) {
    inputDet.addEventListener("input", () => {
      apartadoDetBuscarTexto = inputDet.value;
      const cursor = inputDet.selectionStart;
      renderDetalleApartado();
      const nuevoInput = $("apartadoDetBuscar");
      if (nuevoInput) {
        nuevoInput.focus();
        nuevoInput.setSelectionRange(cursor, cursor);
      }
    });
  }

  const btnExp = $("btnApartadoExportar");
  if (btnExp) btnExp.addEventListener("click", () => exportarApartadoAExcel(campo));
}

function exportarApartadoAExcel(campo) {
  const tabla = $("apartadoTabla");
  if (!tabla || !tabla.querySelector("tbody") || !tabla.querySelector("tbody").children.length) {
    showToast("No hay datos en este desglose para exportar.", "error");
    return;
  }
  if (typeof XLSX === "undefined") {
    showToast("No se pudo exportar: falta la librería XLSX.", "error");
    return;
  }
  const hoja = XLSX.utils.table_to_sheet(tabla);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, campo.label.slice(0, 28));
  const fechaHoy = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `desglose_${campo.key}_${fechaHoy}.xlsx`);
  showToast("Desglose exportado.", "success");
}

function initDashboardInteractivoEventos() {
  renderGridApartados("");
  renderDetalleApartado();

  const buscadorCampo = $("apartadoBuscarCampo");
  if (buscadorCampo) buscadorCampo.addEventListener("input", () => renderGridApartados(buscadorCampo.value));
}

document.addEventListener("DOMContentLoaded", () => {
  initExecTabs();
  initDashboardInteractivoEventos();
});

// Vuelve a pintar el dashboard interactivo con la paleta correcta al cambiar de tema
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      setTimeout(() => {
        const tabPivot = $("execTabPivot");
        if (execUltimaData && tabPivot && !tabPivot.classList.contains("hidden")) {
          renderGridApartados($("apartadoBuscarCampo") ? $("apartadoBuscarCampo").value : "");
          renderDetalleApartado();
        }
      }, 50);
    });
  });
});

window.renderExecutiveDashboard = renderExecutiveDashboard;
