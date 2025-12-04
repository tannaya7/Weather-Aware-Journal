/**
 * Accessibility Utilities Module
 * Provides centralized a11y helpers for the Weather Journal App
 */

// Create ARIA live regions for announcements
let politeRegion = null;
let assertiveRegion = null;

/**
 * Initialize accessibility features
 */
export function initA11y() {
    createLiveRegions();
    createSkipLink();
    setupGlobalKeyboardHandlers();
    setDocumentLang();
}

/**
 * Create ARIA live regions for screen reader announcements
 */
function createLiveRegions() {
    // Polite live region (doesn't interrupt)
    if (!document.getElementById('a11y-polite-region')) {
        politeRegion = document.createElement('div');
        politeRegion.id = 'a11y-polite-region';
        politeRegion.className = 'sr-only';
        politeRegion.setAttribute('aria-live', 'polite');
        politeRegion.setAttribute('aria-atomic', 'true');
        document.body.appendChild(politeRegion);
    } else {
        politeRegion = document.getElementById('a11y-polite-region');
    }

    // Assertive live region (interrupts immediately)
    if (!document.getElementById('a11y-assertive-region')) {
        assertiveRegion = document.createElement('div');
        assertiveRegion.id = 'a11y-assertive-region';
        assertiveRegion.className = 'sr-only';
        assertiveRegion.setAttribute('aria-live', 'assertive');
        assertiveRegion.setAttribute('aria-atomic', 'true');
        document.body.appendChild(assertiveRegion);
    } else {
        assertiveRegion = document.getElementById('a11y-assertive-region');
    }
}

/**
 * Announce a message to screen readers
 * @param {string} message - The message to announce
 * @param {string} priority - 'polite' (default) or 'assertive'
 */
export function announce(message, priority = 'polite') {
    const region = priority === 'assertive' ? assertiveRegion : politeRegion;

    if (!region) {
        createLiveRegions();
        return announce(message, priority);
    }

    // Clear and set new message with a small delay to ensure screen readers pick it up
    region.textContent = '';
    setTimeout(() => {
        region.textContent = message;
    }, 100);

    // Auto-clear after 5 seconds
    setTimeout(() => {
        region.textContent = '';
    }, 5000);
}

/**
 * Create skip navigation link
 */
function createSkipLink() {
    if (document.getElementById('skip-link')) return;

    const skipLink = document.createElement('a');
    skipLink.id = 'skip-link';
    skipLink.className = 'skip-link';
    skipLink.href = '#main-content';
    skipLink.textContent = 'Skip to main content';

    skipLink.addEventListener('click', (e) => {
        e.preventDefault();
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.setAttribute('tabindex', '-1');
            mainContent.focus();
            mainContent.addEventListener('blur', () => {
                mainContent.removeAttribute('tabindex');
            }, { once: true });
        }
    });

    document.body.insertBefore(skipLink, document.body.firstChild);
}

/**
 * Set up global keyboard shortcuts
 */
function setupGlobalKeyboardHandlers() {
    document.addEventListener('keydown', (e) => {
        // Press '/' to focus search (on index page)
        if (e.key === '/' && !e.ctrlKey && !e.altKey) {
            const searchInput = document.querySelector('.search');
            if (searchInput && document.activeElement !== searchInput) {
                e.preventDefault();
                searchInput.focus();
            }
        }

        // Press 'Escape' to close modals/panels
        if (e.key === 'Escape') {
            handleEscapeKey();
        }
    });
}

/**
 * Handle escape key press
 */
function handleEscapeKey() {
    // Close mood summary panel if open
    const moodPanel = document.querySelector('.mood-summary-panel.visible');
    if (moodPanel) {
        moodPanel.classList.remove('visible');
        // Return focus to the button that opened it
        const moodButton = document.querySelector('.moodtr');
        if (moodButton) moodButton.focus();
        announce('Mood tracker closed');
        return;
    }

    // Close undo toast if visible
    const undoToast = document.querySelector('.undo-toast');
    if (undoToast && undoToast.style.display !== 'none') {
        undoToast.style.display = 'none';
        return;
    }
}

/**
 * Set document language attribute
 */
function setDocumentLang() {
    if (!document.documentElement.hasAttribute('lang')) {
        document.documentElement.setAttribute('lang', 'en');
    }
}

/**
 * Trap focus within an element (for modals/panels)
 * @param {HTMLElement} element - The element to trap focus within
 * @returns {Function} - Cleanup function to remove the focus trap
 */
export function focusTrap(element) {
    const focusableElements = element.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    function handleTabKey(e) {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstFocusable) {
                e.preventDefault();
                lastFocusable.focus();
            }
        } else {
            // Tab
            if (document.activeElement === lastFocusable) {
                e.preventDefault();
                firstFocusable.focus();
            }
        }
    }

    element.addEventListener('keydown', handleTabKey);

    // Focus first element
    if (firstFocusable) firstFocusable.focus();

    // Return cleanup function
    return () => {
        element.removeEventListener('keydown', handleTabKey);
    };
}

/**
 * Make an element keyboard accessible by adding Enter and Space key handlers
 * @param {HTMLElement} element - The element to make keyboard accessible
 * @param {Function} callback - The callback to execute on Enter/Space
 */
export function makeKeyboardAccessible(element, callback) {
    element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            callback(e);
        }
    });
}

/**
 * Manage focus return after an action
 * @param {HTMLElement} returnElement - Element to return focus to
 */
export function manageFocusReturn(returnElement) {
    if (returnElement && typeof returnElement.focus === 'function') {
        setTimeout(() => {
            returnElement.focus();
        }, 100);
    }
}

/**
 * Add accessible description to an element
 * @param {HTMLElement} element - The element
 * @param {string} description - The description text
 * @returns {string} - The ID of the description element
 */
export function addDescription(element, description) {
    const descId = `desc-${Math.random().toString(36).substr(2, 9)}`;
    const descElement = document.createElement('span');
    descElement.id = descId;
    descElement.className = 'sr-only';
    descElement.textContent = description;
    element.appendChild(descElement);
    element.setAttribute('aria-describedby', descId);
    return descId;
}
