(function () {
  "use strict";

  const API_URL = "http://127.0.0.1:8000/predict";
  const TIMEOUT_MS = 20000;
  const TOTAL_STEPS = 3;

  // Field rules. Names match the backend exactly.
  const FIELDS = {
    age: { step: 1, type: "int", min: 10, max: 100, label: "Age" },
    gender: { step: 1, type: "choice", options: ["Male", "Female"] },
    country: { step: 1, type: "text" },
    academic_level: { step: 1, type: "choice", options: ["Undergraduate", "Graduate", "High School"] },
    most_used_platform: { step: 2, type: "choice", options: ["Facebook", "LinkedIn", "Instagram", "Snapchat", "Twitter", "YouTube", "TikTok", "LINE", "KakaoTalk", "VKontakte", "WhatsApp", "WeChat"] },
    purpose_of_use: { step: 2, type: "choice", options: ["Networking", "Education", "Entertainment", "News"] },
    avg_daily_usage_hours: { step: 2, type: "float", min: 0, max: 24 },
    daily_unlocks: { step: 2, type: "int", min: 0 },
    study_hours: { step: 3, type: "float", min: 0, max: 24 },
    physical_activity_hours: { step: 3, type: "float", min: 0, max: 24 },
    sleep_hours_per_night: { step: 3, type: "float", min: 0, max: 24 },
    stress_level: { step: 3, type: "choice", options: ["Medium", "Low", "Very High", "High"] }
  };

  const form = document.getElementById("predictForm");
  const formCard = document.getElementById("formCard");
  const resultCard = document.getElementById("resultCard");
  const backBtn = document.getElementById("backBtn");
  const nextBtn = document.getElementById("nextBtn");
  const submitBtn = document.getElementById("submitBtn");
  const submitLabel = document.getElementById("submitLabel");
  const banner = document.getElementById("formBanner");
  const progressBar = document.getElementById("progressBar");
  const stepCount = document.getElementById("stepCount");
  const scoreValue = document.getElementById("scoreValue");
  const steps = Array.from(form.querySelectorAll(".step"));

  let currentStep = 1;
  let isSubmitting = false;

  function rawValue(name) {
    if (FIELDS[name].type === "choice" && form.elements[name].length !== undefined && form.elements[name][0] && form.elements[name][0].type === "radio") {
      const checked = form.querySelector('input[name="' + name + '"]:checked');
      return checked ? checked.value : "";
    }
    return form.elements[name].value.trim();
  }

  // Returns an error message or "" if the field is valid.
  function validateField(name) {
    const rule = FIELDS[name];
    const v = rawValue(name);

    if (rule.type === "choice") {
      return rule.options.includes(v) ? "" : "Please choose an option.";
    }
    if (rule.type === "text") {
      return v ? "" : "Please enter your country.";
    }
    if (v === "") return "Please enter a number.";
    const n = Number(v);
    if (!Number.isFinite(n)) return "Please enter a valid number.";
    if (rule.type === "int" && !Number.isInteger(n)) return "Please enter a whole number.";
    if (rule.min !== undefined && rule.max !== undefined && (n < rule.min || n > rule.max)) {
      return "Please enter a value between " + rule.min + " and " + rule.max + ".";
    }
    if (rule.min !== undefined && n < rule.min) return "Please enter " + rule.min + " or more.";
    return "";
  }

  function showError(name, message) {
    const err = document.getElementById(name === "stress_level" ? "stress_level-error" : name + "-error");
    const field = err.closest(".field");
    err.textContent = message;
    field.classList.toggle("invalid", Boolean(message));
    const inputs = form.querySelectorAll('[name="' + name + '"]');
    inputs.forEach(function (el) {
      if (message) el.setAttribute("aria-invalid", "true");
      else el.removeAttribute("aria-invalid");
    });
  }

  function validateStep(step, focusFirst) {
    let firstBad = null;
    Object.keys(FIELDS).forEach(function (name) {
      if (FIELDS[name].step !== step) return;
      const msg = validateField(name);
      showError(name, msg);
      if (msg && !firstBad) firstBad = name;
    });
    if (firstBad && focusFirst) form.querySelector('[name="' + firstBad + '"]').focus();
    return !firstBad;
  }

  function showStep(step) {
    currentStep = step;
    steps.forEach(function (s) { s.hidden = Number(s.dataset.step) !== step; });
    progressBar.style.width = (step / TOTAL_STEPS * 100) + "%";
    stepCount.textContent = "Step " + step + " of " + TOTAL_STEPS;
    backBtn.hidden = step === 1;
    nextBtn.hidden = step === TOTAL_STEPS;
    submitBtn.hidden = step !== TOTAL_STEPS;
    hideBanner();
    const first = steps[step - 1].querySelector("input, select");
    if (first) first.focus({ preventScroll: true });
  }

  function showBanner(msg) { banner.textContent = msg; banner.hidden = false; }
  function hideBanner() { banner.hidden = true; banner.textContent = ""; }

  function setLoading(loading) {
    isSubmitting = loading;
    submitBtn.disabled = loading;
    backBtn.disabled = loading;
    submitBtn.classList.toggle("loading", loading);
    submitBtn.setAttribute("aria-busy", String(loading));
    submitLabel.textContent = loading ? "Estimating…" : "Get my estimate";
  }

  function buildPayload() {
    const payload = {};
    Object.keys(FIELDS).forEach(function (name) {
      const rule = FIELDS[name];
      const v = rawValue(name);
      payload[name] = (rule.type === "int" || rule.type === "float") ? Number(v) : v;
    });
    return payload;
  }

  async function submitForm() {
    if (isSubmitting) return;
    hideBanner();

    for (let s = 1; s <= TOTAL_STEPS; s++) {
      if (!validateStep(s, false)) {
        showStep(s);
        validateStep(s, true);
        showBanner("A few answers need your attention before we can continue.");
        return;
      }
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(buildPayload()),
        signal: controller.signal
      });

      if (!res.ok) {
        if (res.status === 422) throw new Error("The service didn't accept one of the answers. Please review your entries and try again.");
        if (res.status >= 500) throw new Error("The prediction service ran into a problem. Please try again in a moment.");
        throw new Error("The request couldn't be completed (error " + res.status + "). Please try again.");
      }

      let data;
      try { data = await res.json(); }
      catch (e) { throw new Error("The service sent back something we couldn't read. Please try again."); }

      const score = data ? data.predicted_mental_health_score : undefined;
      if (typeof score !== "number" || !Number.isFinite(score)) {
        throw new Error("The service replied, but the result wasn't in the expected format.");
      }
      showResult(score);
    } catch (err) {
      if (err.name === "AbortError") {
        showBanner("The service took too long to respond. Please check that it is running and try again.");
      } else if (err instanceof TypeError) {
        showBanner("We couldn't reach the prediction service at 127.0.0.1:8000. Make sure the backend is running, then try again.");
      } else {
        showBanner(err.message);
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  function showResult(score) {
    scoreValue.textContent = score.toFixed(2);
    formCard.hidden = true;
    resultCard.hidden = false;
    resultCard.focus();
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function backToForm(step) {
    resultCard.hidden = true;
    formCard.hidden = false;
    showStep(step);
    formCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  nextBtn.addEventListener("click", function () {
    if (validateStep(currentStep, true)) showStep(currentStep + 1);
  });
  backBtn.addEventListener("click", function () {
    if (currentStep > 1) showStep(currentStep - 1);
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (currentStep < TOTAL_STEPS) {
      if (validateStep(currentStep, true)) showStep(currentStep + 1);
      return;
    }
    submitForm();
  });

  // Clear a field's error as soon as the person fixes it.
  form.addEventListener("input", function (e) {
    const name = e.target.name;
    if (name && FIELDS[name] && e.target.closest(".field").classList.contains("invalid")) {
      showError(name, validateField(name));
    }
  });
  form.addEventListener("change", function (e) {
    const name = e.target.name;
    if (name && FIELDS[name] && e.target.closest(".field").classList.contains("invalid")) {
      showError(name, validateField(name));
    }
  });

  document.getElementById("editBtn").addEventListener("click", function () { backToForm(1); });
  document.getElementById("restartBtn").addEventListener("click", function () {
    form.reset();
    Object.keys(FIELDS).forEach(function (n) { showError(n, ""); });
    backToForm(1);
  });

  showStep(1);
})();
