/**
 * EventBus - Simple event system for inter-module communication
 *
 * Allows modules to emit and listen to events without direct coupling.
 */

const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Allow many listeners
  }

  /**
   * Emit an event with data
   *
   * @param {string} eventName - Event name
   * @param {any} data - Event data
   */
  publish(eventName, data) {
    console.log(`[EVENT] Publishing: ${eventName}`);
    this.emit(eventName, data);
  }

  /**
   * Subscribe to an event
   *
   * @param {string} eventName - Event name
   * @param {function} handler - Event handler
   */
  subscribe(eventName, handler) {
    console.log(`[EVENT] Subscribing to: ${eventName}`);
    this.on(eventName, handler);
  }

  /**
   * Unsubscribe from an event
   *
   * @param {string} eventName - Event name
   * @param {function} handler - Event handler
   */
  unsubscribe(eventName, handler) {
    console.log(`[EVENT] Unsubscribing from: ${eventName}`);
    this.off(eventName, handler);
  }

  /**
   * Subscribe once to an event
   *
   * @param {string} eventName - Event name
   * @param {function} handler - Event handler
   */
  subscribeOnce(eventName, handler) {
    console.log(`[EVENT] Subscribing once to: ${eventName}`);
    this.once(eventName, handler);
  }

  /**
   * Remove all listeners for an event
   *
   * @param {string} eventName - Event name
   */
  clear(eventName) {
    this.removeAllListeners(eventName);
  }
}

// Export singleton instance
module.exports = new EventBus();
