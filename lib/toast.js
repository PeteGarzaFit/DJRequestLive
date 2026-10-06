export const toast = (msg) => window.dispatchEvent(new CustomEvent('rl-toast', { detail: String(msg) }));
