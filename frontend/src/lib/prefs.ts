// Local UI preferences (no backend). Currently just a manual "reduce motion"
// switch that adds .reduce-motion to <html> (CSS then neutralises animation).
const K = "pr_reduce_motion";

export function getReduceMotion(): boolean {
  return localStorage.getItem(K) === "1";
}

export function applyReduceMotion(on: boolean) {
  document.documentElement.classList.toggle("reduce-motion", on);
}

export function setReduceMotion(on: boolean) {
  localStorage.setItem(K, on ? "1" : "0");
  applyReduceMotion(on);
}

export function initPrefs() {
  applyReduceMotion(getReduceMotion());
}
