export function SkipLink() {
  function handleClick(e) {
    e.preventDefault();
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;
    mainContent.setAttribute('tabindex', '-1');
    mainContent.focus();
    mainContent.addEventListener(
      'blur',
      () => {
        mainContent.removeAttribute('tabindex');
      },
      { once: true },
    );
  }

  return (
    <a href="#main-content" className="skip-link" onClick={handleClick}>
      Skip to main content
    </a>
  );
}
