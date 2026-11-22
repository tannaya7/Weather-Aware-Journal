// After a result is closed, focus goes back to the button that made it.
export function focusOn(id) {
  document.getElementById(id)?.focus();
}
