// popup.js — Déjà Applied

const statusBadge = document.getElementById("status-badge");
const statusText = document.getElementById("status-text");
const signedOutActions = document.getElementById("signed-out-actions");
const signedInActions = document.getElementById("signed-in-actions");
const signinBtn = document.getElementById("signin-btn");
const signoutBtn = document.getElementById("signout-btn");
const errorMsg = document.getElementById("error-msg");

function setStatus(signedIn) {
  if (signedIn) {
    statusBadge.className = "status-badge signed-in";
    statusText.textContent = "Connected to Gmail";
    signedOutActions.classList.add("hidden");
    signedInActions.classList.remove("hidden");
  } else {
    statusBadge.className = "status-badge signed-out";
    statusText.textContent = "Not signed in";
    signedOutActions.classList.remove("hidden");
    signedInActions.classList.add("hidden");
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove("hidden");
  setTimeout(() => errorMsg.classList.add("hidden"), 4000);
}

chrome.runtime.sendMessage({ type: "GET_AUTH_STATUS" }, (resp) => {
  setStatus(resp?.authenticated === true);
});

signinBtn.addEventListener("click", () => {
  signinBtn.innerHTML = '<span class="spinner"></span>Signing in…';
  signinBtn.disabled = true;
  chrome.runtime.sendMessage({ type: "SIGN_IN" }, (resp) => {
    signinBtn.innerHTML = "Sign in with Google";
    signinBtn.disabled = false;
    if (resp?.success) { setStatus(true); }
    else { setStatus(false); showError("Sign-in failed: " + (resp?.error || "unknown error")); }
  });
});

signoutBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SIGN_OUT" }, () => setStatus(false));
});
