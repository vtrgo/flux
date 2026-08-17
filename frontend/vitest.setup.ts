import '@testing-library/jest-dom'

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserver

window.HTMLElement.prototype.scrollIntoView = function() {}
window.HTMLElement.prototype.hasPointerCapture = function() { return false; }
window.HTMLElement.prototype.releasePointerCapture = function() {}
