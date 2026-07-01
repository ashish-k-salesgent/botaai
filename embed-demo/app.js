const BOTAAI_CLIENT_ID = "botaai_892ae1e0-579";
const BOTAAI_API = "http://localhost:8085";
const USERS_KEY = "sg_routes_users";
const SESSION_KEY = "sg_routes_user";

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const signinForm = document.getElementById("signin-form");
const signupForm = document.getElementById("signup-form");
const signinError = document.getElementById("signin-error");
const signupError = document.getElementById("signup-error");
const welcomeName = document.getElementById("welcome-name");
const userBadge = document.getElementById("user-badge");
const visitorDebug = document.getElementById("visitor-debug");
const logoutBtn = document.getElementById("logout-btn");
const tabSignin = document.getElementById("tab-signin");
const tabSignup = document.getElementById("tab-signup");
const signinPanel = document.getElementById("signin-panel");
const signupPanel = document.getElementById("signup-panel");

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function setSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  window.BOTAAI_VISITOR = { name: user.username, email: user.email };
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  delete window.BOTAAI_VISITOR;
}

function showTab(which) {
  const signin = which === "signin";
  tabSignin.classList.toggle("active", signin);
  tabSignup.classList.toggle("active", !signin);
  signinPanel.classList.toggle("hidden", !signin);
  signupPanel.classList.toggle("hidden", signin);
  signinError.textContent = "";
  signupError.textContent = "";
}

function teardownWidget() {
  const existing = document.getElementById("botaai-widget-script");
  if (existing) existing.remove();
  document.getElementById("botaai-bubble")?.remove();
  document.getElementById("botaai-panel")?.remove();
}

function loadWidget() {
  if (document.getElementById("botaai-widget-script")) return;
  window.BOTAAI_CONFIG = {
    clientId: BOTAAI_CLIENT_ID,
    api: BOTAAI_API,
  };
  const s = document.createElement("script");
  s.id = "botaai-widget-script";
  s.src = `${BOTAAI_API}/widget.js`;
  s.setAttribute("data-client", BOTAAI_CLIENT_ID);
  s.setAttribute("data-api", BOTAAI_API);
  document.body.appendChild(s);
}

function showApp(user) {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  welcomeName.textContent = user.username;
  userBadge.textContent = user.email;
  visitorDebug.innerHTML = `
    <strong>Sent to BotAAI widget:</strong><br />
    <code>name</code> = "${user.username}"<br />
    <code>email</code> = "${user.email}"<br />
    <span class="muted">Check Chats on <a href="http://localhost:3005/app/chats" target="_blank">localhost:3005</a> — should show this name &amp; email.</span>
  `;
  setSession(user);
  loadWidget();
}

function showLogin() {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  clearSession();
  teardownWidget();
}

tabSignin.addEventListener("click", () => showTab("signin"));
tabSignup.addEventListener("click", () => showTab("signup"));

signupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  signupError.textContent = "";
  const username = document.getElementById("signup-username").value.trim();
  const email = document.getElementById("signup-email").value.trim().toLowerCase();
  const password = document.getElementById("signup-password").value;
  const confirm = document.getElementById("signup-confirm").value;

  if (!username || !email || !password) {
    signupError.textContent = "All fields are required.";
    return;
  }
  if (password !== confirm) {
    signupError.textContent = "Passwords do not match.";
    return;
  }
  if (password.length < 4) {
    signupError.textContent = "Password must be at least 4 characters.";
    return;
  }

  const users = loadUsers();
  const key = username.toLowerCase();
  if (users.some((u) => u.username.toLowerCase() === key)) {
    signupError.textContent = "Username already taken.";
    return;
  }
  if (users.some((u) => u.email.toLowerCase() === email)) {
    signupError.textContent = "Email already registered.";
    return;
  }

  const user = { username, email, password };
  users.push(user);
  saveUsers(users);
  showApp(user);
});

signinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  signinError.textContent = "";
  const username = document.getElementById("signin-username").value.trim();
  const password = document.getElementById("signin-password").value;
  const user = loadUsers().find(
    (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  if (!user) {
    signinError.textContent = "Invalid username or password. Sign up first if you are new.";
    return;
  }
  showApp(user);
});

logoutBtn.addEventListener("click", showLogin);

const saved = getSession();
if (saved && loadUsers().some((u) => u.username === saved.username)) {
  showApp(saved);
} else {
  showTab("signin");
}
