const state = {
  user: null,
  issues: [],
  statusFilter: "All",
  categoryFilter: "All",
  unitFilter: ""
};

const authView = document.getElementById("authView");
const residentView = document.getElementById("residentView");
const superintendentView = document.getElementById("superintendentView");
const logoutBtn = document.getElementById("logoutBtn");
const issuesList = document.getElementById("issuesList");

document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
    btn.classList.add("active");
    const section = btn.dataset.authTab;
    if (section === "login") {
      document.getElementById("loginFormWrap").classList.add("active");
    } else {
      document.getElementById("registerFormWrap").classList.add("active");
    }
  });
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Login failed");
    return;
  }

  await loadSession();
});

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const body = {
    username: document.getElementById("registerUsername").value.trim(),
    password: document.getElementById("registerPassword").value,
    name: document.getElementById("registerName").value.trim(),
    email: document.getElementById("registerEmail").value.trim(),
    unit: document.getElementById("registerUnit").value.trim(),
    role: document.getElementById("registerRole").value
  };

  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Registration failed");
    return;
  }

  await loadSession();
});

document.getElementById("issueForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = document.getElementById("issueForm");
  const formData = new FormData(form);

  const res = await fetch("/api/issues", {
    method: "POST",
    body: formData
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || "Issue submission failed");
    return;
  }

  form.reset();
  alert("Issue submitted successfully.");
  await loadIssues();
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  await loadSession();
});

function showAuth() {
  authView.classList.remove("hidden");
  residentView.classList.add("hidden");
  superintendentView.classList.add("hidden");
}

function showResidentApp() {
  authView.classList.add("hidden");
  residentView.classList.remove("hidden");
  superintendentView.classList.add("hidden");
}

function showSuperintendentApp() {
  authView.classList.add("hidden");
  residentView.classList.add("hidden");
  superintendentView.classList.remove("hidden");
}

async function loadSession() {
  const res = await fetch("/api/session");
  const data = await res.json();

  state.user = data.user;

  if (state.user) {
    logoutBtn.classList.remove("hidden");
    if (state.user.role === "resident") {
      document.getElementById("issueUnit").value = state.user.unit || "";
      showResidentApp();
    } else {
      showSuperintendentApp();
      await loadIssues();
    }
  } else {
    logoutBtn.classList.add("hidden");
    showAuth();
  }
}

function renderIssues(issues) {
  if (!issues.length) {
    issuesList.innerHTML = "<p>No issues match the current filters.</p>";
    return;
  }

  issuesList.innerHTML = issues
    .map((issue) => {
      const statusClass = issue.status.toLowerCase().replace(/\s+/g, "-");
      const badgeClass = statusClass === "new" ? "new" : statusClass === "in-progress" ? "in-progress" : "resolved";
      const urgencyClass = issue.urgency === "Emergency" ? "emergency" : "";

      return `
        <article class="issue-card">
          <div class="issue-top">
            <h3 class="issue-title">${escapeHtml(issue.title)}</h3>
            <span class="badge ${badgeClass}">${escapeHtml(issue.status)}</span>
          </div>

          <div class="issue-meta">
            <span>Unit: ${escapeHtml(issue.unit)}</span>
            <span>Reporter: ${escapeHtml(issue.reporter_name || "Unknown")}</span>
            <span>Category: ${escapeHtml(issue.category)}</span>
            <span>Urgency: <span class="badge ${urgencyClass}">${escapeHtml(issue.urgency)}</span></span>
          </div>

          <p>${escapeHtml(issue.description)}</p>

          ${issue.photo_path ? `<img class="issue-photo" src="${issue.photo_path}" alt="${escapeHtml(issue.title)}" />` : ""}

          <label>
            Update status
            <select class="status-select" data-id="${issue.id}">
              <option value="New" ${issue.status === "New" ? "selected" : ""}>New</option>
              <option value="In Progress" ${issue.status === "In Progress" ? "selected" : ""}>In Progress</option>
              <option value="Resolved" ${issue.status === "Resolved" ? "selected" : ""}>Resolved</option>
            </select>
          </label>
        </article>
      `;
    })
    .join("");
}

async function loadIssues() {
  if (!state.user || state.user.role !== "superintendent") return;

  const params = new URLSearchParams();
  if (state.statusFilter !== "All") params.append("status", state.statusFilter);
  if (state.categoryFilter !== "All") params.append("category", state.categoryFilter);
  if (state.unitFilter.trim()) params.append("unit", state.unitFilter.trim());

  const res = await fetch(`/api/issues?${params.toString()}`, {
    headers: { "Content-Type": "application/json" }
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Failed to load issues");
    return;
  }

  state.issues = data.issues || [];
  renderIssues(state.issues);
}

document.getElementById("filterStatus").addEventListener("change", (e) => {
  state.statusFilter = e.target.value;
  loadIssues();
});

document.getElementById("filterCategory").addEventListener("change", (e) => {
  state.categoryFilter = e.target.value;
  loadIssues();
});

document.getElementById("filterUnit").addEventListener("input", (e) => {
  state.unitFilter = e.target.value;
  loadIssues();
});

issuesList.addEventListener("change", async (event) => {
  const select = event.target;
  if (!select.matches(".status-select")) return;

  const id = select.dataset.id;
  const status = select.value;

  const res = await fetch(`/api/issues/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Failed to update issue");
    return;
  }

  await loadIssues();
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

showAuth();
loadSession();
