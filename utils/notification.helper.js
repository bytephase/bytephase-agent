const { Notification } = require('electron');

/**
 * Notification Helper
 * Unified interface for system notifications across platforms
 */
class NotificationHelper {
  /**
   * Show system notification
   * @param {string} title - Notification title
   * @param {string} body - Notification body text
   * @param {Object} options - Additional options (icon, silent, urgency)
   * @returns {Notification|null} - Notification instance or null if not supported
   */
  static show(title, body, options = {}) {
    // Check if notifications are supported
    if (!Notification.isSupported()) {
      console.warn('[NOTIFICATION] System notifications not supported');
      return null;
    }

    const notification = new Notification({
      title: title,
      body: body,
      icon: options.icon || null,
      silent: options.silent || false,
      urgency: options.urgency || 'normal'  // low, normal, critical
    });

    notification.show();
    return notification;
  }

  /**
   * Success notification for agent connection
   * @param {string} shopId - Shop ID that was connected
   * @returns {Notification|null}
   */
  static showConnectionSuccess(shopId) {
    return this.show(
      'BytePhase Agent Connected',
      `Successfully connected to shop ${shopId}. Agent is now running in the background.`,
      { urgency: 'normal' }
    );
  }

  /**
   * Error notification for connection failure
   * @param {string} errorMessage - Error message to display
   * @returns {Notification|null}
   */
  static showConnectionError(errorMessage) {
    return this.show(
      'BytePhase Agent Connection Failed',
      errorMessage,
      { urgency: 'critical' }
    );
  }

  /**
   * Generic info notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @returns {Notification|null}
   */
  static showInfo(title, message) {
    return this.show(title, message, { urgency: 'low' });
  }
}

module.exports = NotificationHelper;
