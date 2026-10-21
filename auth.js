const USERS = [
  {
    username: "admin",
    password: "innvida2026",
    role: "admin",
    sede: null,
    displayName: "Administración general"
  },
  {
    username: "morelia",
    password: "morelia2026",
    role: "sede",
    sede: "Morelia",
    displayName: "Sede Morelia"
  },
  {
    username: "toluca",
    password: "toluca2026",
    role: "sede",
    sede: "Toluca",
    displayName: "Sede Toluca"
  },
  {
    username: "narvarte",
    password: "narvarte2026",
    role: "sede",
    sede: "Narvarte",
    displayName: "Sede Narvarte"
  },
  {
    username: "tijuana",
    password: "tijuana2026",
    role: "sede",
    sede: "Tijuana",
    displayName: "Sede Tijuana"
  },
  {
    username: "santafe",
    password: "santafe2026",
    role: "sede",
    sede: "Santa Fe",
    displayName: "Sede Santa Fe"
  }
];

const SESSION_KEY = "innvidaSesionUsuario";

let currentUser = null;

function findUser(username, password) {
  const normalized = String(username || "").trim().toLowerCase();

  return USERS.find(
    u =>
      u.username.toLowerCase() === normalized &&
      u.password === password
  ) || null;
}

function saveSession(user) {
  const { username, role, sede, displayName } = user;

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ username, role, sede, displayName })
  );
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function showApp() {
  document.getElementById("loginContainer").classList.add("hidden");
  document.getElementById("appContainer").classList.remove("hidden");

  applyRoleToUI();

  if (typeof initDashboard === "function") {
    initDashboard();
  }
}

function showLogin() {
  document.getElementById("appContainer").classList.add("hidden");
  document.getElementById("loginContainer").classList.remove("hidden");
}

// Ajusta qué elementos puede usar cada tipo de usuario.
function applyRoleToUI() {
  const info = document.getElementById("sesionInfo");

  if (info) {
    info.textContent = currentUser.role === "admin"
      ? `${currentUser.displayName} · Ve todas las sedes`
      : `${currentUser.displayName} · Sede asignada: ${currentUser.sede}`;
  }

  const campoSede = document.getElementById("campoFiltroSede");

  if (campoSede) {
    // La sede ya está asignada al usuario; no debe seleccionarla manualmente.
    campoSede.classList.toggle(
      "hidden",
      currentUser.role !== "admin"
    );
  }

  // Importar y exportar solamente para administración.
  const btnImportar = document.getElementById("btnImportarExcel");
  const btnExportar = document.getElementById("btnExportarExcel");
  const importSede = document.getElementById("importSede");

  if (btnImportar) {
    btnImportar.classList.toggle(
      "hidden",
      currentUser.role !== "admin"
    );
  }

  if (importSede) {
    importSede.classList.toggle(
      "hidden",
      currentUser.role !== "admin"
    );
  }

  if (btnExportar) {
    btnExportar.classList.toggle(
      "hidden",
      currentUser.role !== "admin"
    );
  }

  // Dashboard ejecutivo: solo administrador.
  const panelDashboardAdmin = document.getElementById("panelDashboardAdmin");

  if (panelDashboardAdmin) {
    panelDashboardAdmin.classList.toggle(
      "hidden",
      currentUser.role !== "admin"
    );
  }

  const panelAgendaPipeline = document.getElementById("panelAgendaPipeline");
  if (panelAgendaPipeline) {
    panelAgendaPipeline.classList.toggle(
      "hidden",
      currentUser.role !== "admin"
    );
  }

  // Nuevo registro: solo sedes.
  const btnNuevoRegistro = document.getElementById("btnNuevoRegistro");

  if (btnNuevoRegistro) {
    btnNuevoRegistro.classList.toggle(
      "hidden",
      currentUser.role === "admin"
    );
  }

  // Admin y sedes pueden guardar modificaciones.
  // Borrar registros es exclusivo de administración.
  const btnGuardarDetalle = document.getElementById("btnGuardarDetalle");
  const btnBorrarRegistro = document.getElementById("btnBorrarRegistro");

  if (btnGuardarDetalle) {
    btnGuardarDetalle.classList.toggle(
      "hidden",
      !["admin", "sede"].includes(currentUser.role)
    );
  }

  if (btnBorrarRegistro) {
    btnBorrarRegistro.classList.toggle(
      "hidden",
      currentUser.role !== "admin"
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = loadSession();

  if (saved) {
    currentUser = saved;
    showApp();
  }

  const form = document.getElementById("loginForm");

  form.addEventListener("submit", e => {
    e.preventDefault();

    const username = document.getElementById("loginUsername").value;
    const password = document.getElementById("loginPassword").value;
    const errorEl = document.getElementById("loginError");

    const user = findUser(username, password);

    if (user) {
      currentUser = user;
      saveSession(user);
      errorEl.style.display = "none";
      showApp();
    } else {
      errorEl.style.display = "block";
    }
  });

  const btnSalir = document.getElementById("btnCerrarSesion");

  btnSalir.addEventListener("click", () => {
    clearSession();
    currentUser = null;
    window.location.reload();
  });
});
